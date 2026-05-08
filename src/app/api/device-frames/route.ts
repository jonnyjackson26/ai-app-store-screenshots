import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400;

const UPSTREAM = "https://device-frames-api.fly.dev";

const CATEGORY_ORDER = [
  "apple-iphone",
  "apple-ipad",
  "android-phone",
  "android-tablet",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  "apple-iphone": "iPhone",
  "apple-ipad": "iPad",
  "android-phone": "Android Phone",
  "android-tablet": "Android Tablet",
};

type UpstreamDevice = {
  category: string;
  device: string;
  variation: string;
  frame_size: { width: number; height: number };
  screen: { x: number; y: number; width: number; height: number };
  hex_color: string;
};

export type DeviceFrameVariation = {
  variation: string;
  variationLabel: string;
  frameUrl: string;
  hexColor: string;
  frameSize: { width: number; height: number };
};

export type DeviceFrameModel = {
  device: string;
  modelLabel: string;
  variations: DeviceFrameVariation[];
};

export type DeviceFrameCategory = {
  id: string;
  label: string;
  models: DeviceFrameModel[];
};

export type DeviceFramesResponse = {
  categories: DeviceFrameCategory[];
};

// /find_template returns its payload as a Python repr (single quotes),
// not JSON. We only need the `frame` URL — pull it out directly.
const FRAME_URL_RE = /'frame':\s*'([^']+)'/;

const fetchFrameUrl = async (
  category: string,
  device: string,
  variation: string,
): Promise<{ frameUrl: string; modelLabel: string; variationLabel: string } | null> => {
  const url = `${UPSTREAM}/find_template?device=${encodeURIComponent(device)}&variation=${encodeURIComponent(variation)}&category=${encodeURIComponent(category)}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const json = (await res.json()) as { template_path?: string };
  const raw = json.template_path ?? "";
  const match = raw.match(FRAME_URL_RE);
  if (!match) return null;
  const frameUrl = match[1];
  // Frame URLs look like:
  //   .../device-frames-output/<Category>/<Model>/<Variation>/frame.png
  // Use the path segments to derive human-readable labels.
  const segments = frameUrl.split("/").map(decodeURIComponent);
  const modelLabel = segments.at(-3) ?? device;
  const variationLabel = segments.at(-2) ?? variation;
  return { frameUrl, modelLabel, variationLabel };
};

export async function GET() {
  try {
    const listRes = await fetch(`${UPSTREAM}/list_devices`, {
      next: { revalidate: 86400 },
    });
    if (!listRes.ok) {
      return NextResponse.json(
        { error: `Upstream list_devices failed: ${listRes.status}` },
        { status: 502 },
      );
    }
    const listJson = (await listRes.json()) as { devices: UpstreamDevice[] };
    const devices = listJson.devices ?? [];

    const enriched = await Promise.all(
      devices.map(async (d) => {
        const meta = await fetchFrameUrl(d.category, d.device, d.variation);
        return { d, meta };
      }),
    );

    const byCategoryAndDevice = new Map<string, Map<string, DeviceFrameModel>>();

    for (const { d, meta } of enriched) {
      if (!meta) continue;
      let cat = byCategoryAndDevice.get(d.category);
      if (!cat) {
        cat = new Map();
        byCategoryAndDevice.set(d.category, cat);
      }
      let model = cat.get(d.device);
      if (!model) {
        model = {
          device: d.device,
          modelLabel: meta.modelLabel,
          variations: [],
        };
        cat.set(d.device, model);
      }
      model.variations.push({
        variation: d.variation,
        variationLabel: meta.variationLabel,
        frameUrl: meta.frameUrl,
        hexColor: d.hex_color,
        frameSize: d.frame_size,
      });
    }

    const categories: DeviceFrameCategory[] = CATEGORY_ORDER.filter((id) =>
      byCategoryAndDevice.has(id),
    ).map((id) => {
      const models = Array.from(byCategoryAndDevice.get(id)!.values());
      models.sort((a, b) => a.modelLabel.localeCompare(b.modelLabel));
      return {
        id,
        label: CATEGORY_LABEL[id] ?? id,
        models,
      };
    });

    return NextResponse.json({ categories } satisfies DeviceFramesResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
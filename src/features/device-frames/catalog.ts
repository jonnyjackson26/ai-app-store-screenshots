// Shared catalog fetching/formatting for the device-frame feature. The
// /api/device-frames route serves this to the picker; the AI chat route
// embeds a compact form in its developer message so the model knows which
// (category, device, variation) tuples are valid.

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
  const segments = frameUrl.split("/").map(decodeURIComponent);
  const modelLabel = segments.at(-3) ?? device;
  const variationLabel = segments.at(-2) ?? variation;
  return { frameUrl, modelLabel, variationLabel };
};

export const fetchDeviceFrameCatalog = async (): Promise<DeviceFramesResponse> => {
  const listRes = await fetch(`${UPSTREAM}/list_devices`, {
    next: { revalidate: 86400 },
  });
  if (!listRes.ok) {
    throw new Error(`Upstream list_devices failed: ${listRes.status}`);
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

  return { categories };
};

/**
 * Compact YAML-ish rendering of the catalog for inclusion in the AI chat
 * developer message. ~5KB. Lists every (device, variation) tuple so the
 * model can pick valid ones; includes hex colors so colour-based requests
 * ("make page 2's phone orange") have ground truth to match against.
 */
export const formatCatalogForPrompt = (catalog: DeviceFramesResponse): string => {
  const lines: string[] = [];
  for (const category of catalog.categories) {
    lines.push(`${category.id} (${category.label}):`);
    for (const model of category.models) {
      const variations = model.variations
        .map((v) => `${v.variation}#${v.hexColor}`)
        .join(", ");
      lines.push(`  ${model.device} (${model.modelLabel}): ${variations}`);
    }
  }
  return lines.join("\n");
};

/**
 * Build a quick-lookup index for validating AI-supplied frame tuples.
 * Returns a Set of "category::device::variation" keys.
 */
export const buildCatalogIndex = (catalog: DeviceFramesResponse): Set<string> => {
  const set = new Set<string>();
  for (const category of catalog.categories) {
    for (const model of category.models) {
      for (const v of model.variations) {
        set.add(`${category.id}::${model.device}::${v.variation}`);
      }
    }
  }
  return set;
};

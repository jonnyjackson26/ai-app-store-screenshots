import { NextRequest, NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";

export const runtime = "nodejs";

const UPSTREAM = "https://device-frames-api.fly.dev";

const utapi = new UTApi();

type SourceResolution =
  | { blob: Blob; filename: string; sourceUrl: string | null }
  | { error: string; status: number };

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

const extensionFromMime = (mime: string | undefined): string => {
  if (!mime) return "png";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  return "png";
};

const ensureValidFilename = (rawName: string, mime: string | undefined): string => {
  const base = rawName.split("?")[0].split("#")[0];
  const dotIdx = base.lastIndexOf(".");
  const ext = dotIdx >= 0 ? base.slice(dotIdx + 1).toLowerCase() : "";
  if (ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return base;
  }
  const stem = (dotIdx >= 0 ? base.slice(0, dotIdx) : base) || "screenshot";
  return `${stem}.${extensionFromMime(mime)}`;
};

const resolveSource = async (formData: FormData): Promise<SourceResolution> => {
  const file = formData.get("file");
  if (file instanceof File) {
    return {
      blob: file,
      filename: ensureValidFilename(file.name || "screenshot", file.type),
      sourceUrl: null,
    };
  }

  const sourceUrl = formData.get("sourceUrl");
  if (typeof sourceUrl === "string" && sourceUrl) {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      return { error: `Could not fetch source image: ${res.status}`, status: 502 };
    }
    const blob = await res.blob();
    const rawName = sourceUrl.split("/").pop() || "screenshot";
    return {
      blob,
      filename: ensureValidFilename(rawName, blob.type),
      sourceUrl,
    };
  }

  return { error: "Provide either `file` or `sourceUrl`.", status: 400 };
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const device = formData.get("device");
    const variation = formData.get("variation");
    const category = formData.get("category");

    if (typeof device !== "string" || typeof variation !== "string") {
      return NextResponse.json(
        { error: "Missing `device` or `variation`." },
        { status: 400 },
      );
    }

    const source = await resolveSource(formData);
    if ("error" in source) {
      return NextResponse.json({ error: source.error }, { status: source.status });
    }

    const upstreamForm = new FormData();
    upstreamForm.append("file", source.blob, source.filename);
    upstreamForm.append("device", device);
    upstreamForm.append("variation", variation);
    if (typeof category === "string" && category) {
      upstreamForm.append("category", category);
    }

    const upstreamRes = await fetch(`${UPSTREAM}/apply_frame`, {
      method: "POST",
      body: upstreamForm,
    });

    if (!upstreamRes.ok) {
      const detail = await upstreamRes.text();
      return NextResponse.json(
        { error: `apply_frame failed: ${upstreamRes.status} ${detail}` },
        { status: 502 },
      );
    }

    const framedBuffer = await upstreamRes.arrayBuffer();
    const framedFilename = `${device}-${variation}-framed.png`;
    const framedFile = new File([framedBuffer], framedFilename, { type: "image/png" });

    // When the source came as an upload, persist it too so the editor can
    // re-bake the screenshot under a different frame later.
    let resolvedSourceUrl = source.sourceUrl;
    const uploads: File[] = [framedFile];
    if (!resolvedSourceUrl) {
      uploads.push(new File([await source.blob.arrayBuffer()], source.filename, {
        type: source.blob.type || "image/png",
      }));
    }

    const uploaded = await utapi.uploadFiles(uploads);
    const framedResult = uploaded[0];
    if (framedResult.error) {
      return NextResponse.json(
        { error: `UploadThing upload failed: ${framedResult.error.message}` },
        { status: 502 },
      );
    }
    if (!resolvedSourceUrl) {
      const sourceResult = uploaded[1];
      if (sourceResult.error) {
        return NextResponse.json(
          { error: `UploadThing upload failed (source): ${sourceResult.error.message}` },
          { status: 502 },
        );
      }
      resolvedSourceUrl = sourceResult.data.ufsUrl;
    }

    return NextResponse.json({
      url: framedResult.data.ufsUrl,
      sourceUrl: resolvedSourceUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { fetchDeviceFrameCatalog } from "@/features/device-frames/catalog";

export const runtime = "nodejs";
export const revalidate = 86400;

// Re-export shared types so existing imports from this route file continue
// to work without churn.
export type {
  DeviceFrameVariation,
  DeviceFrameModel,
  DeviceFrameCategory,
  DeviceFramesResponse,
} from "@/features/device-frames/catalog";

export async function GET() {
  try {
    const catalog = await fetchDeviceFrameCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { LocalTemplate } from "@/lib/templates";

export const runtime = "nodejs";

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");

export async function GET() {
  try {
    const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
    const templates: LocalTemplate[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const folder = path.join(TEMPLATES_DIR, id);
      const files = await fs.readdir(folder);
      const json = files.find((f) => f.toLowerCase().endsWith(".json"));
      const thumb = files.find((f) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f));
      if (!json || !thumb) continue;
      templates.push({
        id,
        json: `/templates/${id}/${json}`,
        thumbnailUrl: `/templates/${id}/${thumb}`,
      });
    }

    templates.sort((a, b) => {
      if (a.id === "default") return -1;
      if (b.id === "default") return 1;
      return a.id.localeCompare(b.id);
    });

    return NextResponse.json(templates);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

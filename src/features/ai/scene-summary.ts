import type { fabric } from "fabric";
import { uuid } from "uuidv4";

import {
  DEFAULT_NUM_PAGES,
  DEFAULT_PAGE_GAP,
  type DeviceFrameMeta,
} from "@/features/editor/types";
import type { SceneObject, SceneSummary } from "./types";

type ObjWithCustom = fabric.Object & {
  id?: string;
  name?: string;
  numPages?: number;
  pageGap?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: string;
  src?: string;
  deviceFrame?: DeviceFrameMeta;
};

const round = (n: number | undefined): number =>
  typeof n === "number" ? Math.round(n) : 0;

const r2 = (n: number | undefined): number | undefined =>
  typeof n === "number" ? Math.round(n * 100) / 100 : undefined;

const truncateSrc = (src: string | undefined): string | undefined => {
  if (!src) return undefined;
  if (src.length <= 80) return src;
  // Keep the trailing filename so the AI can identify uploads.
  const parts = src.split("/");
  const tail = parts.slice(-1)[0] || src.slice(-40);
  return `…/${tail.slice(-60)}`;
};

/**
 * Build a compact, AI-friendly view of the canvas. Backfills missing ids on
 * non-workspace objects so existing documents (e.g. flash_sale.json) work.
 *
 * Coordinates are rounded to ints. Image src strings are truncated. Text is
 * left intact because edits often quote the original text verbatim.
 */
export const buildSceneSummary = (canvas: fabric.Canvas): SceneSummary => {
  const workspace = canvas
    .getObjects()
    .find((o) => (o as ObjWithCustom).name === "clip") as
    | ObjWithCustom
    | undefined;

  const numPages = Math.max(
    1,
    Math.floor(workspace?.numPages ?? DEFAULT_NUM_PAGES),
  );
  const pageGap = Math.max(0, workspace?.pageGap ?? DEFAULT_PAGE_GAP);
  const totalLogicalWidth = workspace?.width ?? 0;
  const pageWidth = totalLogicalWidth / numPages;

  const page = {
    width: round(pageWidth),
    height: round(workspace?.height),
    numPages,
    pageGap: round(pageGap),
    background: typeof workspace?.fill === "string" ? workspace.fill : "#ffffff",
  };

  let backfilled = false;

  const objects: SceneObject[] = canvas.getObjects().flatMap((o) => {
    const obj = o as ObjWithCustom;
    if (obj.name === "clip") return [];

    if (!obj.id) {
      obj.id = uuid().slice(0, 8);
      backfilled = true;
    }

    const base: SceneObject = {
      id: obj.id,
      type: obj.type ?? "object",
      left: round(obj.left),
      top: round(obj.top),
      width: round((obj.width ?? 0) * (obj.scaleX ?? 1)),
      height: round((obj.height ?? 0) * (obj.scaleY ?? 1)),
    };

    if (typeof obj.angle === "number" && obj.angle !== 0) base.angle = round(obj.angle);
    if (typeof obj.opacity === "number" && obj.opacity !== 1)
      base.opacity = r2(obj.opacity);
    if (typeof obj.fill === "string") base.fill = obj.fill;
    if (typeof obj.stroke === "string") base.stroke = obj.stroke;
    if (typeof obj.strokeWidth === "number" && obj.strokeWidth !== 0)
      base.strokeWidth = round(obj.strokeWidth);

    if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
      if (obj.text != null) base.text = obj.text;
      if (obj.fontSize != null) base.fontSize = round(obj.fontSize);
      if (obj.fontFamily != null) base.fontFamily = obj.fontFamily;
      if (obj.fontWeight != null) base.fontWeight = Number(obj.fontWeight);
      if (obj.textAlign != null) base.textAlign = obj.textAlign;
    }

    if (obj.type === "image") {
      base.src = truncateSrc(obj.src);
      if (obj.deviceFrame) {
        base.deviceFrame = {
          category: obj.deviceFrame.category,
          device: obj.deviceFrame.device,
          variation: obj.deviceFrame.variation,
        };
      }
    }

    return [base];
  });

  // If we backfilled ids on existing objects, fire canvas:dirty so the
  // JSON sidebar refreshes its view; this is a one-time migration that
  // shouldn't pollute history (the change is a no-op in user terms).
  if (backfilled) {
    canvas.fire("canvas:dirty" as never);
  }

  return { page, objects };
};

/**
 * Render the scene summary as a compact YAML-ish string for the LLM. Cheaper
 * than JSON (no quotes around keys, no commas) and easier for the model to
 * scan than raw Fabric JSON.
 */
export const formatSceneForPrompt = (scene: SceneSummary): string => {
  const lines: string[] = [];
  lines.push("page:");
  lines.push(`  width: ${scene.page.width}`);
  lines.push(`  height: ${scene.page.height}`);
  lines.push(`  numPages: ${scene.page.numPages}`);
  lines.push(`  pageGap: ${scene.page.pageGap}`);
  lines.push(`  background: ${scene.page.background}`);
  lines.push("objects:");
  for (const o of scene.objects) {
    const parts: string[] = [
      `id=${o.id}`,
      `type=${o.type}`,
      `left=${o.left}`,
      `top=${o.top}`,
      `w=${o.width}`,
      `h=${o.height}`,
    ];
    if (o.angle != null) parts.push(`angle=${o.angle}`);
    if (o.opacity != null) parts.push(`opacity=${o.opacity}`);
    if (o.fill != null) parts.push(`fill=${o.fill}`);
    if (o.stroke != null) parts.push(`stroke=${o.stroke}`);
    if (o.strokeWidth != null) parts.push(`strokeWidth=${o.strokeWidth}`);
    if (o.fontSize != null) parts.push(`fontSize=${o.fontSize}`);
    if (o.fontFamily != null) parts.push(`fontFamily=${o.fontFamily}`);
    if (o.fontWeight != null) parts.push(`fontWeight=${o.fontWeight}`);
    if (o.textAlign != null) parts.push(`textAlign=${o.textAlign}`);
    if (o.text != null) parts.push(`text=${JSON.stringify(o.text)}`);
    if (o.src != null) parts.push(`src=${o.src}`);
    if (o.deviceFrame != null) {
      parts.push(
        `deviceFrame=${o.deviceFrame.category}/${o.deviceFrame.device}/${o.deviceFrame.variation}`,
      );
    }
    lines.push(`  - ${parts.join(" ")}`);
  }
  return lines.join("\n");
};

/**
 * Stable hash of a scene summary. Small enough to round-trip through SSE and
 * detect when the canvas changed under the AI's feet between turns.
 */
export const hashScene = (scene: SceneSummary): string => {
  // FNV-1a over the canonical JSON form. Cheap, no deps, plenty for our needs.
  const str = JSON.stringify(scene);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

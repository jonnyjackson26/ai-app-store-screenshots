import { fabric } from "fabric";

import {
  FILL_COLOR,
  type ColorValue,
  type GradientFill,
} from "@/features/editor/types";

export const isGradientFill = (value: unknown): value is GradientFill => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "linear" &&
    Array.isArray(v.colorStops) &&
    !!v.coords &&
    typeof v.coords === "object"
  );
};

// Convert a structured GradientFill into a fabric.Gradient instance. Plain
// color strings pass through unchanged. The return type is widened to
// `string` because @types/fabric declares `fill`/`stroke` as `string |
// undefined`, but Fabric accepts `fabric.Gradient` at runtime — the typings
// lie, so we lie back at the boundary.
export const materializeFill = (value: ColorValue): string => {
  if (typeof value === "string") return value;
  return new fabric.Gradient({
    type: value.type,
    coords: value.coords,
    colorStops: value.colorStops,
  }) as unknown as string;
};

// Convert whatever Fabric handed us back (a string, a fabric.Gradient
// instance, or a serialized gradient blob from loadFromJSON) into the
// JSON-shaped ColorValue the picker UI works with.
export const dematerializeFill = (value: unknown): ColorValue => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return FILL_COLOR;
  const v = value as Record<string, unknown> & {
    type?: string;
    coords?: GradientFill["coords"];
    colorStops?: unknown;
  };
  if (v.type !== "linear" || !v.coords) return FILL_COLOR;
  const stops = Array.isArray(v.colorStops)
    ? (v.colorStops as { offset: number; color: string }[]).map((s) => ({
        offset: typeof s.offset === "number" ? s.offset : 0,
        color: typeof s.color === "string" ? s.color : "rgba(0,0,0,1)",
      }))
    : [];
  if (stops.length < 2) return FILL_COLOR;
  return { type: "linear", coords: v.coords, colorStops: stops };
};

// Linear gradient coords for a given angle (degrees, 0° = left→right, 90° =
// top→bottom). Coords are in the object's local pixel space (Fabric
// convention; matches the AI system prompt).
export const coordsForAngle = (
  angle: number,
  width: number,
  height: number,
): { x1: number; y1: number; x2: number; y2: number } => {
  const a = ((angle % 360) + 360) % 360;
  const rad = (a * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  // Half-extent of the bounding box projected onto the gradient direction
  // so the line spans corner-to-corner regardless of angle.
  const half = (Math.abs(Math.cos(rad)) * width + Math.abs(Math.sin(rad)) * height) / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return {
    x1: cx - dx,
    y1: cy - dy,
    x2: cx + dx,
    y2: cy + dy,
  };
};

// Best-effort recovery of the angle used to generate a set of linear coords.
// Returns 0 for degenerate (zero-length) coords.
export const angleFromCoords = (coords: GradientFill["coords"]): number => {
  const dx = coords.x2 - coords.x1;
  const dy = coords.y2 - coords.y1;
  if (dx === 0 && dy === 0) return 0;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return ((Math.round(deg) % 360) + 360) % 360;
};

// CSS string suitable for setting `style.background` to preview a ColorValue.
export const colorValueToCss = (value: ColorValue): string => {
  if (typeof value === "string") return value;
  const stops = value.colorStops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `${s.color} ${(s.offset * 100).toFixed(1)}%`)
    .join(", ");
  // CSS angle convention has 0° pointing up; Fabric's convention has 0°
  // pointing right (along +x). Convert: cssAngle = fabricAngle + 90°.
  const angle = angleFromCoords(value.coords) + 90;
  return `linear-gradient(${angle}deg, ${stops})`;
};

export const firstStopColor = (value: ColorValue): string => {
  if (typeof value === "string") return value;
  return value.colorStops[0]?.color ?? FILL_COLOR;
};

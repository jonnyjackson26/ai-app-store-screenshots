import { useCallback, useMemo, useRef, useState } from "react";
import { ChromePicker, CirclePicker } from "react-color";
import { Trash2 } from "lucide-react";

import {
  colors,
  type ColorValue,
  type GradientFill,
} from "@/features/editor/types";
import { rgbaObjectToString } from "@/features/editor/utils";
import {
  angleFromCoords,
  colorValueToCss,
  coordsForAngle,
} from "@/features/editor/color-utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "solid" | "gradient";

interface ColorPickerProps {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
  targetSize?: { width: number; height: number };
  allowGradient?: boolean;
}

const DEFAULT_SIZE = { width: 400, height: 400 };

const DEFAULT_GRADIENT_STOPS: GradientFill["colorStops"] = [
  { offset: 0, color: "rgba(168, 85, 247, 1)" },
  { offset: 1, color: "rgba(236, 72, 153, 1)" },
];

const parseRgba = (
  color: string,
): { r: number; g: number; b: number; a: number } => {
  const m = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] : 1 };
  if (color.startsWith("#")) {
    const hex =
      color.length === 4
        ? color
            .slice(1)
            .split("")
            .map((c) => c + c)
            .join("")
        : color.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16) || 0,
      g: parseInt(hex.slice(2, 4), 16) || 0,
      b: parseInt(hex.slice(4, 6), 16) || 0,
      a: 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
};

const interpolateColorAt = (
  stops: GradientFill["colorStops"],
  offset: number,
): string => {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  if (offset <= sorted[0].offset) return sorted[0].color;
  if (offset >= sorted[sorted.length - 1].offset)
    return sorted[sorted.length - 1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (offset >= a.offset && offset <= b.offset) {
      const t = (offset - a.offset) / (b.offset - a.offset || 1);
      const ca = parseRgba(a.color);
      const cb = parseRgba(b.color);
      return `rgba(${Math.round(ca.r + (cb.r - ca.r) * t)}, ${Math.round(
        ca.g + (cb.g - ca.g) * t,
      )}, ${Math.round(ca.b + (cb.b - ca.b) * t)}, ${(
        ca.a +
        (cb.a - ca.a) * t
      ).toFixed(3)})`;
    }
  }
  return sorted[0].color;
};

const cloneStops = (stops: GradientFill["colorStops"]): GradientFill["colorStops"] =>
  stops.map((s) => ({ offset: s.offset, color: s.color }));

const seedGradient = (
  size: { width: number; height: number },
  existingStops?: GradientFill["colorStops"],
): GradientFill => {
  const colorStops =
    existingStops && existingStops.length >= 2
      ? cloneStops(existingStops)
      : DEFAULT_GRADIENT_STOPS.map((s) => ({ ...s }));
  return {
    type: "linear",
    coords: coordsForAngle(0, size.width, size.height),
    colorStops,
  };
};

const detectMode = (value: ColorValue): Mode =>
  typeof value === "string" ? "solid" : "gradient";

export const ColorPicker = ({
  value,
  onChange,
  targetSize,
  allowGradient = true,
}: ColorPickerProps) => {
  const size = targetSize ?? DEFAULT_SIZE;

  // Track the user's working gradient locally so editing offsets/colors
  // doesn't lose UI state on each upstream change. If `value` arrives as a
  // gradient (e.g. from getActiveFillColor on a selected object), we
  // honor it; otherwise we keep our last gradient draft so users can
  // toggle Solid <-> Gradient without losing their stops.
  const [draft, setDraft] = useState<GradientFill | null>(() =>
    typeof value === "object" ? value : null,
  );
  const lastEmittedRef = useRef<ColorValue | null>(null);

  const mode: Mode = detectMode(value);
  const solidColor = typeof value === "string" ? value : "rgba(0,0,0,1)";
  const gradient: GradientFill | null =
    typeof value === "object" ? value : draft;

  const [activeStopIndex, setActiveStopIndex] = useState(0);

  const emit = useCallback(
    (next: ColorValue) => {
      lastEmittedRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    if (nextMode === "solid") {
      // Take the first stop's color as the solid fallback.
      const fallback =
        gradient?.colorStops[0]?.color ?? solidColor ?? "rgba(0,0,0,1)";
      emit(fallback);
      return;
    }
    const next = gradient ?? seedGradient(size);
    setDraft(next);
    emit(next);
    setActiveStopIndex(0);
  };

  const updateGradient = (next: GradientFill) => {
    setDraft(next);
    emit(next);
  };

  const updateAngle = (angle: number) => {
    if (!gradient) return;
    updateGradient({
      ...gradient,
      coords: coordsForAngle(angle, size.width, size.height),
    });
  };

  const updateStopColor = (index: number, color: string) => {
    if (!gradient) return;
    const stops = cloneStops(gradient.colorStops);
    if (!stops[index]) return;
    stops[index] = { ...stops[index], color };
    updateGradient({ ...gradient, colorStops: stops });
  };

  const updateStopOffset = (index: number, offset: number) => {
    if (!gradient) return;
    const stops = cloneStops(gradient.colorStops);
    if (!stops[index]) return;
    stops[index] = { ...stops[index], offset };
    updateGradient({ ...gradient, colorStops: stops });
  };

  const addStop = () => {
    if (!gradient) return;
    const stops = cloneStops(gradient.colorStops);
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    // Insert at the midpoint of the largest gap so the new handle has room.
    let bestOffset = 0.5;
    let bestGap = -1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].offset - sorted[i].offset;
      if (gap > bestGap) {
        bestGap = gap;
        bestOffset = (sorted[i].offset + sorted[i + 1].offset) / 2;
      }
    }
    const color = interpolateColorAt(stops, bestOffset);
    stops.push({ offset: bestOffset, color });
    updateGradient({ ...gradient, colorStops: stops });
    setActiveStopIndex(stops.length - 1);
  };

  const removeStop = (index: number) => {
    if (!gradient) return;
    if (gradient.colorStops.length <= 2) return;
    const stops = cloneStops(gradient.colorStops).filter((_, i) => i !== index);
    updateGradient({ ...gradient, colorStops: stops });
    setActiveStopIndex((i) => Math.max(0, Math.min(i, stops.length - 1)));
  };

  const trackRef = useRef<HTMLDivElement>(null);

  const offsetFromClientX = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const beginDragStop = (
    index: number,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveStopIndex(index);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const move = (ev: PointerEvent) => {
      const next = offsetFromClientX(ev.clientX);
      if (next === null) return;
      updateStopOffset(index, next);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const previewBackground = useMemo(() => {
    if (mode === "solid") return solidColor;
    return gradient ? colorValueToCss(gradient) : solidColor;
  }, [mode, solidColor, gradient]);

  const angle = gradient ? angleFromCoords(gradient.coords) : 0;
  const activeStop = gradient?.colorStops[activeStopIndex];

  return (
    <div className="w-full space-y-4">
      {allowGradient && (
        <div className="grid grid-cols-2 rounded-md border bg-muted/40 p-1 text-sm">
          {([
            { id: "solid", label: "Solid color" },
            { id: "gradient", label: "Gradient" },
          ] as { id: Mode; label: string }[]).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => switchMode(m.id)}
              className={cn(
                "py-1 rounded-sm transition-colors",
                mode === m.id
                  ? "bg-white shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {mode === "solid" && (
        <>
          <ChromePicker
            color={solidColor}
            onChange={(color) => emit(rgbaObjectToString(color.rgb))}
            className="border rounded-lg"
          />
          <CirclePicker
            color={solidColor}
            colors={colors}
            onChangeComplete={(color) => emit(rgbaObjectToString(color.rgb))}
          />
        </>
      )}

      {mode === "gradient" && gradient && (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Color stops
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addStop}
                className="h-7 px-2"
              >
                + Add stop
              </Button>
            </div>
            <div
              ref={trackRef}
              className="relative h-10 w-full rounded-md border"
              style={{ background: previewBackground }}
            />
            <div className="relative h-6 w-full">
              {gradient.colorStops.map((stop, i) => (
                <button
                  key={i}
                  type="button"
                  onPointerDown={(e) => beginDragStop(i, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveStopIndex(i);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault();
                      removeStop(i);
                    }
                  }}
                  style={{ left: `${stop.offset * 100}%` }}
                  className={cn(
                    "absolute top-0 -translate-x-1/2 size-5 rounded-full border-2 shadow cursor-grab active:cursor-grabbing transition-transform focus:outline-none",
                    activeStopIndex === i
                      ? "border-blue-500 ring-2 ring-blue-300 scale-110"
                      : "border-white",
                  )}
                  aria-label={`Stop ${i + 1} at ${Math.round(stop.offset * 100)}%`}
                >
                  <span
                    className="block size-full rounded-full"
                    style={{ background: stop.color }}
                  />
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Drag a handle to move. Press Backspace to delete the selected stop.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Angle</span>
              <span>{angle}°</span>
            </div>
            <Slider
              value={[angle]}
              min={0}
              max={359}
              step={1}
              onValueChange={(v) => updateAngle(v[0])}
            />
          </div>

          {activeStop && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Stop color · {Math.round(activeStop.offset * 100)}%
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeStop(activeStopIndex)}
                  disabled={gradient.colorStops.length <= 2}
                  className="text-muted-foreground hover:text-red-500 h-7 px-2"
                >
                  <Trash2 className="size-4 mr-1" />
                  Delete
                </Button>
              </div>
              <ChromePicker
                color={activeStop.color}
                onChange={(color) =>
                  updateStopColor(activeStopIndex, rgbaObjectToString(color.rgb))
                }
                className="border rounded-lg"
              />
              <CirclePicker
                color={activeStop.color}
                colors={colors}
                onChangeComplete={(color) =>
                  updateStopColor(activeStopIndex, rgbaObjectToString(color.rgb))
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

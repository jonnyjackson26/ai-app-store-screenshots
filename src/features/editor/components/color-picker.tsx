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
  radialCoords,
} from "@/features/editor/color-utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "solid" | "linear" | "radial";

interface ColorPickerProps {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
  targetSize?: { width: number; height: number };
  allowGradient?: boolean;
}

const DEFAULT_SIZE = { width: 400, height: 400 };

const cloneStops = (stops: GradientFill["colorStops"]): GradientFill["colorStops"] =>
  stops.map((s) => ({ offset: s.offset, color: s.color }));

const seedGradient = (
  type: "linear" | "radial",
  baseColor: string,
  size: { width: number; height: number },
  existingStops?: GradientFill["colorStops"],
): GradientFill => {
  const colorStops =
    existingStops && existingStops.length >= 2
      ? cloneStops(existingStops)
      : [
          { offset: 0, color: baseColor },
          { offset: 1, color: "rgba(0,0,0,0)" },
        ];
  const coords =
    type === "linear"
      ? coordsForAngle(0, size.width, size.height)
      : radialCoords(size.width, size.height);
  return { type, coords, colorStops };
};

const detectMode = (value: ColorValue): Mode => {
  if (typeof value === "string") return "solid";
  return value.type;
};

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
    // Going Solid -> gradient OR linear <-> radial.
    const next = gradient
      ? {
          ...gradient,
          type: nextMode,
          coords:
            nextMode === "linear"
              ? coordsForAngle(0, size.width, size.height)
              : radialCoords(size.width, size.height),
        }
      : seedGradient(nextMode, solidColor, size);
    setDraft(next);
    emit(next);
    setActiveStopIndex(0);
  };

  const updateGradient = (next: GradientFill) => {
    setDraft(next);
    emit(next);
  };

  const updateAngle = (angle: number) => {
    if (!gradient || gradient.type !== "linear") return;
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
    // Insert a midpoint between the last two stops, biased toward the end.
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2] ?? { offset: 0, color: last.color };
    stops.push({
      offset: Math.min(1, (prev.offset + last.offset) / 2 + 0.0001),
      color: last.color,
    });
    updateGradient({ ...gradient, colorStops: stops });
    setActiveStopIndex(stops.length - 1);
  };

  const removeStop = (index: number) => {
    if (!gradient) return;
    if (gradient.colorStops.length <= 2) return;
    const stops = cloneStops(gradient.colorStops).filter((_, i) => i !== index);
    updateGradient({ ...gradient, colorStops: stops });
    setActiveStopIndex((i) => Math.min(i, stops.length - 1));
  };

  const previewBackground = useMemo(() => {
    if (mode === "solid") return solidColor;
    return gradient ? colorValueToCss(gradient) : solidColor;
  }, [mode, solidColor, gradient]);

  const angle =
    gradient && gradient.type === "linear" ? angleFromCoords(gradient.coords) : 0;
  const activeStop = gradient?.colorStops[activeStopIndex];

  return (
    <div className="w-full space-y-4">
      {allowGradient && (
        <div className="grid grid-cols-3 rounded-md border bg-muted/40 p-1 text-sm">
          {(["solid", "linear", "radial"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                "py-1 rounded-sm capitalize transition-colors",
                mode === m
                  ? "bg-white shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
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

      {mode !== "solid" && gradient && (
        <div className="space-y-3">
          <div
            className={cn(
              "h-12 w-full rounded-md border",
              mode === "radial" && "rounded-full aspect-square h-auto max-w-[160px] mx-auto",
            )}
            style={{ background: previewBackground }}
          />

          {mode === "linear" && (
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
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Color stops
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addStop}
              >
                + Add stop
              </Button>
            </div>
            <div className="space-y-2">
              {gradient.colorStops.map((stop, i) => (
                <div
                  key={i}
                  onClick={() => setActiveStopIndex(i)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border p-2 cursor-pointer",
                    activeStopIndex === i
                      ? "border-blue-500 bg-blue-50"
                      : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <div
                    className="size-6 rounded border shrink-0"
                    style={{ background: stop.color }}
                  />
                  <Slider
                    value={[Math.round(stop.offset * 100)]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => updateStopOffset(i, v[0] / 100)}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                    {Math.round(stop.offset * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStop(i);
                    }}
                    disabled={gradient.colorStops.length <= 2}
                    className="text-muted-foreground hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Remove stop"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {activeStop && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Stop {activeStopIndex + 1} color
              </span>
              <ChromePicker
                color={activeStop.color}
                onChange={(color) =>
                  updateStopColor(activeStopIndex, rgbaObjectToString(color.rgb))
                }
                className="border rounded-lg"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

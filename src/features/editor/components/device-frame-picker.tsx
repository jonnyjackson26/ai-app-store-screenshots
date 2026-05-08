"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import type {
  DeviceFrameCategory,
  DeviceFrameVariation,
  DeviceFramesResponse,
} from "@/app/api/device-frames/route";
import type { Editor } from "@/features/editor/types";
import { deviceFrameKey } from "@/features/editor/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_CATEGORY = "apple-iphone";

interface DeviceFramePickerProps {
  editor: Editor | undefined;
}

type PendingApply = {
  categoryId: string;
  device: string;
  variation: string;
};

export const DeviceFramePicker = ({ editor }: DeviceFramePickerProps) => {
  const [data, setData] = useState<DeviceFramesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(DEFAULT_CATEGORY);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Re-render when the canvas selection changes, so the "Remove frame"
  // button and active-variation highlight reflect the active object.
  const [, forceTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFromPickerRef = useRef<PendingApply | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/device-frames")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return (await res.json()) as DeviceFramesResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        if (!json.categories.some((c) => c.id === DEFAULT_CATEGORY) && json.categories[0]) {
          setSelectedCategory(json.categories[0].id);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load frames");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = editor?.canvas;
    if (!canvas) return;
    const tick = () => forceTick((n) => n + 1);
    canvas.on("selection:created", tick);
    canvas.on("selection:updated", tick);
    canvas.on("selection:cleared", tick);
    canvas.on("object:modified", tick);
    return () => {
      canvas.off("selection:created", tick);
      canvas.off("selection:updated", tick);
      canvas.off("selection:cleared", tick);
      canvas.off("object:modified", tick);
    };
  }, [editor]);

  const variationKey = (device: string, variation: string) => `${device}::${variation}`;

  const submit = async (
    pending: PendingApply,
    payload: { sourceUrl?: string; file?: File },
  ) => {
    const key = variationKey(pending.device, pending.variation);
    setBusyKey(key);
    try {
      const formData = new FormData();
      formData.append("device", pending.device);
      formData.append("variation", pending.variation);
      formData.append("category", pending.categoryId);
      if (payload.file) formData.append("file", payload.file);
      else if (payload.sourceUrl) formData.append("sourceUrl", payload.sourceUrl);

      const res = await fetch("/api/device-frames/apply", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || `Request failed: ${res.status}`);
      }
      const json = (await res.json()) as { url: string; sourceUrl: string };

      const meta = {
        category: pending.categoryId,
        device: pending.device,
        variation: pending.variation,
        sourceUrl: json.sourceUrl,
        cachedKey: deviceFrameKey({
          category: pending.categoryId,
          device: pending.device,
          variation: pending.variation,
        }),
      };

      if (payload.sourceUrl) {
        editor?.applyDeviceFrameToSelected({ url: json.url, deviceFrame: meta });
      } else {
        editor?.addFramedImage({ url: json.url, deviceFrame: meta });
      }
      toast.success("Frame applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply frame");
    } finally {
      setBusyKey(null);
    }
  };

  const handleVariationClick = (
    categoryId: string,
    model: { device: string },
    v: DeviceFrameVariation,
  ) => {
    if (busyKey) return;
    const existing = editor?.getSelectedDeviceFrame?.() ?? null;
    const sourceUrl = existing?.sourceUrl ?? editor?.getSelectedImageSource?.() ?? null;
    const pending: PendingApply = {
      categoryId,
      device: model.device,
      variation: v.variation,
    };
    if (sourceUrl) {
      void submit(pending, { sourceUrl });
      return;
    }
    pendingFromPickerRef.current = pending;
    fileInputRef.current?.click();
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const pending = pendingFromPickerRef.current;
    pendingFromPickerRef.current = null;
    if (!file || !pending) return;
    void submit(pending, { file });
  };

  if (error) {
    return <p className="text-sm text-destructive">Couldn&apos;t load device frames: {error}</p>;
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading device frames...
      </div>
    );
  }

  const selectedFrame = editor?.getSelectedDeviceFrame?.() ?? null;
  const effectiveCategoryId = selectedFrame?.category ?? selectedCategory;
  const category: DeviceFrameCategory | undefined =
    data.categories.find((c) => c.id === effectiveCategoryId) ?? data.categories[0];

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePicked}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="device-frame-category" className="text-xs font-medium text-muted-foreground">
          Device type
        </label>
        <select
          id="device-frame-category"
          value={category?.id ?? DEFAULT_CATEGORY}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          Select an image on the canvas, then click a frame to apply it. With nothing selected, you&apos;ll be prompted to upload one.
        </p>
      </div>

      {selectedFrame && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="font-medium">Current frame</p>
            <p className="truncate text-muted-foreground">
              {selectedFrame.device} · {selectedFrame.variation}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busyKey !== null}
            onClick={() => editor?.removeDeviceFrameFromSelected?.()}
          >
            <X className="size-3.5" /> Remove
          </Button>
        </div>
      )}

      {category?.models.map((model) => (
        <section key={model.device} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{model.modelLabel}</h3>
          <div className="grid grid-cols-3 gap-2">
            {model.variations.map((v) => {
              const isLandscape = v.frameSize.width > v.frameSize.height;
              const key = variationKey(model.device, v.variation);
              const isBusy = busyKey === key;
              const disabled = busyKey !== null;
              const isActive =
                selectedFrame?.device === model.device &&
                selectedFrame?.variation === v.variation;
              return (
                <button
                  key={`${model.device}-${v.variation}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleVariationClick(category!.id, model, v)}
                  className={cn(
                    "group relative flex flex-col items-center gap-1 rounded-md border bg-muted/30 p-1.5 transition",
                    !disabled && "hover:border-primary hover:bg-muted",
                    disabled && "opacity-60",
                    isActive && "border-primary ring-1 ring-primary",
                  )}
                  title={`${model.modelLabel} — ${v.variationLabel}`}
                >
                  <div
                    className={cn(
                      "relative flex w-full items-center justify-center overflow-hidden rounded",
                      isLandscape ? "aspect-[4/3]" : "aspect-[3/4]",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.frameUrl}
                      alt={`${model.modelLabel} ${v.variationLabel}`}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                    {isBusy && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <Loader2 className="size-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <span className="line-clamp-1 w-full text-center text-[10px] text-muted-foreground">
                    {v.variationLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

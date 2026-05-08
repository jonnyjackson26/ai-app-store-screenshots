"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import type {
  DeviceFrameCategory,
  DeviceFramesResponse,
} from "@/app/api/device-frames/route";
import { cn } from "@/lib/utils";

const DEFAULT_CATEGORY = "apple-iphone";

export const DeviceFramePicker = () => {
  const [data, setData] = useState<DeviceFramesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(DEFAULT_CATEGORY);

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

  const category: DeviceFrameCategory | undefined =
    data.categories.find((c) => c.id === selectedCategory) ?? data.categories[0];

  return (
    <div className="flex flex-col gap-4">
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
      </div>

      {category?.models.map((model) => (
        <section key={model.device} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{model.modelLabel}</h3>
          <div className="grid grid-cols-3 gap-2">
            {model.variations.map((v) => {
              const isLandscape = v.frameSize.width > v.frameSize.height;
              return (
                <button
                  key={`${model.device}-${v.variation}`}
                  type="button"
                  className={cn(
                    "group relative flex flex-col items-center gap-1 rounded-md border bg-muted/30 p-1.5 transition hover:border-primary hover:bg-muted",
                  )}
                  title={`${model.modelLabel} — ${v.variationLabel}`}
                >
                  <div
                    className={cn(
                      "flex w-full items-center justify-center overflow-hidden rounded",
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

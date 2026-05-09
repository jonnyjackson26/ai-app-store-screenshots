import { useEffect, useMemo, useState } from "react";

import {
  ActiveTool,
  type ColorValue,
  DEFAULT_NUM_PAGES,
  DEFAULT_PAGE_GAP,
  Editor,
  FILL_COLOR,
} from "@/features/editor/types";
import {
  CUSTOM_PRESET_ID,
  DEVICE_PRESETS,
  PLATFORM_LABELS,
  Platform,
  findPresetByDimensions,
} from "@/features/editor/device-presets";
import { dematerializeFill } from "@/features/editor/color-utils";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { ColorPicker } from "@/features/editor/components/color-picker";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SettingsSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

const SELECT_CLASSES =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export const SettingsSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: SettingsSidebarProps) => {
  const workspace = editor?.getWorkspace();

  const initialNumPages = useMemo(() => {
    const raw = (workspace as (fabric.Object & { numPages?: number }) | undefined)?.numPages;
    const parsed = typeof raw === "number" && raw >= 1 ? Math.floor(raw) : DEFAULT_NUM_PAGES;
    return `${parsed}`;
  }, [workspace]);
  const initialPageWidth = useMemo(() => {
    const totalWidth = workspace?.width ?? 0;
    const pages = parseInt(initialNumPages, 10) || DEFAULT_NUM_PAGES;
    return `${Math.round(totalWidth / pages)}`;
  }, [workspace, initialNumPages]);
  const initialPageGap = useMemo(() => {
    const raw = (workspace as (fabric.Object & { pageGap?: number }) | undefined)?.pageGap;
    const parsed = typeof raw === "number" && raw >= 0 ? raw : DEFAULT_PAGE_GAP;
    return `${parsed}`;
  }, [workspace]);
  const initialHeight = useMemo(() => `${workspace?.height ?? 0}`, [workspace]);
  const initialBackground = useMemo<ColorValue>(
    () => (workspace?.fill ? dematerializeFill(workspace.fill) : FILL_COLOR),
    [workspace],
  );

  const initialMatch = useMemo(
    () => findPresetByDimensions(parseInt(initialPageWidth, 10), parseInt(initialHeight, 10)),
    [initialPageWidth, initialHeight],
  );

  const [pageWidth, setPageWidth] = useState(initialPageWidth);
  const [numPages, setNumPages] = useState(initialNumPages);
  const [pageGap, setPageGap] = useState(initialPageGap);
  const [height, setHeight] = useState(initialHeight);
  const [background, setBackground] = useState<ColorValue>(initialBackground);
  const [platform, setPlatform] = useState<Platform>(initialMatch?.platform ?? "apple");
  const [presetId, setPresetId] = useState<string>(initialMatch?.presetId ?? CUSTOM_PRESET_ID);
  const [showAdvanced, setShowAdvanced] = useState(!initialMatch);

  useEffect(() => {
    setPageWidth(initialPageWidth);
    setNumPages(initialNumPages);
    setPageGap(initialPageGap);
    setHeight(initialHeight);
    setBackground(initialBackground);
    if (initialMatch) {
      setPlatform(initialMatch.platform);
      setPresetId(initialMatch.presetId);
    } else {
      setPresetId(CUSTOM_PRESET_ID);
    }
  },
  [
    initialPageWidth,
    initialNumPages,
    initialPageGap,
    initialHeight,
    initialBackground,
    initialMatch,
  ]);

  const applyPreset = (width: number, height: number) => {
    setPageWidth(`${width}`);
    setHeight(`${height}`);
    editor?.changeSize({
      width,
      height,
      numPages: parseInt(numPages, 10) || DEFAULT_NUM_PAGES,
      pageGap: parseInt(pageGap, 10) || 0,
    });
  };

  const onPlatformChange = (next: Platform) => {
    setPlatform(next);
    const first = DEVICE_PRESETS[next][0];
    if (first) {
      setPresetId(first.id);
      applyPreset(first.width, first.height);
    }
  };

  const onPresetChange = (id: string) => {
    setPresetId(id);
    if (id === CUSTOM_PRESET_ID) return;
    const preset = DEVICE_PRESETS[platform].find((p) => p.id === id);
    if (preset) {
      applyPreset(preset.width, preset.height);
    }
  };

  const changePageWidth = (value: string) => {
    setPageWidth(value);
    const match = findPresetByDimensions(parseInt(value, 10), parseInt(height, 10));
    setPresetId(match?.presetId ?? CUSTOM_PRESET_ID);
    if (match) setPlatform(match.platform);
  };
  const changeNumPages = (value: string) => setNumPages(value);
  const changePageGap = (value: string) => setPageGap(value);
  const changeHeight = (value: string) => {
    setHeight(value);
    const match = findPresetByDimensions(parseInt(pageWidth, 10), parseInt(value, 10));
    setPresetId(match?.presetId ?? CUSTOM_PRESET_ID);
    if (match) setPlatform(match.platform);
  };
  const changeBackground = (value: ColorValue) => {
    setBackground(value);
    editor?.changeBackground(value);
  };

  const workspaceTargetSize = (() => {
    const totalWidth = workspace?.width ?? 0;
    const pages = parseInt(numPages, 10) || DEFAULT_NUM_PAGES;
    const perPageWidth = pages > 0 ? Math.round(totalWidth / pages) : totalWidth;
    return {
      width: perPageWidth || 400,
      height: workspace?.height || 400,
    };
  })();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    editor?.changeSize({
      width: parseInt(pageWidth, 10),
      height: parseInt(height, 10),
      numPages: parseInt(numPages, 10),
      pageGap: parseInt(pageGap, 10) || 0,
    });
  }

  const onClose = () => {
    onChangeActiveTool("select");
  };

  const presets = DEVICE_PRESETS[platform];
  const isCustom = presetId === CUSTOM_PRESET_ID;

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "settings" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title="Settings"
        description="Change the look of your workspace"
      />
      <ScrollArea>
        <form className="space-y-4 p-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label>Platform</Label>
            <select
              value={platform}
              onChange={(e) => onPlatformChange(e.target.value as Platform)}
              className={SELECT_CLASSES}
            >
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Screenshot size</Label>
            <select
              value={presetId}
              onChange={(e) => onPresetChange(e.target.value)}
              className={SELECT_CLASSES}
            >
              {isCustom && (
                <option value={CUSTOM_PRESET_ID}>Custom dimensions</option>
              )}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.width} × {p.height})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-md border bg-muted/30 p-3">
              <div className="space-y-2">
                <Label>Page width</Label>
                <Input
                  placeholder="Page width"
                  value={pageWidth}
                  type="number"
                  onChange={(e) => changePageWidth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Height</Label>
                <Input
                  placeholder="Height"
                  value={height}
                  type="number"
                  onChange={(e) => changeHeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Number of pages</Label>
                <Input
                  placeholder="Number of pages"
                  value={numPages}
                  type="number"
                  min={1}
                  step={1}
                  onChange={(e) => changeNumPages(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Page gap</Label>
                <Input
                  placeholder="Page gap"
                  value={pageGap}
                  type="number"
                  min={0}
                  step={1}
                  onChange={(e) => changePageGap(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">
                Resize
              </Button>
            </div>
          )}
        </form>
        <div className="p-4">
          <ColorPicker
            value={background}
            onChange={changeBackground}
            targetSize={workspaceTargetSize}
          />
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};

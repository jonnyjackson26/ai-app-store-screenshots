import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

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
}

type SectionId = "advanced" | "background";

type ResizeOverrides = Partial<{
  width: number;
  height: number;
  numPages: number;
  pageGap: number;
}>;

const SELECT_CLASSES =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

const toIntOr = (value: string, fallback: number) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

interface AccordionSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AccordionSection = ({ title, isOpen, onToggle, children }: AccordionSectionProps) => (
  <div className="border-b last:border-b-0">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <ChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180",
        )}
      />
    </button>
    {isOpen && <div className="px-4 pb-4">{children}</div>}
  </div>
);

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
    const pages = toIntOr(initialNumPages, DEFAULT_NUM_PAGES);
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
    () => findPresetByDimensions(toIntOr(initialPageWidth, 0), toIntOr(initialHeight, 0)),
    [initialPageWidth, initialHeight],
  );

  const [pageWidth, setPageWidth] = useState(initialPageWidth);
  const [numPages, setNumPages] = useState(initialNumPages);
  const [pageGap, setPageGap] = useState(initialPageGap);
  const [height, setHeight] = useState(initialHeight);
  const [background, setBackground] = useState<ColorValue>(initialBackground);
  const [platform, setPlatform] = useState<Platform>(initialMatch?.platform ?? "apple");
  const [presetId, setPresetId] = useState<string>(initialMatch?.presetId ?? CUSTOM_PRESET_ID);
  const [openSection, setOpenSection] = useState<SectionId | null>(initialMatch ? null : "advanced");

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
  }, [
    initialPageWidth,
    initialNumPages,
    initialPageGap,
    initialHeight,
    initialBackground,
    initialMatch,
  ]);

  const applyResize = (overrides: ResizeOverrides = {}) => {
    editor?.changeSize({
      width: overrides.width ?? toIntOr(pageWidth, 0),
      height: overrides.height ?? toIntOr(height, 0),
      numPages: overrides.numPages ?? toIntOr(numPages, DEFAULT_NUM_PAGES),
      pageGap: overrides.pageGap ?? toIntOr(pageGap, 0),
    });
  };

  const syncPresetFromDimensions = (widthValue: string, heightValue: string) => {
    const match = findPresetByDimensions(toIntOr(widthValue, 0), toIntOr(heightValue, 0));
    setPresetId(match?.presetId ?? CUSTOM_PRESET_ID);
    if (match) setPlatform(match.platform);
  };

  const onPlatformChange = (next: Platform) => {
    setPlatform(next);
    const first = DEVICE_PRESETS[next][0];
    if (!first) return;
    setPresetId(first.id);
    setPageWidth(`${first.width}`);
    setHeight(`${first.height}`);
    applyResize({ width: first.width, height: first.height });
  };

  const onPresetChange = (id: string) => {
    setPresetId(id);
    if (id === CUSTOM_PRESET_ID) return;
    const preset = DEVICE_PRESETS[platform].find((p) => p.id === id);
    if (!preset) return;
    setPageWidth(`${preset.width}`);
    setHeight(`${preset.height}`);
    applyResize({ width: preset.width, height: preset.height });
  };

  const changeNumPages = (value: string) => {
    setNumPages(value);
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    applyResize({ numPages: parsed });
  };

  const changePageWidth = (value: string) => {
    setPageWidth(value);
    syncPresetFromDimensions(value, height);
  };

  const changeHeight = (value: string) => {
    setHeight(value);
    syncPresetFromDimensions(pageWidth, value);
  };

  const changePageGap = (value: string) => setPageGap(value);

  const changeBackground = (value: ColorValue) => {
    setBackground(value);
    editor?.changeBackground(value);
  };

  const toggleSection = (id: SectionId) =>
    setOpenSection((current) => (current === id ? null : id));

  const workspaceTargetSize = useMemo(() => {
    const totalWidth = workspace?.width ?? 0;
    const pages = toIntOr(numPages, DEFAULT_NUM_PAGES);
    const perPageWidth = pages > 0 ? Math.round(totalWidth / pages) : totalWidth;
    return {
      width: perPageWidth || 400,
      height: workspace?.height || 400,
    };
  }, [workspace, numPages]);

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
        <div className="space-y-4 p-4">
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
        </div>

        <div className="border-t">
          <AccordionSection
            title="Advanced sizing"
            isOpen={openSection === "advanced"}
            onToggle={() => toggleSection("advanced")}
          >
            <div className="space-y-4">
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
              <Button type="button" className="w-full" onClick={() => applyResize()}>
                Resize
              </Button>
            </div>
          </AccordionSection>
          <AccordionSection
            title="Background color"
            isOpen={openSection === "background"}
            onToggle={() => toggleSection("background")}
          >
            <ColorPicker
              value={background}
              onChange={changeBackground}
              targetSize={workspaceTargetSize}
            />
          </AccordionSection>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={() => onChangeActiveTool("select")} />
    </aside>
  );
};

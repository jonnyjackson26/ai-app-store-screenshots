import { useEffect, useMemo, useState } from "react";

import { ActiveTool, DEFAULT_NUM_PAGES, Editor } from "@/features/editor/types";
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
  const initialHeight = useMemo(() => `${workspace?.height ?? 0}`, [workspace]);
  const initialBackground = useMemo(() => workspace?.fill ?? "#ffffff", [workspace]);

  const [pageWidth, setPageWidth] = useState(initialPageWidth);
  const [numPages, setNumPages] = useState(initialNumPages);
  const [height, setHeight] = useState(initialHeight);
  const [background, setBackground] = useState(initialBackground);

  useEffect(() => {
    setPageWidth(initialPageWidth);
    setNumPages(initialNumPages);
    setHeight(initialHeight);
    setBackground(initialBackground);
  },
  [
    initialPageWidth,
    initialNumPages,
    initialHeight,
    initialBackground
  ]);

  const changePageWidth = (value: string) => setPageWidth(value);
  const changeNumPages = (value: string) => setNumPages(value);
  const changeHeight = (value: string) => setHeight(value);
  const changeBackground = (value: string) => {
    setBackground(value);
    editor?.changeBackground(value);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    editor?.changeSize({
      width: parseInt(pageWidth, 10),
      height: parseInt(height, 10),
      numPages: parseInt(numPages, 10),
    });
  }

  const onClose = () => {
    onChangeActiveTool("select");
  };

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
            <Label>
              Height
            </Label>
            <Input
              placeholder="Height"
              value={height}
              type="number"
              onChange={(e) => changeHeight(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Page width
            </Label>
            <Input
              placeholder="Page width"
              value={pageWidth}
              type="number"
              onChange={(e) => changePageWidth(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Number of pages
            </Label>
            <Input
              placeholder="Number of pages"
              value={numPages}
              type="number"
              min={1}
              step={1}
              onChange={(e) => changeNumPages(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Resize
          </Button>
        </form>
        <div className="p-4">
          <ColorPicker
            value={background as string} // We dont support gradients or patterns
            onChange={changeBackground}
          />
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};

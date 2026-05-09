import { useEffect, useState } from "react";

import {
  ActiveTool,
  Editor,
} from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConfirm } from "@/hooks/use-confirm";
import { LocalTemplate } from "@/lib/templates";

interface TemplateSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

export const TemplateSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: TemplateSidebarProps) => {
  const [ConfirmDialog, confirm] = useConfirm(
    "Are you sure?",
    "You are about to replace the current project with this template."
  );

  const [templates, setTemplates] = useState<LocalTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => [])
      .then((data: LocalTemplate[]) => {
        if (!cancelled) setTemplates(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  const onClick = async (template: LocalTemplate) => {
    const ok = await confirm();
    if (!ok) return;

    const response = await fetch(template.json);
    const json = await response.text();
    editor?.loadJson(json);
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "templates" ? "visible" : "hidden",
      )}
    >
      <ConfirmDialog />
      <ToolSidebarHeader
        title="Templates"
        description="Choose from a variety of templates to get started"
      />
      <ScrollArea>
        <div className="p-4 flex flex-col gap-4">
          {templates.map((template) => (
            <button
              onClick={() => onClick(template)}
              key={template.id}
              className="w-full group hover:opacity-75 transition bg-muted rounded-sm overflow-hidden border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={template.thumbnailUrl}
                alt={template.id}
                className="block w-full h-auto"
              />
            </button>
          ))}
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};

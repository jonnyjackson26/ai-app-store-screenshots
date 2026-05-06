import Image from "next/image";

import {
  ActiveTool,
  Editor,
} from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConfirm } from "@/hooks/use-confirm";
import { localTemplates, LocalTemplate } from "@/lib/templates";

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
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            {localTemplates.map((template) => (
              <button
                style={{
                  aspectRatio: `${template.width}/${template.height}`,
                }}
                onClick={() => onClick(template)}
                key={template.id}
                className="relative w-full group hover:opacity-75 transition bg-muted rounded-sm overflow-hidden border"
              >
                <Image
                  fill
                  src={template.thumbnailUrl}
                  alt={template.name}
                  className="object-cover"
                />
                <div className="opacity-0 group-hover:opacity-100 absolute left-0 bottom-0 w-full text-[10px] truncate text-white p-1 bg-black/50 text-left">
                  {template.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};

"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { ActiveTool, Editor } from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { useJsonSync } from "@/features/editor/hooks/use-json-sync";

import { cn } from "@/lib/utils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
      Loading editor…
    </div>
  ),
});

interface JsonSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

export const JsonSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: JsonSidebarProps) => {
  const { value, setValue, status } = useJsonSync(editor);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[480px] h-full flex flex-col",
        activeTool === "json" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title="Document JSON"
        description="Edit the raw Fabric document"
      />
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language="json"
          theme="vs"
          value={value}
          onChange={setValue}
          options={{
            minimap: { enabled: false },
            formatOnPaste: true,
            tabSize: 2,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontSize: 12,
            renderLineHighlight: "line",
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
        />
      </div>
      <div
        className={cn(
          "border-t px-4 py-2 text-xs flex items-center gap-x-2",
          status.ok ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {status.ok ? (
          <>
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span>In sync with canvas</span>
          </>
        ) : (
          <>
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="truncate" title={status.message}>
              Invalid JSON — canvas paused
              {status.message ? `: ${status.message}` : ""}
            </span>
          </>
        )}
      </div>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};

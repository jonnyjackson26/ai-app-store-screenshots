"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  History,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { ActiveTool, Editor } from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { useAiChat } from "@/features/ai/hooks/use-ai-chat";
import { OpRow } from "@/features/ai/components/op-row";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AiSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
  aiApplying: React.MutableRefObject<boolean>;
}

export const AiSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
  aiApplying,
}: AiSidebarProps) => {
  const {
    messages,
    current,
    turns,
    busy,
    error,
    send,
    toggleOp,
    acceptCurrent,
    rejectCurrent,
    revertTurn,
    clearChat,
  } = useAiChat(editor, aiApplying);

  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, current?.responseText, current?.ops.length]);

  const onClose = () => onChangeActiveTool("select");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy || current) return;
    const value = input;
    setInput("");
    await send(value);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSubmit(e);
    }
  };

  const onRevert = (turnId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    const idx = turns.findIndex((t) => t.id === turnId);
    const laterCount = turns.length - 1 - idx;
    if (laterCount > 0) {
      const ok = window.confirm(
        `This will also undo ${laterCount} later AI ${laterCount === 1 ? "change" : "changes"}. Continue?`,
      );
      if (!ok) return;
    }
    void revertTurn(turnId);
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[480px] h-full flex flex-col",
        activeTool === "ai" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title="AI assistant"
        description="Describe a change and review proposed edits"
      />

      <div ref={transcriptRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !current && turns.length === 0 && (
          <div className="text-xs text-muted-foreground space-y-2">
            <p className="flex items-center gap-x-1.5">
              <Sparkles className="size-3.5" />
              Try asking things like:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>&quot;Change the title to &apos;Hello&apos;&quot;</li>
              <li>&quot;Make all the text bigger&quot;</li>
              <li>&quot;Add a new page&quot;</li>
              <li>&quot;Make the colors friendlier&quot;</li>
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-md p-2 text-sm",
              m.role === "user"
                ? "bg-blue-50 border border-blue-100"
                : "bg-muted/40 border",
            )}
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {m.role}
            </p>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}

        {current && (
          <div className="rounded-md p-2 text-sm bg-muted/40 border space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              assistant {current.status === "streaming" && "(thinking…)"}
            </p>
            {current.responseText ? (
              <p className="whitespace-pre-wrap">{current.responseText}</p>
            ) : current.status === "streaming" ? (
              <p className="text-muted-foreground italic">…</p>
            ) : null}
            {current.ops.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {current.ops.map((op) => (
                  <OpRow
                    key={op.id}
                    op={op}
                    checked={current.checkedIds.has(op.id)}
                    onToggle={() => toggleOp(op.id)}
                    disabled={current.status !== "previewing"}
                  />
                ))}
              </div>
            )}
            {current.status === "previewing" && current.ops.length > 0 && (
              <div className="flex items-center gap-x-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => void acceptCurrent()}
                  className="flex-1"
                >
                  <Check className="size-3.5 mr-1" />
                  Accept {current.checkedIds.size}/{current.ops.length}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void rejectCurrent()}
                >
                  <X className="size-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            )}
            {current.status === "previewing" && current.ops.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void rejectCurrent()}
              >
                Dismiss
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md p-2 text-xs bg-destructive/10 border border-destructive/30 text-destructive">
            {error}
          </div>
        )}
      </div>

      {turns.length > 0 && (
        <div className="border-t p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-x-1">
            <History className="size-3" />
            Past turns
          </p>
          <ScrollArea className="max-h-[120px]">
            <div className="space-y-1">
              {turns.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-x-2 text-xs"
                >
                  <span className="flex-1 truncate" title={t.prompt}>
                    {t.prompt}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRevert(t.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors flex items-center gap-x-1"
                    title="Revert to before this turn"
                  >
                    <Undo2 className="size-3" />
                    Revert
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <form onSubmit={onSubmit} className="border-t p-3 space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            current ? "Accept or reject the proposal first…" : "Describe a change…"
          }
          disabled={busy || current !== null}
          className="min-h-[60px] text-sm"
        />
        <div className="flex items-center gap-x-2">
          <Button
            type="submit"
            size="sm"
            disabled={busy || !input.trim() || current !== null}
            className="flex-1"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <Send className="size-3.5 mr-1" />
                Send
              </>
            )}
          </Button>
          {(messages.length > 0 || turns.length > 0) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearChat}
              disabled={busy || current !== null}
              title="Clear chat history (does not undo applied edits)"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </form>

      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};

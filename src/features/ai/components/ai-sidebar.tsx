"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Trash2, Undo2 } from "lucide-react";

import { ActiveTool, Editor } from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { useAiChat } from "@/features/ai/hooks/use-ai-chat";
import { OpRow } from "@/features/ai/components/op-row";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    revertTurn,
    clearChat,
  } = useAiChat(editor, aiApplying);

  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const baselineByTurnId = useMemo(() => {
    const map = new Map<string, object>();
    for (const t of turns) map.set(t.id, t.baselineJson);
    return map;
  }, [turns]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, current?.responseText, current?.ops.length]);

  const onClose = () => onChangeActiveTool("select");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
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
    const idx = turns.findIndex((t) => t.id === turnId);
    if (idx < 0) return;
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
        description="Describe a change and the AI will apply it"
      />

      <div ref={transcriptRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !current && (
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

        {messages.map((m, i) => {
          const baseline =
            m.turnId ? baselineByTurnId.get(m.turnId) ?? null : null;
          return (
            <div
              key={i}
              className={cn(
                "rounded-md p-2 text-sm",
                m.role === "user"
                  ? "bg-blue-50 border border-blue-100"
                  : "bg-muted/40 border",
              )}
            >
              <div className="flex items-start justify-between gap-x-2 mb-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {m.role}
                </p>
                {m.turnId && (
                  <button
                    type="button"
                    onClick={() => onRevert(m.turnId!)}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-x-1"
                    title="Revert to before this change"
                  >
                    <Undo2 className="size-3" />
                    Revert
                  </button>
                )}
              </div>
              {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
              {m.role === "assistant" && m.appliedOps && m.appliedOps.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  {m.appliedOps.map((op) => (
                    <OpRow key={op.id} op={op} baselineJson={baseline} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {current && (
          <div className="rounded-md p-2 text-sm bg-muted/40 border space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              assistant (thinking…)
            </p>
            {current.responseText ? (
              <p className="whitespace-pre-wrap">{current.responseText}</p>
            ) : (
              <p className="text-muted-foreground italic">…</p>
            )}
            {current.ops.length > 0 && (
              <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
                {current.ops.map((op) => (
                  <li key={op.id} className="leading-tight">
                    • {op.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md p-2 text-xs bg-destructive/10 border border-destructive/30 text-destructive">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t p-3 space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Describe a change…"
          disabled={busy}
          className="min-h-[60px] text-sm"
        />
        <div className="flex items-center gap-x-2">
          <Button
            type="submit"
            size="sm"
            disabled={busy || !input.trim()}
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
          {messages.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearChat}
              disabled={busy}
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

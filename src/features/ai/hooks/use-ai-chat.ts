"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uuid } from "uuidv4";

import type { Editor } from "@/features/editor/types";
import {
  applyOps,
  restoreSnapshot,
  snapshotCanvas,
} from "@/features/ai/apply-ops";
import {
  buildSceneSummary,
  hashScene,
} from "@/features/ai/scene-summary";
import type {
  AiOp,
  ChatMessage,
  SseEvent,
  Turn,
} from "@/features/ai/types";

interface CurrentTurn {
  prompt: string;
  responseText: string;
  ops: AiOp[];
  checkedIds: Set<string>;
  baselineJson: object | null;
  status: "streaming" | "previewing" | "applying";
}

export interface UseAiChatResult {
  messages: ChatMessage[];
  current: CurrentTurn | null;
  turns: Turn[];
  busy: boolean;
  error: string | null;
  send: (prompt: string) => Promise<void>;
  toggleOp: (opId: string) => void;
  acceptCurrent: () => Promise<void>;
  rejectCurrent: () => Promise<void>;
  revertTurn: (turnId: string) => Promise<void>;
  clearChat: () => void;
}

export const useAiChat = (
  editor: Editor | undefined,
  aiApplying: React.MutableRefObject<boolean>,
): UseAiChatResult => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [current, setCurrent] = useState<CurrentTurn | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef(editor);
  editorRef.current = editor;
  const currentRef = useRef(current);
  currentRef.current = current;

  // Re-apply checked ops on top of baseline. Debounced lightly to coalesce
  // rapid checkbox clicks (loadFromJSON is async).
  const reapplyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reapplyChecked = useCallback(async () => {
    const turn = currentRef.current;
    const ed = editorRef.current;
    if (!turn || !ed || !turn.baselineJson) return;
    aiApplying.current = true;
    ed.skipSave.current = true;
    await restoreSnapshot(ed.canvas, turn.baselineJson);
    const checkedOps = turn.ops.filter((op) => turn.checkedIds.has(op.id));
    await applyOps(ed, checkedOps);
    aiApplying.current = false;
    // Leave skipSave true while previewing; cleared on accept/reject.
  }, [aiApplying]);

  const scheduleReapply = useCallback(() => {
    if (reapplyTimeoutRef.current) clearTimeout(reapplyTimeoutRef.current);
    reapplyTimeoutRef.current = setTimeout(() => {
      void reapplyChecked();
    }, 80);
  }, [reapplyChecked]);

  const send = useCallback(
    async (prompt: string) => {
      const ed = editorRef.current;
      if (!ed) return;
      if (busy) return;
      const trimmed = prompt.trim();
      if (!trimmed) return;

      setError(null);
      setBusy(true);

      const scene = buildSceneSummary(ed.canvas);
      const sceneHash = hashScene(scene);

      const userMessage: ChatMessage = { role: "user", content: trimmed };
      const nextMessages: ChatMessage[] = [...messages, userMessage];
      setMessages(nextMessages);

      const baselineJson = snapshotCanvas(ed.canvas);
      const turnId = uuid().slice(0, 8);

      setCurrent({
        prompt: trimmed,
        responseText: "",
        ops: [],
        checkedIds: new Set(),
        baselineJson,
        status: "streaming",
      });

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages,
            scene,
            sceneHash,
          }),
        });

        if (!response.ok || !response.body) {
          const errBody = await response.json().catch(() => ({
            error: "Request failed",
          }));
          throw new Error(errBody.error ?? "Request failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let payload: SseEvent;
            try {
              payload = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (payload.type === "text") {
              setCurrent((c) =>
                c ? { ...c, responseText: c.responseText + payload.delta } : c,
              );
            } else if (payload.type === "op") {
              setCurrent((c) => {
                if (!c) return c;
                const nextOps = [...c.ops, payload.op];
                const nextChecked = new Set(c.checkedIds);
                nextChecked.add(payload.op.id);
                return { ...c, ops: nextOps, checkedIds: nextChecked };
              });
            } else if (payload.type === "error") {
              setError(payload.message);
            }
          }
        }

        // After stream closes, transition to previewing and apply checked ops.
        setCurrent((c) => (c ? { ...c, status: "previewing" } : c));
        // Wait one tick so currentRef updates, then apply.
        setTimeout(() => void reapplyChecked(), 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setCurrent(null);
        // Roll back any partial state — restore baseline.
        if (ed && baselineJson) {
          aiApplying.current = true;
          ed.skipSave.current = true;
          await restoreSnapshot(ed.canvas, baselineJson);
          ed.skipSave.current = false;
          aiApplying.current = false;
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, reapplyChecked, aiApplying],
  );

  const toggleOp = useCallback(
    (opId: string) => {
      setCurrent((c) => {
        if (!c) return c;
        const next = new Set(c.checkedIds);
        if (next.has(opId)) next.delete(opId);
        else next.add(opId);
        return { ...c, checkedIds: next };
      });
      scheduleReapply();
    },
    [scheduleReapply],
  );

  const acceptCurrent = useCallback(async () => {
    const turn = currentRef.current;
    const ed = editorRef.current;
    if (!turn || !ed) return;
    if (reapplyTimeoutRef.current) {
      clearTimeout(reapplyTimeoutRef.current);
      reapplyTimeoutRef.current = null;
    }
    aiApplying.current = true;
    ed.skipSave.current = true;
    if (turn.baselineJson) {
      await restoreSnapshot(ed.canvas, turn.baselineJson);
    }
    const accepted = turn.ops.filter((op) => turn.checkedIds.has(op.id));
    await applyOps(ed, accepted);
    ed.skipSave.current = false;
    aiApplying.current = false;
    ed.save();

    const turnId = uuid().slice(0, 8);

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: turn.responseText || "Done.",
        appliedOps: accepted,
        turnId: accepted.length > 0 ? turnId : undefined,
      },
    ]);

    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        prompt: turn.prompt,
        responseText: turn.responseText,
        ops: turn.ops,
        appliedOpIds: accepted.map((o) => o.id),
        baselineJson: turn.baselineJson ?? {},
      },
    ]);
    setCurrent(null);
  }, [aiApplying]);

  const rejectCurrent = useCallback(async () => {
    const turn = currentRef.current;
    const ed = editorRef.current;
    if (!turn || !ed) return;
    if (reapplyTimeoutRef.current) {
      clearTimeout(reapplyTimeoutRef.current);
      reapplyTimeoutRef.current = null;
    }
    if (turn.baselineJson) {
      aiApplying.current = true;
      ed.skipSave.current = true;
      await restoreSnapshot(ed.canvas, turn.baselineJson);
      ed.skipSave.current = false;
      aiApplying.current = false;
    }
    // Drop the user message we appended optimistically — the turn never
    // committed so it shouldn't influence future context.
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].role === "user") {
        return prev.slice(0, -1);
      }
      return prev;
    });
    setCurrent(null);
  }, [aiApplying]);

  const revertTurn = useCallback(
    async (turnId: string) => {
      const ed = editorRef.current;
      if (!ed) return;
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx < 0) return;
      const turn = turns[idx];
      aiApplying.current = true;
      ed.skipSave.current = true;
      await restoreSnapshot(ed.canvas, turn.baselineJson);
      ed.skipSave.current = false;
      aiApplying.current = false;
      ed.save();
      setTurns((prev) => prev.slice(0, idx));
      // Drop messages from this turn onward — the assistant message with
      // matching turnId, the preceding user message, and anything after.
      setMessages((prev) => {
        const msgIdx = prev.findIndex((m) => m.turnId === turnId);
        if (msgIdx < 0) return prev;
        let cut = msgIdx;
        while (cut > 0 && prev[cut - 1].role === "user") cut--;
        return prev.slice(0, cut);
      });
    },
    [turns, aiApplying],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setTurns([]);
    setCurrent(null);
    setError(null);
  }, []);

  // Cleanup pending reapply on unmount.
  useEffect(() => {
    return () => {
      if (reapplyTimeoutRef.current) clearTimeout(reapplyTimeoutRef.current);
    };
  }, []);

  return useMemo(
    () => ({
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
    }),
    [
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
    ],
  );
};

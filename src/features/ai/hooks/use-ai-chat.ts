"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
}

export interface UseAiChatResult {
  messages: ChatMessage[];
  current: CurrentTurn | null;
  turns: Turn[];
  busy: boolean;
  error: string | null;
  send: (prompt: string) => Promise<void>;
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

      setCurrent({
        prompt: trimmed,
        responseText: "",
        ops: [],
      });

      let finalResponseText = "";
      const finalOps: AiOp[] = [];

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
              finalResponseText += payload.delta;
              const snapshot = finalResponseText;
              setCurrent((c) => (c ? { ...c, responseText: snapshot } : c));
            } else if (payload.type === "op") {
              finalOps.push(payload.op);
              const snapshot = [...finalOps];
              setCurrent((c) => (c ? { ...c, ops: snapshot } : c));
            } else if (payload.type === "error") {
              setError(payload.message);
            }
          }
        }

        if (finalOps.length > 0) {
          aiApplying.current = true;
          ed.skipSave.current = true;
          try {
            await applyOps(ed, finalOps);
          } catch (applyErr) {
            await restoreSnapshot(ed.canvas, baselineJson);
            throw applyErr;
          } finally {
            ed.skipSave.current = false;
            aiApplying.current = false;
          }
          ed.save();
        }

        const turnId = uuid().slice(0, 8);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: finalResponseText,
            appliedOps: finalOps,
            turnId: finalOps.length > 0 ? turnId : undefined,
          },
        ]);
        if (finalOps.length > 0) {
          setTurns((prev) => [
            ...prev,
            {
              id: turnId,
              prompt: trimmed,
              responseText: finalResponseText,
              ops: finalOps,
              appliedOpIds: finalOps.map((o) => o.id),
              baselineJson,
            },
          ]);
        }
        setCurrent(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setCurrent(null);
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
    [busy, messages, aiApplying],
  );

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

  return useMemo(
    () => ({
      messages,
      current,
      turns,
      busy,
      error,
      send,
      revertTurn,
      clearChat,
    }),
    [messages, current, turns, busy, error, send, revertTurn, clearChat],
  );
};

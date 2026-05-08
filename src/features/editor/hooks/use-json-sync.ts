import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import debounce from "lodash.debounce";

import { Editor, JSON_KEYS } from "@/features/editor/types";

const DEBOUNCE_MS = 400;

const serialize = (canvas: fabric.Canvas) =>
  JSON.stringify(canvas.toJSON(JSON_KEYS), null, 2);

// Multiset line diff: returns 0-indexed line numbers in `next` that did not
// appear in `prev` (or appeared more times in `next`). Cheap and good enough
// for the "this line just changed" flash — it precisely catches modified
// property values and added object lines, and ignores brace/bracket noise.
const changedLineNumbers = (prev: string, next: string): number[] => {
  if (!prev) return [];
  const prevLines = prev.split("\n");
  const nextLines = next.split("\n");
  const counts = new Map<string, number>();
  for (const line of prevLines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const changed: number[] = [];
  for (let i = 0; i < nextLines.length; i++) {
    const remaining = counts.get(nextLines[i]) ?? 0;
    if (remaining > 0) {
      counts.set(nextLines[i], remaining - 1);
    } else {
      changed.push(i);
    }
  }
  return changed;
};

const validateShape = (parsed: unknown): string | null => {
  if (typeof parsed !== "object" || parsed === null) {
    return "Document must be a JSON object.";
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.objects)) {
    return "Missing 'objects' array.";
  }
  if (typeof obj.version !== "string") {
    return "Missing Fabric 'version' field.";
  }
  return null;
};

interface JsonStatus {
  ok: boolean;
  message?: string;
}

export const useJsonSync = (
  editor: Editor | undefined,
  aiApplying?: MutableRefObject<boolean>,
) => {
  const canvas = editor?.canvas;

  const [value, setValueState] = useState<string>("");
  const [status, setStatus] = useState<JsonStatus>({ ok: true });
  const [highlight, setHighlight] = useState<{ id: number; lines: number[] }>({
    id: 0,
    lines: [],
  });

  const applyingFromJson = useRef(false);
  const pendingUserEdit = useRef(false);
  const isTextEditing = useRef(false);

  const valueRef = useRef(value);
  valueRef.current = value;

  const editorRef = useRef(editor);
  editorRef.current = editor;

  const applyJsonToCanvas = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    if (!pendingUserEdit.current) return;
    pendingUserEdit.current = false;

    const text = valueRef.current;
    if (!text.trim()) {
      setStatus({ ok: false, message: "Editor is empty." });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setStatus({ ok: false, message: (e as Error).message });
      return;
    }

    const shapeError = validateShape(parsed);
    if (shapeError) {
      setStatus({ ok: false, message: shapeError });
      return;
    }

    const targetCanvas = currentEditor.canvas;
    const previousActiveName = (targetCanvas.getActiveObject() as
      | (fabric.Object & { name?: string })
      | null)?.name;

    currentEditor.skipSave.current = true;
    applyingFromJson.current = true;

    targetCanvas.loadFromJSON(parsed, () => {
      if (previousActiveName) {
        const match = targetCanvas
          .getObjects()
          .find(
            (o) =>
              (o as fabric.Object & { name?: string }).name === previousActiveName,
          );
        if (match) targetCanvas.setActiveObject(match);
      }
      targetCanvas.renderAll();
      currentEditor.skipSave.current = false;
      applyingFromJson.current = false;
      currentEditor.save();
      setStatus({ ok: true });
      // If the user edited deviceFrame fields in the JSON, re-bake any
      // image whose pixels are stale relative to its metadata.
      void currentEditor.reconcileDeviceFrames();
    });
  }, []);

  const debouncedApply = useRef(debounce(applyJsonToCanvas, DEBOUNCE_MS));

  useEffect(() => {
    debouncedApply.current = debounce(applyJsonToCanvas, DEBOUNCE_MS);
    return () => {
      debouncedApply.current.cancel();
    };
  }, [applyJsonToCanvas]);

  const setValue = useCallback((next: string | undefined) => {
    const text = next ?? "";
    setValueState(text);
    pendingUserEdit.current = true;
    debouncedApply.current();
  }, []);

  useEffect(() => {
    if (!canvas) return;

    if (!valueRef.current) {
      setValueState(serialize(canvas));
    }

    const refreshFromCanvas = () => {
      if (applyingFromJson.current) return;
      if (isTextEditing.current) return;
      if (pendingUserEdit.current) return;
      if (aiApplying?.current) return;
      const next = serialize(canvas);
      const prev = valueRef.current;
      setValueState(next);
      const lines = changedLineNumbers(prev, next);
      if (lines.length > 0) {
        setHighlight((h) => ({ id: h.id + 1, lines }));
      }
    };

    const onTextEnter = () => {
      isTextEditing.current = true;
    };
    const onTextExit = () => {
      isTextEditing.current = false;
      refreshFromCanvas();
    };

    canvas.on("object:added", refreshFromCanvas);
    canvas.on("object:removed", refreshFromCanvas);
    canvas.on("object:modified", refreshFromCanvas);
    canvas.on("canvas:dirty" as never, refreshFromCanvas);
    canvas.on("text:editing:entered", onTextEnter);
    canvas.on("text:editing:exited", onTextExit);

    return () => {
      canvas.off("object:added", refreshFromCanvas);
      canvas.off("object:removed", refreshFromCanvas);
      canvas.off("object:modified", refreshFromCanvas);
      canvas.off("canvas:dirty" as never, refreshFromCanvas);
      canvas.off("text:editing:entered", onTextEnter);
      canvas.off("text:editing:exited", onTextExit);
    };
  }, [canvas]);

  return { value, setValue, status, highlight };
};

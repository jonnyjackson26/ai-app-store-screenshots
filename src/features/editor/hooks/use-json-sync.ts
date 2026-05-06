import { useCallback, useEffect, useRef, useState } from "react";
import debounce from "lodash.debounce";

import { Editor, JSON_KEYS } from "@/features/editor/types";

const DEBOUNCE_MS = 400;

const serialize = (canvas: fabric.Canvas) =>
  JSON.stringify(canvas.toJSON(JSON_KEYS), null, 2);

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

export const useJsonSync = (editor: Editor | undefined) => {
  const canvas = editor?.canvas;

  const [value, setValueState] = useState<string>("");
  const [status, setStatus] = useState<JsonStatus>({ ok: true });

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
      setValueState(serialize(canvas));
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

  return { value, setValue, status };
};

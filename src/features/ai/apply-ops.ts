import { fabric } from "fabric";

import { JSON_KEYS } from "@/features/editor/types";
import type { Editor } from "@/features/editor/types";
import type { AiOp } from "./types";

type ObjWithCustom = fabric.Object & { id?: string; name?: string };

const findById = (canvas: fabric.Canvas, id: string): fabric.Object | undefined =>
  canvas
    .getObjects()
    .find((o) => (o as ObjWithCustom).id === id) as fabric.Object | undefined;

const buildAddObject = async (
  op: Extract<AiOp, { kind: "add_object" }>,
): Promise<fabric.Object | null> => {
  const raw = { ...(op.props as Record<string, unknown>) };
  switch (op.objectType) {
    case "textbox": {
      const text = typeof raw.text === "string" ? raw.text : "";
      delete raw.text;
      return new fabric.Textbox(text, raw as fabric.ITextboxOptions);
    }
    case "rect":
      return new fabric.Rect(raw as fabric.IRectOptions);
    case "triangle":
      return new fabric.Triangle(raw as fabric.ITriangleOptions);
    case "circle": {
      const radius =
        typeof raw.radius === "number"
          ? raw.radius
          : Math.min(
              typeof raw.width === "number" ? raw.width : 100,
              typeof raw.height === "number" ? raw.height : 100,
            ) / 2;
      delete raw.radius;
      delete raw.width;
      delete raw.height;
      return new fabric.Circle({
        ...(raw as fabric.ICircleOptions),
        radius,
      });
    }
    case "polygon": {
      const points = Array.isArray(raw.points)
        ? (raw.points as { x: number; y: number }[])
        : [];
      delete raw.points;
      return new fabric.Polygon(points, raw as fabric.IPolylineOptions);
    }
    case "image": {
      const src = typeof raw.src === "string" ? raw.src : "";
      delete raw.src;
      return new Promise<fabric.Object | null>((resolve) => {
        fabric.Image.fromURL(
          src,
          (img) => {
            img.set(raw as Partial<fabric.IImageOptions>);
            resolve(img);
          },
          { crossOrigin: "anonymous" },
        );
      });
    }
    default:
      return null;
  }
};

/**
 * Apply a sequence of validated ops to the canvas in order. Caller is
 * responsible for the surrounding skipSave/aiApplying flag dance and for
 * choosing whether to call editor.save() afterward.
 */
export const applyOps = async (
  editor: Editor,
  ops: AiOp[],
): Promise<void> => {
  const canvas = editor.canvas;

  for (const op of ops) {
    if (op.kind === "modify_object") {
      const target = findById(canvas, op.targetId);
      if (!target) continue;
      target.set(op.props as Partial<fabric.IObjectOptions>);
      target.setCoords();
    } else if (op.kind === "add_object") {
      const obj = await buildAddObject(op);
      if (!obj) continue;
      canvas.add(obj);
    } else if (op.kind === "remove_object") {
      const target = findById(canvas, op.targetId);
      if (!target) continue;
      canvas.remove(target);
    } else if (op.kind === "set_page_settings") {
      const workspace = editor.getWorkspace() as fabric.Rect | undefined;
      if (!workspace) continue;
      const ws = workspace as fabric.Rect & {
        numPages?: number;
        pageGap?: number;
      };
      const nextWidth = op.props.width ?? ws.width ?? 0;
      const nextHeight = op.props.height ?? ws.height ?? 0;
      const nextNumPages = op.props.numPages ?? ws.numPages ?? 1;
      const nextPageGap = op.props.pageGap ?? ws.pageGap ?? 0;
      // changeSize calls save() internally — fine when caller has cleared
      // skipSave intentionally; harmless when skipSave is set, since
      // useHistory respects it.
      editor.changeSize({
        width: nextWidth,
        height: nextHeight,
        numPages: nextNumPages,
        pageGap: nextPageGap,
      });
      if (op.props.background) {
        editor.changeBackground(op.props.background);
      }
    }
  }

  canvas.requestRenderAll();
  canvas.fire("canvas:dirty" as never);
};

/**
 * Take a JSON snapshot of the canvas (in JSON_KEYS shape) suitable for use as
 * a preview baseline.
 */
export const snapshotCanvas = (canvas: fabric.Canvas): object =>
  canvas.toJSON(JSON_KEYS) as object;

/**
 * Restore a snapshot taken by snapshotCanvas. Async (loadFromJSON is async).
 * Re-selects the previously-active object by id if it still exists.
 */
export const restoreSnapshot = (
  canvas: fabric.Canvas,
  snapshot: object,
): Promise<void> => {
  const previousActiveId = (canvas.getActiveObject() as ObjWithCustom | null)?.id;
  return new Promise((resolve) => {
    canvas.loadFromJSON(snapshot, () => {
      if (previousActiveId) {
        const match = canvas
          .getObjects()
          .find((o) => (o as ObjWithCustom).id === previousActiveId);
        if (match) canvas.setActiveObject(match);
      }
      canvas.renderAll();
      resolve();
    });
  });
};

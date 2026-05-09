import { fabric } from "fabric";

import { JSON_KEYS } from "@/features/editor/types";
import type { DeviceFrameMeta, Editor } from "@/features/editor/types";
import { isGradientFill, materializeFill } from "@/features/editor/color-utils";
import type { AiOp } from "./types";

type ObjWithCustom = fabric.Object & {
  id?: string;
  name?: string;
  deviceFrame?: DeviceFrameMeta;
};

const findById = (canvas: fabric.Canvas, id: string): fabric.Object | undefined =>
  canvas
    .getObjects()
    .find((o) => (o as ObjWithCustom).id === id) as fabric.Object | undefined;

// Walk the props record and replace any gradient-shaped value with a real
// fabric.Gradient. Right now this only matters for `fill`, but kept generic
// in case we expose stroke gradients later.
const materializeProps = (
  props: Record<string, unknown>,
): Record<string, unknown> => {
  if (!("fill" in props)) return props;
  const fill = props.fill;
  return {
    ...props,
    fill: isGradientFill(fill) ? materializeFill(fill) : fill,
  };
};

const buildAddObject = async (
  op: Extract<AiOp, { kind: "add_object" }>,
): Promise<fabric.Object | null> => {
  const raw = materializeProps({ ...(op.props as Record<string, unknown>) });
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
      const props = materializeProps(op.props as Record<string, unknown>);
      target.set(props as Partial<fabric.IObjectOptions>);
      target.setCoords();
    } else if (op.kind === "add_object") {
      const obj = await buildAddObject(op);
      if (!obj) continue;
      canvas.add(obj);
    } else if (op.kind === "remove_object") {
      const target = findById(canvas, op.targetId);
      if (!target) continue;
      canvas.remove(target);
    } else if (op.kind === "set_z_order") {
      const target = findById(canvas, op.targetId);
      if (!target) continue;
      switch (op.position) {
        case "front":
          canvas.bringToFront(target);
          break;
        case "back":
          canvas.sendToBack(target);
          break;
        case "forward":
          canvas.bringForward(target);
          break;
        case "backward":
          canvas.sendBackwards(target);
          break;
        case "above":
        case "below": {
          if (!op.relativeToId) break;
          const ref = findById(canvas, op.relativeToId);
          if (!ref) break;
          const objs = canvas.getObjects();
          const ti = objs.indexOf(target);
          const ri = objs.indexOf(ref);
          if (ti < 0 || ri < 0) break;
          // After Fabric's moveTo (remove + splice), the object lands at the
          // given index. To put target above ref (drawn later) we want target
          // immediately after ref's final position; below = immediately before.
          const destIndex =
            op.position === "above"
              ? ti < ri
                ? ri
                : ri + 1
              : ti < ri
                ? ri - 1
                : ri;
          canvas.moveTo(target, destIndex);
          break;
        }
      }
      // Match the toolbar's invariant: keep the workspace clip pinned at the
      // back so user objects can never end up behind the page background.
      const workspace = editor.getWorkspace() as fabric.Object | undefined;
      workspace?.sendToBack();
    } else if (op.kind === "set_device_frame") {
      const target = findById(canvas, op.targetId);
      if (!target || target.type !== "image") continue;
      const image = target as fabric.Image;
      const existing = (image as ObjWithCustom).deviceFrame;
      if (op.frame === null) {
        if (!existing) continue;
        // Restore the unframed screenshot. Mirrors removeDeviceFrameFromSelected.
        const center = image.getCenterPoint();
        const origScaledWidth = image.getScaledWidth();
        const origScaledHeight = image.getScaledHeight();
        const angle = image.angle ?? 0;
        await new Promise<void>((resolve) => {
          image.setSrc(
            existing.sourceUrl,
            () => {
              const naturalWidth = image.width ?? origScaledWidth;
              const naturalHeight = image.height ?? origScaledHeight;
              const scale = Math.min(
                origScaledWidth / naturalWidth,
                origScaledHeight / naturalHeight,
              );
              image.set({
                scaleX: scale,
                scaleY: scale,
                angle,
                originX: "center",
                originY: "center",
                left: center.x,
                top: center.y,
              });
              (image as ObjWithCustom).deviceFrame = undefined;
              image.setCoords();
              resolve();
            },
            { crossOrigin: "anonymous" },
          );
        });
      } else {
        // Either swapping the frame on an already-framed image, or wrapping a
        // bare screenshot for the first time. In both cases we just stamp the
        // metadata with a stale cachedKey — reconcileDeviceFrames() runs after
        // applyOps and bakes the framed PNG against the upstream API.
        const sourceUrl =
          existing?.sourceUrl ||
          (typeof image.getSrc === "function" ? image.getSrc() : "");
        if (!sourceUrl) continue;
        (image as ObjWithCustom).deviceFrame = {
          category: op.frame.category,
          device: op.frame.device,
          variation: op.frame.variation,
          sourceUrl,
          cachedKey: existing?.cachedKey ?? "",
        };
      }
    } else if (op.kind === "set_page_settings") {
      const workspace = editor.getWorkspace() as fabric.Rect | undefined;
      if (!workspace) continue;
      const ws = workspace as fabric.Rect & {
        numPages?: number;
        pageGap?: number;
      };
      // ws.width is the TOTAL logical width across all pages, but
      // editor.changeSize expects value.width to be PER-PAGE (it multiplies
      // by numPages internally). Convert before falling back.
      const currentNumPages = Math.max(1, Math.floor(ws.numPages ?? 1));
      const currentPageWidth = (ws.width ?? 0) / currentNumPages;
      const nextWidth = op.props.width ?? currentPageWidth;
      const nextHeight = op.props.height ?? ws.height ?? 0;
      const nextNumPages = op.props.numPages ?? currentNumPages;
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

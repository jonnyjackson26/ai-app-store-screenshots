import { fabric } from "fabric";
import JSZip from "jszip";
import { useCallback, useState, useMemo, useRef } from "react";
import { uuid } from "uuidv4";

import {
  Editor,
  FILL_COLOR,
  STROKE_WIDTH,
  STROKE_COLOR,
  CIRCLE_OPTIONS,
  DIAMOND_OPTIONS,
  TRIANGLE_OPTIONS,
  BuildEditorProps,
  RECTANGLE_OPTIONS,
  EditorHookProps,
  STROKE_DASH_ARRAY,
  TEXT_OPTIONS,
  FONT_FAMILY,
  FONT_WEIGHT,
  FONT_SIZE,
  JSON_KEYS,
  DEFAULT_NUM_PAGES,
  DEFAULT_PAGE_GAP,
  type ColorValue,
  type DeviceFrameMeta,
  deviceFrameKey,
} from "@/features/editor/types";
import { useHistory } from "@/features/editor/hooks/use-history";
import {
  createFilter,
  downloadFile,
  isTextType,
  transformText
} from "@/features/editor/utils";
import {
  dematerializeFill,
  firstStopColor,
  materializeFill,
} from "@/features/editor/color-utils";
import { useHotkeys } from "@/features/editor/hooks/use-hotkeys";
import { usePan } from "@/features/editor/hooks/use-pan";
import { useClipboard } from "@/features/editor/hooks//use-clipboard";
import { useAutoResize } from "@/features/editor/hooks/use-auto-resize";
import { useCanvasEvents } from "@/features/editor/hooks/use-canvas-events";
import { useWindowEvents } from "@/features/editor/hooks/use-window-events";
import { useLoadState } from "@/features/editor/hooks/use-load-state";

const buildEditor = ({
  save,
  skipSave,
  undo,
  redo,
  canRedo,
  canUndo,
  autoZoom,
  copy,
  paste,
  canvas,
  fillColor,
  fontFamily,
  setFontFamily,
  setFillColor,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  selectedObjects,
  strokeDashArray,
  setStrokeDashArray,
  projectTitle,
  setProjectTitle,
}: BuildEditorProps): Editor => {
  const generateSaveOptions = () => {
    const { width, height, left, top } = getWorkspace() as fabric.Rect;

    return {
      name: "Image",
      format: "png",
      quality: 1,
      width,
      height,
      left,
      top,
    };
  };

  // Captures one PNG dataURL per page by slicing the workspace along its
  // width. Caller must have already reset the viewport transform.
  // Returns [] when there's only one page (the main image already covers it).
  const capturePages = (): string[] => {
    const workspace = getWorkspace() as
      | (fabric.Rect & { numPages?: number })
      | undefined;
    if (!workspace) return [];

    const numPages = Math.max(
      1,
      Math.floor(workspace.numPages ?? DEFAULT_NUM_PAGES),
    );
    if (numPages <= 1) return [];

    const totalWidth = workspace.width ?? 0;
    const pageWidth = totalWidth / numPages;
    const height = workspace.height ?? 0;
    const top = workspace.top ?? 0;
    const baseLeft = workspace.left ?? 0;

    const captures: string[] = [];
    for (let i = 0; i < numPages; i++) {
      captures.push(
        canvas.toDataURL({
          format: "png",
          quality: 1,
          width: pageWidth,
          height,
          left: baseLeft + i * pageWidth,
          top,
        }),
      );
    }
    return captures;
  };

  const downloadAsZip = async (
    fullDataUrl: string,
    pageDataUrls: string[],
    extension: string,
  ) => {
    const zip = new JSZip();
    const fullBase64 = fullDataUrl.split(",")[1] ?? "";
    zip.file(`${projectTitle}.${extension}`, fullBase64, { base64: true });

    const pad = String(pageDataUrls.length).length;
    pageDataUrls.forEach((dataUrl, i) => {
      const base64 = dataUrl.split(",")[1] ?? "";
      const name = `${String(i + 1).padStart(pad, "0")}.${extension}`;
      zip.file(name, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    downloadFile(url, "zip", projectTitle);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveImage = (extension: string) => {
    const options = generateSaveOptions();

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const fullDataUrl = canvas.toDataURL(options);
    const pages = capturePages();
    autoZoom();

    if (pages.length === 0) {
      // Single page: just the full image, no zip needed
      downloadFile(fullDataUrl, extension, projectTitle);
      return;
    }

    void downloadAsZip(fullDataUrl, pages, extension);
  };

  const savePng = () => saveImage("png");
  const saveSvg = () => saveImage("svg");
  const saveJpg = () => saveImage("jpg");

  const saveJson = async () => {
    const dataUrl = canvas.toJSON(JSON_KEYS);

    await transformText(dataUrl.objects);
    const fileString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(dataUrl, null, "\t"),
    )}`;
    downloadFile(fileString, "json", projectTitle);
  };

  const loadJson = (json: string) => {
    const data = JSON.parse(json);

    canvas.loadFromJSON(data, () => {
      autoZoom();
      // Re-bake any framed images whose deviceFrame metadata disagrees with
      // the cached pixels. Fire-and-forget — image src updates as each one
      // completes.
      void reconcileFromCanvas();
    });
  };

  const reconcileFromCanvas = async () => {
    const targets: {
      image: fabric.Image;
      meta: DeviceFrameMeta;
    }[] = [];
    canvas.getObjects().forEach((obj) => {
      if (obj.type !== "image") return;
      const meta = (obj as unknown as { deviceFrame?: DeviceFrameMeta }).deviceFrame;
      if (!meta) return;
      const currentKey = deviceFrameKey(meta);
      if (meta.cachedKey === currentKey) return;
      const sourceUrl =
        meta.sourceUrl || ((obj as fabric.Image).getSrc?.() ?? "");
      if (!sourceUrl) return;
      targets.push({
        image: obj as fabric.Image,
        meta: { ...meta, sourceUrl },
      });
    });
    if (targets.length === 0) return;
    await Promise.all(
      targets.map(async ({ image, meta }) => {
        try {
          const formData = new FormData();
          formData.append("device", meta.device);
          formData.append("variation", meta.variation);
          formData.append("category", meta.category);
          formData.append("sourceUrl", meta.sourceUrl);
          const res = await fetch("/api/device-frames/apply", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) return;
          const json = (await res.json()) as { url: string; sourceUrl: string };
          await new Promise<void>((resolve) => {
            const center = image.getCenterPoint();
            const origScaledWidth = image.getScaledWidth();
            const origScaledHeight = image.getScaledHeight();
            const angle = image.angle ?? 0;
            image.setSrc(
              json.url,
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
                (image as unknown as { deviceFrame: DeviceFrameMeta }).deviceFrame = {
                  ...meta,
                  sourceUrl: json.sourceUrl,
                  cachedKey: deviceFrameKey(meta),
                };
                image.setCoords();
                resolve();
              },
              { crossOrigin: "anonymous" },
            );
          });
        } catch {
          // Leave the stale frame in place.
        }
      }),
    );
    canvas.requestRenderAll();
    canvas.fire("canvas:dirty" as never);
  };

  const getWorkspace = () => {
    return canvas
    .getObjects()
    .find((object) => object.name === "clip");
  };

  const center = (object: fabric.Object) => {
    const workspace = getWorkspace();
    const center = workspace?.getCenterPoint();

    if (!center) return;

    // @ts-ignore
    canvas._centerObject(object, center);
  };

  const addToCanvas = (object: fabric.Object) => {
    center(object);
    canvas.add(object);
    canvas.setActiveObject(object);
  };

  const notifyChange = () => {
    // Custom event consumed by useJsonSync to mirror property mutations
    // that don't naturally fire object:added/removed/modified.
    // Intentionally not fired through the history path so picker drags
    // don't spam undo entries.
    canvas.fire("canvas:dirty" as never);
  };

  return {
    projectTitle,
    setProjectTitle,
    savePng,
    saveJpg,
    saveSvg,
    saveJson,
    loadJson,
    save,
    skipSave,
    canUndo,
    canRedo,
    autoZoom,
    getWorkspace,
    zoomIn: () => {
      let zoomRatio = canvas.getZoom();
      zoomRatio += 0.05;
      const center = canvas.getCenter();
      canvas.zoomToPoint(
        new fabric.Point(center.left, center.top),
        zoomRatio > 1 ? 1 : zoomRatio
      );
    },
    zoomOut: () => {
      let zoomRatio = canvas.getZoom();
      zoomRatio -= 0.05;
      const center = canvas.getCenter();
      canvas.zoomToPoint(
        new fabric.Point(center.left, center.top),
        zoomRatio < 0.2 ? 0.2 : zoomRatio,
      );
    },
    changeSize: (value: { width: number; height: number; numPages: number; pageGap: number }) => {
      const workspace = getWorkspace();
      const numPages = Math.max(1, Math.floor(value.numPages));
      const pageGap = Math.max(0, value.pageGap);
      const logicalWidth = value.width * numPages;
      const visualWidth = logicalWidth + Math.max(0, numPages - 1) * pageGap;

      workspace?.set({
        width: logicalWidth,
        height: value.height,
        // @ts-ignore - custom property persisted via JSON_KEYS
        numPages,
        // @ts-ignore - custom property persisted via JSON_KEYS
        pageGap,
      });

      const clip = canvas.clipPath as fabric.Rect | undefined;
      if (clip && workspace) {
        clip.set({
          left: workspace.left,
          top: workspace.top,
          width: visualWidth,
          height: value.height,
        });
      }

      autoZoom();
      canvas.requestRenderAll();
      save();
      notifyChange();
    },
    changeBackground: (value: ColorValue) => {
      const workspace = getWorkspace();
      workspace?.set({ fill: materializeFill(value) });
      canvas.renderAll();
      save();
      notifyChange();
    },
    enableDrawingMode: () => {
      canvas.discardActiveObject();
      canvas.renderAll();
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.width = strokeWidth;
      canvas.freeDrawingBrush.color = firstStopColor(strokeColor);
    },
    disableDrawingMode: () => {
      canvas.isDrawingMode = false;
    },
    onUndo: () => undo(),
    onRedo: () => redo(),
    onCopy: () => copy(),
    onPaste: () => paste(),
    changeImageFilter: (value: string) => {
      const objects = canvas.getActiveObjects();
      objects.forEach((object) => {
        if (object.type === "image") {
          const imageObject = object as fabric.Image;

          const effect = createFilter(value);

          imageObject.filters = effect ? [effect] : [];
          imageObject.applyFilters();
          canvas.renderAll();
        }
      });
      notifyChange();
    },
    addImage: (value: string) => {
      fabric.Image.fromURL(
        value,
        (image) => {
          const workspace = getWorkspace();

          image.scaleToWidth(workspace?.width || 0);
          image.scaleToHeight(workspace?.height || 0);

          addToCanvas(image);
        },
        {
          crossOrigin: "anonymous",
        },
      );
    },
    addFramedImage: ({ url, deviceFrame }) => {
      fabric.Image.fromURL(
        url,
        (image) => {
          const workspace = getWorkspace();
          image.scaleToWidth(workspace?.width || 0);
          image.scaleToHeight(workspace?.height || 0);
          // Custom prop persisted via JSON_KEYS.
          (image as unknown as { deviceFrame: DeviceFrameMeta }).deviceFrame = deviceFrame;
          addToCanvas(image);
        },
        { crossOrigin: "anonymous" },
      );
    },
    getSelectedImageSource: () => {
      const active = canvas.getActiveObject();
      if (!active || active.type !== "image") return null;
      const src = (active as fabric.Image).getSrc?.();
      return typeof src === "string" && src ? src : null;
    },
    getSelectedDeviceFrame: () => {
      const active = canvas.getActiveObject();
      if (!active || active.type !== "image") return null;
      const meta = (active as unknown as { deviceFrame?: DeviceFrameMeta }).deviceFrame;
      return meta ?? null;
    },
    applyDeviceFrameToSelected: ({ url, deviceFrame }) => {
      const active = canvas.getActiveObject();
      if (!active || active.type !== "image") return;
      const target = active as fabric.Image;
      const center = target.getCenterPoint();
      const origScaledWidth = target.getScaledWidth();
      const origScaledHeight = target.getScaledHeight();
      const angle = target.angle ?? 0;

      target.setSrc(
        url,
        () => {
          const naturalWidth = target.width ?? origScaledWidth;
          const naturalHeight = target.height ?? origScaledHeight;
          // Fit the new framed pixels inside the original's bounding box.
          const scale = Math.min(
            origScaledWidth / naturalWidth,
            origScaledHeight / naturalHeight,
          );
          target.set({
            scaleX: scale,
            scaleY: scale,
            angle,
            originX: "center",
            originY: "center",
            left: center.x,
            top: center.y,
          });
          (target as unknown as { deviceFrame: DeviceFrameMeta }).deviceFrame = deviceFrame;
          target.setCoords();
          canvas.requestRenderAll();
          canvas.fire("object:modified", { target });
          notifyChange();
        },
        { crossOrigin: "anonymous" },
      );
    },
    removeDeviceFrameFromSelected: () => {
      const active = canvas.getActiveObject();
      if (!active || active.type !== "image") return;
      const target = active as fabric.Image;
      const meta = (target as unknown as { deviceFrame?: DeviceFrameMeta }).deviceFrame;
      if (!meta) return;
      const center = target.getCenterPoint();
      const origScaledWidth = target.getScaledWidth();
      const origScaledHeight = target.getScaledHeight();
      const angle = target.angle ?? 0;
      target.setSrc(
        meta.sourceUrl,
        () => {
          const naturalWidth = target.width ?? origScaledWidth;
          const naturalHeight = target.height ?? origScaledHeight;
          const scale = Math.min(
            origScaledWidth / naturalWidth,
            origScaledHeight / naturalHeight,
          );
          target.set({
            scaleX: scale,
            scaleY: scale,
            angle,
            originX: "center",
            originY: "center",
            left: center.x,
            top: center.y,
          });
          // Wipe metadata.
          (target as unknown as { deviceFrame?: DeviceFrameMeta }).deviceFrame = undefined;
          target.setCoords();
          canvas.requestRenderAll();
          canvas.fire("object:modified", { target });
          notifyChange();
        },
        { crossOrigin: "anonymous" },
      );
    },
    reconcileDeviceFrames: async () => {
      await reconcileFromCanvas();
    },
    delete: () => {
      canvas.getActiveObjects().forEach((object) => canvas.remove(object));
      canvas.discardActiveObject();
      canvas.renderAll();
    },
    addText: (value, options) => {
      const object = new fabric.Textbox(value, {
        ...TEXT_OPTIONS,
        fill: materializeFill(fillColor),
        ...options,
      });

      addToCanvas(object);
    },
    getActiveOpacity: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return 1;
      }

      const value = selectedObject.get("opacity") || 1;

      return value;
    },
    changeFontSize: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontSize exists.
          object.set({ fontSize: value });
        }
      });
      canvas.renderAll();
      notifyChange();
    },
    getActiveFontSize: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return FONT_SIZE;
      }

      // @ts-ignore
      // Faulty TS library, fontSize exists.
      const value = selectedObject.get("fontSize") || FONT_SIZE;

      return value;
    },
    changeTextAlign: (value: string) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, textAlign exists.
          object.set({ textAlign: value });
        }
      });
      canvas.renderAll();
      notifyChange();
    },
    getActiveTextAlign: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return "left";
      }

      // @ts-ignore
      // Faulty TS library, textAlign exists.
      const value = selectedObject.get("textAlign") || "left";

      return value;
    },
    changeFontUnderline: (value: boolean) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, underline exists.
          object.set({ underline: value });
        }
      });
      canvas.renderAll();
      notifyChange();
    },
    getActiveFontUnderline: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return false;
      }

      // @ts-ignore
      // Faulty TS library, underline exists.
      const value = selectedObject.get("underline") || false;

      return value;
    },
    changeFontLinethrough: (value: boolean) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, linethrough exists.
          object.set({ linethrough: value });
        }
      });
      canvas.renderAll();
      notifyChange();
    },
    getActiveFontLinethrough: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return false;
      }

      // @ts-ignore
      // Faulty TS library, linethrough exists.
      const value = selectedObject.get("linethrough") || false;

      return value;
    },
    changeFontStyle: (value: string) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontStyle exists.
          object.set({ fontStyle: value });
        }
      });
      canvas.renderAll();
      notifyChange();
    },
    getActiveFontStyle: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return "normal";
      }

      // @ts-ignore
      // Faulty TS library, fontStyle exists.
      const value = selectedObject.get("fontStyle") || "normal";

      return value;
    },
    changeFontWeight: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontWeight exists.
          object.set({ fontWeight: value });
        }
      });
      canvas.renderAll();
      notifyChange();
    },
    changeOpacity: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        object.set({ opacity: value });
      });
      canvas.renderAll();
      notifyChange();
    },
    bringForward: () => {
      canvas.getActiveObjects().forEach((object) => {
        canvas.bringForward(object);
      });

      canvas.renderAll();

      const workspace = getWorkspace();
      workspace?.sendToBack();
      notifyChange();
    },
    sendBackwards: () => {
      canvas.getActiveObjects().forEach((object) => {
        canvas.sendBackwards(object);
      });

      canvas.renderAll();
      const workspace = getWorkspace();
      workspace?.sendToBack();
      notifyChange();
    },
    changeFontFamily: (value: string) => {
      setFontFamily(value);
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontFamily exists.
          object.set({ fontFamily: value });
        }
      });
      canvas.renderAll();
      notifyChange();
    },
    changeFillColor: (value: ColorValue) => {
      setFillColor(value);
      const fillForFabric = materializeFill(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ fill: fillForFabric });
      });
      canvas.renderAll();
      notifyChange();
    },
    changeStrokeColor: (value: ColorValue) => {
      setStrokeColor(value);
      const colorForFabric = materializeFill(value);
      canvas.getActiveObjects().forEach((object) => {
        // Text types don't have stroke
        if (isTextType(object.type)) {
          object.set({ fill: colorForFabric });
          return;
        }

        object.set({ stroke: colorForFabric });
      });
      canvas.freeDrawingBrush.color = firstStopColor(value);
      canvas.renderAll();
      notifyChange();
    },
    changeStrokeWidth: (value: number) => {
      setStrokeWidth(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ strokeWidth: value });
      });
      canvas.freeDrawingBrush.width = value;
      canvas.renderAll();
      notifyChange();
    },
    changeStrokeDashArray: (value: number[]) => {
      setStrokeDashArray(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ strokeDashArray: value });
      });
      canvas.renderAll();
      notifyChange();
    },
    addCircle: () => {
      const object = new fabric.Circle({
        ...CIRCLE_OPTIONS,
        fill: materializeFill(fillColor),
        stroke: materializeFill(strokeColor),
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addSoftRectangle: () => {
      const object = new fabric.Rect({
        ...RECTANGLE_OPTIONS,
        rx: 50,
        ry: 50,
        fill: materializeFill(fillColor),
        stroke: materializeFill(strokeColor),
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addRectangle: () => {
      const object = new fabric.Rect({
        ...RECTANGLE_OPTIONS,
        fill: materializeFill(fillColor),
        stroke: materializeFill(strokeColor),
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addTriangle: () => {
      const object = new fabric.Triangle({
        ...TRIANGLE_OPTIONS,
        fill: materializeFill(fillColor),
        stroke: materializeFill(strokeColor),
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addInverseTriangle: () => {
      const HEIGHT = TRIANGLE_OPTIONS.height;
      const WIDTH = TRIANGLE_OPTIONS.width;

      const object = new fabric.Polygon(
        [
          { x: 0, y: 0 },
          { x: WIDTH, y: 0 },
          { x: WIDTH / 2, y: HEIGHT },
        ],
        {
          ...TRIANGLE_OPTIONS,
          fill: materializeFill(fillColor),
          stroke: materializeFill(strokeColor),
          strokeWidth: strokeWidth,
          strokeDashArray: strokeDashArray,
        }
      );

      addToCanvas(object);
    },
    addDiamond: () => {
      const HEIGHT = DIAMOND_OPTIONS.height;
      const WIDTH = DIAMOND_OPTIONS.width;

      const object = new fabric.Polygon(
        [
          { x: WIDTH / 2, y: 0 },
          { x: WIDTH, y: HEIGHT / 2 },
          { x: WIDTH / 2, y: HEIGHT },
          { x: 0, y: HEIGHT / 2 },
        ],
        {
          ...DIAMOND_OPTIONS,
          fill: materializeFill(fillColor),
          stroke: materializeFill(strokeColor),
          strokeWidth: strokeWidth,
          strokeDashArray: strokeDashArray,
        }
      );
      addToCanvas(object);
    },
    canvas,
    getActiveFontWeight: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return FONT_WEIGHT;
      }

      // @ts-ignore
      // Faulty TS library, fontWeight exists.
      const value = selectedObject.get("fontWeight") || FONT_WEIGHT;

      return value;
    },
    getActiveFontFamily: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return fontFamily;
      }

      // @ts-ignore
      // Faulty TS library, fontFamily exists.
      const value = selectedObject.get("fontFamily") || fontFamily;

      return value;
    },
    getActiveFillColor: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return fillColor;
      }

      const raw = selectedObject.get("fill");
      if (raw === undefined || raw === null || raw === "") return fillColor;
      return dematerializeFill(raw);
    },
    getActiveStrokeColor: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeColor;
      }

      const raw = selectedObject.get("stroke");
      if (raw === undefined || raw === null || raw === "") return strokeColor;
      return dematerializeFill(raw);
    },
    getActiveStrokeWidth: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeWidth;
      }

      const value = selectedObject.get("strokeWidth") || strokeWidth;

      return value;
    },
    getActiveStrokeDashArray: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeDashArray;
      }

      const value = selectedObject.get("strokeDashArray") || strokeDashArray;

      return value;
    },
    selectedObjects,
  };
};

export const useEditor = ({
  defaultState,
  defaultHeight,
  defaultWidth,
  clearSelectionCallback,
  isPanning,
  setSpacePanning,
}: EditorHookProps) => {
  const initialState = useRef(defaultState);
  const initialWidth = useRef(defaultWidth);
  const initialHeight = useRef(defaultHeight);

  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [selectedObjects, setSelectedObjects] = useState<fabric.Object[]>([]);

  const [fontFamily, setFontFamily] = useState(FONT_FAMILY);
  const [fillColor, setFillColor] = useState<ColorValue>(FILL_COLOR);
  const [strokeColor, setStrokeColor] = useState<ColorValue>(STROKE_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTH);
  const [strokeDashArray, setStrokeDashArray] = useState<number[]>(STROKE_DASH_ARRAY);
  const [projectTitle, setProjectTitle] = useState("Untitled design");

  useWindowEvents();

  const {
    save,
    canRedo,
    canUndo,
    undo,
    redo,
    canvasHistory,
    setHistoryIndex,
    skipSave,
  } = useHistory({
    canvas,
  });

  const { copy, paste } = useClipboard({ canvas });

  const { autoZoom } = useAutoResize({
    canvas,
    container,
  });

  useCanvasEvents({
    save,
    canvas,
    setSelectedObjects,
    clearSelectionCallback,
  });

  useHotkeys({
    undo,
    redo,
    copy,
    paste,
    save,
    canvas,
    setSpacePanning,
  });

  usePan({
    canvas,
    isPanning,
  });

  useLoadState({
    canvas,
    autoZoom,
    initialState,
    canvasHistory,
    setHistoryIndex,
  });

  const editor = useMemo(() => {
    if (canvas) {
      return buildEditor({
        save,
        skipSave,
        undo,
        redo,
        canUndo,
        canRedo,
        autoZoom,
        copy,
        paste,
        canvas,
        fillColor,
        strokeWidth,
        strokeColor,
        setFillColor,
        setStrokeColor,
        setStrokeWidth,
        strokeDashArray,
        selectedObjects,
        setStrokeDashArray,
        fontFamily,
        setFontFamily,
        projectTitle,
        setProjectTitle,
      });
    }

    return undefined;
  },
  [
    canRedo,
    canUndo,
    undo,
    redo,
    save,
    skipSave,
    autoZoom,
    copy,
    paste,
    canvas,
    fillColor,
    strokeWidth,
    strokeColor,
    selectedObjects,
    strokeDashArray,
    fontFamily,
    projectTitle,
  ]);

  const init = useCallback(
    ({
      initialCanvas,
      initialContainer,
    }: {
      initialCanvas: fabric.Canvas;
      initialContainer: HTMLDivElement;
    }) => {
      fabric.Object.prototype.set({
        cornerColor: "#FFF",
        cornerStyle: "circle",
        borderColor: "#3b82f6",
        borderScaleFactor: 1.5,
        transparentCorners: false,
        borderOpacityWhenMoving: 1,
        cornerStrokeColor: "#3b82f6",
      });

      const initialWorkspace = new fabric.Rect({
        width: initialWidth.current,
        height: initialHeight.current,
        name: "clip",
        fill: "white",
        selectable: false,
        hasControls: false,
        // @ts-ignore - custom property persisted via JSON_KEYS
        numPages: DEFAULT_NUM_PAGES,
        // @ts-ignore - custom property persisted via JSON_KEYS
        pageGap: DEFAULT_PAGE_GAP,
        shadow: new fabric.Shadow({
          color: "rgba(0,0,0,0.8)",
          blur: 5,
        }),
      });

      initialCanvas.setWidth(initialContainer.offsetWidth);
      initialCanvas.setHeight(initialContainer.offsetHeight);

      initialCanvas.add(initialWorkspace);
      initialCanvas.centerObject(initialWorkspace);

      // Stamp every newly-added object with a stable id. Persisted via
      // JSON_KEYS so AI tool calls can reference objects across turns.
      initialCanvas.on("object:added", (e: fabric.IEvent) => {
        const target = e.target as
          | (fabric.Object & { id?: string; name?: string })
          | undefined;
        if (!target) return;
        if (target.name === "clip") return;
        if (!target.id) target.id = uuid().slice(0, 8);
      });

      // Separate clip rect (not added to _objects) sized to the *visual*
      // bounds (logical width + gap padding between pages). When pages and
      // gaps are configured this is wider than the workspace, so the
      // shifted page renders below aren't cut off by the canvas-level clip.
      const clipShape = new fabric.Rect({
        left: initialWorkspace.left,
        top: initialWorkspace.top,
        width: initialWorkspace.width,
        height: initialWorkspace.height,
      });
      initialCanvas.clipPath = clipShape;

      // Per-page render shift. Each page is drawn into its own visual
      // region, with the rendering translated by `p × pageGap` so the
      // design's logical x-axis is continuous: an image straddling a
      // boundary appears split across the gap with no pixel data lost.
      // Skipped during export (toCanvasElement uses a different ctx),
      // so exports remain at the logical, gap-free coordinate system.
      const canvasWithCtx = initialCanvas as fabric.Canvas & {
        contextContainer: CanvasRenderingContext2D;
        _renderObjects: (
          ctx: CanvasRenderingContext2D,
          objects: fabric.Object[],
        ) => void;
      };
      const defaultRenderObjects = canvasWithCtx._renderObjects.bind(initialCanvas);
      canvasWithCtx._renderObjects = (
        ctx: CanvasRenderingContext2D,
        objects: fabric.Object[],
      ) => {
        const workspace = initialCanvas
          .getObjects()
          .find((o) => o.name === "clip") as
          | (fabric.Rect & { numPages?: number; pageGap?: number })
          | undefined;

        const numPages = Math.max(
          1,
          Math.floor(workspace?.numPages ?? DEFAULT_NUM_PAGES),
        );
        const pageGap = Math.max(0, workspace?.pageGap ?? DEFAULT_PAGE_GAP);

        if (
          ctx !== canvasWithCtx.contextContainer ||
          !workspace ||
          numPages <= 1 ||
          pageGap <= 0
        ) {
          defaultRenderObjects(ctx, objects);
          return;
        }

        const totalLogicalWidth = workspace.width ?? 0;
        const pageWidth = totalLogicalWidth / numPages;
        const wsLeft = workspace.left ?? 0;
        const wsTop = workspace.top ?? 0;
        const wsHeight = workspace.height ?? 0;

        for (let p = 0; p < numPages; p++) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(
            wsLeft + p * pageWidth + p * pageGap,
            wsTop,
            pageWidth,
            wsHeight,
          );
          ctx.clip();
          ctx.translate(p * pageGap, 0);
          for (let i = 0, len = objects.length; i < len; i++) {
            objects[i] && objects[i].render(ctx);
          }
          ctx.restore();
        }
      };

      setCanvas(initialCanvas);
      setContainer(initialContainer);

      const currentState = JSON.stringify(
        initialCanvas.toJSON(JSON_KEYS)
      );
      canvasHistory.current = [currentState];
      setHistoryIndex(0);
    },
    [
      canvasHistory, // No need, this is from useRef
      setHistoryIndex, // No need, this is from useState
    ]
  );

  return { init, editor };
};

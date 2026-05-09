import type { MutableRefObject } from "react";
import { fabric } from "fabric";
import { ITextboxOptions } from "fabric/fabric-impl";
import * as material from "material-colors";

export const JSON_KEYS = [
  "name",
  "id",
  "gradientAngle",
  "selectable",
  "hasControls",
  "linkData",
  "editable",
  "extensionType",
  "extension",
  "numPages",
  "pageGap",
  "deviceFrame",
];

export interface DeviceFrameMeta {
  category: string;
  device: string;
  variation: string;
  // The unframed screenshot URL — preserved so the frame can be swapped later
  // without losing the original.
  sourceUrl: string;
  // "${category}::${device}::${variation}" at the time the framed PNG was
  // baked. After loadJSON, if this disagrees with category/device/variation
  // we re-bake against the upstream API.
  cachedKey: string;
}

export const deviceFrameKey = (meta: Pick<DeviceFrameMeta, "category" | "device" | "variation">) =>
  `${meta.category}::${meta.device}::${meta.variation}`;

export const DEFAULT_NUM_PAGES = 1;
export const DEFAULT_PAGE_GAP = 0;

export const filters = [
  "none",
  "polaroid",
  "sepia",
  "kodachrome",
  "contrast",
  "brightness",
  "greyscale",
  "brownie",
  "vintage",
  "technicolor",
  "pixelate",
  "invert",
  "blur",
  "sharpen",
  "emboss",
  "removecolor",
  "blacknwhite",
  "vibrance",
  "blendcolor",
  "huerotate",
  "resize",
  "saturation",
  "gamma",
];

export const fonts = [
  "Arial",
  "Arial Black",
  "Verdana",
  "Helvetica",
  "Tahoma",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Courier New",
  "Brush Script MT",
  "Palatino",
  "Bookman",
  "Comic Sans MS",
  "Impact",
  "Lucida Sans Unicode",
  "Geneva",
  "Lucida Console",
];

export const selectionDependentTools = [
  "fill",
  "font",
  "filter",
  "opacity",
  "stroke-color",
  "stroke-width",
];

export const colors = [
  material.red["500"],
  material.pink["500"],
  material.purple["500"],
  material.deepPurple["500"],
  material.indigo["500"],
  material.blue["500"],
  material.lightBlue["500"],
  material.cyan["500"],
  material.teal["500"],
  material.green["500"],
  material.lightGreen["500"],
  material.lime["500"],
  material.yellow["500"],
  material.amber["500"],
  material.orange["500"],
  material.deepOrange["500"],
  material.brown["500"],
  material.blueGrey["500"],
  "transparent",
];

export type ActiveTool =
  | "select"
  | "pan"
  | "elements"
  | "text"
  | "images"
  | "fill"
  | "stroke-color"
  | "stroke-width"
  | "font"
  | "opacity"
  | "filter"
  | "settings"
  | "templates"
  | "json"
  | "ai";

export const FILL_COLOR = "rgba(0,0,0,1)";
export const STROKE_COLOR = "rgba(0,0,0,1)";
export const STROKE_WIDTH = 2;
export const STROKE_DASH_ARRAY = [];
export const FONT_FAMILY = "Arial";
export const FONT_SIZE = 32;
export const FONT_WEIGHT = 400;

export interface GradientFill {
  type: "linear";
  coords: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  colorStops: { offset: number; color: string }[];
}

export type ColorValue = string | GradientFill;

export const CIRCLE_OPTIONS = {
  radius: 225,
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
};

export const RECTANGLE_OPTIONS = {
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
  width: 400,
  height: 400,
  angle: 0,
};

export const DIAMOND_OPTIONS = {
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
  width: 600,
  height: 600,
  angle: 0,
};

export const TRIANGLE_OPTIONS = {
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
  width: 400,
  height: 400,
  angle: 0,
};

export const TEXT_OPTIONS = {
  type: "textbox",
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  fontSize: FONT_SIZE,
  fontFamily: FONT_FAMILY,
};

export interface EditorHookProps {
  defaultState?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  clearSelectionCallback?: () => void;
  isPanning: boolean;
  setSpacePanning: (value: boolean) => void;
};

export type BuildEditorProps = {
  undo: () => void;
  redo: () => void;
  save: (skip?: boolean) => void;
  skipSave: MutableRefObject<boolean>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  autoZoom: () => void;
  copy: () => void;
  paste: () => void;
  canvas: fabric.Canvas;
  fillColor: ColorValue;
  strokeColor: ColorValue;
  strokeWidth: number;
  selectedObjects: fabric.Object[];
  strokeDashArray: number[];
  fontFamily: string;
  setStrokeDashArray: (value: number[]) => void;
  setFillColor: (value: ColorValue) => void;
  setStrokeColor: (value: ColorValue) => void;
  setStrokeWidth: (value: number) => void;
  setFontFamily: (value: string) => void;
  projectTitle: string;
  setProjectTitle: (value: string) => void;
};

export interface Editor {
  savePng: () => void;
  saveJpg: () => void;
  saveSvg: () => void;
  saveJson: () => void;
  loadJson: (json: string) => void;
  save: (skip?: boolean) => void;
  skipSave: MutableRefObject<boolean>;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  autoZoom: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getWorkspace: () => fabric.Object | undefined;
  changeBackground: (value: ColorValue) => void;
  changeSize: (value: { width: number; height: number; numPages: number; pageGap: number }) => void;
  enableDrawingMode: () => void;
  disableDrawingMode: () => void;
  onCopy: () => void;
  onPaste: () => void;
  changeImageFilter: (value: string) => void;
  addImage: (value: string) => void;
  addFramedImage: (args: { url: string; deviceFrame: DeviceFrameMeta }) => void;
  getSelectedImageSource: () => string | null;
  getSelectedDeviceFrame: () => DeviceFrameMeta | null;
  applyDeviceFrameToSelected: (args: {
    url: string;
    deviceFrame: DeviceFrameMeta;
  }) => void;
  removeDeviceFrameFromSelected: () => void;
  reconcileDeviceFrames: () => Promise<void>;
  delete: () => void;
  changeFontSize: (value: number) => void;
  getActiveFontSize: () => number;
  changeTextAlign: (value: string) => void;
  getActiveTextAlign: () => string;
  changeFontUnderline: (value: boolean) => void;
  getActiveFontUnderline: () => boolean;
  changeFontLinethrough: (value: boolean) => void;
  getActiveFontLinethrough: () => boolean;
  changeFontStyle: (value: string) => void;
  getActiveFontStyle: () => string;
  changeFontWeight: (value: number) => void;
  getActiveFontWeight: () => number;
  getActiveFontFamily: () => string;
  changeFontFamily: (value: string) => void;
  addText: (value: string, options?: ITextboxOptions) => void;
  getActiveOpacity: () => number;
  changeOpacity: (value: number) => void;
  bringForward: () => void;
  sendBackwards: () => void;
  changeStrokeWidth: (value: number) => void;
  changeFillColor: (value: ColorValue) => void;
  changeStrokeColor: (value: ColorValue) => void;
  changeStrokeDashArray: (value: number[]) => void;
  addCircle: () => void;
  addSoftRectangle: () => void;
  addRectangle: () => void;
  addTriangle: () => void;
  addInverseTriangle: () => void;
  addDiamond: () => void;
  canvas: fabric.Canvas;
  getActiveFillColor: () => ColorValue;
  getActiveStrokeColor: () => ColorValue;
  getActiveStrokeWidth: () => number;
  getActiveStrokeDashArray: () => number[];
  selectedObjects: fabric.Object[];
  projectTitle: string;
  setProjectTitle: (value: string) => void;
};

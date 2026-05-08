// Shared types for the AI chatbot tool. The schemas in ./schemas.ts are the
// source of truth at runtime; these are the static counterparts.

export type AiObjectType =
  | "textbox"
  | "rect"
  | "circle"
  | "triangle"
  | "polygon"
  | "image";

export interface ModifyObjectOp {
  id: string;
  kind: "modify_object";
  targetId: string;
  props: Record<string, unknown>;
  summary: string;
}

export interface AddObjectOp {
  id: string;
  kind: "add_object";
  objectType: AiObjectType;
  props: Record<string, unknown> & { left: number; top: number };
  summary: string;
}

export interface RemoveObjectOp {
  id: string;
  kind: "remove_object";
  targetId: string;
  summary: string;
}

export interface SetPageSettingsOp {
  id: string;
  kind: "set_page_settings";
  props: {
    numPages?: number;
    pageGap?: number;
    width?: number;
    height?: number;
    background?: string;
  };
  summary: string;
}

export type AiOp =
  | ModifyObjectOp
  | AddObjectOp
  | RemoveObjectOp
  | SetPageSettingsOp;

export interface SceneObject {
  id: string;
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  angle?: number;
  opacity?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: string;
  src?: string;
}

export interface ScenePage {
  width: number;
  height: number;
  numPages: number;
  pageGap: number;
  background: string;
}

export interface SceneSummary {
  page: ScenePage;
  objects: SceneObject[];
}

// Wire format for the SSE stream from /api/ai/chat
export type SseEvent =
  | { type: "text"; delta: string }
  | { type: "op"; op: AiOp }
  | { type: "done" }
  | { type: "error"; message: string };

// Chat history wire format
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Ops attached to an assistant turn that have been accepted (committed).
  // Used by the server to rebuild the conversation context on subsequent
  // turns. The model sees these as "applied" so follow-ups like "now make
  // it bigger" work.
  appliedOps?: AiOp[];
}

// Client-side: a committed turn the user can revert to.
export interface Turn {
  id: string;
  prompt: string;
  responseText: string;
  ops: AiOp[];
  appliedOpIds: string[];
  baselineJson: object;
}

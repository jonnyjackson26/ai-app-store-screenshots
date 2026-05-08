// OpenAI tool / function-calling definitions. Hand-written JSON Schema so
// we can mark `strict: true` and have the model emit conforming args. The
// runtime validation (with stricter rules) lives in ./schemas.ts.

import { fonts } from "@/features/editor/types";

const fontEnum = [...fonts];

const modifyProps = {
  type: "object",
  additionalProperties: false,
  properties: {
    left: { type: "number" },
    top: { type: "number" },
    width: { type: "number", minimum: 0 },
    height: { type: "number", minimum: 0 },
    angle: { type: "number" },
    opacity: { type: "number", minimum: 0, maximum: 1 },
    fill: { type: "string" },
    stroke: { type: ["string", "null"] },
    strokeWidth: { type: "number", minimum: 0 },
    rx: { type: "number", minimum: 0 },
    ry: { type: "number", minimum: 0 },
    text: { type: "string" },
    fontSize: { type: "number", exclusiveMinimum: 0 },
    fontFamily: { type: "string", enum: fontEnum },
    fontWeight: { type: "number" },
    fontStyle: { type: "string", enum: ["normal", "italic"] },
    textAlign: {
      type: "string",
      enum: ["left", "center", "right", "justify"],
    },
    underline: { type: "boolean" },
    linethrough: { type: "boolean" },
  },
} as const;

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "modify_object",
      description:
        "Change properties on an existing object identified by its stable id. Use this for text edits, color changes, repositioning, resizing, font changes, etc.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["targetId", "props", "summary"],
        properties: {
          targetId: {
            type: "string",
            description: "The id of the object to modify, from the scene summary.",
          },
          props: modifyProps,
          summary: {
            type: "string",
            description:
              "One-sentence human-readable description shown in the UI, e.g. \"Change title text to 'Hello'\".",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_object",
      description:
        "Add a new object to the canvas. Required props vary by objectType.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["objectType", "props", "summary"],
        properties: {
          objectType: {
            type: "string",
            enum: ["textbox", "rect", "triangle", "circle", "polygon", "image"],
          },
          props: {
            type: "object",
            additionalProperties: true,
            description:
              "Object-specific properties. textbox/rect/triangle/circle accept the modify_object props plus type-specific required fields. circle accepts `radius`. polygon requires `points`. image requires `src`.",
            properties: {
              left: { type: "number" },
              top: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              radius: { type: "number" },
              text: { type: "string" },
              src: { type: "string" },
              points: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["x", "y"],
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                },
              },
              fill: { type: "string" },
              stroke: { type: ["string", "null"] },
              strokeWidth: { type: "number" },
              fontSize: { type: "number" },
              fontFamily: { type: "string", enum: fontEnum },
              fontWeight: { type: "number" },
              textAlign: {
                type: "string",
                enum: ["left", "center", "right", "justify"],
              },
              opacity: { type: "number" },
              angle: { type: "number" },
              rx: { type: "number" },
              ry: { type: "number" },
            },
          },
          summary: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_object",
      description: "Delete an existing object by id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["targetId", "summary"],
        properties: {
          targetId: { type: "string" },
          summary: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_page_settings",
      description:
        "Update the document's page settings. Use this to add pages (numPages), change page dimensions, gap between pages, or background color.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["summary"],
        properties: {
          numPages: { type: "integer", minimum: 1, maximum: 20 },
          pageGap: { type: "number", minimum: 0 },
          width: { type: "number", exclusiveMinimum: 0 },
          height: { type: "number", exclusiveMinimum: 0 },
          background: { type: "string" },
          summary: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_object",
      description:
        "Fetch full Fabric properties for a single object when the scene summary doesn't include enough detail. Returns the object's full property set. Use sparingly — at most a few times per turn.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["targetId"],
        properties: {
          targetId: { type: "string" },
        },
      },
    },
  },
];

export const MODEL = "gpt-5-mini";

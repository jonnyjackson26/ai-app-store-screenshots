// OpenAI tool / function-calling definitions. Hand-written JSON Schema so
// we can mark `strict: true` and have the model emit conforming args. The
// runtime validation (with stricter rules) lives in ./schemas.ts.

import { fonts } from "@/features/editor/types";

const fontEnum = [...fonts];

// fill / background can be a solid color string OR a structured Fabric
// gradient. CSS gradient strings ("linear-gradient(...)") are NOT valid —
// the Zod refinement in schemas.ts rejects them and feeds an error back to
// the model.
const fillSchema = {
  oneOf: [
    {
      type: "string",
      description:
        "Solid color: hex (#fff, #ff8800), rgb()/rgba(), or named color. Do NOT use CSS gradient syntax.",
    },
    {
      type: "object",
      description: "Fabric gradient. coords expect canvas-space pixels.",
      additionalProperties: false,
      required: ["type", "coords", "colorStops"],
      properties: {
        type: { type: "string", enum: ["linear", "radial"] },
        coords: {
          type: "object",
          additionalProperties: false,
          required: ["x1", "y1", "x2", "y2"],
          properties: {
            x1: { type: "number" },
            y1: { type: "number" },
            x2: { type: "number" },
            y2: { type: "number" },
            r1: { type: "number", description: "Inner radius (radial only)." },
            r2: { type: "number", description: "Outer radius (radial only)." },
          },
        },
        colorStops: {
          type: "array",
          minItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["offset", "color"],
            properties: {
              offset: { type: "number", minimum: 0, maximum: 1 },
              color: { type: "string", description: "Solid color string." },
            },
          },
        },
      },
    },
  ],
} as const;

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
    fill: fillSchema,
    stroke: {
      oneOf: [
        { type: "string", description: "Solid color string. Do NOT use CSS gradients." },
        { type: "null" },
      ],
    },
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
              fill: fillSchema,
              stroke: {
                oneOf: [
                  { type: "string" },
                  { type: "null" },
                ],
              },
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
        "Update the document's page settings. Use this to add pages (numPages), change page dimensions, gap between pages, or background fill (solid color OR a structured gradient).",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["summary"],
        properties: {
          numPages: { type: "integer", minimum: 1, maximum: 20 },
          pageGap: { type: "number", minimum: 0 },
          width: { type: "number", exclusiveMinimum: 0 },
          height: { type: "number", exclusiveMinimum: 0 },
          background: fillSchema,
          summary: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_z_order",
      description:
        "Change the stacking order of an existing object by reordering it in the document's object array (higher index draws on top). Positions: 'front' / 'back' move it to the absolute top / bottom of user objects; 'forward' / 'backward' move it one step; 'above' / 'below' place it just above / below another object identified by relativeToId.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["targetId", "position", "summary"],
        properties: {
          targetId: { type: "string" },
          position: {
            type: "string",
            enum: ["front", "back", "forward", "backward", "above", "below"],
          },
          relativeToId: {
            type: "string",
            description:
              "Required when position is 'above' or 'below': the id of the reference object the target should sit adjacent to.",
          },
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
  {
    type: "function" as const,
    function: {
      name: "set_device_frame",
      description:
        "Change (or remove) the device frame around an existing image. The scene's deviceFrame field tells you which images are framed and how; the device-frame catalog (in the developer message) lists every valid (category, device, variation) tuple. Pass `frame: null` to strip the frame and revert to the unframed screenshot.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["targetId", "frame", "summary"],
        properties: {
          targetId: {
            type: "string",
            description: "The id of an existing image object.",
          },
          frame: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["category", "device", "variation"],
                description:
                  "Use exact slugs from the catalog. Example: { category: 'apple-iphone', device: '17-pro', variation: 'cosmic-orange' }.",
                properties: {
                  category: {
                    type: "string",
                    enum: [
                      "apple-iphone",
                      "apple-ipad",
                      "android-phone",
                      "android-tablet",
                    ],
                  },
                  device: { type: "string" },
                  variation: { type: "string" },
                },
              },
              {
                type: "null",
                description: "Pass null to remove the device frame.",
              },
            ],
          },
          summary: { type: "string" },
        },
      },
    },
  },
];

export const MODEL = "gpt-5-mini";

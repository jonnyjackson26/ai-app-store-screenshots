import { z } from "zod";

import { fonts } from "@/features/editor/types";

const fontEnum = fonts as unknown as [string, ...string[]];

// Reject CSS gradient strings ("linear-gradient(...)", etc). Fabric does not
// parse those — gradients use the structured GradientFill shape.
const ColorStringSchema = z
  .string()
  .max(80)
  .refine(
    (s) => !/-gradient\s*\(/i.test(s),
    "fill must be a solid color string (hex / rgb / rgba / named). Use the structured gradient shape for gradients.",
  );

const GradientFillSchema = z
  .object({
    type: z.literal("linear"),
    coords: z
      .object({
        x1: z.number(),
        y1: z.number(),
        x2: z.number(),
        y2: z.number(),
      })
      .strict(),
    colorStops: z
      .array(
        z
          .object({
            offset: z.number().min(0).max(1),
            color: ColorStringSchema,
          })
          .strict(),
      )
      .min(2),
  })
  .strict();

const FillSchema = z.union([ColorStringSchema, GradientFillSchema]);

// Common props the AI can set/modify. Permissive on purpose — Fabric accepts
// many fields and over-restricting forces the AI to delete-and-re-add when a
// simple edit would do.
const ModifyProps = z
  .object({
    left: z.number().optional(),
    top: z.number().optional(),
    width: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    angle: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    fill: FillSchema.optional(),
    stroke: ColorStringSchema.nullable().optional(),
    strokeWidth: z.number().nonnegative().optional(),
    rx: z.number().nonnegative().optional(),
    ry: z.number().nonnegative().optional(),
    text: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fontFamily: z.enum(fontEnum).optional(),
    fontWeight: z.number().optional(),
    fontStyle: z.enum(["normal", "italic"]).optional(),
    textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
    underline: z.boolean().optional(),
    linethrough: z.boolean().optional(),
  })
  .strict();

export const ModifyObjectSchema = z.object({
  targetId: z.string().min(1),
  props: ModifyProps,
  summary: z.string().min(1).max(140),
});

const AddTextboxProps = ModifyProps.extend({
  text: z.string().min(1),
  left: z.number(),
  top: z.number(),
});

const AddRectProps = ModifyProps.extend({
  left: z.number(),
  top: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const AddCircleProps = ModifyProps.extend({
  left: z.number(),
  top: z.number(),
  // For circles, width/height drive radius indirectly via Fabric;
  // we accept either a radius or a width/height pair.
  radius: z.number().positive().optional(),
});

const AddImageProps = z
  .object({
    src: z.string().url(),
    left: z.number(),
    top: z.number(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    opacity: z.number().min(0).max(1).optional(),
    angle: z.number().optional(),
  })
  .strict();

const AddPolygonProps = ModifyProps.extend({
  left: z.number(),
  top: z.number(),
  points: z
    .array(z.object({ x: z.number(), y: z.number() }).strict())
    .min(3),
});

export const AddObjectSchema = z.discriminatedUnion("objectType", [
  z.object({
    objectType: z.literal("textbox"),
    props: AddTextboxProps,
    summary: z.string().min(1).max(140),
  }),
  z.object({
    objectType: z.literal("rect"),
    props: AddRectProps,
    summary: z.string().min(1).max(140),
  }),
  z.object({
    objectType: z.literal("triangle"),
    props: AddRectProps,
    summary: z.string().min(1).max(140),
  }),
  z.object({
    objectType: z.literal("circle"),
    props: AddCircleProps,
    summary: z.string().min(1).max(140),
  }),
  z.object({
    objectType: z.literal("polygon"),
    props: AddPolygonProps,
    summary: z.string().min(1).max(140),
  }),
  z.object({
    objectType: z.literal("image"),
    props: AddImageProps,
    summary: z.string().min(1).max(140),
  }),
]);

export const RemoveObjectSchema = z.object({
  targetId: z.string().min(1),
  summary: z.string().min(1).max(140),
});

export const SetPageSettingsSchema = z
  .object({
    numPages: z.number().int().min(1).max(20).optional(),
    pageGap: z.number().nonnegative().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    background: FillSchema.optional(),
    summary: z.string().min(1).max(140),
  })
  .strict();

export const SetZOrderSchema = z
  .object({
    targetId: z.string().min(1),
    position: z.enum([
      "front",
      "back",
      "forward",
      "backward",
      "above",
      "below",
    ]),
    relativeToId: z.string().min(1).optional(),
    summary: z.string().min(1).max(140),
  })
  .refine(
    (v) =>
      (v.position === "above" || v.position === "below")
        ? !!v.relativeToId
        : true,
    {
      message:
        "relativeToId is required when position is 'above' or 'below' — name the object to place the target relative to.",
      path: ["relativeToId"],
    },
  )
  .refine(
    (v) => v.relativeToId !== v.targetId,
    {
      message: "relativeToId must differ from targetId.",
      path: ["relativeToId"],
    },
  );

export const ReadObjectSchema = z.object({
  targetId: z.string().min(1),
});

const DeviceFrameTupleSchema = z
  .object({
    category: z.enum([
      "apple-iphone",
      "apple-ipad",
      "android-phone",
      "android-tablet",
    ]),
    device: z.string().min(1),
    variation: z.string().min(1),
  })
  .strict();

export const SetDeviceFrameSchema = z
  .object({
    targetId: z.string().min(1),
    // null clears the frame and reverts to the unframed source image.
    frame: z.union([DeviceFrameTupleSchema, z.null()]),
    summary: z.string().min(1).max(140),
  })
  .strict();

export type ModifyObjectArgs = z.infer<typeof ModifyObjectSchema>;
export type AddObjectArgs = z.infer<typeof AddObjectSchema>;
export type RemoveObjectArgs = z.infer<typeof RemoveObjectSchema>;
export type SetPageSettingsArgs = z.infer<typeof SetPageSettingsSchema>;
export type SetZOrderArgs = z.infer<typeof SetZOrderSchema>;
export type ReadObjectArgs = z.infer<typeof ReadObjectSchema>;
export type SetDeviceFrameArgs = z.infer<typeof SetDeviceFrameSchema>;

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { uuid } from "uuidv4";

import {
  AddObjectSchema,
  ModifyObjectSchema,
  ReadObjectSchema,
  RemoveObjectSchema,
  SetDeviceFrameSchema,
  SetPageSettingsSchema,
  SetZOrderSchema,
} from "@/features/ai/schemas";
import { SYSTEM_PROMPT } from "@/features/ai/system-prompt";
import { MODEL, TOOL_DEFINITIONS } from "@/features/ai/tools";
import { formatSceneForPrompt, hashScene } from "@/features/ai/scene-summary";
import {
  buildCatalogIndex,
  fetchDeviceFrameCatalog,
  formatCatalogForPrompt,
} from "@/features/device-frames/catalog";
import type {
  AiOp,
  ChatMessage,
  SceneSummary,
} from "@/features/ai/types";

export const runtime = "nodejs";

const MAX_HISTORY = 12;
const MAX_READ_OBJECT_PER_TURN = 3;
const MAX_RETRIES = 2;
// Runaway fuse for the tool-call loop. Normal exit is finish_reason: "stop"
// with no tool calls; this cap only matters if the model never stops.
const MAX_TOOL_ITERATIONS = 15;
// Hard ceiling on write ops per user turn. Stops a misbehaving model from
// emitting hundreds of ops on a 200-object scene.
const MAX_OPS_PER_TURN = 30;
// gpt-5-mini is a reasoning model — output tokens are split between hidden
// reasoning and visible content. With reasoning_effort: "minimal" the
// reasoning budget collapses to ~0 and tokens behave like a normal model,
// but we still leave headroom for tool-call args + a short chat reply.
const MAX_COMPLETION_TOKENS = 2000;

interface RequestBody {
  messages: ChatMessage[];
  scene: SceneSummary;
  sceneHash: string;
}

const sendEvent = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: unknown,
) => {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
};

const buildOpFromToolCall = (
  name: string,
  args: unknown,
  scene: SceneSummary,
  frameIndex: Set<string>,
): { ok: true; op: AiOp } | { ok: false; error: string } => {
  const validIds = new Set(scene.objects.map((o) => o.id));

  if (name === "modify_object") {
    const parsed = ModifyObjectSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid args" };
    }
    if (!validIds.has(parsed.data.targetId)) {
      return {
        ok: false,
        error: `Unknown object id "${parsed.data.targetId}". Valid ids: ${Array.from(validIds).join(", ") || "(none)"}.`,
      };
    }
    return {
      ok: true,
      op: {
        id: uuid().slice(0, 8),
        kind: "modify_object",
        targetId: parsed.data.targetId,
        props: parsed.data.props,
        summary: parsed.data.summary,
      },
    };
  }

  if (name === "add_object") {
    const parsed = AddObjectSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid args" };
    }
    return {
      ok: true,
      op: {
        id: uuid().slice(0, 8),
        kind: "add_object",
        objectType: parsed.data.objectType,
        props: parsed.data.props as AiOp extends { kind: "add_object" }
          ? AiOp["props"]
          : never,
        summary: parsed.data.summary,
      },
    };
  }

  if (name === "remove_object") {
    const parsed = RemoveObjectSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid args" };
    }
    if (!validIds.has(parsed.data.targetId)) {
      return { ok: false, error: `Unknown object id "${parsed.data.targetId}".` };
    }
    return {
      ok: true,
      op: {
        id: uuid().slice(0, 8),
        kind: "remove_object",
        targetId: parsed.data.targetId,
        summary: parsed.data.summary,
      },
    };
  }

  if (name === "set_page_settings") {
    const parsed = SetPageSettingsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid args" };
    }
    const { summary, ...rest } = parsed.data;
    return {
      ok: true,
      op: {
        id: uuid().slice(0, 8),
        kind: "set_page_settings",
        props: rest,
        summary,
      },
    };
  }

  if (name === "set_z_order") {
    const parsed = SetZOrderSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid args" };
    }
    if (!validIds.has(parsed.data.targetId)) {
      return { ok: false, error: `Unknown object id "${parsed.data.targetId}".` };
    }
    if (parsed.data.relativeToId && !validIds.has(parsed.data.relativeToId)) {
      return {
        ok: false,
        error: `Unknown relativeToId "${parsed.data.relativeToId}".`,
      };
    }
    return {
      ok: true,
      op: {
        id: uuid().slice(0, 8),
        kind: "set_z_order",
        targetId: parsed.data.targetId,
        position: parsed.data.position,
        relativeToId: parsed.data.relativeToId,
        summary: parsed.data.summary,
      },
    };
  }

  if (name === "set_device_frame") {
    const parsed = SetDeviceFrameSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid args" };
    }
    if (!validIds.has(parsed.data.targetId)) {
      return { ok: false, error: `Unknown object id "${parsed.data.targetId}".` };
    }
    const target = scene.objects.find((o) => o.id === parsed.data.targetId);
    if (target?.type !== "image") {
      return {
        ok: false,
        error: `Object "${parsed.data.targetId}" is type ${target?.type ?? "unknown"}; set_device_frame only applies to images.`,
      };
    }
    if (parsed.data.frame !== null) {
      const key = `${parsed.data.frame.category}::${parsed.data.frame.device}::${parsed.data.frame.variation}`;
      if (!frameIndex.has(key)) {
        return {
          ok: false,
          error: `Unknown frame ${parsed.data.frame.category}/${parsed.data.frame.device}/${parsed.data.frame.variation}. Use one of the valid (category, device, variation) tuples from the catalog.`,
        };
      }
      // The image must already have a deviceFrame (so we know its sourceUrl).
      // Without that, the AI would need to upload a screenshot, which it
      // can't do — guard so the model doesn't try.
      if (!target.deviceFrame) {
        return {
          ok: false,
          error: `Image "${parsed.data.targetId}" has no existing deviceFrame; the user must apply a frame from the sidebar first before the AI can swap it.`,
        };
      }
    } else if (!target.deviceFrame) {
      return {
        ok: false,
        error: `Image "${parsed.data.targetId}" has no frame to remove.`,
      };
    }
    return {
      ok: true,
      op: {
        id: uuid().slice(0, 8),
        kind: "set_device_frame",
        targetId: parsed.data.targetId,
        frame: parsed.data.frame,
        summary: parsed.data.summary,
      },
    };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
};

const resolveReadObject = (
  args: unknown,
  scene: SceneSummary,
): string => {
  const parsed = ReadObjectSchema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify({ ok: false, error: "Invalid read_object args" });
  }
  const obj = scene.objects.find((o) => o.id === parsed.data.targetId);
  if (!obj) {
    return JSON.stringify({ ok: false, error: `Unknown id ${parsed.data.targetId}` });
  }
  return JSON.stringify({ ok: true, object: obj });
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.messages?.length || !body.scene || !body.sceneHash) {
    return new Response(
      JSON.stringify({ error: "messages, scene, and sceneHash are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const computedHash = hashScene(body.scene);
  if (computedHash !== body.sceneHash) {
    return new Response(
      JSON.stringify({
        error:
          "sceneHash mismatch — the canvas may have changed during the request. Please retry.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  if (body.scene.objects.length > 200) {
    return new Response(
      JSON.stringify({
        error: `Scene has ${body.scene.objects.length} objects (limit 200). Please simplify before asking.`,
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }

  const openai = new OpenAI({ apiKey });
  const trimmedHistory = body.messages.slice(-MAX_HISTORY);

  // Fetch the device-frame catalog so the model knows the valid (category,
  // device, variation) tuples and their hex colors. Cached at the upstream
  // fetch level — typically a sub-millisecond HIT after the picker has
  // warmed it.
  let catalogPromptText: string | null = null;
  let frameIndex = new Set<string>();
  try {
    const catalog = await fetchDeviceFrameCatalog();
    catalogPromptText = formatCatalogForPrompt(catalog);
    frameIndex = buildCatalogIndex(catalog);
  } catch {
    // Catalog fetch failure shouldn't block the chat — set_device_frame
    // tool calls will be rejected by the empty index and the model can
    // explain the failure.
  }

  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "developer",
      content: `Available object IDs and scene follow:\n\n${formatSceneForPrompt(body.scene)}`,
    },
    ...(catalogPromptText
      ? [
          {
            role: "developer" as const,
            content: `Device frame catalog (use these exact slugs in set_device_frame). Format is "<variation>#<hex_color>" so you can match colour requests:\n\n${catalogPromptText}`,
          },
        ]
      : []),
    ...trimmedHistory.map<OpenAI.Chat.ChatCompletionMessageParam>((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let conversation = baseMessages;
        let readObjectCalls = 0;
        let retryCount = 0;
        let opsEmittedThisTurn = 0;

        // Outer loop: each iteration is one OpenAI call. We continue as long
        // as the model keeps emitting tool calls; we stop when it returns
        // finish_reason "stop" with no tool calls, hits the runaway fuse, or
        // exceeds the per-turn op cap.
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: conversation,
            tools: TOOL_DEFINITIONS,
            tool_choice: "auto",
            stream: true,
            max_completion_tokens: MAX_COMPLETION_TOKENS,
            reasoning_effort: "minimal",
          });

          let assistantContent = "";
          const toolCallBuffer = new Map<
            number,
            { id: string; name: string; argsJson: string }
          >();

          for await (const chunk of response) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta;
            if (delta?.content) {
              assistantContent += delta.content;
              sendEvent(controller, encoder, {
                type: "text",
                delta: delta.content,
              });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                const slot = toolCallBuffer.get(idx) ?? {
                  id: "",
                  name: "",
                  argsJson: "",
                };
                if (tc.id) slot.id = tc.id;
                if (tc.function?.name) slot.name = tc.function.name;
                if (tc.function?.arguments) slot.argsJson += tc.function.arguments;
                toolCallBuffer.set(idx, slot);
              }
            }
          }

          // Model emitted no tool calls — it's done (text reply or empty stop).
          if (toolCallBuffer.size === 0) break;

          // Reconstruct the assistant message with all tool calls so we can
          // append tool results to feed back into the next iteration.
          const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
            role: "assistant",
            content: assistantContent || null,
            tool_calls: Array.from(toolCallBuffer.entries())
              .sort(([a], [b]) => a - b)
              .map(([, slot]) => ({
                id: slot.id,
                type: "function" as const,
                function: { name: slot.name, arguments: slot.argsJson },
              })),
          };

          const followupToolMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

          for (const [, slot] of Array.from(toolCallBuffer.entries()).sort(
            ([a], [b]) => a - b,
          )) {
            let parsedArgs: unknown;
            try {
              parsedArgs = slot.argsJson ? JSON.parse(slot.argsJson) : {};
            } catch (e) {
              followupToolMessages.push({
                role: "tool",
                tool_call_id: slot.id,
                content: JSON.stringify({
                  ok: false,
                  error: `Invalid JSON in tool args: ${(e as Error).message}`,
                }),
              });
              continue;
            }

            if (slot.name === "read_object") {
              if (readObjectCalls >= MAX_READ_OBJECT_PER_TURN) {
                followupToolMessages.push({
                  role: "tool",
                  tool_call_id: slot.id,
                  content: JSON.stringify({
                    ok: false,
                    error: "read_object limit reached for this turn.",
                  }),
                });
              } else {
                readObjectCalls++;
                followupToolMessages.push({
                  role: "tool",
                  tool_call_id: slot.id,
                  content: resolveReadObject(parsedArgs, body.scene),
                });
              }
              continue;
            }

            // Per-turn op cap: refuse new write ops once exceeded so the
            // model can wrap up gracefully instead of being cut mid-stream.
            if (opsEmittedThisTurn >= MAX_OPS_PER_TURN) {
              followupToolMessages.push({
                role: "tool",
                tool_call_id: slot.id,
                content: JSON.stringify({
                  ok: false,
                  error: `Op limit (${MAX_OPS_PER_TURN}) reached for this turn. Stop emitting more changes and summarize what you've done.`,
                }),
              });
              continue;
            }

            const result = buildOpFromToolCall(
              slot.name,
              parsedArgs,
              body.scene,
              frameIndex,
            );
            if (result.ok) {
              opsEmittedThisTurn++;
              sendEvent(controller, encoder, { type: "op", op: result.op });
              followupToolMessages.push({
                role: "tool",
                tool_call_id: slot.id,
                content: JSON.stringify({ ok: true, applied: true }),
              });
            } else {
              followupToolMessages.push({
                role: "tool",
                tool_call_id: slot.id,
                content: JSON.stringify({ ok: false, error: result.error }),
              });
              if (retryCount < MAX_RETRIES) {
                retryCount++;
              }
            }
          }

          conversation = [
            ...conversation,
            assistantMessage,
            ...followupToolMessages,
          ];
        }

        sendEvent(controller, encoder, { type: "done" });
      } catch (err) {
        sendEvent(controller, encoder, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

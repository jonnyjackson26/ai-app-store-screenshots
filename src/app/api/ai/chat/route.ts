import { NextRequest } from "next/server";
import OpenAI from "openai";
import { uuid } from "uuidv4";

import {
  AddObjectSchema,
  ModifyObjectSchema,
  ReadObjectSchema,
  RemoveObjectSchema,
  SetPageSettingsSchema,
} from "@/features/ai/schemas";
import { SYSTEM_PROMPT } from "@/features/ai/system-prompt";
import { MODEL, TOOL_DEFINITIONS } from "@/features/ai/tools";
import { formatSceneForPrompt, hashScene } from "@/features/ai/scene-summary";
import type {
  AiOp,
  ChatMessage,
  SceneSummary,
} from "@/features/ai/types";

export const runtime = "nodejs";

const MAX_HISTORY = 12;
const MAX_READ_OBJECT_PER_TURN = 3;
const MAX_RETRIES = 2;
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

  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "developer",
      content: `Available object IDs and scene follow:\n\n${formatSceneForPrompt(body.scene)}`,
    },
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

        // Outer loop: handles read_object self-loops + retries on validation failures.
        // Each iteration is one OpenAI call; each call may emit text + ops + tool calls.
        for (let iter = 0; iter < 6; iter++) {
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
          let finishReason: string | null = null;

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

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          }

          if (finishReason === "stop" || toolCallBuffer.size === 0) {
            // Pure text turn (or unexpected stop with no tool calls). We're done.
            break;
          }

          // Reconstruct the assistant message with all tool calls so we can
          // append tool results in the next iteration if needed.
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

          let needsAnotherIteration = false;
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
              needsAnotherIteration = true;
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
              needsAnotherIteration = true;
              continue;
            }

            const result = buildOpFromToolCall(slot.name, parsedArgs, body.scene);
            if (result.ok) {
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
                needsAnotherIteration = true;
              }
            }
          }

          if (!needsAnotherIteration) break;

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

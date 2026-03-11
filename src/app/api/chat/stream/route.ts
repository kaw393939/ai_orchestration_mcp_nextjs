import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/config/env";
import { looksLikeMath, buildSystemPrompt } from "@/lib/chat/policy";
import {
  errorJson,
  runRouteTemplate,
  successText,
} from "@/lib/chat/http-facade";
import { runClaudeAgentLoopStream } from "@/lib/chat/anthropic-stream";
import { getToolRegistry, getToolExecutor } from "@/lib/chat/tool-composition-root";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";
import { getSessionUser } from "@/lib/auth";
import type { RoleName } from "@/core/entities/user";
import type { MessagePart } from "@/core/entities/message-parts";
import { getConversationInteractor } from "@/lib/chat/conversation-root";
import { MessageLimitError } from "@/core/use-cases/ConversationInteractor";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Formats for SSE
function sseChunk(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  return runRouteTemplate({
    route: "/api/chat/stream",
    request,
    execute: async (context) => {
      const apiKey = getAnthropicApiKey();
      const user = await getSessionUser();
      const role = user.roles[0] as RoleName;
      const systemPrompt = await buildSystemPrompt(role);
      const tools = getToolRegistry().getSchemasForRole(role) as Anthropic.Tool[];

      const execContext: ToolExecutionContext = {
        role,
        userId: user.id,
      };
      const toolExecutor = (name: string, input: Record<string, unknown>) =>
        getToolExecutor()(name, input, execContext);

      const body = (await request.json()) as {
        messages?: ChatMessage[];
        conversationId?: string;
      };
      const incomingMessages = body.messages ?? [];

      if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
        return errorJson(context, "messages must be a non-empty array.", 400);
      }

      const latestUserMessage = [...incomingMessages]
        .reverse()
        .find((message) => message.role === "user")?.content;

      if (!latestUserMessage) {
        return errorJson(context, "No user message found.", 400);
      }

      // Persistence: only for authenticated (non-ANONYMOUS) users
      const shouldPersist = role !== "ANONYMOUS";
      let conversationId = body.conversationId || null;

      if (shouldPersist) {
        const interactor = getConversationInteractor();

        // Create conversation if needed
        if (!conversationId) {
          const title = latestUserMessage.slice(0, 80);
          const conv = await interactor.create(user.id, title);
          conversationId = conv.id;
        }

        // Persist user message
        try {
          await interactor.appendMessage(
            {
              conversationId,
              role: "user",
              content: latestUserMessage,
              parts: [{ type: "text", text: latestUserMessage }],
            },
            user.id,
          );
        } catch (err) {
          if (err instanceof MessageLimitError) {
            return errorJson(context, err.message, 400);
          }
          throw err;
        }
      }

      if (looksLikeMath(latestUserMessage)) {
        const mathResponse = await fetch(new URL("/api/chat", request.url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({ messages: incomingMessages }),
        });

        const mathPayload = (await mathResponse.json()) as {
          reply?: string;
          error?: string;
        };
        if (!mathResponse.ok) {
          return errorJson(
            context,
            mathPayload.error || "Math request failed.",
            500,
          );
        }

        // Persist math reply as assistant message
        if (shouldPersist && conversationId && mathPayload.reply) {
          const interactor = getConversationInteractor();
          await interactor.appendMessage(
            {
              conversationId,
              role: "assistant",
              content: mathPayload.reply,
              parts: [{ type: "text", text: mathPayload.reply }],
            },
            user.id,
          );
        }

        return successText(context, mathPayload.reply || "");
      }

      const encoder = new TextEncoder();
      const streamAbortController = new AbortController();
      // Collect assistant parts for persistence
      const assistantParts: MessagePart[] = [];
      let assistantText = "";

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            // Send conversationId as first SSE event for authenticated users
            if (shouldPersist && conversationId) {
              controller.enqueue(
                encoder.encode(sseChunk({ conversation_id: conversationId })),
              );
            }

            await runClaudeAgentLoopStream({
              apiKey,
              messages: incomingMessages,
              signal: streamAbortController.signal,
              systemPrompt,
              tools,
              toolExecutor,
              callbacks: {
                onDelta(text) {
                  assistantText += text;
                  assistantParts.push({ type: "text", text });
                  controller.enqueue(encoder.encode(sseChunk({ delta: text })));
                },
                onToolCall(name, args) {
                  assistantParts.push({ type: "tool_call", name, args });
                  controller.enqueue(
                    encoder.encode(sseChunk({ tool_call: { name, args } })),
                  );
                },
                onToolResult(name, result) {
                  assistantParts.push({ type: "tool_result", name, result });
                  controller.enqueue(
                    encoder.encode(sseChunk({ tool_result: { name, result } })),
                  );
                },
              },
            });

            // Persist assistant message after stream
            if (shouldPersist && conversationId) {
              try {
                const interactor = getConversationInteractor();
                await interactor.appendMessage(
                  {
                    conversationId,
                    role: "assistant",
                    content: assistantText,
                    parts: assistantParts,
                  },
                  user.id,
                );
              } catch (err) {
                console.error("[stream] persist assistant error", err);
              }
            }

            controller.close();
          } catch (err) {
            console.error("[stream] error", err);
            controller.error(
              err instanceof Error ? err : new Error(String(err)),
            );
          }
        },
        cancel() {
          streamAbortController.abort();
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "x-request-id": context.requestId,
        },
      });
    },
  });
}

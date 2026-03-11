import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { getAnthropicApiKey } from "@/lib/config/env";
import { looksLikeMath, buildSystemPrompt } from "@/lib/chat/policy";
import { orchestrateChatTurn } from "@/lib/chat/orchestrator";
import {
  getLatestUserMessage,
  parseIncomingMessages,
  toAnthropicMessages,
} from "@/lib/chat/validation";
import { createAnthropicProvider } from "@/lib/chat/anthropic-client";
import {
  withProviderErrorMapping,
  withProviderTiming,
} from "@/lib/chat/provider-decorators";
import { runRouteTemplate, successJson } from "@/lib/chat/http-facade";
import { logEvent } from "@/lib/observability/logger";
import { getToolRegistry, getToolExecutor } from "@/lib/chat/tool-composition-root";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";
import { getSessionUser } from "@/lib/auth";
import type { RoleName } from "@/core/entities/user";

export async function POST(request: NextRequest) {
  return runRouteTemplate({
    route: "/api/chat",
    request,
    execute: async (context) => {
      const body = await request.json();
      const incomingMessages = parseIncomingMessages(body);
      const latestUserMessage = getLatestUserMessage(incomingMessages);
      const apiKey = getAnthropicApiKey();
      const conversation = toAnthropicMessages(incomingMessages);

      const user = await getSessionUser();
      const role = user.roles[0] as RoleName;
      const systemPrompt = await buildSystemPrompt(role);
      const tools = getToolRegistry().getSchemasForRole(role) as Anthropic.Tool[];

      const toolContext: ToolExecutionContext = {
        role,
        userId: user.id,
      };
      const toolExecutor = (name: string, input: Record<string, unknown>) =>
        getToolExecutor()(name, input, toolContext);

      const client = new Anthropic({ apiKey });
      const provider = withProviderTiming(
        withProviderErrorMapping(
          createAnthropicProvider(client, { systemPrompt, tools }),
        ),
        ({ durationMs, isError }) => {
          logEvent("info", "provider.call", {
            route: context.route,
            requestId: context.requestId,
            durationMs,
            isError,
          });
        },
      );

      const toolChoice:
        | { type: "auto" }
        | { type: "tool"; name: "calculator" } = looksLikeMath(
        latestUserMessage,
      )
        ? { type: "tool", name: "calculator" }
        : { type: "auto" };

      const reply = await orchestrateChatTurn({
        provider,
        conversation,
        toolChoice,
        toolExecutor,
      });

      return successJson(context, { reply });
    },
  });
}

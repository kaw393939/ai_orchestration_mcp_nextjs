import type Anthropic from "@anthropic-ai/sdk";
import type { ChatProvider } from "@/lib/chat/anthropic-client";
import type { ToolChoice } from "@/lib/chat/types";

export async function orchestrateChatTurn({
  provider,
  conversation,
  toolChoice,
  toolExecutor,
}: {
  provider: ChatProvider;
  conversation: Anthropic.MessageParam[];
  toolChoice: ToolChoice;
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}) {
  let nextToolChoice = toolChoice;

  for (let step = 0; step < 6; step += 1) {
    const response = await provider.createMessage({
      messages: conversation,
      toolChoice: nextToolChoice,
    });

    nextToolChoice = { type: "auto" };

    const toolUses = response.content.filter(
      (block) => block.type === "tool_use",
    );
    const textReply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (toolUses.length === 0) {
      return textReply || "No response content returned.";
    }

    const assistantMessage: Anthropic.MessageParam = {
      role: "assistant",
      content: response.content,
    };
    conversation.push(assistantMessage);

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (use): Promise<Anthropic.Messages.ToolResultBlockParam> => {
        try {
          const result = await toolExecutor(use.name, use.input as Record<string, unknown>);
          return {
            type: "tool_result" as const,
            tool_use_id: use.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (error) {
          return {
            type: "tool_result" as const,
            tool_use_id: use.id,
            content: error instanceof Error ? error.message : "Tool execution failed.",
            is_error: true,
          };
        }
      }),
    );

    const toolResultMessage: Anthropic.MessageParam = {
      role: "user",
      content: toolResults,
    };
    conversation.push(toolResultMessage);
  }

  throw new Error("Exceeded tool-call safety limit.");
}

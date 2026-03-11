import Anthropic from "@anthropic-ai/sdk";
import { getModelCandidates } from "@/lib/chat/policy";

export interface StreamCallbacks {
  onDelta?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: unknown) => void;
}

export async function runClaudeAgentLoopStream({
  apiKey,
  messages,
  callbacks,
  maxToolRounds = 4,
  signal,
  systemPrompt,
  tools,
  toolExecutor,
}: {
  apiKey: string;
  messages: Anthropic.MessageParam[];
  callbacks: StreamCallbacks;
  maxToolRounds?: number;
  signal?: AbortSignal;
  systemPrompt: string;
  tools: Anthropic.Tool[];
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}): Promise<void> {
  const models = getModelCandidates();
  const model = models[0]; // fallback, but ideally we check candidates

  // Simplistic fallback: just try the first configured model
  if (!model) {
    throw new Error("No valid Anthropic model configured.");
  }

  const client = new Anthropic({ apiKey });

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    input_schema: t.input_schema || { type: "object", properties: {} },
  }));

  let round = 0;
  // Make a working copy of the conversation
  const conversation = [...messages];

  while (round < maxToolRounds) {
    round++;
    if (signal?.aborted) break;

    const stream = client.messages.stream(
      {
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: conversation,
        tools: anthropicTools,
      },
      { signal },
    );

    stream.on("text", (text) => {
      callbacks.onDelta?.(text);
    });

    const response = await stream.finalMessage();

    // Check if finished or tool used
    if (response.stop_reason !== "tool_use") {
      break;
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) break;

    // Record the assistant's request to use tools
    conversation.push({ role: "assistant", content: response.content });

    const toolResultContents: Anthropic.ToolResultBlockParam[] = [];

    // Execute tools through the middleware-wrapped executor
    for (let i = 0; i < toolUseBlocks.length; i++) {
      const use = toolUseBlocks[i];
      const args = use.input as Record<string, unknown>;
      callbacks.onToolCall?.(use.name, args);

      let res: Anthropic.Messages.ToolResultBlockParam;
      try {
        const result = await toolExecutor(use.name, args);
        const content = typeof result === "string" ? result : JSON.stringify(result);
        res = { type: "tool_result" as const, tool_use_id: use.id, content };
      } catch (error) {
        res = {
          type: "tool_result" as const,
          tool_use_id: use.id,
          content: error instanceof Error ? error.message : "Tool execution failed.",
          is_error: true,
        };
      }

      // Parse result for callback
      let finalResult: unknown = res.content;
      if (typeof res.content === "string") {
        try {
          finalResult = JSON.parse(res.content);
        } catch {
          // Not JSON, that's fine
        }
      }

      callbacks.onToolResult?.(use.name, finalResult);
      toolResultContents.push(res);
    }

    conversation.push({ role: "user", content: toolResultContents });
  }
}

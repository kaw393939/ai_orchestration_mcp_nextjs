import type Anthropic from "@anthropic-ai/sdk";
import type { RoleName } from "@/core/entities/user";
import { getToolRegistry, getToolExecutor } from "@/lib/chat/tool-composition-root";

export { getToolRegistry, getToolExecutor } from "@/lib/chat/tool-composition-root";

export function getToolsForRole(role: RoleName): Anthropic.Tool[] {
  return getToolRegistry().getSchemasForRole(role) as Anthropic.Tool[];
}

/**
 * @deprecated Use getToolExecutor() from tool-composition-root instead.
 * Kept for backward compatibility with existing tests.
 */
export async function createToolResults(
  toolUses: Anthropic.Messages.ToolUseBlock[],
  role?: RoleName,
) {
  const context = {
    role: role ?? ("ANONYMOUS" as RoleName),
    userId: "legacy",
  };
  const executor = getToolExecutor();

  return Promise.all(
    toolUses.map(
      async (toolUse): Promise<Anthropic.Messages.ToolResultBlockParam> => {
        try {
          const result = await executor(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            context,
          );
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (error) {
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: error instanceof Error ? error.message : "Tool execution failed.",
            is_error: true,
          };
        }
      },
    ),
  );
}

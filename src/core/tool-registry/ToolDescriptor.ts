import type { ToolCommand } from "./ToolCommand";
import type { RoleName } from "@/core/entities/user";

export type ToolCategory = "content" | "ui" | "math" | "system";

export type AnthropicToolSchema = {
  description: string;
  input_schema: Record<string, unknown>;
};

export interface ToolDescriptor<TInput = unknown, TOutput = unknown> {
  /** Unique tool name — must match the Anthropic tool name exactly */
  name: string;
  /** Anthropic JSON schema for the LLM */
  schema: AnthropicToolSchema;
  /** The command that executes this tool */
  command: ToolCommand<TInput, TOutput>;
  /** Which roles can execute this tool. "ALL" = unrestricted. */
  roles: RoleName[] | "ALL";
  /** Organizational category */
  category: ToolCategory;
}

import type { ToolExecutionContext } from "./ToolExecutionContext";

export interface ToolCommand<TInput = unknown, TOutput = unknown> {
  execute(input: TInput, context?: ToolExecutionContext): Promise<TOutput>;
}

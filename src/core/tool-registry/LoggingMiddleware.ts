import type { ToolMiddleware, ToolExecuteFn } from "./ToolMiddleware";
import type { ToolExecutionContext } from "./ToolExecutionContext";

export class LoggingMiddleware implements ToolMiddleware {
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    next: ToolExecuteFn,
  ): Promise<unknown> {
    const start = Date.now();
    console.log(`[Tool:${name}] START`, { role: context.role });

    try {
      const result = await next(name, input, context);
      const duration = Date.now() - start;
      console.log(`[Tool:${name}] SUCCESS (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`[Tool:${name}] ERROR (${duration}ms)`, error);
      throw error;
    }
  }
}

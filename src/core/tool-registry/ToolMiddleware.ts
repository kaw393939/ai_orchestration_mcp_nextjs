import type { ToolExecutionContext } from "./ToolExecutionContext";

export type ToolExecuteFn = (
  name: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<unknown>;

export interface ToolMiddleware {
  execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    next: ToolExecuteFn,
  ): Promise<unknown>;
}

/**
 * Composes middleware around a registry's execute method.
 * Applied outer → inner: first middleware in array is outermost.
 */
export function composeMiddleware(
  middlewares: ToolMiddleware[],
  executeFn: ToolExecuteFn,
): ToolExecuteFn {
  return middlewares.reduceRight<ToolExecuteFn>(
    (next, mw) => (name, input, context) => mw.execute(name, input, context, next),
    executeFn,
  );
}

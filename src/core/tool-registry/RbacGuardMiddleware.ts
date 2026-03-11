import type { ToolMiddleware, ToolExecuteFn } from "./ToolMiddleware";
import type { ToolExecutionContext } from "./ToolExecutionContext";
import type { ToolRegistry } from "./ToolRegistry";
import { ToolAccessDeniedError, UnknownToolError } from "./errors";

export class RbacGuardMiddleware implements ToolMiddleware {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    next: ToolExecuteFn,
  ): Promise<unknown> {
    const toolNames = this.registry.getToolNames();
    if (!toolNames.includes(name)) {
      throw new UnknownToolError(name);
    }
    if (!this.registry.canExecute(name, context.role)) {
      throw new ToolAccessDeniedError(name, context.role);
    }
    return next(name, input, context);
  }
}

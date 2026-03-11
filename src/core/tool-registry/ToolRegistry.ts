import type { RoleName } from "@/core/entities/user";
import type { ToolDescriptor } from "./ToolDescriptor";
import type { ToolExecutionContext } from "./ToolExecutionContext";
import { ToolAccessDeniedError, UnknownToolError } from "./errors";

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();

  register(descriptor: ToolDescriptor): void {
    if (this.tools.has(descriptor.name)) {
      throw new Error(`Tool "${descriptor.name}" is already registered`);
    }
    this.tools.set(descriptor.name, descriptor);
  }

  getSchemasForRole(role: RoleName): { name: string; description: string; input_schema: Record<string, unknown> }[] {
    const schemas: { name: string; description: string; input_schema: Record<string, unknown> }[] = [];
    for (const descriptor of this.tools.values()) {
      if (descriptor.roles === "ALL" || descriptor.roles.includes(role)) {
        schemas.push({
          name: descriptor.name,
          description: descriptor.schema.description,
          input_schema: descriptor.schema.input_schema,
        });
      }
    }
    return schemas;
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const descriptor = this.tools.get(name);
    if (!descriptor) {
      throw new UnknownToolError(name);
    }
    if (!this.canExecute(name, context.role)) {
      throw new ToolAccessDeniedError(name, context.role);
    }
    return descriptor.command.execute(input, context);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  canExecute(name: string, role: RoleName): boolean {
    const descriptor = this.tools.get(name);
    if (!descriptor) return false;
    return descriptor.roles === "ALL" || descriptor.roles.includes(role);
  }
}

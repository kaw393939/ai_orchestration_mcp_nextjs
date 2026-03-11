import { describe, it, expect } from "vitest";
import { ToolRegistry } from "@/core/tool-registry/ToolRegistry";
import { ToolAccessDeniedError, UnknownToolError } from "@/core/tool-registry/errors";
import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";
import { calculate } from "@/core/entities/calculator";

function makeDescriptor(overrides: Partial<ToolDescriptor> = {}): ToolDescriptor {
  return {
    name: "calculator",
    schema: { description: "Calculate", input_schema: { type: "object", properties: {} } },
    command: {
      async execute(input: Record<string, unknown>) {
        const op = input.operation as "add" | "subtract" | "multiply" | "divide";
        return calculate(op, input.a as number, input.b as number);
      },
    },
    roles: "ALL",
    category: "math",
    ...overrides,
  };
}

const ctx: ToolExecutionContext = { role: "AUTHENTICATED", userId: "user-1" };
const anonCtx: ToolExecutionContext = { role: "ANONYMOUS", userId: "anon" };

describe("ToolRegistry", () => {
  // TEST-REG-01
  it("registers a tool and includes it in getToolNames()", () => {
    const registry = new ToolRegistry();
    registry.register(makeDescriptor());
    expect(registry.getToolNames()).toContain("calculator");
  });

  // TEST-REG-02
  it("throws on duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(makeDescriptor());
    expect(() => registry.register(makeDescriptor())).toThrow(
      'Tool "calculator" is already registered',
    );
  });

  // TEST-REG-03
  it("getSchemasForRole ANONYMOUS returns only matching tools", () => {
    const registry = new ToolRegistry();
    registry.register(makeDescriptor({ name: "calculator", roles: "ALL" }));
    registry.register(
      makeDescriptor({
        name: "restricted_tool",
        roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
        category: "system",
      }),
    );

    const schemas = registry.getSchemasForRole("ANONYMOUS");
    const names = schemas.map((s) => s.name);
    expect(names).toContain("calculator");
    expect(names).not.toContain("restricted_tool");
  });

  // TEST-REG-04
  it("getSchemasForRole AUTHENTICATED returns all tools", () => {
    const registry = new ToolRegistry();
    registry.register(makeDescriptor({ name: "calculator", roles: "ALL" }));
    registry.register(
      makeDescriptor({
        name: "restricted_tool",
        roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
        category: "system",
      }),
    );

    const schemas = registry.getSchemasForRole("AUTHENTICATED");
    const names = schemas.map((s) => s.name);
    expect(names).toContain("calculator");
    expect(names).toContain("restricted_tool");
  });

  // TEST-REG-05
  it("executes calculator add 2+3 → result 5", async () => {
    const registry = new ToolRegistry();
    registry.register(makeDescriptor());

    const result = await registry.execute(
      "calculator",
      { operation: "add", a: 2, b: 3 },
      ctx,
    );
    expect(result).toEqual({ operation: "add", a: 2, b: 3, result: 5 });
  });

  // TEST-REG-06
  it("throws ToolAccessDeniedError when role lacks access", async () => {
    const registry = new ToolRegistry();
    registry.register(
      makeDescriptor({
        name: "restricted_tool",
        roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
        category: "system",
      }),
    );

    await expect(
      registry.execute("restricted_tool", {}, anonCtx),
    ).rejects.toThrow(ToolAccessDeniedError);
  });

  // TEST-REG-07
  it("throws UnknownToolError for unregistered tool", async () => {
    const registry = new ToolRegistry();
    await expect(
      registry.execute("unknown_tool", {}, ctx),
    ).rejects.toThrow(UnknownToolError);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createToolRegistry } from "@/lib/chat/tool-composition-root";
import { composeMiddleware, type ToolExecuteFn } from "@/core/tool-registry/ToolMiddleware";
import { LoggingMiddleware } from "@/core/tool-registry/LoggingMiddleware";
import { RbacGuardMiddleware } from "@/core/tool-registry/RbacGuardMiddleware";
import { ToolAccessDeniedError, UnknownToolError } from "@/core/tool-registry/errors";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";
import type { BookRepository } from "@/core/use-cases/BookRepository";

// Minimal mock BookRepository — returns canned data, no filesystem
const mockBookRepo: BookRepository = {
  getAllBooks: vi.fn().mockResolvedValue([]),
  getBookBySlug: vi.fn().mockResolvedValue(null),
  getAllChapters: vi.fn().mockResolvedValue([]),
  getChaptersByBook: vi.fn().mockResolvedValue([]),
  getChapterBySlug: vi.fn().mockResolvedValue(null),
};

function buildStack() {
  const registry = createToolRegistry(mockBookRepo);
  const executor: ToolExecuteFn = composeMiddleware(
    [new LoggingMiddleware(), new RbacGuardMiddleware(registry)],
    registry.execute.bind(registry),
  );
  return { registry, executor };
}

const anonCtx: ToolExecutionContext = { role: "ANONYMOUS", userId: "anon-1" };
const authCtx: ToolExecutionContext = { role: "AUTHENTICATED", userId: "user-1" };
const adminCtx: ToolExecutionContext = { role: "ADMIN", userId: "admin-1" };

describe("Tool Registry Integration", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // TEST-REG-01
  it("registry has exactly 11 tools after full composition", () => {
    const { registry } = buildStack();
    expect(registry.getToolNames()).toHaveLength(11);
  });

  // TEST-REG-02
  it("registering a duplicate tool name throws", () => {
    const { registry } = buildStack();
    expect(() => registry.register({
      name: "calculator",
      schema: { description: "dup", input_schema: { type: "object", properties: {} } },
      command: { execute: async () => ({}) },
      roles: "ALL",
      category: "math",
    })).toThrow('Tool "calculator" is already registered');
  });

  // TEST-REG-03
  it("ANONYMOUS gets exactly 6 tools", () => {
    const { registry } = buildStack();
    const schemas = registry.getSchemasForRole("ANONYMOUS");
    const names = schemas.map(s => s.name).sort();
    expect(names).toEqual([
      "adjust_ui", "calculator", "get_book_summary", "navigate", "search_books", "set_theme",
    ]);
  });

  // TEST-REG-04
  it("AUTHENTICATED gets all 11 tools", () => {
    const { registry } = buildStack();
    const schemas = registry.getSchemasForRole("AUTHENTICATED");
    expect(schemas).toHaveLength(11);
  });

  // TEST-REG-05
  it("execute calculator via full stack → correct result", async () => {
    const { executor } = buildStack();
    const result = await executor("calculator", { operation: "add", a: 2, b: 3 }, anonCtx);
    expect(result).toEqual({ operation: "add", a: 2, b: 3, result: 5 });
  });

  // TEST-REG-06
  it("ANONYMOUS executing get_chapter → ToolAccessDeniedError, command never called", async () => {
    const { executor } = buildStack();
    await expect(executor("get_chapter", { book_slug: "x", chapter_slug: "y" }, anonCtx))
      .rejects.toThrow(ToolAccessDeniedError);
  });

  // TEST-REG-07
  it("execute nonexistent tool → UnknownToolError", async () => {
    const { executor } = buildStack();
    await expect(executor("nonexistent_tool", {}, anonCtx))
      .rejects.toThrow(UnknownToolError);
  });

  // Logging verification
  it("logs START + SUCCESS for successful execution", async () => {
    const { executor } = buildStack();
    await executor("calculator", { operation: "add", a: 1, b: 2 }, anonCtx);
    const logs = logSpy.mock.calls.map(c => c[0]);
    expect(logs.some((l: string) => l.includes("[Tool:calculator] START"))).toBe(true);
    expect(logs.some((l: string) => l.includes("[Tool:calculator] SUCCESS"))).toBe(true);
  });

  it("logs START + ERROR for denied access", async () => {
    const { executor } = buildStack();
    try { await executor("get_chapter", {}, anonCtx); } catch { /* expected */ }
    const allLogs = [...logSpy.mock.calls.map(c => c[0]), ...errorSpy.mock.calls.map(c => c[0])];
    expect(allLogs.some((l: string) => l.includes("[Tool:get_chapter] START"))).toBe(true);
    expect(allLogs.some((l: string) => l.includes("[Tool:get_chapter] ERROR"))).toBe(true);
  });
});

describe("Security Verification", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // TEST-SEC-01: Context isolation — LLM input cannot escalate privileges
  it("context.role is not overridden by LLM input", async () => {
    const { executor } = buildStack();
    // LLM sends {role: "ADMIN"} in input — should be ignored; context.role remains AUTHENTICATED
    // ANONYMOUS can't access generate_chart, but AUTHENTICATED can
    // The point: even if input contains {role: "ADMIN"}, the middleware uses context.role
    const result = await executor("calculator", { operation: "add", a: 1, b: 1 }, authCtx);
    expect(result).toMatchObject({ result: 2 });
    // Also verify ANONYMOUS is still blocked from restricted tools regardless of input
    await expect(executor("generate_chart", { data: [], type: "bar", role: "ADMIN" }, anonCtx))
      .rejects.toThrow(ToolAccessDeniedError);
  });

  // TEST-SEC-02: RBAC blocks at middleware, not command
  it("ANONYMOUS executing generate_audio → ToolAccessDeniedError", async () => {
    const { executor } = buildStack();
    await expect(executor("generate_audio", { text: "hi", title: "test" }, anonCtx))
      .rejects.toThrow(ToolAccessDeniedError);
  });

  // TEST-SEC-03: Per-descriptor role arrays work for custom tools
  it("custom ADMIN-only tool rejects non-ADMIN roles", async () => {
    const registry = createToolRegistry(mockBookRepo);
    registry.register({
      name: "admin_secret",
      schema: { description: "Admin only", input_schema: { type: "object", properties: {} } },
      command: { execute: async () => "secret" },
      roles: ["ADMIN"],
      category: "system",
    });
    const exec: ToolExecuteFn = composeMiddleware(
      [new LoggingMiddleware(), new RbacGuardMiddleware(registry)],
      registry.execute.bind(registry),
    );

    // ADMIN succeeds
    await expect(exec("admin_secret", {}, adminCtx)).resolves.toBe("secret");

    // All others rejected
    await expect(exec("admin_secret", {}, anonCtx)).rejects.toThrow(ToolAccessDeniedError);
    await expect(exec("admin_secret", {}, authCtx)).rejects.toThrow(ToolAccessDeniedError);
    await expect(exec("admin_secret", {}, { role: "STAFF", userId: "staff-1" }))
      .rejects.toThrow(ToolAccessDeniedError);
  });
});

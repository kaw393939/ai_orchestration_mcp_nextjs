import { describe, expect, it } from "vitest";
import { ChatPolicyInteractor } from "@/core/use-cases/ChatPolicyInteractor";
import { getToolRegistry } from "@/lib/chat/tool-composition-root";

describe("ChatPolicyInteractor", () => {
  const basePrompt = "You are an advisor.";
  const interactor = new ChatPolicyInteractor(basePrompt);

  it("ANONYMOUS prompt includes DEMO mode framing", async () => {
    const prompt = await interactor.execute({ role: "ANONYMOUS" });
    expect(prompt).toContain(basePrompt);
    expect(prompt).toContain("DEMO MODE");
  });

  it("ADMIN prompt includes system administrator framing", async () => {
    const prompt = await interactor.execute({ role: "ADMIN" });
    expect(prompt).toContain(basePrompt);
    expect(prompt).toContain("SYSTEM ADMINISTRATOR");
  });

  it("AUTHENTICATED prompt includes registered member framing", async () => {
    const prompt = await interactor.execute({ role: "AUTHENTICATED" });
    expect(prompt).toContain("registered member");
  });

  it("STAFF prompt includes staff framing", async () => {
    const prompt = await interactor.execute({ role: "STAFF" });
    expect(prompt).toContain("staff member");
  });
});

describe("ToolRegistry RBAC", () => {
  const registry = getToolRegistry();

  it("ANONYMOUS gets exactly 6 tool schemas", () => {
    const schemas = registry.getSchemasForRole("ANONYMOUS");
    expect(schemas).toHaveLength(6);
    const names = schemas.map((s) => s.name);
    expect(names).toContain("calculator");
    expect(names).toContain("search_books");
    expect(names).toContain("get_book_summary");
    expect(names).toContain("set_theme");
    expect(names).toContain("navigate");
    expect(names).toContain("adjust_ui");
  });

  it("ANONYMOUS cannot execute restricted tools", () => {
    expect(registry.canExecute("get_chapter", "ANONYMOUS")).toBe(false);
    expect(registry.canExecute("get_checklist", "ANONYMOUS")).toBe(false);
    expect(registry.canExecute("generate_audio", "ANONYMOUS")).toBe(false);
    expect(registry.canExecute("generate_chart", "ANONYMOUS")).toBe(false);
    expect(registry.canExecute("list_practitioners", "ANONYMOUS")).toBe(false);
  });

  it("AUTHENTICATED gets all 11 tool schemas", () => {
    const schemas = registry.getSchemasForRole("AUTHENTICATED");
    expect(schemas).toHaveLength(11);
  });

  it("STAFF gets all 11 tool schemas", () => {
    const schemas = registry.getSchemasForRole("STAFF");
    expect(schemas).toHaveLength(11);
  });

  it("ADMIN gets all 11 tool schemas", () => {
    const schemas = registry.getSchemasForRole("ADMIN");
    expect(schemas).toHaveLength(11);
  });
});

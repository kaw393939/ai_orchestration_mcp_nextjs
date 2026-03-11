# Sprint 2 — Composition Root & Wiring

> **Goal:** Create the tool composition root, wire the registry into both chat
> routes, replace `createToolResults()` with `registry.execute()`, and clean up
> the old god file.
> **Spec ref:** §3.4 composition root, §10 migration strategy
> **Prerequisite:** Sprint 1 complete

---

## Task 2.1 — Tool composition root

**What:** Create the central wiring point that builds a fully configured
`ToolRegistry` with all 11 tools registered and the middleware stack composed.

| Item | Detail |
| --- | --- |
| **Create** | `src/lib/chat/tool-composition-root.ts` |
| **Spec** | §3.4, TOOL-REG-1 |

### Design

```typescript
// src/lib/chat/tool-composition-root.ts
import { ToolRegistry } from "@/core/tool-registry/ToolRegistry";
import { composeMiddleware, type ToolExecuteFn } from "@/core/tool-registry/ToolMiddleware";
import { LoggingMiddleware } from "@/core/tool-registry/LoggingMiddleware";
import { RbacGuardMiddleware } from "@/core/tool-registry/RbacGuardMiddleware";
import { getBookRepository } from "@/adapters/RepositoryFactory";

// Import all 11 tool descriptors
import { calculatorTool } from "@/core/use-cases/tools/calculator.tool";
import { setThemeTool } from "@/core/use-cases/tools/set-theme.tool";
import { adjustUiTool } from "@/core/use-cases/tools/adjust-ui.tool";
import { navigateTool } from "@/core/use-cases/tools/navigate.tool";
import { generateChartTool } from "@/core/use-cases/tools/generate-chart.tool";
import { generateAudioTool } from "@/core/use-cases/tools/generate-audio.tool";
import { createSearchBooksTool } from "@/core/use-cases/tools/search-books.tool";
import { createGetChapterTool } from "@/core/use-cases/tools/get-chapter.tool";
import { createGetChecklistTool } from "@/core/use-cases/tools/get-checklist.tool";
import { createListPractitionersTool } from "@/core/use-cases/tools/list-practitioners.tool";
import { createGetBookSummaryTool } from "@/core/use-cases/tools/get-book-summary.tool";

let registry: ToolRegistry | null = null;
let composedExecute: ToolExecuteFn | null = null;

export function createToolRegistry(bookRepo: BookRepository): ToolRegistry {
  const reg = new ToolRegistry();

  // Stateless tools (no deps)
  reg.register(calculatorTool);
  reg.register(setThemeTool);
  reg.register(adjustUiTool);
  reg.register(navigateTool);
  reg.register(generateChartTool);
  reg.register(generateAudioTool);

  // Book tools (need BookRepository)
  reg.register(createSearchBooksTool(bookRepo));
  reg.register(createGetChapterTool(bookRepo));
  reg.register(createGetChecklistTool(bookRepo));
  reg.register(createListPractitionersTool(bookRepo));
  reg.register(createGetBookSummaryTool(bookRepo));

  return reg;
}

export function getToolRegistry(): ToolRegistry {
  if (!registry) {
    registry = createToolRegistry(getBookRepository());
  }
  return registry;
}

export function getToolExecutor(): ToolExecuteFn {
  if (!composedExecute) {
    const reg = getToolRegistry();
    composedExecute = composeMiddleware(
      [new LoggingMiddleware(), new RbacGuardMiddleware(reg)],
      reg.execute.bind(reg),
    );
  }
  return composedExecute;
}
```

### Key details

- `getToolRegistry()` is a lazy singleton — `getBookRepository()` called once.
- `getToolExecutor()` returns the middleware-wrapped execute function.
- Routes call `getToolExecutor()` to get a function that handles logging + RBAC + dispatch.

### Verify

```bash
npm run build   # passes — all tool descriptors wire correctly
```

---

## Task 2.2 — Wire registry into chat routes

**What:** Update both chat API routes and the stream/orchestrator functions to
use the registry instead of the old `createToolResults()` dispatch.

| Item | Detail |
| --- | --- |
| **Modify** | `src/app/api/chat/stream/route.ts` |
| **Modify** | `src/app/api/chat/route.ts` |
| **Modify** | `src/lib/chat/anthropic-stream.ts` |
| **Modify** | `src/lib/chat/orchestrator.ts` |
| **Spec** | TOOL-SEC-1, TOOL-SEC-3, §10 migration |

### Route changes

Both routes currently:
1. Call `getToolsForRole(role)` to get Anthropic tool schemas.
2. Pass `role` to stream/orchestrator, which calls `createToolResults(toolUses, role)`.

After this task:
1. Call `getToolRegistry().getSchemasForRole(role)` for schemas.
2. Build a `ToolExecutionContext` from the authenticated user.
3. Create a bound executor: `(name, input) => getToolExecutor()(name, input, context)`.
4. Pass the executor to stream/orchestrator.

### `anthropic-stream.ts` signature change

```typescript
// Before:
export async function runClaudeAgentLoopStream({
  role,
  ...
}: {
  role?: RoleName;
  ...
})

// After:
export async function runClaudeAgentLoopStream({
  toolExecutor,
  ...
}: {
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  ...
})
```

Inside the function, replace:
```typescript
// Before:
const generatedResults = await createToolResults(toolUseBlocks, role);

// After (per tool use block):
for (const use of toolUseBlocks) {
  const result = await toolExecutor(use.name, use.input as Record<string, unknown>);
  // Build ToolResultBlockParam from result
}
```

### `orchestrator.ts` signature change

```typescript
// Before:
export async function orchestrateChatTurn({
  role,
  ...
}: {
  role?: RoleName;
  ...
})

// After:
export async function orchestrateChatTurn({
  toolExecutor,
  ...
}: {
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  ...
})
```

Inside: replace `createToolResults(toolUses, role)` with per-tool execution
through the passed executor.

### Context separation (TOOL-SEC-1, TOOL-SEC-3)

The `ToolExecutionContext` is created **once** in the route handler:

```typescript
const context: ToolExecutionContext = {
  role: user?.role ?? "ANONYMOUS",
  userId: user?.id ?? "anonymous",
  conversationId,
};
```

The executor closes over this context:
```typescript
const executor = (name: string, input: Record<string, unknown>) =>
  getToolExecutor()(name, input, context);
```

The stream/orchestrator functions never see `role` directly — they only call
`executor(name, input)`. **Context and LLM input are never merged.**

### Verify

```bash
npm run build                                 # passes
npx vitest run                                # all tests pass
# Manual: chat with tools works end-to-end
```

---

## Task 2.3 — Clean up old code

**What:** Gut `tools.ts` to a thin re-export wrapper (≤50 lines). Delete
`ToolAccessPolicy.ts`. Update tests.

| Item | Detail |
| --- | --- |
| **Modify** | `src/lib/chat/tools.ts` — remove `ALL_TOOLS` array, `commands` registry, `createToolResults()`. Keep `getToolsForRole()` as backward-compat wrapper that delegates to `getToolRegistry().getSchemasForRole()`. |
| **Delete** | `src/core/use-cases/ToolAccessPolicy.ts` |
| **Modify** | `tests/core-policy.test.ts` — update `ToolAccessPolicy` tests to test `ToolRegistry.canExecute()` instead of `getToolNamesForRole()`. Keep identical assertions. |
| **Modify** | `src/lib/chat/policy.ts` — verify/remove any reference to old `getToolNamesForRole` |
| **Spec** | NEG-TOOL-3, NEG-TOOL-4 |

### `tools.ts` after cleanup (~30–50 lines)

```typescript
// src/lib/chat/tools.ts — thin re-export wrapper
import type Anthropic from "@anthropic-ai/sdk";
import type { RoleName } from "@/core/entities/user";
import { getToolRegistry } from "@/lib/chat/tool-composition-root";

export { getToolRegistry } from "@/lib/chat/tool-composition-root";
export { getToolExecutor } from "@/lib/chat/tool-composition-root";

export function getToolsForRole(role: RoleName): Anthropic.Tool[] {
  return getToolRegistry().getSchemasForRole(role);
}
```

### Test migration (`tests/core-policy.test.ts`)

The existing `ToolAccessPolicy` describe block (5 tests) is updated to test
`ToolRegistry.canExecute()` and `getSchemasForRole()` instead:

```typescript
// Before:
import { getToolNamesForRole } from "@/core/use-cases/ToolAccessPolicy";

describe("ToolAccessPolicy", () => {
  it("ANONYMOUS gets exactly 6 whitelisted tools", () => {
    const tools = getToolNamesForRole("ANONYMOUS");
    // ...
  });
});

// After:
import { getToolRegistry } from "@/lib/chat/tool-composition-root";

describe("ToolRegistry RBAC", () => {
  const registry = getToolRegistry();

  it("ANONYMOUS gets exactly 6 tool schemas", () => {
    const schemas = registry.getSchemasForRole("ANONYMOUS");
    expect(schemas).toHaveLength(6);
    expect(schemas.map(s => s.name)).toContain("calculator");
    // ... same assertions
  });

  it("ANONYMOUS cannot execute restricted tools", () => {
    expect(registry.canExecute("get_chapter", "ANONYMOUS")).toBe(false);
    expect(registry.canExecute("generate_audio", "ANONYMOUS")).toBe(false);
  });

  it("AUTHENTICATED can execute all tools", () => {
    const schemas = registry.getSchemasForRole("AUTHENTICATED");
    expect(schemas).toHaveLength(11);
  });
});
```

### Verify

```bash
npx vitest run                                        # all tests pass
grep -r "ToolAccessPolicy" src/                       # returns nothing
grep -r "createToolResults" src/                      # returns nothing
wc -l src/lib/chat/tools.ts                           # ≤ 50 lines
```

---

## Sprint 2 Summary

| Metric | Value |
| --- | --- |
| **New files** | 1 (`src/lib/chat/tool-composition-root.ts`) |
| **Modified files** | 6 (`tools.ts`, `anthropic-stream.ts`, `orchestrator.ts`, `route.ts` ×2, `policy.ts`) |
| **Deleted files** | 1 (`src/core/use-cases/ToolAccessPolicy.ts`) |
| **Updated test files** | 1 (`tests/core-policy.test.ts`) |
| **New tests** | ~3 (updated policy → registry tests) |
| **Existing tests** | All 182+ still pass |
| **Requirement coverage** | TOOL-SEC-1, TOOL-SEC-3, TOOL-REG-1, NEG-TOOL-3, NEG-TOOL-4 |

### Migration complete

After Sprint 2, the tool system runs entirely through the new registry. The old
`createToolResults()` path is gone. `ToolAccessPolicy` is deleted. The
middleware stack provides logging + RBAC enforcement on every tool call.

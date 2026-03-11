# Sprint 1 — Tool Descriptors (Self-Registration)

> **Goal:** Create descriptor files for all 11 tools. Each descriptor bundles
> schema + command + roles + category in a single file. Existing code untouched —
> these are additive files only.
> **Spec ref:** §3.4, §4 new files, §6 role matrix
> **Prerequisite:** Sprint 0 complete

---

## Task 1.1 — Calculator + UI tool descriptors (6 stateless tools)

**What:** Create descriptor files for the 6 tools that have zero dependencies.
Each file exports a `ToolDescriptor` constant that bundles the Anthropic schema
(currently scattered across `tools.ts` constants) with the command class, roles,
and category.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/use-cases/tools/calculator.tool.ts` |
| **Create** | `src/core/use-cases/tools/set-theme.tool.ts` |
| **Create** | `src/core/use-cases/tools/adjust-ui.tool.ts` |
| **Create** | `src/core/use-cases/tools/navigate.tool.ts` |
| **Create** | `src/core/use-cases/tools/generate-chart.tool.ts` |
| **Create** | `src/core/use-cases/tools/generate-audio.tool.ts` |
| **Spec** | §3.4 self-registration pattern, §6 role matrix |

### Schema source

The schemas are currently defined as `Anthropic.Tool` constants in
`src/lib/chat/tools.ts` (lines 24–161). Each descriptor moves its tool's schema
into the descriptor file so the schema lives alongside the command.

### Role assignments (from §6 and `ToolAccessPolicy.ts` whitelist)

| Tool | Roles | Category |
| --- | --- | --- |
| `calculator` | `"ALL"` | `"math"` |
| `set_theme` | `"ALL"` | `"ui"` |
| `adjust_ui` | `"ALL"` | `"ui"` |
| `navigate` | `"ALL"` | `"ui"` |
| `generate_chart` | `["AUTHENTICATED", "STAFF", "ADMIN"]` | `"ui"` |
| `generate_audio` | `["AUTHENTICATED", "STAFF", "ADMIN"]` | `"ui"` |

### Example: `calculator.tool.ts`

```typescript
import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { CalculatorCommand } from "./CalculatorTool";

export const calculatorTool: ToolDescriptor = {
  name: "calculator",
  schema: {
    description: "Performs arithmetic. Mandatory for every math calculation.",
    input_schema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"] },
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["operation", "a", "b"],
    },
  },
  command: new CalculatorCommand(),
  roles: "ALL",
  category: "math",
};
```

### Example: `generate-chart.tool.ts` (restricted)

```typescript
import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { GenerateChartCommand } from "./UiTools";

export const generateChartTool: ToolDescriptor = {
  name: "generate_chart",
  schema: {
    description: "Generate a visual Mermaid.js chart.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Mermaid code." },
        caption: { type: "string" },
      },
      required: ["code"],
    },
  },
  command: new GenerateChartCommand(),
  roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
  category: "ui",
};
```

### Verify

```bash
npm run build   # all 6 descriptor files compile with correct types
```

---

## Task 1.2 — Book tool descriptors (5 tools, factory pattern)

**What:** Create descriptor files for the 5 tools that depend on `BookRepository`.
These use **factory functions** instead of static constants because the command
classes need `BookRepository` injected via constructor.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/use-cases/tools/search-books.tool.ts` |
| **Create** | `src/core/use-cases/tools/get-chapter.tool.ts` |
| **Create** | `src/core/use-cases/tools/get-checklist.tool.ts` |
| **Create** | `src/core/use-cases/tools/list-practitioners.tool.ts` |
| **Create** | `src/core/use-cases/tools/get-book-summary.tool.ts` |
| **Spec** | §3.4 factory method pattern |

### Role assignments (from §6 and `ToolAccessPolicy.ts` whitelist)

| Tool | Roles | Category |
| --- | --- | --- |
| `search_books` | `"ALL"` (ANON sees truncated results via formatter in Sprint 3) | `"content"` |
| `get_book_summary` | `"ALL"` | `"content"` |
| `get_chapter` | `["AUTHENTICATED", "STAFF", "ADMIN"]` | `"content"` |
| `get_checklist` | `["AUTHENTICATED", "STAFF", "ADMIN"]` | `"content"` |
| `list_practitioners` | `["AUTHENTICATED", "STAFF", "ADMIN"]` | `"content"` |

### Factory pattern

```typescript
// src/core/use-cases/tools/search-books.tool.ts
import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import type { BookRepository } from "../BookRepository";
import { SearchBooksCommand } from "./BookTools";

export function createSearchBooksTool(repo: BookRepository): ToolDescriptor {
  return {
    name: "search_books",
    schema: {
      description: "Search across all 10 books (104 chapters) in the Product Development Library.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query (concept, person, topic)." },
          max_results: { type: "number", description: "Max results (1-15)." },
        },
        required: ["query"],
      },
    },
    command: new SearchBooksCommand(repo),
    roles: "ALL",
    category: "content",
  };
}
```

All 5 book tool factories follow the same pattern: accept `BookRepository`,
return `ToolDescriptor` with the appropriate schema, command, and roles.

### Verify

```bash
npm run build   # all 11 descriptor files compile
```

---

## Task 1.3 — Update ToolCommand interface (remove `any`)

**What:** Update the old `src/core/use-cases/ToolCommand.ts` to re-export from
the new canonical location. Update all 11 command classes to accept the optional
`ToolExecutionContext` parameter, maintaining backward compatibility.

| Item | Detail |
| --- | --- |
| **Modify** | `src/core/use-cases/ToolCommand.ts` — re-export from `@/core/tool-registry/ToolCommand` |
| **Modify** | `src/core/use-cases/tools/BookTools.ts` — update import path; add `context?: ToolExecutionContext` to all 5 `execute()` signatures. `SearchBooksCommand` uses `context?.role` instead of `role` from input (backward compat: falls back to `role` from input if no context). |
| **Modify** | `src/core/use-cases/tools/CalculatorTool.ts` — update import path; add optional `context` param |
| **Modify** | `src/core/use-cases/tools/UiTools.ts` — update import path; add optional `context` param |
| **Spec** | TOOL-TYPE-1, TOOL-TYPE-2 |

### `ToolCommand.ts` change

```typescript
// src/core/use-cases/ToolCommand.ts (becomes thin re-export)
export type { ToolCommand } from "@/core/tool-registry/ToolCommand";
```

### `SearchBooksCommand` dual-mode

During Sprint 2, the route will pass `ToolExecutionContext` via the registry.
During the transition, the command supports both:

```typescript
async execute(
  { query, max_results = 5, role }: { query: string; max_results?: number; role?: RoleName },
  context?: ToolExecutionContext,
) {
  const effectiveRole = context?.role ?? role;
  // ... use effectiveRole for ANONYMOUS formatting
}
```

After Sprint 2 wiring is complete, the `role` input field is no longer passed,
and `context?.role` is the only source. The fallback to input `role` is removed
in Sprint 3 (Task 3.2) when `SearchBooksCommand` drops inline RBAC formatting.

### Verify

```bash
npm run build                                            # passes
npx vitest run                                           # all 182+ tests pass
grep "= any" src/core/use-cases/ToolCommand.ts           # returns nothing
grep "= any" src/core/tool-registry/ToolCommand.ts       # returns nothing
```

---

## Sprint 1 Summary

| Metric | Value |
| --- | --- |
| **New files** | 11 descriptor files (`*.tool.ts`) |
| **Modified files** | 4 (`ToolCommand.ts`, `BookTools.ts`, `CalculatorTool.ts`, `UiTools.ts`) |
| **New test files** | 0 (build-verified; descriptors tested via registry in Sprint 2) |
| **Existing tests** | All 182 still pass (backward compat maintained) |
| **Requirement coverage** | TOOL-SRP-2, TOOL-TYPE-1, TOOL-TYPE-2 |

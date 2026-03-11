# Sprint 0 — Core Types & Registry

> **Goal:** Build the registry foundation. No behavioral changes — existing code
> continues to work untouched.
> **Spec ref:** §3.1, §3.2, §3.3, §4 new files
> **Prerequisite:** RBAC Sprints 0–5 complete (182 tests passing)

---

## Task 0.1 — Core types (ToolDescriptor, ToolExecutionContext, ToolCommand)

**What:** Create the three foundational types in a new `src/core/tool-registry/` directory. These are type-only files with no runtime behavior — the build is the test.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/tool-registry/ToolDescriptor.ts` |
| **Create** | `src/core/tool-registry/ToolExecutionContext.ts` |
| **Create** | `src/core/tool-registry/ToolCommand.ts` |
| **Spec** | §3.1, TOOL-TYPE-1, NEG-TOOL-1 |

### `ToolDescriptor.ts`

```typescript
import type { ToolCommand } from "./ToolCommand";
import type { RoleName } from "@/core/entities/user";

export type ToolCategory = "content" | "ui" | "math" | "system";

export type AnthropicToolSchema = {
  description: string;
  input_schema: Record<string, unknown>;
};

export interface ToolDescriptor<TInput = unknown, TOutput = unknown> {
  /** Unique tool name — must match the Anthropic tool name exactly */
  name: string;
  /** Anthropic JSON schema for the LLM */
  schema: AnthropicToolSchema;
  /** The command that executes this tool */
  command: ToolCommand<TInput, TOutput>;
  /** Which roles can execute this tool. "ALL" = unrestricted. */
  roles: RoleName[] | "ALL";
  /** Organizational category */
  category: ToolCategory;
}
```

### `ToolExecutionContext.ts`

Separates server-controlled auth data from LLM-controlled tool input. These are
**never** merged into a single object.

```typescript
import type { RoleName } from "@/core/entities/user";

export interface ToolExecutionContext {
  role: RoleName;
  userId: string;
  conversationId?: string;
}
```

### `ToolCommand.ts`

Replaces `any` defaults with `unknown`. Commands that need execution context
declare the optional parameter.

```typescript
import type { ToolExecutionContext } from "./ToolExecutionContext";

export interface ToolCommand<TInput = unknown, TOutput = unknown> {
  execute(input: TInput, context?: ToolExecutionContext): Promise<TOutput>;
}
```

### Verify

```bash
grep -r "any" src/core/tool-registry/   # returns nothing
npm run build                            # passes
```

---

## Task 0.2 — ToolRegistry class + error types

**What:** Implement the GoF Registry with `register()`, `getSchemasForRole()`,
`execute()`, `getToolNames()`, `canExecute()`. Create custom error types.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/tool-registry/ToolRegistry.ts` |
| **Create** | `src/core/tool-registry/errors.ts` |
| **Create** | `tests/tool-registry.test.ts` |
| **Spec** | §3.2, TOOL-REG-1 through TOOL-REG-5, TOOL-SEC-1 |

### `errors.ts`

```typescript
export class ToolAccessDeniedError extends Error {
  constructor(toolName: string, role: string) {
    super(`Access denied: role "${role}" cannot execute tool "${toolName}"`);
    this.name = "ToolAccessDeniedError";
  }
}

export class UnknownToolError extends Error {
  constructor(toolName: string) {
    super(`Unknown tool: "${toolName}"`);
    this.name = "UnknownToolError";
  }
}
```

### `ToolRegistry.ts` — Key behaviors

```typescript
class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();

  register(descriptor: ToolDescriptor): void {
    // Throws if name already registered (TOOL-REG-2)
  }

  getSchemasForRole(role: RoleName): Anthropic.Tool[] {
    // Returns only tools where descriptor.roles === "ALL"
    // or descriptor.roles.includes(role) (TOOL-REG-3)
    // Maps ToolDescriptor → { name, description, input_schema }
  }

  execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    // 1. Lookup tool — throw UnknownToolError if missing (TOOL-REG-5)
    // 2. Check canExecute() — throw ToolAccessDeniedError if denied
    // 3. Call command.execute(input, context) — input and context NEVER merged (TOOL-SEC-1)
    // 4. Return result (TOOL-REG-4)
  }

  getToolNames(): string[] {
    // All registered tool names
  }

  canExecute(name: string, role: RoleName): boolean {
    // True if tool exists AND (roles === "ALL" || roles.includes(role))
  }
}
```

### Tests (`tests/tool-registry.test.ts`)

| Test ID | Scenario |
| --- | --- |
| TEST-REG-01 | Register calculator → `getToolNames()` includes `"calculator"` |
| TEST-REG-02 | Register duplicate name → throws `Error` |
| TEST-REG-03 | `getSchemasForRole("ANONYMOUS")` → returns only tools with matching roles |
| TEST-REG-04 | `getSchemasForRole("AUTHENTICATED")` → returns all tools |
| TEST-REG-05 | `execute("calculator", {op:"add",a:2,b:3}, ctx)` → returns `{result:5}` |
| TEST-REG-06 | `execute("restricted_tool", input, {role:"ANONYMOUS"})` → `ToolAccessDeniedError` |
| TEST-REG-07 | `execute("unknown_tool", input, ctx)` → `UnknownToolError` |

### Verify

```bash
npx vitest run tests/tool-registry.test.ts   # 7 tests pass
npm run build                                 # passes
```

---

## Task 0.3 — ToolMiddleware interface + LoggingMiddleware + RbacGuardMiddleware

**What:** Create the middleware abstraction (Chain of Responsibility) and two
concrete implementations. The middleware stack wraps `ToolRegistry.execute()`.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/tool-registry/ToolMiddleware.ts` |
| **Create** | `src/core/tool-registry/LoggingMiddleware.ts` |
| **Create** | `src/core/tool-registry/RbacGuardMiddleware.ts` |
| **Create** | `tests/tool-middleware.test.ts` |
| **Spec** | §3.3, TOOL-SEC-2, TOOL-OBS-1, TOOL-OBS-2 |

### `ToolMiddleware.ts`

```typescript
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
 * Applied outer → inner: logging wraps RBAC wraps dispatch.
 */
export function composeMiddleware(
  middlewares: ToolMiddleware[],
  executeFn: ToolExecuteFn,
): ToolExecuteFn {
  // Reduce right-to-left so first middleware in array is outermost
}
```

### `LoggingMiddleware.ts`

Matches the existing `LoggingDecorator` format from `src/core/common/LoggingDecorator.ts`:

```typescript
// Log format (matches existing conventions):
// [Tool:calculator] START  {role: "ANONYMOUS"}
// [Tool:calculator] SUCCESS (12ms)
// [Tool:calculator] ERROR (5ms) Error: ...
```

- Logs tool `name`, `context.role`, duration in ms, and success/error status.
- On error: logs the error, then re-throws (does not swallow).

### `RbacGuardMiddleware.ts`

```typescript
// Checks registry.canExecute(name, context.role)
// If denied → throw ToolAccessDeniedError (TOOL-SEC-2)
// If allowed → call next(name, input, context)
```

- Accepts `ToolRegistry` in constructor (needs access to `canExecute()`).
- This is the belt-and-suspenders layer — even if schema filtering missed a
  tool, this middleware blocks it at dispatch.

### Middleware stack (composition order)

```text
LoggingMiddleware → RbacGuardMiddleware → registry.execute()
```

This ensures:
1. Every call is logged (even RBAC rejections get timing).
2. RBAC runs before the command.
3. The command only runs if RBAC passes.

### Tests (`tests/tool-middleware.test.ts`)

| Test ID | Scenario |
| --- | --- |
| TEST-MW-01 | `LoggingMiddleware` logs `[Tool:name] START` + `SUCCESS (Xms)` on success |
| TEST-MW-02 | `LoggingMiddleware` logs `[Tool:name] ERROR (Xms)` on failure |
| TEST-MW-03 | `RbacGuardMiddleware` blocks ANONYMOUS from restricted tool → `ToolAccessDeniedError` |
| TEST-MW-04 | `RbacGuardMiddleware` allows AUTHENTICATED to access restricted tool → passes through |
| TEST-MW-05 | Composed chain: logging → RBAC → execute. RBAC rejection is logged with timing. |

### Verify

```bash
npx vitest run tests/tool-middleware.test.ts  # 5 tests pass
npm run build                                 # passes
grep -r "any" src/core/tool-registry/         # returns nothing
```

---

## Sprint 0 Summary

| Metric | Value |
| --- | --- |
| **New files** | 8 (`src/core/tool-registry/`: ToolDescriptor.ts, ToolExecutionContext.ts, ToolCommand.ts, ToolRegistry.ts, errors.ts, ToolMiddleware.ts, LoggingMiddleware.ts, RbacGuardMiddleware.ts) |
| **Modified files** | 0 |
| **New test files** | 2 (`tests/tool-registry.test.ts`, `tests/tool-middleware.test.ts`) |
| **New tests** | ~12 |
| **Existing tests** | All 182 still pass (no code changed) |
| **Requirement coverage** | TOOL-REG-1–5, TOOL-SEC-1–2, TOOL-OBS-1–2, TOOL-TYPE-1, NEG-TOOL-1 |

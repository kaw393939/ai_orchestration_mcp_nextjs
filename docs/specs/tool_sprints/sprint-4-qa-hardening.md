# Sprint 4 — QA & Hardening

> **Goal:** Final verification — integration tests spanning the full stack,
> security verification of RBAC + context isolation, and clean architecture
> boundary checks.
> **Spec ref:** §8, §9
> **Prerequisite:** Sprint 3 complete

---

## Task 4.1 — Integration tests

**What:** End-to-end tests that exercise the full tool stack: composition root →
registry → middleware (logging + RBAC) → command → formatter.

| Item | Detail |
| --- | --- |
| **Create** | `tests/tool-registry.integration.test.ts` |
| **Spec** | TEST-REG-01 through TEST-REG-07, TEST-SEC-01 through TEST-SEC-03 |

### Test design

Create a registry using `createToolRegistry()` with a **mock `BookRepository`**
(returns canned data, no filesystem). Compose the full middleware stack. Run
assertions against the composed executor.

### Test scenarios

| Test ID | Scenario |
| --- | --- |
| TEST-REG-01 | Registry has exactly 11 tools after full composition |
| TEST-REG-02 | Registering a duplicate tool name throws |
| TEST-REG-03 | `getSchemasForRole("ANONYMOUS")` → exactly 6 tools: `calculator`, `search_books`, `get_book_summary`, `set_theme`, `navigate`, `adjust_ui` |
| TEST-REG-04 | `getSchemasForRole("AUTHENTICATED")` → all 11 tools |
| TEST-REG-05 | Execute `calculator` with `{operation:"add", a:2, b:3}` → `{result: 5}` |
| TEST-REG-06 | ANONYMOUS executes `get_chapter` → `ToolAccessDeniedError` from middleware (command.execute never called — verified via spy) |
| TEST-REG-07 | Execute `"nonexistent_tool"` → `UnknownToolError` |

### Logging verification

Use `vi.spyOn(console, "log")` and `vi.spyOn(console, "error")` to verify
`LoggingMiddleware` output format:

```text
[Tool:calculator] START  {role: "ANONYMOUS"}
[Tool:calculator] SUCCESS (Xms)
```

```text
[Tool:get_chapter] START  {role: "ANONYMOUS"}
[Tool:get_chapter] ERROR (Xms) ToolAccessDeniedError: ...
```

### Verify

```bash
npx vitest run tests/tool-registry.integration.test.ts   # 7+ tests pass
```

---

## Task 4.2 — Security verification

**What:** Verify the three-layer RBAC defense and context isolation with
targeted security tests.

| Item | Detail |
| --- | --- |
| **Tests in** | `tests/tool-registry.integration.test.ts` (same file, separate describe block) |
| **Spec** | TOOL-SEC-1 through TOOL-SEC-3 |

### Test scenarios

| Test ID | Scenario | Why it matters |
| --- | --- | --- |
| TEST-SEC-01 | Create context `{role: "AUTHENTICATED"}`, pass input `{role: "ADMIN"}` → execute tool → verify `context.role` is still `"AUTHENTICATED"` (not overridden by LLM input) | Proves context isolation: LLM input cannot escalate privileges |
| TEST-SEC-02 | ANONYMOUS executes `generate_audio` via composed middleware → `ToolAccessDeniedError`. Spy on `GenerateAudioCommand.execute` → **never called**. | Proves RBAC blocks at middleware, not at command level |
| TEST-SEC-03 | Register a custom test tool with `roles: ["ADMIN"]` → only ADMIN can execute; AUTHENTICATED, STAFF, ANONYMOUS all rejected | Proves per-descriptor role arrays work beyond the built-in whitelist |

### Architecture grep checks

```bash
# No mixing of LLM input with server context
grep -rn "\.\.\.toolUse\.input.*role\|\.\.\.input.*role" src/    # returns nothing

# No ToolAccessPolicy references remain
grep -r "ToolAccessPolicy" src/                                  # returns nothing

# Core tool-registry has no infra imports
grep -r "from.*@/lib\|from.*@/adapters" src/core/tool-registry/  # returns nothing

# No Anthropic SDK in core layer
grep -ri "anthropic" src/core/                                    # returns nothing
```

### Verify

```bash
npx vitest run tests/tool-registry.integration.test.ts   # all pass
```

---

## Task 4.3 — Clean architecture verification

**What:** Systematically verify all negative/architectural requirements from the
spec hold. These are automated checks, not manual.

| Requirement | Check | Command |
| --- | --- | --- |
| NEG-TOOL-1 | Core tool-registry has no infra imports | `grep -r "from.*@/lib\|from.*@/adapters" src/core/tool-registry/` → nothing |
| NEG-TOOL-2 | All existing tests pass | `npm run build && npx vitest run` → 182+ tests, 0 failures |
| NEG-TOOL-3 | `ToolAccessPolicy` fully removed | `grep -r "ToolAccessPolicy" src/` → nothing |
| NEG-TOOL-4 | `tools.ts` is ≤50 lines | `wc -l src/lib/chat/tools.ts` → ≤50 |
| NEG-TOOL-5 | No Anthropic SDK in core layer | `grep -ri "anthropic" src/core/` → nothing |
| TOOL-TYPE-1 | No `any` in tool-registry types | `grep "any" src/core/tool-registry/*.ts` → nothing |
| TOOL-TYPE-2 | No `as any` or `as unknown` in dispatch | `grep "as any\|as unknown" src/core/tool-registry/ToolRegistry.ts` → nothing |

### Final counts

```bash
# Total test count
npx vitest run 2>&1 | grep "Tests"
# Expected: 182 + ~30 new = ~212 tests passing

# File inventory
find src/core/tool-registry -name "*.ts" | wc -l
# Expected: 8 files

find src/core/use-cases/tools -name "*.tool.ts" | wc -l
# Expected: 11 descriptor files
```

### Verify

```bash
npm run build && npx vitest run   # all pass, zero warnings
```

---

## Sprint 4 Summary

| Metric | Value |
| --- | --- |
| **New files** | 1 (`tests/tool-registry.integration.test.ts`) |
| **Modified files** | 0 |
| **New tests** | ~8 (integration + security) |
| **Total tests** | ~212 (182 baseline + ~30 new across all sprints) |
| **Requirement coverage** | TEST-SEC-01–03, TEST-REG-01–07, NEG-TOOL-1–5, TOOL-TYPE-1–2 |

---

## Post-Sprint 4 — Implementation Complete

### Architecture achieved

```text
src/core/tool-registry/         (8 files — types, registry, middleware, errors, formatter)
src/core/use-cases/tools/       (11 *.tool.ts descriptors + existing command classes)
src/lib/chat/tool-composition-root.ts   (wires everything)
src/lib/chat/tools.ts           (thin re-export wrapper, ≤50 lines)
src/adapters/CachedBookRepository.ts    (performance decorator)
```

### Adding a new tool (the payoff)

1. Create `src/core/use-cases/tools/my-tool.tool.ts` with descriptor + command.
2. Add one `registry.register(myTool)` line in `tool-composition-root.ts`.
3. Done. RBAC, logging, and caching work automatically.

### Three-layer RBAC defense

```text
Layer 1: Schema filtering  → LLM only sees allowed tools
Layer 2: RbacGuardMiddleware → dispatch blocked if role mismatch
Layer 3: ToolExecutionContext → commands get role via separate context, never merged with LLM input
```

# Sprint 3 — Role-Aware LLM

> **Goal:** LLM behavior and tool access vary by role. TTS gated. Admin switcher gated.  
> **Spec ref:** §3.4, §6, §8 Phase 2  
> **Prerequisite:** Sprint 2 complete

---

## Task 3.1 — ChatPolicyInteractor + ToolAccessPolicy (core)

**What:** Move domain rules from infrastructure to core use-case layer.

| Item | Detail |
|------|--------|
| **Create** | `src/core/use-cases/ChatPolicyInteractor.ts` — `buildSystemPrompt(role)`, `looksLikeMath()` (moved from `policy.ts`) |
| **Create** | `src/core/use-cases/ToolAccessPolicy.ts` — `getToolNamesForRole(role)` with ANONYMOUS whitelist |
| **Spec** | §2A Issues D & E, §3.4, §6, RBAC-2–7, NEG-ARCH-6 |
| **Tests (new)** | `buildSystemPrompt("ANONYMOUS")` includes "DEMO mode"; `buildSystemPrompt("ADMIN")` includes "system administrator"; `getToolNamesForRole("ANONYMOUS")` returns 6 tools; `getToolNamesForRole("AUTHENTICATED")` returns `"ALL"` |

---

## Task 3.2 — Wire policy into infrastructure

**What:** Update `policy.ts` and `tools.ts` to delegate to core interactors.

| Item | Detail |
|------|--------|
| **Modify** | `src/lib/chat/policy.ts` — delegate to `ChatPolicyInteractor` |
| **Modify** | `src/lib/chat/tools.ts` — use `ToolAccessPolicy.getToolNamesForRole()` for filtering |
| **Spec** | §4 modified files table |
| **Tests** | Existing chat tests pass; tool filtering now role-aware |

---

## Task 3.3 — Chat route session integration

**What:** Both chat routes resolve the caller's role from session and pass it to policy/tools.

| Item | Detail |
|------|--------|
| **Modify** | `src/app/api/chat/stream/route.ts` — read cookie → ValidateSession → role → ChatPolicyInteractor → ToolAccessPolicy → filtered Anthropic call |
| **Modify** | `src/app/api/chat/route.ts` — same session/role integration |
| **Spec** | §3.4 implementation flow (7 steps), MW-4, MW-5, RBAC-2–3 |
| **Key details** | No cookie → ANONYMOUS. Cookie present → validate → real role. Invalid token → 401. |
| **Tests (new)** | TEST-SESS-06 (no cookie → ANONYMOUS tools), TEST-RBAC-01 (ANONYMOUS limited), TEST-RBAC-02 (AUTHENTICATED full) |

---

## Task 3.4 — Belt-and-suspenders: SearchBooks + TTS gating

**What:** Server-side enforcement independent of prompt directives.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/use-cases/tools/BookTools.ts` — `SearchBooksCommand.execute()` accepts role context; truncates output for ANONYMOUS |
| **Modify** | `src/app/api/tts/route.ts` — add session validation; reject ANONYMOUS with 403 |
| **Spec** | §6 belt-and-suspenders, RBAC-7, NEG-ROLE-2 |
| **Tests (new)** | SearchBooks ANONYMOUS → truncated. TTS ANONYMOUS → 403. |

---

## Task 3.5 — Admin role-switcher gating

**What:** Gate `/api/auth/switch` behind ADMIN role (with dev-mode bypass).

| Item | Detail |
|------|--------|
| **Modify** | `src/app/api/auth/switch/route.ts` — validate session → check ADMIN **or** `NODE_ENV === 'development'` → write `lms_simulated_role` cookie |
| **Spec** | SWITCH-1–3, NEG-ROLE-1, TEST-RBAC-03–04 |
| **Tests (new)** | ADMIN → 200 + cookie set; non-ADMIN → 403 (prod); non-ADMIN + dev mode → 200; no session → 401 |

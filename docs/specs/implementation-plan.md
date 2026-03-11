# Implementation Plan — Multi-User Auth, RBAC & Chat History

> **Source:** `docs/specs/multi-user-rbac-spec.md` (v2.3)  
> **Test runner:** Vitest (25 existing test files)  
> **Convention:** Each task = one commit. Run `npm run build && npm test` between commits.

---

## Sprint 0 — Dependency Violation Fixes

> **Goal:** Establish clean architecture before adding new features.  
> **Spec ref:** §2A Violations 1–4, §4 Pre-work table, §8 Phase 0  
> **Prerequisite:** None

### Task 0.1 — BookTools dependency inversion (Violation 1)

**What:** BookTools commands currently import 5 facade functions from `@/lib/book-library` (infrastructure). Inject the existing `BookRepository` port via constructor instead.

**Note:** The `BookRepository` port already exists at `src/core/use-cases/BookRepository.ts` — no new file needed.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/use-cases/tools/BookTools.ts` — add `BookRepository` constructor param to each of the 5 commands (`SearchBooksCommand`, `GetChapterCommand`, `GetChecklistCommand`, `ListPractitionersCommand`, `GetBookSummaryCommand`); remove `@/lib/book-library` import; call repository methods instead of facade functions |
| **Modify** | `src/lib/chat/tools.ts` — wire `FileSystemBookRepository` instance into each command constructor (currently `new XxxCommand()` → `new XxxCommand(bookRepo)`) |
| **Spec** | §2A Violation 1, §8 Phase 0 step 1, NEG-ARCH-1 |
| **Tests** | Existing BookTools tests still pass; `BookTools.ts` has zero imports from `src/lib/` |
| **Verify** | `grep -r "@/lib/book-library" src/core/` returns nothing |

### Task 0.2 — Calculator move to core (Violation 2)

**What:** `CalculatorTool.ts` imports `calculate`, `isCalculatorOperation`, and `CalculatorResult` from `@/lib/calculator`. Move the entire module (all 4 exports) into the core entity layer — it's pure arithmetic with zero I/O.

| Item | Detail |
|------|--------|
| **Create** | `src/core/entities/calculator.ts` — move all 4 exports from `lib/calculator.ts`: type `CalculatorOperation`, type `CalculatorResult`, function `calculate()`, function `isCalculatorOperation()` |
| **Modify** | `src/core/use-cases/tools/CalculatorTool.ts` — change import from `@/lib/calculator` to `@/core/entities/calculator` (imports `calculate`, `isCalculatorOperation`, `CalculatorResult`) |
| **Modify** | `src/lib/calculator.ts` — replace implementation with re-exports from `@/core/entities/calculator` (backward compat for any other consumers) |
| **Spec** | §2A Violation 2, §8 Phase 0 step 2, NEG-ARCH-1 |
| **Tests** | Existing calculator tests pass; `CalculatorTool.ts` has zero imports from `src/lib/` |
| **Verify** | `grep -r "@/lib/calculator" src/core/` returns nothing |

### Task 0.3 — BookMeta to adapter layer (Violation 3)

**What:** `BookMeta` interface (with `chaptersDir` file-system path) and `BOOKS` constant are in `src/core/entities/library.ts`, coupling the entity layer to storage strategy. Move to adapter layer.

**Complication:** 4 Next.js page files also import `BOOKS` from `library.ts` for `generateStaticParams()` and rendering. These pages only use `slug`, `title`, `number` fields (not `chaptersDir`), so they should switch to importing via the `book-library.ts` facade.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/entities/library.ts` — remove `BookMeta` interface and `BOOKS` constant; retain pure types: `Book`, `Chapter`, `LibrarySearchResult`, `Practitioner`, `Checklist` |
| **Modify** | `src/adapters/FileSystemBookRepository.ts` — absorb `BookMeta` interface + `BOOKS` constant; update imports |
| **Modify** | `src/lib/book-library.ts` — export a `getBooks(): Book[]` convenience function (maps `BOOKS` to pure `Book` shape) for page consumers |
| **Modify** | `src/app/books/page.tsx`, `src/app/books/[book]/page.tsx`, `src/app/books/[book]/layout.tsx`, `src/app/books/[book]/[chapter]/page.tsx` — replace `import { BOOKS } from "@/core/entities/library"` with facade import |
| **Spec** | §2A Violation 3, §8 Phase 0 step 3, NEG-ARCH-1 |
| **Tests** | Existing book tests pass; `src/core/entities/library.ts` exports only pure domain types (no file-system references) |
| **Verify** | `grep -r "chaptersDir" src/core/` returns nothing; `grep -r "BOOKS.*library" src/app/` returns nothing |

### Task 0.4 — ChatMessage unification (Violation 4)

**What:** Two competing `ChatMessage` types exist with different shapes. Unify to single canonical source in `chat-message.ts`.

**Type differences to reconcile:**
- `MessageFactory.ts` version: no `id`, optional `timestamp`, role `"user" | "assistant"` only, `parts?: MessagePart[]`
- `chat-message.ts` version: has `id` (required), required `timestamp`, role includes `"system"`, `parts?: unknown[]`

**Resolution:** The canonical type in `chat-message.ts` wins (it has the richer shape). `MessageFactory` already generates `id` via `crypto.randomUUID()` and `timestamp` via `new Date()`, so it already produces the canonical shape — it just didn't declare it. The `parts` type should use the more specific `MessagePart[]` (from `message-parts.ts`) in the canonical definition.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/entities/chat-message.ts` — update `parts` type from `unknown[]` to `MessagePart[]` (import from `message-parts.ts`); this is the canonical source |
| **Modify** | `src/core/entities/MessageFactory.ts` — delete duplicate `ChatMessage` interface; import `ChatMessage` from `./chat-message`; update `create()` return type |
| **Modify** | `src/hooks/useGlobalChat.tsx` — change `ChatMessage` import/re-export from `"@/core/entities/MessageFactory"` to `"@/core/entities/chat-message"` |
| **Spec** | §2A Violation 4, §8 Phase 0 step 4 |
| **Tests** | All existing tests pass; only one `ChatMessage` export exists in `src/core/entities/` |
| **Verify** | `grep -rn "interface ChatMessage" src/core/entities/` returns exactly 1 result (in `chat-message.ts`) |

---

## Sprint 1 — Auth Core (inside-out: entities → ports → use cases → adapters)

> **Goal:** All auth business logic exists and is unit-testable. No routes or UI yet.  
> **Spec ref:** §3.1, §3.2, §4, §8 Phase 1 steps 1–8  
> **Prerequisite:** Sprint 0 complete

### Task 1.1 — Auth entities

**What:** Create the `Session` entity type and extend `User`-related types.

| Item | Detail |
|------|--------|
| **Create** | `src/core/entities/session.ts` — `Session { id, userId, expiresAt, createdAt }` |
| **Spec** | §4 new files table |
| **Tests** | Type-only file; verified by build |

### Task 1.2 — Auth ports

**What:** Define the port interfaces that auth interactors depend on.

| Item | Detail |
|------|--------|
| **Create** | `src/core/use-cases/SessionRepository.ts` — `create()`, `findByToken()`, `delete()`, `deleteExpired()` |
| **Create** | `src/core/use-cases/UserRepository.ts` — `create()`, `findByEmail()`, `findById()`, `findByRole()` |
| **Create** | `src/core/use-cases/PasswordHasher.ts` — `hash(plain): string`, `verify(plain, hash): boolean` |
| **Spec** | §2A Issue B, §4 new files table |
| **Tests** | Interface-only files; verified by build |

### Task 1.3 — Auth use cases

**What:** Implement the three auth interactors against the port interfaces (no concrete DB).

| Item | Detail |
|------|--------|
| **Create** | `src/core/use-cases/RegisterUserInteractor.ts` — `UseCase<RegisterRequest, AuthResult>` |
| **Create** | `src/core/use-cases/AuthenticateUserInteractor.ts` — `UseCase<LoginRequest, AuthResult>` |
| **Create** | `src/core/use-cases/ValidateSessionInteractor.ts` — `UseCase<{ token }, SessionUser>` |
| **Spec** | §3.1 registration/login flows, REG-1–9, AUTH-1–7, SESS-1–3 |
| **Key details** | RegisterUser: validate email/password/name → hash → create user → create session. Authenticate: findByEmail → verify (timing-safe dummy hash if not found) → create session. Validate: findByToken → check expiry → return user. |
| **Tests (new)** | Unit tests with stub ports: TEST-REG-01–08 scenarios, TEST-LOGIN-01–05, TEST-SESS-01–04 |
| **Verify** | `npm test -- --reporter verbose` — all new tests green |

### Task 1.4 — BcryptHasher adapter + install bcryptjs

**What:** Create the concrete `PasswordHasher` implementation.

| Item | Detail |
|------|--------|
| **Install** | `npm install bcryptjs && npm install -D @types/bcryptjs` |
| **Create** | `src/adapters/BcryptHasher.ts` — implements `PasswordHasher` using bcryptjs, cost from `BCRYPT_ROUNDS` env |
| **Spec** | §2A Issue B adapter #4, REG-2, NEG-SEC-1 |
| **Tests (new)** | `hash()` → `verify()` round-trip; wrong password → false |

### Task 1.5 — Database schema extension

**What:** Add `password_hash`, `created_at` to users table; create `sessions` table; add UNIQUE index on email.

| Item | Detail |
|------|--------|
| **Modify** | `src/lib/db/schema.ts` — add `ALTER TABLE users ADD COLUMN` (try/catch), `CREATE TABLE sessions`, `CREATE UNIQUE INDEX idx_users_email` |
| **Spec** | §3.2 full SQL |
| **Tests** | Build passes; existing seed data preserved; `ALTER TABLE` idempotent |

### Task 1.6 — SessionDataMapper adapter

**What:** SQLite implementation of `SessionRepository`.

| Item | Detail |
|------|--------|
| **Create** | `src/adapters/SessionDataMapper.ts` — `create()`, `findByToken()`, `delete()`, `deleteExpired()` |
| **Spec** | §2A corrected layer map |
| **Tests (new)** | Integration test: create → findByToken → delete lifecycle; expired sessions not returned |

### Task 1.7 — Extend UserDataMapper

**What:** Implement `UserRepository` port on existing `UserDataMapper`. Add `UserRecord` type.

| Item | Detail |
|------|--------|
| **Modify** | `src/adapters/UserDataMapper.ts` — add `create()`, `findByEmail()`, `findById()` methods; define `UserRecord` (with `passwordHash`); implement `UserRepository` interface |
| **Spec** | §2A Issue A (User vs UserRecord), NEG-ARCH-5, NEG-SEC-2 |
| **Tests (new)** | Integration: `create()` → `findByEmail()` → `findById()` chain; duplicate email → UNIQUE constraint error |

### Task 1.8 — Auth composition root

**What:** Refactor `src/lib/auth.ts` from grab-bag to composition root that wires interactors to adapters.

| Item | Detail |
|------|--------|
| **Modify** | `src/lib/auth.ts` — wire `RegisterUserInteractor`, `AuthenticateUserInteractor`, `ValidateSessionInteractor` to concrete adapters (`SessionDataMapper`, `UserDataMapper`, `BcryptHasher`). Export convenience functions: `register()`, `login()`, `logout()`, `validateSession()`, `getSessionUser()`. |
| **Spec** | §2A Issue B step 8, follows `book-library.ts` Facade pattern |
| **Tests** | Existing auth tests adapted; build passes |

---

## Sprint 2 — Auth API & UI

> **Goal:** Users can register, log in, log out via browser. Middleware protects routes.  
> **Spec ref:** §3.3, §3.6, §5, §8 Phase 1 steps 9–12  
> **Prerequisite:** Sprint 1 complete

### Task 2.1 — Edge middleware

**What:** Create `src/middleware.ts` — cookie presence check only, no DB.

| Item | Detail |
|------|--------|
| **Create** | `src/middleware.ts` — route matcher config from §3.3; check `lms_session_token` cookie; 401 for protected routes without cookie; pass everything else |
| **Spec** | §3.3, §5, MW-1–6, NEG-ARCH-3, NEG-ARCH-4 |
| **Tests (new)** | Middleware unit tests: cookie absent + protected route → 401; cookie present → passes; public routes → passes; page routes → passes |
| **Verify** | `npm run build` succeeds (Edge Runtime compatible — no `better-sqlite3` import) |

### Task 2.2 — Auth API routes

**What:** Create the 4 auth route handlers.

| Item | Detail |
|------|--------|
| **Create** | `src/app/api/auth/register/route.ts` — POST, delegates to `register()` |
| **Create** | `src/app/api/auth/login/route.ts` — POST, delegates to `login()` |
| **Create** | `src/app/api/auth/logout/route.ts` — POST, delegates to `logout()` |
| **Create** | `src/app/api/auth/me/route.ts` — GET, delegates to `validateSession()` |
| **Spec** | §12 API Reference (Auth section), REG-1–9, AUTH-1–7 |
| **Tests (new)** | Integration: `POST /register` → `POST /login` → `GET /me` → `POST /logout` → `GET /me` (401) |

### Task 2.3 — Login & Register pages

**What:** Create the two auth UI pages.

| Item | Detail |
|------|--------|
| **Create** | `src/app/login/page.tsx` — email + password form, inline errors, redirect to `/` on success |
| **Create** | `src/app/register/page.tsx` — email + password + name form, inline field validation, redirect to `/` on success |
| **Spec** | §3.6, UI-4, UI-5, TEST-PAGE-03–06 |
| **Key details** | Login: retain email on failure, clear password (TEST-PAGE-03). Register: inline errors per field (TEST-PAGE-04). Both redirect to `/` on success. |
| **Tests** | Manual verification + build passes |

### Task 2.4 — Nav auth state (AccountMenu + SiteNav)

**What:** Update navigation to reflect auth state.

| Item | Detail |
|------|--------|
| **Modify** | `src/components/AccountMenu.tsx` — unauthenticated: "Sign In" / "Register" links; authenticated: user info + conversation history; ADMIN: + simulation panel |
| **Modify** | `src/components/SiteNav.tsx` — login/register CTA for anonymous users |
| **Modify** | `src/app/layout.tsx` — pass user to ChatProvider for context |
| **Modify** | `src/hooks/useMockAuth.ts` — remove exported `ROLE_CONFIG` (move to AccountMenu local const); simplify to admin-only role switch |
| **Spec** | §3.6, UI-1–3, TEST-PAGE-01–02 |
| **Tests** | Build passes; manual verification of both auth states |

---

## Sprint 3 — Role-Aware LLM

> **Goal:** LLM behavior and tool access vary by role. TTS gated. Admin switcher gated.  
> **Spec ref:** §3.4, §6, §8 Phase 2  
> **Prerequisite:** Sprint 2 complete

### Task 3.1 — ChatPolicyInteractor + ToolAccessPolicy (core)

**What:** Move domain rules from infrastructure to core use-case layer.

| Item | Detail |
|------|--------|
| **Create** | `src/core/use-cases/ChatPolicyInteractor.ts` — `buildSystemPrompt(role)`, `looksLikeMath()` (moved from `policy.ts`) |
| **Create** | `src/core/use-cases/ToolAccessPolicy.ts` — `getToolNamesForRole(role)` with ANONYMOUS whitelist |
| **Spec** | §2A Issues D & E, §3.4, §6, RBAC-2–7, NEG-ARCH-6 |
| **Tests (new)** | `buildSystemPrompt("ANONYMOUS")` includes "DEMO mode"; `buildSystemPrompt("ADMIN")` includes "system administrator"; `getToolNamesForRole("ANONYMOUS")` returns 6 tools; `getToolNamesForRole("AUTHENTICATED")` returns `"ALL"` |

### Task 3.2 — Wire policy into infrastructure

**What:** Update `policy.ts` and `tools.ts` to delegate to core interactors.

| Item | Detail |
|------|--------|
| **Modify** | `src/lib/chat/policy.ts` — delegate to `ChatPolicyInteractor` |
| **Modify** | `src/lib/chat/tools.ts` — use `ToolAccessPolicy.getToolNamesForRole()` for filtering |
| **Spec** | §4 modified files table |
| **Tests** | Existing chat tests pass; tool filtering now role-aware |

### Task 3.3 — Chat route session integration

**What:** Both chat routes resolve the caller's role from session and pass it to policy/tools.

| Item | Detail |
|------|--------|
| **Modify** | `src/app/api/chat/stream/route.ts` — read cookie → ValidateSession → role → ChatPolicyInteractor → ToolAccessPolicy → filtered Anthropic call |
| **Modify** | `src/app/api/chat/route.ts` — same session/role integration |
| **Spec** | §3.4 implementation flow (7 steps), MW-4, MW-5, RBAC-2–3 |
| **Key details** | No cookie → ANONYMOUS. Cookie present → validate → real role. Invalid token → 401. |
| **Tests (new)** | TEST-SESS-06 (no cookie → ANONYMOUS tools), TEST-RBAC-01 (ANONYMOUS limited), TEST-RBAC-02 (AUTHENTICATED full) |

### Task 3.4 — Belt-and-suspenders: SearchBooks + TTS gating

**What:** Server-side enforcement independent of prompt directives.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/use-cases/tools/BookTools.ts` — `SearchBooksCommand.execute()` accepts role context; truncates output for ANONYMOUS |
| **Modify** | `src/app/api/tts/route.ts` — add session validation; reject ANONYMOUS with 403 |
| **Spec** | §6 belt-and-suspenders, RBAC-7, NEG-ROLE-2 |
| **Tests (new)** | SearchBooks ANONYMOUS → truncated. TTS ANONYMOUS → 403. |

### Task 3.5 — Admin role-switcher gating

**What:** Gate `/api/auth/switch` behind ADMIN role.

| Item | Detail |
|------|--------|
| **Modify** | `src/app/api/auth/switch/route.ts` — validate session → check ADMIN → write `lms_simulated_role` cookie |
| **Spec** | SWITCH-1–3, NEG-ROLE-1, TEST-RBAC-03–04 |
| **Tests (new)** | ADMIN → 200 + cookie set; non-ADMIN → 403; no session → 401 |

---

## Sprint 4 — Chat Persistence

> **Goal:** Authenticated users get persistent conversation history.  
> **Spec ref:** §3.5, §7, §8 Phase 3  
> **Prerequisite:** Sprint 3 complete

### Task 4.1 — Chat entities + schema

**What:** Create conversation/message entity types and DB tables.

| Item | Detail |
|------|--------|
| **Create** | `src/core/entities/conversation.ts` — `Conversation`, `ConversationSummary`, `Message`, `NewMessage` |
| **Modify** | `src/lib/db/schema.ts` — add `conversations` and `messages` tables per §3.2 SQL |
| **Spec** | §3.2 (conversations + messages SQL), §4 |
| **Tests** | Build passes; schema migration idempotent |

### Task 4.2 — Chat ports

**What:** Define persistence contracts for conversations and messages.

| Item | Detail |
|------|--------|
| **Create** | `src/core/use-cases/ConversationRepository.ts` — `create()`, `listByUser()`, `findById()`, `delete()`, `updateTitle()` |
| **Create** | `src/core/use-cases/MessageRepository.ts` — `create()`, `listByConversation()`, `countByConversation()` |
| **Spec** | §2A Issue C, §3.5 port interfaces |
| **Tests** | Interface-only; verified by build |

### Task 4.3 — ConversationInteractor (use case)

**What:** CRUD orchestration with ownership enforcement and limit checks.

| Item | Detail |
|------|--------|
| **Create** | `src/core/use-cases/ConversationInteractor.ts` — create, get, list, delete with `userId` ownership checks; message count validation (100 hard limit); conversation count check (50 soft limit, auto-delete oldest) |
| **Spec** | §2A Issue C, CHAT-1–10, NEG-DATA-1–4, NEG-ARCH-2 |
| **Key details** | Ownership: `conversation.user_id !== currentUser.id` → 404 (not 403, NEG-SEC-6). Message limit: count ≥ 100 → 400. Conversation limit: count ≥ 50 → delete oldest. |
| **Tests (new)** | Ownership enforcement (TEST-CHAT-03); message limit (TEST-CHAT-09); conversation count limit (TEST-CHAT-10) |

### Task 4.4 — Chat data mappers (adapters)

**What:** SQLite implementations of conversation and message repositories.

| Item | Detail |
|------|--------|
| **Create** | `src/adapters/ConversationDataMapper.ts` — implements `ConversationRepository` |
| **Create** | `src/adapters/MessageDataMapper.ts` — implements `MessageRepository` |
| **Spec** | §2A Issue C adapters |
| **Tests (new)** | Integration: create → listByUser → findById → delete (CASCADE). Messages: create → listByConversation (ordered). Parts JSON round-trip. |

### Task 4.5 — Conversation API routes

**What:** REST endpoints for conversation CRUD.

| Item | Detail |
|------|--------|
| **Create** | `src/app/api/conversations/route.ts` — GET (list) + POST (create) |
| **Create** | `src/app/api/conversations/[id]/route.ts` — GET (with messages) + DELETE |
| **Spec** | §12 Conversations API reference, CHAT-5–8, NEG-SEC-6 |
| **Key details** | All routes require valid session (middleware enforces cookie, handler validates). Ownership violations → 404 (not 403). |
| **Tests (new)** | TEST-RBAC-05 (ANONYMOUS → 401); TEST-CHAT-06 (list ordered by updated_at); TEST-CHAT-05 (delete cascades) |

### Task 4.6 — Chat stream persistence integration

**What:** Update `/api/chat/stream` to persist messages for authenticated users.

| Item | Detail |
|------|--------|
| **Modify** | `src/app/api/chat/stream/route.ts` — full 9-step flow from §3.5: accept `conversationId`, create conversation if needed, persist user message before Anthropic call, persist assistant message after stream completes, return `conversationId` in first SSE event |
| **Spec** | §3.5 flow (9 steps), CHAT-1–4, CHAT-6, CHAT-9, NEG-DATA-2 |
| **Key details** | ANONYMOUS → skip all persistence (no conversationId in response). Authenticated → full persistence. Agent-loop → single assistant row with complete parts array. |
| **Tests (new)** | TEST-CHAT-01 (first message creates conv), TEST-CHAT-02 (appends), TEST-CHAT-08 (ANONYMOUS not persisted) |

### Task 4.7 — Client-side conversation state

**What:** Extend `useGlobalChat` to track conversations and integrate with server.

| Item | Detail |
|------|--------|
| **Modify** | `src/hooks/useGlobalChat.tsx` — add `conversationId` to state; add `conversations` list; add `LOAD_CONVERSATION`, `NEW_CONVERSATION`, `SET_CONVERSATIONS` actions; include `conversationId` in POST body; parse from first SSE event |
| **Spec** | §3.5 client-side, CHAT-4, CHAT-10, UI-6–7 |
| **Tests** | Build passes; manual verification of conversation switching |

### Task 4.8 — Conversation UI

**What:** Add conversation sidebar/selector and "New Chat" button.

| Item | Detail |
|------|--------|
| **Create/Modify** | Conversation sidebar or dropdown component; "New Chat" button; conversation title in header; delete conversation option |
| **Spec** | §3.5 UI additions, UI-6, UI-7, TEST-CHAT-07, TEST-PAGE-02 |
| **Tests** | Manual verification; build passes |

---

## Sprint 5 — Polish & Hardening

> **Goal:** Production-ready quality. Error handling, loading states, observability.  
> **Spec ref:** §8 Phase 4  
> **Prerequisite:** Sprint 4 complete

### Task 5.1 — Session cleanup

**What:** Expired session pruning.

| Item | Detail |
|------|--------|
| **Modify** | Session cleanup logic — opportunistic (delete on read if expired) + startup prune via `SessionRepository.deleteExpired()` |
| **Spec** | AUTH-7 |
| **Tests** | Integration: create expired session → prune → verify deleted |

### Task 5.2 — Conversation auto-title

**What:** Auto-generate conversation titles from first user message.

| Item | Detail |
|------|--------|
| **Modify** | `ConversationInteractor.create()` — auto-title from first user message, truncated to 80 chars |
| **Spec** | CHAT-3, TEST-CHAT-01 |
| **Tests** | Unit: long message → truncated to 80 chars |

### Task 5.3 — Client error handling

**What:** Proper handling of 401/403 responses in the client.

| Item | Detail |
|------|--------|
| **Modify** | Client-side fetch wrappers / hooks — redirect to login on 401; show "access denied" on 403 |
| **Spec** | TEST-EDGE-01, TEST-EDGE-04 |
| **Tests** | Manual verification |

### Task 5.4 — Loading states

**What:** Add loading indicators for auth and conversation operations.

| Item | Detail |
|------|--------|
| **Modify** | Login/register forms — loading spinner during submission |
| **Modify** | Conversation sidebar — loading state during list fetch and conversation switch |
| **Spec** | UI polish (Phase 4 items 4–5) |
| **Tests** | Manual verification |

### Task 5.5 — LoggingDecorator for new interactors

**What:** Wrap all new use cases with the existing `LoggingDecorator` for observability.

| Item | Detail |
|------|--------|
| **Modify** | `src/lib/auth.ts` — wrap `RegisterUserInteractor`, `AuthenticateUserInteractor`, `ValidateSessionInteractor` with `LoggingDecorator` |
| **Modify** | Conversation composition root — wrap `ConversationInteractor` with `LoggingDecorator` |
| **Spec** | §2A Design Pattern Summary (Decorator row), Phase 4 item 6 |
| **Tests** | Build + existing tests pass; verify log output manually |

---

## Summary

| Sprint | Tasks | New Files | Modified Files | New Tests |
|--------|-------|-----------|----------------|-----------|
| **0 — Violations** | 4 | 1 | 10 | 0 (existing pass) |
| **1 — Auth Core** | 8 | 9 | 3 | ~15 unit + integration |
| **2 — Auth API & UI** | 4 | 7 | 5 | ~8 integration + middleware |
| **3 — Role-Aware LLM** | 5 | 2 | 6 | ~10 unit + integration |
| **4 — Chat Persistence** | 8 | 6 | 3 | ~12 unit + integration |
| **5 — Polish** | 5 | 0 | ~6 | ~3 |
| **Total** | **34** | **25** | **28** | **~48** |

### Dependency Graph

```
Sprint 0 (violations)
  └──→ Sprint 1 (auth core)
         └──→ Sprint 2 (auth API + UI)
                └──→ Sprint 3 (role-aware LLM)
                       └──→ Sprint 4 (chat persistence)
                              └──→ Sprint 5 (polish)
```

Each sprint is independently deployable (the app works after each sprint, just with fewer features).

### Quick Reference — Requirement → Task Mapping

| Requirement Group | Tasks |
|-------------------|-------|
| REG-1 through REG-9 | 1.3, 1.4, 1.5, 1.7, 1.8, 2.2, 2.3 |
| AUTH-1 through AUTH-7 | 1.3, 1.6, 1.8, 2.2, 5.1 |
| SESS-1 through SESS-3 | 1.3, 1.6, 1.8, 2.1 |
| MW-1 through MW-6 | 2.1, 3.3 |
| RBAC-1 through RBAC-7 | 3.1, 3.2, 3.3, 3.4 |
| SWITCH-1 through SWITCH-3 | 3.5 |
| CHAT-1 through CHAT-10 | 4.1–4.8, 5.2 |
| UI-1 through UI-7 | 2.3, 2.4, 4.7, 4.8 |
| NEG-SEC-1 through NEG-SEC-8 | 1.3, 1.4, 1.7, 2.1, 4.3, 4.5 |
| NEG-ARCH-1 through NEG-ARCH-6 | 0.1–0.4, 1.7, 2.1, 3.1 |
| NEG-ROLE-1 through NEG-ROLE-4 | 3.3, 3.4, 3.5 |
| NEG-DATA-1 through NEG-DATA-4 | 4.3, 4.6 |

# Multi-User Auth, RBAC & Chat History — System Spec

> **Status:** Draft (v2.3 — architecture-audited + requirements + behavioral tests)  
> **Date:** 2026-03-11  
> **Scope:** Replace mock role-switcher with real auth, enforce RBAC server-side, persist chat history per user, make LLM role-aware.  
> **Audit:** Clean Architecture (Robert C. Martin), SOLID, GoF design patterns.

---

## 1. Problem Statement

The application currently has:

- **Mock auth** — A cookie (`lms_mock_session_role`) that any visitor can set to any role via `POST /api/auth/switch`. No passwords, no sessions, no identity verification.
- **No API protection** — `/api/chat/stream`, `/api/chat`, and `/api/tts` are open to the public. Anyone can consume Anthropic/OpenAI credits.
- **No chat persistence** — Conversations live in React state (`useReducer`). A page refresh destroys all history.
- **Role-blind LLM** — The system prompt is a static string. Claude has no idea who is asking or what their access level is.
- **No registration flow** — Users are 4 hardcoded rows in SQLite.

### What we need

A real multi-user system where:
1. Users can register and log in.
2. Each user has a persistent role (ANONYMOUS visitors have limited access).
3. API routes are gated by role.
4. The LLM adapts its behavior based on the caller's role.
5. Chat history is stored per user and survives page refreshes.
6. The role-switcher is preserved as an ADMIN-only simulation tool.

---

## 2. Current Architecture Inventory

### Database (SQLite via better-sqlite3)

| Table | Columns | Purpose |
|-------|---------|---------|
| `roles` | id, name, description | 4 static roles |
| `users` | id, email, name | 4 hardcoded mock users |
| `user_roles` | user_id, role_id | Join table (1:1 today) |

No chat tables. No password column. No session table.

### Auth Flow (current)

```
Browser → POST /api/auth/switch {role: "ADMIN"}
  → setMockSession() writes httpOnly cookie
  → page reload
  → layout.tsx calls getSessionUser()
  → reads cookie → SQLite lookup → User prop to SiteNav/AccountMenu
```

No middleware. No route guards. `requireRole()` exists in `src/lib/auth.ts` but is never called.

### API Routes

| Route | Auth | Role Check |
|-------|------|------------|
| `POST /api/auth/switch` | None | None |
| `POST /api/chat` | None | None |
| `POST /api/chat/stream` | None | None |
| `POST /api/tts` | None | None |
| `GET /api/health/live` | None | N/A (public) |
| `GET /api/health/ready` | None | N/A (public) |

### Chat System

- System prompt: static string in `src/lib/chat/policy.ts`
- 11 tools, all available to all callers
- Streaming via SSE (`/api/chat/stream`)
- Non-streaming for math (`/api/chat`)
- No user context passed to either route

### Client State

- `useGlobalChat` (React Context + useReducer) — ephemeral
- `ThemeProvider` — persists preferences to localStorage
- No chat persistence of any kind

---

## 2A. Architecture Audit (Clean Architecture / SOLID / GoF)

This section catalogs the existing design patterns, identifies violations, and prescribes corrections that MUST be applied during or before the new feature work. The spec's proposed changes are also audited here.

### Existing Pattern Catalog

The codebase already uses Clean Architecture layers correctly in most places:

| Pattern | Where | Assessment |
|---------|-------|------------|
| **Ports & Adapters** | `BookRepository` (port in core) → `FileSystemBookRepository` (adapter) | Correct |
| **Ports & Adapters** | `ChatStreamProvider` (port in core) → `ChatStreamAdapter` (adapter) | Correct |
| **Ports & Adapters** | `Logger` (port in core/services) → `ConsoleLogger` (adapter) | Correct |
| **Command** (GoF) | `Command` interface → `ThemeCommand`, `NavigationCommand` + `CommandRegistry` | Correct |
| **Strategy** (GoF) | `EventParserStrategy` (3 strategies), `MentionStrategy` (3), `StreamEventStrategy` (4) | Correct |
| **Decorator** (GoF) | `LoggingDecorator<TReq, TRes>` wrapping `UseCase`; `withProviderTiming()` | Correct |
| **Factory Method** (GoF) | `MessageFactory.create()`, `RepositoryFactory`, `StreamProviderFactory` | Correct |
| **Data Mapper** (PoEAA) | `UserDataMapper` (SQL → User entity) | Correct |
| **Presenter** (Clean Arch) | `ChatPresenter` (raw message → PresentedMessage) | Correct |
| **Facade** | `book-library.ts` (composition root wiring DI for all interactors) | Correct |
| **Use Case / Interactor** | `UseCase<TRequest, TResponse>` interface, 9 interactors | Correct |
| **Tool Command** | `ToolCommand<TInput, TOutput>` interface, 11 tool implementations | Partially correct (see violations) |

### Dependency Direction (Clean Architecture)

The rule: **dependencies point inward.** Core knows nothing about adapters, adapters know nothing about frameworks, infrastructure wires everything.

```
Outer: frameworks/ui → hooks → components → app/
  ↓
Middle: adapters/ (ChatPresenter, DataMappers, Strategies)
  ↓
Inner: core/ (entities, use-cases, ports, commands)
  ↓
Foundation: (no external deps — pure TypeScript)
```

### Violation 1 (CRITICAL) — Core → Infrastructure: BookTools

`src/core/use-cases/tools/BookTools.ts` imports `@/lib/book-library`:

```
core/use-cases/tools/BookTools.ts → lib/book-library.ts → adapters/ → core/
```

This is a **Dependency Rule violation** (Uncle Bob, Chapter 22). The innermost layer depends on infrastructure. It also creates a **circular dependency chain**.

**Fix:** BookTools commands must depend on the `BookRepository` port (already defined at `src/core/use-cases/BookRepository.ts`), NOT on the facade. Inject the repository via constructor.

```typescript
// BEFORE (violates DIP)
import { searchBooks } from "@/lib/book-library";
export class SearchBooksCommand implements ToolCommand { ... }

// AFTER (correct — depends on abstraction)
import type { BookRepository } from "../BookRepository";
export class SearchBooksCommand implements ToolCommand {
  constructor(private readonly repo: BookRepository) {}
  async execute({ query }: { query: string }) {
    const chapters = await this.repo.getAllChapters();
    // search logic here, or delegate to a SearchInteractor
  }
}
```

The `book-library.ts` facade (composition root) wires the concrete `FileSystemBookRepository` into each command at startup. This follows the **Dependency Inversion Principle** — core depends on abstractions, concrete wiring happens at the boundary.

### Violation 2 (CRITICAL) — Core → Infrastructure: CalculatorTool

`src/core/use-cases/tools/CalculatorTool.ts` imports `@/lib/calculator`. Same violation.

**Fix:** The calculator is pure arithmetic — move the calculation logic into the core layer (it has no external dependencies). Or define a `Calculator` port in core and inject the implementation.

Since the calculator is pure math with zero I/O, the simplest correct fix is **move calculation into the entity layer** (`src/core/entities/calculator.ts`). No port needed — pure functions belong in core.

### Violation 3 (MODERATE) — Infrastructure Detail in Entity: BookMeta.chaptersDir

`src/core/entities/library.ts` contains `BookMeta.chaptersDir` with file-system paths (`"software-engineering-book/chapters"`). This couples the entity layer to the storage strategy.

**Fix:** Split `BookMeta` (with `chaptersDir`) out of core. Keep pure `Book { slug, title, number }` in core. Move `BookMeta` and the `BOOKS` constant to the adapter layer where `FileSystemBookRepository` lives — it's the only consumer.

### Violation 4 (MINOR) — Duplicate ChatMessage Entity

Two competing `ChatMessage` types exist:
- `src/core/entities/chat-message.ts` — has `id`, `role`, `content`, `timestamp`, `parts`
- `src/core/entities/MessageFactory.ts` — re-declares with `role`, `content`, `parts`, `timestamp?` (no `id`)

**Fix:** One canonical `ChatMessage` type. `MessageFactory` should import and produce the type from `chat-message.ts`. The factory adds the `id` and `timestamp` at creation time.

### Violation 5 (MINOR) — ThemeManagementInteractor skips UseCase interface

Every other interactor implements `UseCase<TRequest, TResponse>`. `ThemeManagementInteractor` uses ad-hoc method names, making it incompatible with the `LoggingDecorator`.

**Fix:** Either implement `UseCase` or document it as a static utility (no execute contract needed for a validation-only class). Low priority.

### Spec Self-Audit — Design Corrections

The original draft (v1) of this spec also had architectural issues. Here are the corrections applied in v2:

#### Issue A: `passwordHash` on User entity

v1 proposed adding `passwordHash` to `src/core/entities/user.ts`. This violates **Interface Segregation** — client-facing code imports `User` and would carry a security-sensitive field.

**Correction:** Define two types:
- `User` (public, exposed to client) — `{ id, email, name, roles }` (unchanged)
- `UserRecord` (internal, adapter-only) — `{ id, email, name, passwordHash, createdAt }` used by `UserDataMapper`

`UserRecord` lives in the adapter layer (`src/adapters/UserDataMapper.ts`) or in a new `src/core/entities/user-internal.ts`. The `User` entity exposed via API responses NEVER includes `passwordHash`.

#### Issue B: Auth functions in `src/lib/auth.ts` as a grab-bag

v1 proposed putting `createSession()`, `validateSession()`, `destroySession()`, `getSessionUserFromToken()` all in one file. This violates **Single Responsibility**.

**Correction:** Define proper ports and use cases:

1. **Port:** `SessionRepository` (core/use-cases) — `create()`, `findByToken()`, `delete()`, `deleteExpired()`
2. **Port:** `PasswordHasher` (core/use-cases) — `hash(plain)`, `verify(plain, hash)`
3. **Adapter:** `SessionDataMapper` implements `SessionRepository`
4. **Adapter:** `BcryptHasher` implements `PasswordHasher`
5. **Use case:** `RegisterUserInteractor` — validates input, hashes password, creates user + session
6. **Use case:** `AuthenticateUserInteractor` — verifies credentials, creates session
7. **Use case:** `ValidateSessionInteractor` — checks token validity
8. **Infrastructure:** `src/lib/auth.ts` remains as a thin composition root (like `book-library.ts`) that wires ports to adapters

This follows the same pattern the codebase already uses for books: port in core → adapter for DB → facade for wiring.

#### Issue C: `ConversationDataMapper` doing too much

v1 spec has the ConversationDataMapper handling conversations AND messages AND authorization checks (userId verification). This violates SRP.

**Correction:** Split into:
1. **Port:** `ConversationRepository` (core/use-cases) — queries and mutations for conversations
2. **Port:** `MessageRepository` (core/use-cases) — queries and mutations for messages
3. **Use case:** `ConversationInteractor` — orchestrates conversation lifecycle, enforces ownership
4. **Adapter:** `ConversationDataMapper` implements `ConversationRepository`
5. **Adapter:** `MessageDataMapper` implements `MessageRepository`

Ownership checks (`conversation.user_id === currentUser.id`) happen in the **use case** layer, not the data mapper. The data mapper is a pure persistence adapter — it should not know about authorization.

#### Issue D: `filterToolsByRole()` in `tools.ts` (infrastructure)

v1 placed the tool-filtering logic in `src/lib/chat/tools.ts`. But the policy "which roles see which tools" is a **domain rule**, not infrastructure.

**Correction:** Define tool access policy in core:

```
src/core/use-cases/ToolAccessPolicy.ts
```

```typescript
import type { RoleName } from "../entities/user";

const TOOL_ACCESS: Record<RoleName, readonly string[] | "ALL"> = {
  ANONYMOUS: ["calculator", "search_books", "get_book_summary", "set_theme", "navigate", "adjust_ui"],
  AUTHENTICATED: "ALL",
  STAFF: "ALL",
  ADMIN: "ALL",
} as const;

export function getToolNamesForRole(role: RoleName): readonly string[] | "ALL" {
  return TOOL_ACCESS[role];
}
```

The infrastructure layer (`tools.ts`) calls this to filter the tools array before passing to Anthropic. The policy itself lives in core.

#### Issue E: `buildSystemPrompt(role)` in `policy.ts` (infrastructure)

Same issue — the per-role behavioral directives are **domain policy**, not infrastructure.

**Correction:** Create a proper use case:

```
src/core/use-cases/ChatPolicyInteractor.ts
```

This interactor owns the system prompt construction and role directives. `policy.ts` remains as the composition root that calls it. The `looksLikeMath()` heuristic also belongs here (it's a domain classification rule, not infrastructure).

#### Issue F: Middleware doing DB lookups

v1 proposed the middleware reading the session from SQLite. Next.js Edge Middleware runs in the Edge Runtime, which **cannot use `better-sqlite3`** (it's a native Node addon). This is a runtime constraint that would cause a build failure.

**Correction:** Two-layer approach:

1. **Middleware** (Edge Runtime) — lightweight cookie presence check only. If `lms_session_token` cookie is missing on a protected route, return 401 immediately. No DB access.
2. **Route handlers** (Node.js Runtime) — full session validation via `SessionDataMapper`. Each protected route calls `validateSession()` which queries SQLite.

This means middleware is a **fast-reject filter** (no cookie = instant 401), and the full session/role validation happens in the route handler where Node.js APIs are available. This is the standard Next.js pattern for native DB drivers.

### Corrected Layer Map (new files)

```
src/core/entities/
├── user.ts                  — User (public), RoleName (unchanged)
├── session.ts               — Session { id, userId, expiresAt, createdAt }
├── conversation.ts          — Conversation, ConversationSummary, Message types
└── calculator.ts            — pure calculate() function (moved from lib/)

src/core/use-cases/
├── SessionRepository.ts     — port: create, findByToken, delete, deleteExpired
├── UserRepository.ts        — port: create, findByEmail, findById, findByRole
├── ConversationRepository.ts — port: create, list, get, delete, updateTitle
├── MessageRepository.ts     — port: create, listByConversation
├── PasswordHasher.ts        — port: hash(plain), verify(plain, hash)
├── ToolAccessPolicy.ts      — getToolNamesForRole(role)
├── ChatPolicyInteractor.ts  — buildSystemPrompt(role), looksLikeMath()
├── RegisterUserInteractor.ts — validates, hashes, creates user + session
├── AuthenticateUserInteractor.ts — verifies credentials, creates session
├── ValidateSessionInteractor.ts — checks token validity + expiry
└── ConversationInteractor.ts — CRUD with ownership enforcement

src/adapters/
├── SessionDataMapper.ts     — implements SessionRepository
├── ConversationDataMapper.ts — implements ConversationRepository
├── MessageDataMapper.ts     — implements MessageRepository
├── BcryptHasher.ts          — implements PasswordHasher
└── UserDataMapper.ts        — extended: create(), findByEmail(), findById()

src/lib/
├── auth.ts                  — composition root: wires interactors + adapters
└── chat/
    ├── policy.ts            — delegates to ChatPolicyInteractor
    └── tools.ts             — uses ToolAccessPolicy for filtering
```

### Design Pattern Summary for New Code

| Pattern | Application |
|---------|-------------|
| **Ports & Adapters** (Hexagonal) | `SessionRepository`, `ConversationRepository`, `MessageRepository`, `PasswordHasher` — all defined as interfaces in core, implemented in adapters |
| **Use Case / Interactor** | `RegisterUserInteractor`, `AuthenticateUserInteractor`, `ValidateSessionInteractor`, `ConversationInteractor` — each implements `UseCase<TReq, TRes>`, wrappable with `LoggingDecorator` |
| **Data Mapper** (PoEAA) | `SessionDataMapper`, `ConversationDataMapper`, `MessageDataMapper` — SQL ↔ entity mapping, no business logic |
| **Strategy** (GoF) | `PasswordHasher` interface enables swapping bcrypt for argon2 or a test stub without changing any use case |
| **Facade** | `src/lib/auth.ts` wires all auth interactors (composition root pattern matching existing `book-library.ts`) |
| **Chain of Responsibility** | Middleware (cookie filter) → Route handler (session validation) → Use case (role enforcement) — each layer can reject early |
| **Decorator** (GoF) | All new interactors are `UseCase<T,R>` compatible → `LoggingDecorator` wraps them automatically for observability |

---

## 3. Target Architecture

> All new code follows the corrected layer map from §2A. Ports in core, adapters for I/O, use cases for business logic, infrastructure for wiring.

### 3.1 Auth Layer

#### Registration & Login

Add password-based auth with `bcryptjs` hashing (pure JS, no native compilation). No external providers needed for v1. All auth logic flows through core use-case interactors (`RegisterUserInteractor`, `AuthenticateUserInteractor`, `ValidateSessionInteractor`) — see §2A for the corrected layer map.

**New API routes:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Authenticate, start session |
| `/api/auth/logout` | POST | Clear session |
| `/api/auth/me` | GET | Return current user (for client hydration) |
| `/api/auth/switch` | POST | **ADMIN-only** simulation tool (preserved) |

**Registration flow:**
```
POST /api/auth/register
Body: { email, password, name }

Server:
  1. Route handler delegates to RegisterUserInteractor
  2. Interactor validates:
     - email: valid format (contains @ and domain)
     - password: ≥8 chars, ≤72 chars (bcrypt input limit)
     - name: 1–100 chars, trimmed, no leading/trailing whitespace
  3. Interactor checks email uniqueness via UserRepository.findByEmail()
  4. Interactor hashes password via PasswordHasher.hash() (bcryptjs, cost 12)
  5. Interactor creates user via UserRepository.create() with role AUTHENTICATED
  6. Interactor creates session via SessionRepository.create() (write cookie)
  7. Return { user: { id, email, name, roles } }
```

**Login flow:**
```
POST /api/auth/login
Body: { email, password }

Server:
  1. Route handler delegates to AuthenticateUserInteractor
  2. Interactor finds user via UserRepository.findByEmail()
  3. Interactor verifies via PasswordHasher.verify(password, stored_hash)
  4. If match: Interactor creates session via SessionRepository.create(), return user
  5. If no match: 401
```

**Timing safety:** When email is not found (step 2), the interactor MUST still call `PasswordHasher.verify()` against a dummy hash before returning 401. This prevents timing-based email enumeration — an attacker cannot distinguish "email not found" (fast) from "wrong password" (slow bcrypt comparison). See TEST-LOGIN-03.

#### Session Management

Replace the bare role cookie with a **session token** cookie.

| Current | Target |
|---------|--------|
| Cookie: `lms_mock_session_role=ADMIN` | Cookie: `lms_session_token=<random-uuid>` |
| Lookup: role → find mock user | Lookup: token → sessions table → user |

**Cookie attributes:** `httpOnly`, `sameSite: lax`, `secure` (in production), `path: /`, `maxAge: 7 days`.

The session token is a cryptographically random UUID (via `crypto.randomUUID()`). No JWTs needed — this is a server-rendered app with a single SQLite database on the same machine.

#### Role Switcher (preserved for ADMIN; unrestricted in dev mode)

The existing role switcher in AccountMenu stays, but:
- Only visible when the current user has the `ADMIN` role **or** `NODE_ENV === 'development'`
- `POST /api/auth/switch` requires ADMIN session **or** `NODE_ENV === 'development'`
- Writes a **separate** `lms_simulated_role` cookie (not the session)
- `getSessionUser()` checks the simulated role cookie if present and user is ADMIN (or dev mode)
- Non-ADMIN users cannot simulate other roles **in production**

> **Dev-mode exception:** When `NODE_ENV === 'development'`, the role switcher is accessible to all authenticated users regardless of role. This allows developers to test RBAC behavior without requiring an ADMIN account. The guard is a simple `process.env.NODE_ENV === 'development'` check added alongside the ADMIN role check.

### 3.2 Database Schema Changes

Add these tables to `src/lib/db/schema.ts`:

```sql
-- Extend users table
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));

-- Add UNIQUE constraint on email (needed for duplicate-email rejection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                    -- crypto.randomUUID()
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,                             -- auto-generated from first message
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  parts TEXT,                             -- JSON blob for tool_call/tool_result parts
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
```

**Migration strategy:** Since we use `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`, add the new statements to `ensureSchema()`. For the `ALTER TABLE` on existing `users`, wrap in a try/catch (SQLite throws if column already exists). This is acceptable for a single-file SQLite dev database.

**Existing hardcoded users:** The 4 mock users (ANONYMOUS, AUTHENTICATED, STAFF, ADMIN) will have NULL `password_hash` after migration. They **cannot log in** via the normal login flow. They serve two purposes going forward:
1. The ANONYMOUS user record provides the identity for unauthenticated visitors.
2. Admin can `INSERT` a password_hash manually or use a one-time bootstrap script to set passwords for the other 3 seed users.
3. New users created via `/api/auth/register` always get a password_hash.

Do NOT auto-assign passwords to seed users — that's a security anti-pattern.

### 3.3 Middleware (Tier 1 — API Protection)

Create `src/middleware.ts`:

```
Route matching (Edge Runtime — cookie presence check ONLY, no DB):
  /api/health/*          → PASS (public)
  /api/auth/register     → PASS (public)
  /api/auth/login        → PASS (public)
  /api/chat/*            → PASS (public — ANONYMOUS access allowed, role gating in route handler)
  /api/tts               → PASS (role gating in route handler — ANONYMOUS rejected there, not at middleware)
  /api/auth/me           → require cookie present
  /api/auth/switch       → require cookie present (ADMIN check in route handler)
  /api/auth/logout       → require cookie present
  /api/conversations/*   → require cookie present
  All other routes        → PASS (pages handle their own rendering)
```

**Middleware does cookie presence checks only** (see §2A Issue F). It cannot access the database — `better-sqlite3` is incompatible with Edge Runtime. Full session validation happens in route handlers via `ValidateSessionInteractor`.

**ANONYMOUS access design:** Chat routes (`/api/chat/*`, `/api/tts`) are public at the middleware level. When no session cookie is present, the route handler treats the caller as role `ANONYMOUS` (limited tools, limited content — see §3.4). When a session cookie IS present, the route handler validates it and uses the user's real role. This allows unauthenticated visitors to demo the product with limited capabilities.

**Middleware does NOT touch page routes.** Pages always render — they show different content via the server-resolved `user` prop. Unauthenticated users see the public-facing chat (limited) or a login prompt.

### 3.4 Role-Aware LLM (Tier 2 — System Prompt)

Move prompt construction from `policy.ts` (infrastructure) into `ChatPolicyInteractor` (core use-case layer — see §2A Issue E). The interactor owns the domain policy; `policy.ts` delegates to it.

```typescript
// src/core/use-cases/ChatPolicyInteractor.ts
class ChatPolicyInteractor implements UseCase<{ role: RoleName }, string> {
  execute({ role }: { role: RoleName }): string  // returns assembled system prompt
}
```

**Per-role behavior:**

| Role | LLM Persona | Tool Access | Content Access |
|------|------------|-------------|----------------|
| **ANONYMOUS** | Sales assistant — demo the product, encourage sign-up | calculator, search_books (titles only), get_book_summary, set_theme, navigate, adjust_ui | No full chapter content, no audio, no checklists |
| **AUTHENTICATED** | Full advisor — use all library tools freely | All tools | Full access |
| **STAFF** | Advisor + analytics framing | All tools | Full access, analytics-oriented responses |
| **ADMIN** | Advisor + system configurator | All tools | Full access, can discuss system internals |

**Implementation in `/api/chat/stream`:**

```
1. Read lms_session_token cookie
2. If cookie present → ValidateSessionInteractor.execute({ token }) → sessionUser
   If cookie absent → sessionUser = { roles: ["ANONYMOUS"] } (synthetic ANONYMOUS identity)
3. role = sessionUser.roles[0] (highest privilege)
4. systemPrompt = ChatPolicyInteractor.execute({ role })
5. allowedTools = ToolAccessPolicy.getToolNamesForRole(role)
6. tools = filter ALL_TOOLS by allowedTools
7. Pass systemPrompt + tools to Anthropic agent loop
```

**Tool access policy** (domain rule in core — see §2A Issue D):

```typescript
// src/core/use-cases/ToolAccessPolicy.ts
const TOOL_ACCESS: Record<RoleName, readonly string[] | "ALL"> = {
  ANONYMOUS: ["calculator", "search_books", "get_book_summary", "set_theme", "navigate", "adjust_ui"],
  AUTHENTICATED: "ALL",
  STAFF: "ALL",
  ADMIN: "ALL",
};

export function getToolNamesForRole(role: RoleName): readonly string[] | "ALL" {
  return TOOL_ACCESS[role];
}
```

The infrastructure layer (`tools.ts`) calls `getToolNamesForRole()` and applies the filter. The policy itself lives in core.

### 3.5 Chat History Persistence

#### Server-Side

Chat persistence follows the split-responsibility pattern from §2A Issue C:

- **Ports** (core): `ConversationRepository` + `MessageRepository` — pure persistence contracts
- **Use case** (core): `ConversationInteractor` — orchestrates CRUD, enforces ownership (`conversation.user_id === currentUser.id`)
- **Adapters**: `ConversationDataMapper` (implements `ConversationRepository`) + `MessageDataMapper` (implements `MessageRepository`)

```typescript
// src/core/use-cases/ConversationRepository.ts (port)
interface ConversationRepository {
  create(userId: string, title?: string): Conversation;
  listByUser(userId: string, limit?: number): ConversationSummary[];
  findById(conversationId: string): Conversation | null;
  delete(conversationId: string): void;
  updateTitle(conversationId: string, title: string): void;
}

// src/core/use-cases/MessageRepository.ts (port)
interface MessageRepository {
  create(conversationId: string, message: NewMessage): Message;
  listByConversation(conversationId: string): Message[];
}

// src/core/use-cases/ConversationInteractor.ts (use case)
// Ownership checks happen HERE, not in the data mapper.
// Data mappers are pure persistence — no authorization logic.
```

**New API routes:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/conversations` | GET | List user's conversations |
| `/api/conversations` | POST | Create new conversation |
| `/api/conversations/[id]` | GET | Get conversation with messages |
| `/api/conversations/[id]` | DELETE | Delete conversation |

**Chat stream integration:**

`POST /api/chat/stream` gains an optional `conversationId` field:

```
Body: {
  messages: ChatMessage[],
  conversationId?: string    // omit to create new conversation
}
```

Flow:
1. Read `lms_session_token` cookie
2. If cookie present → `ValidateSessionInteractor.execute({ token })` → sessionUser
   If cookie absent → treat as ANONYMOUS (skip persistence, skip to step 6)
3. If `conversationId` provided: `ConversationInteractor.get(conversationId, sessionUser.id)` — enforces ownership; check message count < 100 (NEG-DATA-3 → 400 if exceeded)
4. If omitted: check conversation count; if ≥ 50, delete oldest (NEG-DATA-4). Then `ConversationInteractor.create(sessionUser.id, title)` — auto-title from first message (80 chars)
5. Before calling Anthropic: `MessageRepository.create(conversationId, userMessage)` — persist user message
6. Build role-aware system prompt + filtered tools (ANONYMOUS if no session)
7. Call Anthropic with system prompt + tools, stream SSE response
8. After stream completes (authenticated only): `MessageRepository.create(conversationId, assistantMessage)` — persist assistant response with parts
9. Return `conversationId` in the SSE stream first event (authenticated only — ANONYMOUS gets no conversationId)

#### Client-Side

**Extend `useGlobalChat`:**

- Add `conversationId` to state
- Add `conversations` list state (for sidebar)
- Add actions: `LOAD_CONVERSATION`, `NEW_CONVERSATION`, `SET_CONVERSATIONS`
- On `sendMessage`: include `conversationId` in POST body
- Parse `conversationId` from first SSE event
- Add `loadConversation(id)` — fetches messages from server, replaces local state
- Add `newConversation()` — resets to hero message, clears `conversationId`

**UI additions:**

- Conversation sidebar (or dropdown) showing recent conversations
- "New Chat" button
- Conversation title in header
- Delete conversation option

### 3.6 Registration & Login UI

**New pages:**

| Route | Component | Purpose |
|-------|-----------|---------|
| `/login` | `LoginPage` | Email + password form |
| `/register` | `RegisterPage` | Email + password + name form |

These are simple server-rendered pages with client-side form submission. On success, redirect to `/`. On failure, show inline error.

**AccountMenu changes:**

- Unauthenticated: Show "Sign In" / "Register" links instead of user info
- Authenticated: Show user info, conversation history, accessibility controls
- ADMIN: Also show role simulation panel
- Dev mode (`NODE_ENV === 'development'`): Show role simulation panel for all authenticated users

**SiteNav changes:**

- When `user.roles` is `["ANONYMOUS"]`: Show login/register CTA
- When authenticated: Show AccountMenu as-is

---

## 4. File Change Map

### New Files — Core Layer (entities + use cases + ports)

| Path | Layer | Purpose |
|------|-------|---------|
| `src/core/entities/session.ts` | Entity | `Session { id, userId, expiresAt, createdAt }` |
| `src/core/entities/conversation.ts` | Entity | `Conversation`, `ConversationSummary`, `Message`, `NewMessage` |
| `src/core/entities/calculator.ts` | Entity | Pure `calculate()` function (moved from `lib/calculator.ts`; fixes Violation 2) |
| `src/core/use-cases/SessionRepository.ts` | Port | `create()`, `findByToken()`, `delete()`, `deleteExpired()` |
| `src/core/use-cases/ConversationRepository.ts` | Port | `create()`, `listByUser()`, `findById()`, `delete()`, `updateTitle()` |
| `src/core/use-cases/MessageRepository.ts` | Port | `create()`, `listByConversation()` |
| `src/core/use-cases/UserRepository.ts` | Port | `create()`, `findByEmail()`, `findById()`, `findByRole()` (extracted from adapter) |
| `src/core/use-cases/PasswordHasher.ts` | Port | `hash(plain): string`, `verify(plain, hash): boolean` |
| `src/core/use-cases/ToolAccessPolicy.ts` | Policy | `getToolNamesForRole(role)` — domain rule for tool gating |
| `src/core/use-cases/ChatPolicyInteractor.ts` | Use Case | `buildSystemPrompt(role)`, `looksLikeMath()` (moved from `lib/chat/policy.ts`) |
| `src/core/use-cases/RegisterUserInteractor.ts` | Use Case | `UseCase<RegisterRequest, AuthResult>` — validate, hash, create user + session |
| `src/core/use-cases/AuthenticateUserInteractor.ts` | Use Case | `UseCase<LoginRequest, AuthResult>` — verify credentials, create session |
| `src/core/use-cases/ValidateSessionInteractor.ts` | Use Case | `UseCase<{ token: string }, SessionUser>` — check token, return user |
| `src/core/use-cases/ConversationInteractor.ts` | Use Case | CRUD with ownership enforcement (`userId` checks in use-case layer) |

### New Files — Adapter Layer

| Path | Layer | Purpose |
|------|-------|---------|
| `src/adapters/SessionDataMapper.ts` | Adapter | Implements `SessionRepository` — SQLite CRUD for sessions |
| `src/adapters/ConversationDataMapper.ts` | Adapter | Implements `ConversationRepository` |
| `src/adapters/MessageDataMapper.ts` | Adapter | Implements `MessageRepository` |
| `src/adapters/BcryptHasher.ts` | Adapter | Implements `PasswordHasher` using `bcryptjs` |

### New Files — Infrastructure / UI

| Path | Layer | Purpose |
|------|-------|---------|
| `src/middleware.ts` | Infrastructure | Edge middleware — cookie presence check only (no DB; see §2A Issue F) |
| `src/app/api/auth/register/route.ts` | Route | Registration endpoint → delegates to `RegisterUserInteractor` |
| `src/app/api/auth/login/route.ts` | Route | Login endpoint → delegates to `AuthenticateUserInteractor` |
| `src/app/api/auth/logout/route.ts` | Route | Logout endpoint → destroys session |
| `src/app/api/auth/me/route.ts` | Route | Current user endpoint → validates session |
| `src/app/api/conversations/route.ts` | Route | List/create conversations → delegates to `ConversationInteractor` |
| `src/app/api/conversations/[id]/route.ts` | Route | Get/delete conversation → delegates to `ConversationInteractor` |
| `src/app/login/page.tsx` | Page | Login form |
| `src/app/register/page.tsx` | Page | Registration form |

### Modified Files

| Path | Changes |
|------|---------|
| `src/lib/db/schema.ts` | Add sessions, conversations, messages tables; add password_hash + created_at to users |
| `src/lib/auth.ts` | Refactor to **composition root**: wires interactors (`RegisterUser`, `Authenticate`, `ValidateSession`) to adapters. Exports convenience functions. |
| `src/lib/chat/policy.ts` | Delegates to `ChatPolicyInteractor` for prompt building and math detection |
| `src/lib/chat/tools.ts` | Uses `ToolAccessPolicy.getToolNamesForRole()` for filtering. Tool command constructors accept `BookRepository` port (fixes Violation 1). |
| `src/core/use-cases/tools/BookTools.ts` | **Fix Violation 1:** Replace `@/lib/book-library` import with `BookRepository` port injection via constructor |
| `src/core/use-cases/tools/CalculatorTool.ts` | **Fix Violation 2:** Import from `@/core/entities/calculator` instead of `@/lib/calculator` |
| `src/core/entities/library.ts` | **Fix Violation 3:** Remove `BookMeta` and `BOOKS` constant — move to `FileSystemBookRepository` adapter |
| `src/core/entities/MessageFactory.ts` | **Fix Violation 4:** Remove duplicate `ChatMessage` type, import canonical type from `chat-message.ts` |
| `src/adapters/FileSystemBookRepository.ts` | Absorb `BookMeta`, `BOOKS` constant from entities (Fix Violation 3) |
| `src/adapters/UserDataMapper.ts` | Implements `UserRepository` port. Adds `create()`, `findByEmail()`, `findById()`. Defines `UserRecord` (includes `passwordHash`) separate from public `User`. |
| `src/app/api/chat/stream/route.ts` | Call `ValidateSessionInteractor`, pass role to `ChatPolicyInteractor` + `ToolAccessPolicy`, accept `conversationId`, persist messages via `MessageRepository` |
| `src/app/api/chat/route.ts` | Same: add session validation + role-aware prompt |
| `src/app/api/tts/route.ts` | Add session validation + role check: reject ANONYMOUS requests (no audio for unauthenticated visitors — belt-and-suspenders for §6 prompt directive) |
| `src/app/api/auth/switch/route.ts` | Add ADMIN-only guard via `ValidateSessionInteractor`, write `lms_simulated_role` cookie |
| `src/hooks/useGlobalChat.tsx` | Add `conversationId`, conversation list, load/create/delete actions |
| `src/hooks/useMockAuth.ts` | Remove exported `ROLE_CONFIG` (move to `AccountMenu` local const). Simplify to admin-only role switch. |
| `src/components/AccountMenu.tsx` | Conditional rendering: unauthenticated (sign-in/register links) vs authenticated (full menu) vs admin (+ simulation panel) |
| `src/components/SiteNav.tsx` | Login/register links for anonymous users |
| `src/app/layout.tsx` | Pass user to ChatProvider for context |

### Pre-work: Dependency Violation Fixes (before feature work)

These MUST be completed first to establish clean architecture before adding new features:

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| V1 | Inject `BookRepository` into BookTools via constructor | `BookTools.ts`, `tools.ts` (wiring) | Small |
| V2 | Move `calculate()` to `core/entities/calculator.ts` | `CalculatorTool.ts`, `lib/calculator.ts` | Small |
| V3 | Move `BookMeta` + `BOOKS` to adapter layer | `library.ts`, `FileSystemBookRepository.ts` | Small |
| V4 | Unify `ChatMessage` type (single source) | `MessageFactory.ts`, `chat-message.ts` | Small |

### New Dependency

| Package | Purpose |
|---------|---------|
| `bcryptjs` | Password hashing (pure JS, no native compilation required — works in all environments) |

---

## 5. Security Model

### Authentication Boundaries

```
                    ┌──────────────────────────────────┐
                    │         middleware.ts (Edge)      │
                    │   cookie presence check ONLY      │
                    │   no DB access (Edge Runtime)     │
                    └──────────────────┬───────────────┘
                                       │
         ┌─────────────┬───────────────┼───────────────┬──────────────┐
         │ PUBLIC       │ PUBLIC        │ COOKIE REQUIRED │ COOKIE REQ  │
         │              │               │                 │  (ADMIN in  │
         │              │               │                 │   handler)  │
    /api/health/*  /api/auth/login  /api/auth/me      /api/auth/switch
                   /api/auth/register /api/auth/logout
                                    /api/conversations/*

         ┌────────────────────────────────────────────────────────┐
         │ PUBLIC (role resolved in route handler)                 │
         │ No cookie → ANONYMOUS role. Cookie → validated role.   │
         │                                                         │
         │   /api/chat/*       /api/tts                           │
         └────────────────────────────────────────────────────────┘
```

```
Two-layer auth check (Chain of Responsibility):

1. Middleware (Edge) → protected route + cookie missing? → 401 (fast reject)
   Chat routes → always pass (ANONYMOUS allowed)
2. Route handler (Node) → ValidateSessionInteractor
     → no cookie? → treat as ANONYMOUS role
     → token not in DB? → 401
     → session expired? → 401
     → role insufficient? → 403
     → OK → proceed with User context
```

### What middleware checks

1. **Cookie presence only:** Does `lms_session_token` exist? (No DB access — Edge Runtime limitation)
2. **Route classification:** Is this a protected route? (pattern matching against route prefixes)
3. **Fast reject:** Missing cookie on protected route → 401 immediately

### What route handlers check (via ValidateSessionInteractor)

1. **Session validity:** Token exists in DB, `expires_at > now()`
2. **Role gating:** For ADMIN-only routes, verify user's role array includes `ADMIN`
3. **Ownership:** Conversation routes verify `conversation.user_id === session.user_id` (this happens in the route handler, not middleware)

### What middleware does NOT do

- Does not block page routes — pages always render (server components decide what to show)
- Does not validate request bodies — that's the route handler's job
- Does not rate-limit — out of scope for v1 (add later with a simple in-memory counter or external rate limiter)

### Password handling

- `bcryptjs` with cost factor 12
- Password never stored in plaintext, never logged, never returned in API responses
- `User` type exposed to client never includes `passwordHash`
- Registration enforces minimum 8 characters, maximum 72 characters (bcrypt input limit)
- Passwords exceeding 72 bytes are rejected at validation, NOT silently truncated
- Name field: 1–100 characters, trimmed

### Session lifecycle

- Created on login/register
- Expires after 7 days (configurable via env var)
- Destroyed on logout (delete from DB + clear cookie)
- Expired sessions cleaned up opportunistically (on read) or via a periodic cleanup query

### Cookie security

| Attribute | Value |
|-----------|-------|
| `httpOnly` | `true` |
| `sameSite` | `lax` |
| `secure` | `true` in production |
| `path` | `/` |
| `maxAge` | 7 days |

---

## 6. Role-Aware System Prompt Design

> This section details the prompt templates owned by `ChatPolicyInteractor` (core use-case layer — see §2A Issue E). The infrastructure layer (`policy.ts`) delegates to this interactor.

### Prompt Template

```typescript
// Inside ChatPolicyInteractor.execute({ role })
function buildSystemPrompt(role: RoleName): string {
  const base = `
You are a Product Development Advisor backed by a 10-book library...
[existing tool/response instructions]
  `;

  const roleDirectives: Record<RoleName, string> = {
    ANONYMOUS: `
ROLE CONTEXT: The user is a public visitor (not signed in).
- You are in DEMO mode. Be helpful but encourage them to create an account.
- You may search books and show summaries, but do NOT provide full chapter text.
- Do NOT generate audio or provide checklists — these are member features.
- When they ask for gated content, say: "Sign up for a free account to unlock full chapter access, audio, and checklists."
    `,
    AUTHENTICATED: `
ROLE CONTEXT: The user is a signed-in member with full library access.
- Use all tools freely. Provide complete chapter content, checklists, and audio.
- Be direct and thorough in your responses.
    `,
    STAFF: `
ROLE CONTEXT: The user is a staff member.
- Full library access plus analytics framing.
- When relevant, frame insights in terms of user patterns, engagement, and content effectiveness.
- You may reference system internals and usage patterns.
    `,
    ADMIN: `
ROLE CONTEXT: The user is a system administrator.
- Full access to everything including system configuration discussion.
- You may discuss architecture, deployment, and system internals freely.
- You may help with configuration and troubleshooting.
    `,
  };

  return `${base}\n${roleDirectives[role]}`;
}
```

### Tool Gating

Defined in `ToolAccessPolicy.getToolNamesForRole()` (core layer — see §3.4 and §2A Issue D). ANONYMOUS gets a whitelist; all other roles get full access:

```typescript
// ANONYMOUS_TOOLS (from ToolAccessPolicy)
const ANONYMOUS_TOOLS = [
  "calculator",
  "search_books",    // returns titles + summaries only (enforce in tool)
  "get_book_summary",
  "set_theme",
  "navigate",
  "adjust_ui",
];

// All other roles get ALL_TOOLS
```

The `search_books` tool for ANONYMOUS should return truncated results (title + first paragraph). This is enforced in the tool execution layer, not just the prompt — belt and suspenders.

---

## 7. Chat History Architecture

> Follows the split-responsibility pattern from §2A Issue C: ports in core, ownership in use case, persistence in adapters.

### Data Flow

```
User sends message
  → Client: dispatch APPEND_USER_MESSAGE
  → Client: POST /api/chat/stream { messages, conversationId? }
  → Server: read cookie → if present, ValidateSessionInteractor → sessionUser
                          → if absent, synthetic ANONYMOUS identity (no persistence)
  → Server: (authenticated) if no conversationId, ConversationInteractor.create(userId, title)
  → Server: (authenticated) MessageRepository.create(conversationId, userMessage)
  → Server: ChatPolicyInteractor.execute({ role }) → systemPrompt
  → Server: ToolAccessPolicy.getToolNamesForRole(role) → filtered tools
  → Server: call Anthropic with role-aware prompt + filtered tools
  → Server: stream SSE response
  → Server: on stream complete, (authenticated) MessageRepository.create(conversationId, assistantMessage)
  → Client: update state from SSE events
  → Client: (authenticated) store conversationId for subsequent messages
```

### Conversation Lifecycle

1. **First message** — No `conversationId` sent. Server creates conversation, auto-titles from user message (first 80 chars). Returns `conversationId` in first SSE event.
2. **Subsequent messages** — Client sends `conversationId`. Server appends to existing conversation.
3. **Page reload** — Client calls `GET /api/conversations` to list recent conversations. User can select one to resume.
4. **New chat** — Client omits `conversationId`, starting fresh.

### Message Storage Format

```json
{
  "id": "msg_abc123",
  "conversation_id": "conv_xyz789",
  "role": "assistant",
  "content": "Here's what I found about Bauhaus design principles...",
  "parts": "[{\"type\":\"tool_call\",\"name\":\"search_books\",\"args\":{\"query\":\"bauhaus\"}},{\"type\":\"tool_result\",\"name\":\"search_books\",\"result\":{...}}]",
  "created_at": "2026-03-11T12:00:00Z"
}
```

The `parts` column stores the full `MessagePart[]` as JSON. This preserves tool calls and results for conversation replay.

### Agent Loop Persistence

A single user message may trigger multiple Anthropic agent-loop turns (e.g., tool_call → tool_result → tool_call → tool_result → final text). All turns are persisted as a **single assistant message** with the complete `parts` array. This matches the client-side `PresentedMessage` model — one assistant message contains all tool interactions plus the final text response.

```
User message  → 1 row in messages (role: 'user')
Agent loop    → 1 row in messages (role: 'assistant', parts: [...all tool_calls + tool_results + text])
```

Rationale: Storing each tool_call as a separate row would complicate replay and break the 1:1 relationship between displayed messages and DB rows.

### Conversation Limits

- Max 100 messages per conversation — **hard limit**, returns 400 (see NEG-DATA-3, TEST-CHAT-09)
- Max 50 conversations per user — **soft limit**, oldest auto-deleted when exceeded (see NEG-DATA-4, TEST-CHAT-10)

---

## 8. Implementation Order

### Phase 0: Fix Dependency Violations (pre-work)

Must be completed before feature work to maintain clean architecture throughout. Each fix is a small, isolated commit.

1. **V1 — BookTools dependency inversion:** Extract `BookRepository` interface injection into `SearchBooksCommand`, `GetChapterCommand`, `GetChecklistCommand`, `ListPractitionersCommand`, `GetBookSummaryCommand` constructors. Update `tools.ts` (composition root) to wire the concrete `FileSystemBookRepository`.
2. **V2 — Calculator move to core:** Create `src/core/entities/calculator.ts` with the pure `calculate()` function. Update `CalculatorTool.ts` to import from core. Deprecate or re-export from `lib/calculator.ts`.
3. **V3 — BookMeta to adapter layer:** Move `BookMeta` interface and `BOOKS` constant from `src/core/entities/library.ts` into `src/adapters/FileSystemBookRepository.ts`. Update imports.
4. **V4 — ChatMessage unification:** Delete the duplicate `ChatMessage` interface from `MessageFactory.ts`. Import the canonical type from `chat-message.ts`. Ensure `MessageFactory` produces the canonical shape (with `id` and `timestamp`).

_Each fix: < 30 lines changed, one commit each, run tests between commits._

### Phase 1: Auth Foundation (ports → adapters → use cases → routes)

Build from inside out (core first, infrastructure last):

1. Create core entities: `Session`, `Conversation`, `Message` types
2. Create core ports: `SessionRepository`, `UserRepository`, `PasswordHasher`
3. Create core use cases: `RegisterUserInteractor`, `AuthenticateUserInteractor`, `ValidateSessionInteractor`
4. Install `bcryptjs`. Create adapter: `BcryptHasher` (implements `PasswordHasher`)
5. Extend DB schema: `password_hash` + `created_at` on users, `sessions` table
6. Create adapter: `SessionDataMapper` (implements `SessionRepository`)
7. Extend `UserDataMapper` → implement `UserRepository` port (add `create`, `findByEmail`, `findById`)
8. Refactor `src/lib/auth.ts` as composition root: wire interactors to adapters, export convenience functions
9. Create `src/middleware.ts` — Edge-safe cookie presence check (no DB access)
10. Create auth API routes: register, login, logout, me — each delegates to use case interactors
11. Create login/register pages
12. Update AccountMenu + SiteNav for auth state

### Phase 2: Role-Aware LLM (policy in core, wiring in infrastructure)

1. Create `src/core/use-cases/ChatPolicyInteractor.ts` — `buildSystemPrompt(role)`, move `looksLikeMath()` here
2. Create `src/core/use-cases/ToolAccessPolicy.ts` — `getToolNamesForRole(role)` domain rule
3. Update `src/lib/chat/policy.ts` to delegate to `ChatPolicyInteractor`
4. Update `src/lib/chat/tools.ts` to use `ToolAccessPolicy` for tool filtering
5. Update `/api/chat/stream` — call `ValidateSessionInteractor`, pass role to policy + tools
6. Update `/api/chat` — same session/role integration
7. Restrict `SearchBooksCommand.execute()` — accept `role` context, truncate output for ANONYMOUS (belt-and-suspenders enforcement in use case, not just prompt)
8. Gate role-switcher (`/api/auth/switch`) behind ADMIN-only via `ValidateSessionInteractor`
9. Update `/api/tts` — add session validation, reject ANONYMOUS callers (belt-and-suspenders: LLM prompt says no audio for ANONYMOUS, endpoint enforces it server-side)

### Phase 3: Chat Persistence (ports → adapters → use cases → routes → client)

1. Extend DB schema: `conversations` and `messages` tables
2. Create core ports: `ConversationRepository`, `MessageRepository`
3. Create core use case: `ConversationInteractor` (CRUD with ownership enforcement)
4. Create adapters: `ConversationDataMapper`, `MessageDataMapper`
5. Create conversation API routes (`/api/conversations`, `/api/conversations/[id]`)
6. Update `/api/chat/stream` to persist user + assistant messages via `MessageRepository`
7. Extend `useGlobalChat` — add `conversationId`, `conversations` list, load/create/delete actions
8. Add conversation sidebar/selector UI
9. Add "New Chat" button

### Phase 4: Polish & Hardening

1. Expired session cleanup (opportunistic + startup prune via `SessionRepository.deleteExpired()`)
2. Conversation auto-title (from first user message, truncated to 80 chars)
3. Delete conversation UI
4. Error states for auth failures (401/403 handling in client)
5. Loading states for conversation switching
6. Wrap all new interactors with `LoggingDecorator` for observability

---

## 9. Out of Scope (v1)

These are intentionally deferred:

- **OAuth / social login** — Not needed for a demo/educational app. Add later if needed.
- **Email verification** — Would require an email service. Skip for v1.
- **Password reset** — Same. Users can re-register or ask an admin.
- **Rate limiting** — Important for production but not critical for a demo. Add a simple token-bucket later.
- **Conversation search** — Nice-to-have. Search across past conversations by keyword.
- **Conversation sharing** — Share a conversation URL with others.
- **Message editing/deletion** — Users can start a new conversation instead.
- **Real-time collaboration** — Single-user per conversation is fine.
- **Audit logging** — Track who did what. Useful but not v1.

---

## 10. Environment Variables (updated)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API |
| `ANTHROPIC_MODEL` | No | `claude-haiku-4-5` | Default model |
| `OPENAI_API_KEY` | No | — | TTS (disabled without) |
| `SESSION_MAX_AGE_DAYS` | No | `7` | Session cookie lifetime |
| `BCRYPT_ROUNDS` | No | `12` | Password hash cost factor |

---

## 11. Testing Strategy

### Unit Tests (core layer — no I/O, no DB)

| Test | What it proves |
|------|---------------|
| `RegisterUserInteractor` | Validates input, calls `PasswordHasher.hash()`, calls `UserRepository.create()`, calls `SessionRepository.create()`. Uses stub/mock ports. |
| `AuthenticateUserInteractor` | Correct password → session created. Wrong password → throws. User not found → still calls `PasswordHasher.verify()` against dummy hash (timing-safe), then throws. NULL `password_hash` (seed users) → throws. |
| `ValidateSessionInteractor` | Valid token → returns user. Expired → throws. Missing → throws. |
| `ConversationInteractor` | Ownership: user A cannot access user B's conversation. |
| `ChatPolicyInteractor` | `buildSystemPrompt("ANONYMOUS")` includes "DEMO mode". `buildSystemPrompt("ADMIN")` includes "system administrator". |
| `ToolAccessPolicy` | `getToolNamesForRole("ANONYMOUS")` returns 6 tools. `getToolNamesForRole("AUTHENTICATED")` returns "ALL". |
| `BookTools (post-fix)` | `SearchBooksCommand` calls `BookRepository.getAllChapters()` — tests with stub repo, no file I/O. |
| `CalculatorTool (post-fix)` | `calculate()` in core entity: pure math, no imports from lib/. |
| Password hashing | `BcryptHasher`: `hash()` → `verify()` round-trip. Stub hasher for interactor unit tests. |

### Integration Tests (adapter layer — real SQLite)

| Test | What it proves |
|------|---------------|
| `SessionDataMapper` | Create → findByToken → delete lifecycle against test DB. Expired sessions not found. |
| `UserDataMapper (extended)` | `create()` → `findByEmail()` → `findById()` chain. Duplicate email rejected. |
| `ConversationDataMapper` | Create → listByUser → findById → delete. CASCADE deletes messages. |
| `MessageDataMapper` | Create → listByConversation (ordered by created_at). Parts JSON round-trip. |
| Auth API lifecycle | `POST /register` → `POST /login` → `GET /me` → `POST /logout` → `GET /me` (401). |

### Middleware Test

| Test | What it proves |
|------|---------------|
| Cookie absent + protected route | 401 response |
| Cookie present + protected route | Request passes through to handler |
| Cookie absent + public route | Request passes through |

### E2E / Page-Level Tests

| Test | What it proves |
|------|---------------|
| Login page (TEST-PAGE-03) | Form shows inline errors, retains email, clears password on failure. |
| Register page (TEST-PAGE-04) | Inline field-level validation for password length, email format, empty name. |
| Registration redirect (TEST-PAGE-05) | Successful registration → redirect to `/`, nav shows user info. |
| Login redirect (TEST-PAGE-06) | Successful login → redirect to `/`, previous conversations loadable. |
| Unauthenticated layout (TEST-PAGE-01) | Sign In / Register links visible, chat functional with ANONYMOUS limits. |
| Authenticated layout (TEST-PAGE-02) | User info, conversation sidebar, full chat tools. |

See §14.6 for full GIVEN/WHEN/THEN specifications.

---

## 12. API Reference (target state)

### Auth

```
POST /api/auth/register
  Body: { email: string, password: string, name: string }
  → 201: { user: { id, email, name, roles } }
  → 400: { error: string }    — "Email already registered" for duplicates;
                                validation message listing all invalid fields otherwise

POST /api/auth/login
  Body: { email: string, password: string }
  → 200: { user: { id, email, name, roles } }
  → 401: { error: "Invalid credentials" }

POST /api/auth/logout
  Cookie: lms_session_token (required)
  → 200: { success: true }

GET /api/auth/me
  Cookie: lms_session_token (required)
  → 200: { user: { id, email, name, roles } }
  → 401: { error: "Not authenticated" }

POST /api/auth/switch  (ADMIN only)
  Cookie: lms_session_token (required, ADMIN role)
  Body: { role: RoleName }
  → 200: { success: true, simulatedRole: string }
  → 403: { error: "Admin access required" }
```

### Conversations

```
GET /api/conversations
  Cookie: lms_session_token (required)
  Query: ?limit=20
  → 200: { conversations: [{ id, title, updatedAt, messageCount }] }

POST /api/conversations
  Cookie: lms_session_token (required)
  Body: { title?: string }
  → 201: { conversation: { id, title, createdAt } }

GET /api/conversations/[id]
  Cookie: lms_session_token (required)
  → 200: { conversation: { id, title, createdAt }, messages: Message[] }
  → 404: { error: "Conversation not found" }
  Note: Returns 404 for both "does not exist" and "belongs to another user"
        (do not leak existence of other users' conversations)

DELETE /api/conversations/[id]
  Cookie: lms_session_token (required)
  → 200: { success: true }
  → 404: { error: "Conversation not found" }
  Note: Same 404 policy — ownership violations return 404, not 403
```

### Chat (updated)

```
POST /api/chat/stream
  Cookie: lms_session_token (optional — absent = ANONYMOUS role, no persistence)
  Body: { messages: ChatMessage[], conversationId?: string }
  → SSE stream:
      data: {"conversationId": "conv_xxx"}     ← first event
      data: {"delta": "..."}
      data: {"tool_call": {...}}
      data: {"tool_result": {...}}
      data: {"done": true}

POST /api/chat
  Cookie: lms_session_token (optional — absent = ANONYMOUS role)
  Body: { messages: ChatMessage[] }
  → 200: { role: "assistant", content: string }
  Note: Non-streaming endpoint for math/calculator. Same session/role logic
        as /api/chat/stream but returns a single JSON response.
        No persistence (used for quick math, not conversation continuity).

POST /api/tts
  Cookie: lms_session_token (required — ANONYMOUS rejected with 403)
  Body: { text: string }
  → 200: audio/mpeg stream
  → 403: { error: "Audio generation requires a signed-in account" }
  Note: Belt-and-suspenders enforcement — LLM prompt tells ANONYMOUS "no audio",
        endpoint also rejects at the handler level.
```

---

## 13. Requirements Matrix

### 13.1 Positive Requirements (the system MUST)

#### Registration

| ID | Requirement |
|----|-------------|
| REG-1 | The system MUST allow a visitor to create an account with email, password, and name. |
| REG-2 | The system MUST hash the password with bcryptjs (cost 12) before storing it. |
| REG-3 | The system MUST reject registration if the email is already registered (400 response). |
| REG-4 | The system MUST enforce password length: ≥8 and ≤72 characters. |
| REG-5 | The system MUST enforce name length: 1–100 characters, trimmed. |
| REG-6 | The system MUST validate email format (contains @ with a domain). |
| REG-7 | The system MUST assign the AUTHENTICATED role to newly registered users. |
| REG-8 | The system MUST create a session and set an httpOnly cookie upon successful registration. |
| REG-9 | The system MUST return the user object (id, email, name, roles) on successful registration — never the password hash. |

#### Authentication

| ID | Requirement |
|----|-------------|
| AUTH-1 | The system MUST allow a registered user to log in with email and password. |
| AUTH-2 | The system MUST create a new session token (crypto.randomUUID) on each successful login. |
| AUTH-3 | The system MUST return 401 for invalid credentials without revealing whether the email or password was wrong. |
| AUTH-4 | The system MUST destroy the session (DB row + cookie) on logout. |
| AUTH-5 | The system MUST return the current user via `GET /api/auth/me` when a valid session exists. |
| AUTH-6 | The system MUST expire sessions after 7 days (configurable via `SESSION_MAX_AGE_DAYS`). |
| AUTH-7 | The system MUST clean up expired sessions opportunistically or at startup. |

#### Session & Cookie

| ID | Requirement |
|----|-------------|
| SESS-1 | The session cookie MUST be httpOnly, sameSite: lax, path: /, secure in production. |
| SESS-2 | The session token MUST be a cryptographically random UUID. |
| SESS-3 | The session lookup MUST go through `ValidateSessionInteractor` → `SessionRepository` (never raw DB in route handlers). |

#### Middleware & Route Protection

| ID | Requirement |
|----|-------------|
| MW-1 | Middleware MUST run in Edge Runtime — cookie presence check only, no DB access. |
| MW-2 | Middleware MUST return 401 for protected routes (`/api/conversations/*`, `/api/auth/me`, `/api/auth/logout`) when the cookie is missing. |
| MW-3 | Middleware MUST pass chat routes (`/api/chat/*`, `/api/tts`) without cookie — ANONYMOUS access is allowed. |
| MW-4 | Route handlers MUST validate sessions via `ValidateSessionInteractor` for all routes that received a session cookie. |
| MW-5 | Route handlers MUST treat requests with no session cookie on chat routes as ANONYMOUS role. |
| MW-6 | Route handlers MUST return 403 (not 401) when a valid session exists but the role is insufficient. |

#### RBAC & Role-Aware LLM

| ID | Requirement |
|----|-------------|
| RBAC-1 | The system MUST provide 4 roles: ANONYMOUS, AUTHENTICATED, STAFF, ADMIN. |
| RBAC-2 | The system MUST pass the caller's role to `ChatPolicyInteractor` for system prompt generation. |
| RBAC-3 | The system MUST filter available tools by role via `ToolAccessPolicy.getToolNamesForRole()`. |
| RBAC-4 | ANONYMOUS MUST receive only 6 tools: calculator, search_books, get_book_summary, set_theme, navigate, adjust_ui. |
| RBAC-5 | AUTHENTICATED, STAFF, and ADMIN MUST receive all 11 tools. |
| RBAC-6 | The LLM system prompt MUST include role-specific behavioral directives (e.g., ANONYMOUS gets "DEMO mode" framing). |
| RBAC-7 | Tool-level content gating MUST enforce restrictions independently of the prompt (belt and suspenders). |

#### Role Switcher (ADMIN Simulation)

| ID | Requirement |
|----|-------------|
| SWITCH-1 | The role switcher MUST only be accessible to users with the ADMIN role (exception: all authenticated users in `NODE_ENV === 'development'`). |
| SWITCH-2 | The simulated role MUST be stored in a separate `lms_simulated_role` cookie, not the session. |
| SWITCH-3 | The system MUST verify ADMIN role via `ValidateSessionInteractor` before accepting a switch request. |

#### Chat History

| ID | Requirement |
|----|-------------|
| CHAT-1 | The system MUST persist every authenticated user's messages and assistant responses to SQLite. (ANONYMOUS visitors are excluded — see NEG-DATA-2.) |
| CHAT-2 | The system MUST auto-create a conversation on the first message (when no conversationId is provided). |
| CHAT-3 | The system MUST auto-title conversations from the first user message (truncated to 80 chars). |
| CHAT-4 | The system MUST return `conversationId` in the first SSE event so the client can track it. |
| CHAT-5 | The system MUST enforce conversation ownership — a user can only access their own conversations. |
| CHAT-6 | The system MUST store assistant messages with full `parts` JSON (tool_calls + tool_results + text). |
| CHAT-7 | The system MUST support listing a user's conversations (most recent first). |
| CHAT-8 | The system MUST support deleting a conversation (CASCADE deletes all messages). |
| CHAT-9 | The system MUST persist agent-loop exchanges as a single assistant message row (not one row per tool call). |
| CHAT-10 | The system MUST support loading a previous conversation with all its messages for replay. |

#### UI

| ID | Requirement |
|----|-------------|
| UI-1 | Unauthenticated visitors MUST see "Sign In" / "Register" links in the navigation. |
| UI-2 | Authenticated users MUST see their name, conversation history, and accessibility controls. |
| UI-3 | ADMIN users MUST additionally see the role simulation panel. |
| UI-4 | The login page MUST show inline error messages on failure (not alerts). |
| UI-5 | The register page MUST show inline validation errors for each field. |
| UI-6 | The client MUST provide a "New Chat" button to start a fresh conversation. |
| UI-7 | The client MUST provide a conversation sidebar or selector to switch between conversations. |

### 13.2 Negative Requirements (the system MUST NOT)

#### Security Prohibitions

| ID | Requirement |
|----|-------------|
| NEG-SEC-1 | The system MUST NOT store passwords in plaintext — ever. |
| NEG-SEC-2 | The system MUST NOT return `passwordHash` in any API response or client-facing prop. |
| NEG-SEC-3 | The system MUST NOT log passwords, password hashes, or session tokens. |
| NEG-SEC-4 | The system MUST NOT silently truncate passwords exceeding 72 bytes — MUST reject with a validation error. |
| NEG-SEC-5 | The system MUST NOT reveal whether an email is registered during failed login — use generic "Invalid credentials" message. |
| NEG-SEC-6 | The system MUST NOT expose whether a conversation exists when it belongs to another user — return 404, not 403. |
| NEG-SEC-7 | The system MUST NOT use JWTs — session tokens are opaque UUIDs validated against the DB. |
| NEG-SEC-8 | The system MUST NOT auto-assign passwords to existing seed users — that is a security anti-pattern. |

#### Architecture Prohibitions

| ID | Requirement |
|----|-------------|
| NEG-ARCH-1 | Core layer MUST NOT import from `src/lib/` or `src/adapters/` — dependencies point inward only. |
| NEG-ARCH-2 | Data mappers MUST NOT contain authorization logic — ownership checks belong in use-case interactors. |
| NEG-ARCH-3 | Middleware MUST NOT access the database — `better-sqlite3` is incompatible with Edge Runtime. |
| NEG-ARCH-4 | Middleware MUST NOT block page routes — pages always render, showing role-appropriate content. |
| NEG-ARCH-5 | The `User` entity MUST NOT carry `passwordHash` — that field belongs to `UserRecord` in the adapter layer. |
| NEG-ARCH-6 | Tool access policy and system prompt logic MUST NOT live in infrastructure (`lib/`) — they are domain rules belonging in core use-cases. |

#### Role Prohibitions

| ID | Requirement |
|----|-------------|
| NEG-ROLE-1 | Non-ADMIN users MUST NOT access the role-switcher endpoint — return 403 (bypassed when `NODE_ENV === 'development'`). |
| NEG-ROLE-2 | ANONYMOUS users MUST NOT access full chapter content, audio generation, or checklists. |
| NEG-ROLE-3 | ANONYMOUS users MUST NOT access conversation history endpoints (`/api/conversations/*`). |
| NEG-ROLE-4 | The system MUST NOT trust client-side role claims — all role determination happens server-side from the session. |

#### Data Prohibitions

| ID | Requirement |
|----|-------------|
| NEG-DATA-1 | The system MUST NOT allow a user to read, modify, or delete another user's conversations. |
| NEG-DATA-2 | The system MUST NOT persist chat messages for ANONYMOUS visitors (no session = no conversation tracking). |
| NEG-DATA-3 | The system MUST NOT allow conversations to exceed 100 messages (hard limit — returns 400 at creation; see TEST-CHAT-09). |
| NEG-DATA-4 | The system MUST NOT allow a user to have more than 50 conversations (soft limit, oldest deleted when exceeded). |

---

## 14. User Behavior Test Specifications

These are acceptance-test-style scenarios covering complete user journeys. Each scenario specifies the actor, preconditions, actions, and expected outcomes (positive and negative paths).

### 14.1 Registration Journeys

#### TEST-REG-01: Successful Registration

```
GIVEN   a visitor with no account
WHEN    they POST /api/auth/register with:
          { email: "alice@example.com", password: "securepass1", name: "Alice" }
THEN    response status = 201
AND     response body contains { user: { id, email: "alice@example.com", name: "Alice", roles: ["AUTHENTICATED"] } }
AND     response body does NOT contain passwordHash
AND     a Set-Cookie header sets lms_session_token (httpOnly, sameSite=lax)
AND     a row exists in the users table with password_hash NOT NULL
AND     a row exists in the sessions table linked to the new user
AND     a row exists in user_roles linking the user to the AUTHENTICATED role
```

#### TEST-REG-02: Duplicate Email Rejection

```
GIVEN   a user "alice@example.com" already exists
WHEN    a visitor POSTs /api/auth/register with { email: "alice@example.com", ... }
THEN    response status = 400
AND     response body = { error: "Email already registered" }
AND     no new user row is created
AND     no new session is created
```

#### TEST-REG-03: Password Too Short

```
GIVEN   a visitor with no account
WHEN    they POST /api/auth/register with { password: "short" } (5 chars)
THEN    response status = 400
AND     response body contains a validation error mentioning minimum 8 characters
AND     no user is created
```

#### TEST-REG-04: Password Too Long (bcrypt limit)

```
GIVEN   a visitor with no account
WHEN    they POST /api/auth/register with { password: <73 characters> }
THEN    response status = 400
AND     response body contains a validation error mentioning maximum 72 characters
AND     no user is created (password NOT silently truncated)
```

#### TEST-REG-05: Invalid Email Format

```
GIVEN   a visitor with no account
WHEN    they POST /api/auth/register with { email: "not-an-email" }
THEN    response status = 400
AND     response body contains a validation error about email format
```

#### TEST-REG-06: Empty Name

```
GIVEN   a visitor with no account
WHEN    they POST /api/auth/register with { name: "" }
THEN    response status = 400
AND     response body contains a validation error about name being required
```

#### TEST-REG-07: Name Too Long

```
GIVEN   a visitor with no account
WHEN    they POST /api/auth/register with { name: <101 characters> }
THEN    response status = 400
AND     response body contains a validation error about name length
```

#### TEST-REG-08: Missing Required Fields

```
GIVEN   a visitor with no account
WHEN    they POST /api/auth/register with { email: "a@b.com" } (missing password and name)
THEN    response status = 400
AND     response body lists all missing fields
```

### 14.2 Login Journeys

#### TEST-LOGIN-01: Successful Login

```
GIVEN   a registered user "alice@example.com" with password "securepass1"
WHEN    they POST /api/auth/login with { email: "alice@example.com", password: "securepass1" }
THEN    response status = 200
AND     response body contains { user: { id, email, name, roles } }
AND     a Set-Cookie header sets lms_session_token
AND     a new row exists in the sessions table
```

#### TEST-LOGIN-02: Wrong Password

```
GIVEN   a registered user "alice@example.com"
WHEN    they POST /api/auth/login with { email: "alice@example.com", password: "wrongpass" }
THEN    response status = 401
AND     response body = { error: "Invalid credentials" }
AND     NO hint about whether the email was correct
AND     no session is created
```

#### TEST-LOGIN-03: Nonexistent Email

```
GIVEN   no user with email "nobody@example.com"
WHEN    they POST /api/auth/login with { email: "nobody@example.com", password: "anything" }
THEN    response status = 401
AND     response body = { error: "Invalid credentials" }
AND     the response is indistinguishable from TEST-LOGIN-02 (timing-safe)
```

#### TEST-LOGIN-04: Seed User Without Password (cannot login)

```
GIVEN   the hardcoded ADMIN seed user with NULL password_hash
WHEN    they POST /api/auth/login with { email: "admin@lms.local", password: "anything" }
THEN    response status = 401
AND     response body = { error: "Invalid credentials" }
(Seed users cannot log in until a password is set via bootstrap script)
```

#### TEST-LOGIN-05: Multiple Active Sessions

```
GIVEN   user "alice" is logged in on Browser A (session token A)
WHEN    user "alice" logs in on Browser B
THEN    a new session token B is created
AND     session token A remains valid (concurrent sessions allowed)
```

### 14.3 Session Lifecycle Journeys

#### TEST-SESS-01: Valid Session — Access Protected Route

```
GIVEN   user "alice" has a valid session (cookie: lms_session_token=<valid>)
WHEN    they GET /api/auth/me
THEN    response status = 200
AND     response body = { user: { id, email: "alice@...", name: "Alice", roles: ["AUTHENTICATED"] } }
```

#### TEST-SESS-02: Expired Session — Rejected

```
GIVEN   user "alice" has an expired session (expires_at < now)
WHEN    they GET /api/auth/me
THEN    response status = 401
AND     the Set-Cookie header clears the lms_session_token cookie
```

#### TEST-SESS-03: Invalid Token — Rejected

```
GIVEN   a request with cookie lms_session_token=<random-garbage>
WHEN    they GET /api/auth/me
THEN    response status = 401
AND     no user data is returned
```

#### TEST-SESS-04: Logout Destroys Session

```
GIVEN   user "alice" has a valid session
WHEN    they POST /api/auth/logout
THEN    response status = 200
AND     the session row is deleted from the sessions table
AND     the Set-Cookie header clears the lms_session_token cookie
WHEN    they then GET /api/auth/me (with the old cookie)
THEN    response status = 401
```

#### TEST-SESS-05: No Cookie — Middleware Blocks Protected Routes

```
GIVEN   a request with no lms_session_token cookie
WHEN    they GET /api/conversations
THEN    response status = 401 (from middleware, no DB hit)
```

#### TEST-SESS-06: No Cookie — Middleware Allows Chat Routes

```
GIVEN   a request with no lms_session_token cookie
WHEN    they POST /api/chat/stream with { messages: [...] }
THEN    the request reaches the route handler
AND     the route handler treats the caller as ANONYMOUS role
AND     the system prompt includes "DEMO mode" framing
AND     only 6 tools are available (calculator, search_books, get_book_summary, set_theme, navigate, adjust_ui)
```

### 14.4 RBAC & Role-Based Behavior

#### TEST-RBAC-01: ANONYMOUS Gets Limited Tools

```
GIVEN   an unauthenticated visitor (no session cookie)
WHEN    they POST /api/chat/stream with a message asking for a full chapter
THEN    the LLM receives only 6 tools (not get_chapter, get_checklist, etc.)
AND     the system prompt includes the ANONYMOUS directive encouraging sign-up
AND     the LLM response does NOT include full chapter text
AND     the LLM suggests creating an account for full access
```

#### TEST-RBAC-02: AUTHENTICATED Gets Full Tools

```
GIVEN   user "alice" with role AUTHENTICATED and a valid session
WHEN    they POST /api/chat/stream with a message asking for a full chapter
THEN    the LLM receives all 11 tools
AND     the system prompt includes the AUTHENTICATED directive
AND     the LLM CAN return full chapter content
```

#### TEST-RBAC-03: ADMIN Can Switch Roles

```
GIVEN   user "admin" with role ADMIN and a valid session
WHEN    they POST /api/auth/switch with { role: "ANONYMOUS" }
THEN    response status = 200
AND     a lms_simulated_role cookie is set to "ANONYMOUS"
AND     subsequent LLM requests use the ANONYMOUS system prompt + tool set
```

#### TEST-RBAC-04: Non-ADMIN Cannot Switch Roles

```
GIVEN   user "alice" with role AUTHENTICATED and a valid session
WHEN    they POST /api/auth/switch with { role: "ADMIN" }
THEN    response status = 403
AND     response body = { error: "Admin access required" }
AND     no lms_simulated_role cookie is set
```

#### TEST-RBAC-05: ANONYMOUS Cannot Access Conversations

```
GIVEN   an unauthenticated visitor (no session cookie)
WHEN    they GET /api/conversations
THEN    response status = 401 (middleware rejects — no cookie on protected route)
```

#### TEST-RBAC-06: Tool Content Gating (Belt and Suspenders)

```
GIVEN   an unauthenticated visitor (ANONYMOUS role)
WHEN    the LLM somehow attempts to call get_chapter (tool not in filtered list)
THEN    the tool call is rejected (tool not available in the filtered set)
Note:   This is enforced by ToolAccessPolicy, not just the prompt directive
```

### 14.5 Chat History Journeys

#### TEST-CHAT-01: First Message Creates Conversation

```
GIVEN   user "alice" is authenticated
WHEN    they POST /api/chat/stream with { messages: [{ role: "user", content: "Tell me about Bauhaus" }] }
        (no conversationId)
THEN    a new conversation is created in the DB with user_id = alice.id
AND     the conversation title = "Tell me about Bauhaus" (auto-generated)
AND     the first SSE event contains { conversationId: "<new-id>" }
AND     the user message is persisted in the messages table
AND     the assistant response (with parts) is persisted after stream completes
```

#### TEST-CHAT-02: Subsequent Message Appends to Conversation

```
GIVEN   user "alice" is authenticated and has conversation "conv_123"
WHEN    they POST /api/chat/stream with { messages: [...], conversationId: "conv_123" }
THEN    the message is appended to the existing conversation
AND     no new conversation is created
AND     the conversation's updated_at timestamp is refreshed
```

#### TEST-CHAT-03: Conversation Ownership Enforced

```
GIVEN   user "alice" owns conversation "conv_alice_1"
AND     user "bob" is authenticated
WHEN    bob GETs /api/conversations/conv_alice_1
THEN    response status = 404 (NOT 403 — do not leak existence)
WHEN    bob POSTs /api/chat/stream with { conversationId: "conv_alice_1" }
THEN    response status = 404
```

#### TEST-CHAT-04: Load Previous Conversation

```
GIVEN   user "alice" has conversation "conv_123" with 5 messages
WHEN    they GET /api/conversations/conv_123
THEN    response contains all 5 messages in chronological order
AND     each message includes id, role, content, parts, created_at
AND     tool_call/tool_result parts are preserved in the parts JSON
```

#### TEST-CHAT-05: Delete Conversation Cascades

```
GIVEN   user "alice" has conversation "conv_123" with 10 messages
WHEN    they DELETE /api/conversations/conv_123
THEN    response status = 200
AND     the conversation row is deleted
AND     all 10 message rows are deleted (ON DELETE CASCADE)
WHEN    they GET /api/conversations/conv_123
THEN    response status = 404
```

#### TEST-CHAT-06: List Conversations (Most Recent First)

```
GIVEN   user "alice" has 3 conversations created at T1, T2, T3
WHEN    they GET /api/conversations
THEN    response contains 3 conversations ordered by updated_at DESC (T3 first)
AND     each entry contains { id, title, updatedAt, messageCount }
```

#### TEST-CHAT-07: New Chat Resets State

```
GIVEN   user "alice" is in conversation "conv_123" in the UI
WHEN    they click "New Chat"
THEN    the client clears conversationId from state
AND     the chat area resets to the hero/welcome message
AND     the next POST /api/chat/stream omits conversationId (creating a new conversation)
```

#### TEST-CHAT-08: ANONYMOUS Chat Is Not Persisted

```
GIVEN   an unauthenticated visitor (no session cookie)
WHEN    they POST /api/chat/stream with a message
THEN    the LLM responds normally (with ANONYMOUS tool set)
AND     NO conversation is created in the DB
AND     NO messages are persisted
AND     the SSE stream does NOT include a conversationId event
```

#### TEST-CHAT-09: Conversation Message Limit

```
GIVEN   user "alice" has a conversation with 100 messages
WHEN    they POST /api/chat/stream with a new message to that conversation
THEN    response status = 400
AND     response body = { error: "Conversation message limit reached (100). Start a new chat." }
```

#### TEST-CHAT-10: Conversation Count Limit

```
GIVEN   user "alice" has 50 conversations
WHEN    they POST /api/chat/stream with a new message (no conversationId, which would create #51)
THEN    the oldest conversation is deleted to make room
AND     the new conversation is created successfully
```

### 14.6 Page Rendering Journeys

#### TEST-PAGE-01: Unauthenticated Visitor Sees Public Layout

```
GIVEN   a visitor with no session cookie
WHEN    they navigate to /
THEN    the page renders with "Sign In" / "Register" links in the nav
AND     the chat is functional with ANONYMOUS limitations
AND     no conversation sidebar is shown
```

#### TEST-PAGE-02: Authenticated User Sees Full Layout

```
GIVEN   user "alice" is authenticated
WHEN    they navigate to /
THEN    the nav shows alice's name and role
AND     the conversation sidebar/selector is visible
AND     the chat is fully functional with all tools
```

#### TEST-PAGE-03: Login Page Shows Errors Inline

```
GIVEN   a visitor navigates to /login
WHEN    they submit the form with wrong credentials
THEN    the page shows "Invalid credentials" as an inline error (not an alert/popup)
AND     the form is not cleared — email field retains its value
AND     the password field IS cleared (security)
```

#### TEST-PAGE-04: Register Page Validates Fields

```
GIVEN   a visitor navigates to /register
WHEN    they submit with password "short" (5 chars)
THEN    the page shows an inline error: "Password must be at least 8 characters"
WHEN    they submit with email "not-an-email"
THEN    the page shows an inline error about email format
WHEN    they submit with an empty name
THEN    the page shows an inline error: "Name is required"
```

#### TEST-PAGE-05: Successful Registration Redirects

```
GIVEN   a visitor fills out the register form with valid data
WHEN    they submit the form
THEN    the account is created (REG-1 through REG-9)
AND     they are redirected to / (home page)
AND     the nav now shows their name and AUTHENTICATED role
```

#### TEST-PAGE-06: Successful Login Redirects

```
GIVEN   a registered user navigates to /login
WHEN    they submit valid credentials
THEN    a session is created
AND     they are redirected to / (home page)
AND     their previous conversations are loadable
```

### 14.7 Edge Cases & Error Recovery

#### TEST-EDGE-01: DB Unavailable During Session Validation

```
GIVEN   the SQLite database file is locked or corrupted
WHEN    a request arrives with a valid session cookie
THEN    the route handler returns 500 { error: "Internal server error" }
AND     the error is logged (but no sensitive data in the log)
```

#### TEST-EDGE-02: Concurrent Registration Race Condition

```
GIVEN   two simultaneous POST /api/auth/register with the same email
WHEN    both requests reach the interactor
THEN    one succeeds (201) and the other fails (400: "Email already registered")
AND     only one user row exists in the DB
(Enforced by UNIQUE constraint on users.email)
```

#### TEST-EDGE-03: Cookie Present but Session Deleted (e.g., admin cleanup)

```
GIVEN   user "alice" has cookie lms_session_token=<token>
AND     an admin manually deletes alice's session from the DB
WHEN    alice makes a request to /api/auth/me
THEN    response status = 401
AND     the stale cookie is cleared
```

#### TEST-EDGE-04: Malformed Request Bodies

```
GIVEN   an authenticated user
WHEN    they POST /api/chat/stream with { messages: "not-an-array" }
THEN    response status = 400
AND     response body contains a validation error
WHEN    they POST /api/auth/register with { email: 12345 } (wrong type)
THEN    response status = 400
```

#### TEST-EDGE-05: Conversation ID Tampering

```
GIVEN   user "alice" is authenticated
WHEN    they POST /api/chat/stream with { conversationId: "conv_nonexistent" }
THEN    response status = 404
(The system does not create a conversation with a client-supplied ID)
```

#### TEST-EDGE-06: XSS in User Input Fields

```
GIVEN   a visitor registers with name: "<script>alert('xss')</script>"
WHEN    the name is displayed in the UI
THEN    it is rendered as escaped text, NOT executed as HTML
(React's JSX escaping handles this by default, but verify in tests)
```

#### TEST-EDGE-07: SQL Injection in Login

```
GIVEN   a visitor attempts login with email: "' OR '1'='1"
WHEN    the request reaches AuthenticateUserInteractor
THEN    the parameterized query finds no user (email is treated as a literal string)
AND     response status = 401
(All DB queries use parameterized statements via better-sqlite3)
```

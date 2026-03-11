# Sprint 0 — Dependency Violation Fixes

> **Goal:** Establish clean architecture before adding new features.  
> **Spec ref:** §2A Violations 1–4, §4 Pre-work table, §8 Phase 0  
> **Prerequisite:** None

---

## Task 0.1 — BookTools dependency inversion (Violation 1)

**What:** BookTools commands currently import 5 facade functions from `@/lib/book-library` (infrastructure). Inject the existing `BookRepository` port via constructor instead.

**Note:** The `BookRepository` port already exists at `src/core/use-cases/BookRepository.ts` — no new file needed.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/use-cases/tools/BookTools.ts` — add `BookRepository` constructor param to each of the 5 commands (`SearchBooksCommand`, `GetChapterCommand`, `GetChecklistCommand`, `ListPractitionersCommand`, `GetBookSummaryCommand`); remove `@/lib/book-library` import; call repository methods instead of facade functions |
| **Modify** | `src/lib/chat/tools.ts` — wire `FileSystemBookRepository` instance into each command constructor (currently `new XxxCommand()` → `new XxxCommand(bookRepo)`) |
| **Spec** | §2A Violation 1, §8 Phase 0 step 1, NEG-ARCH-1 |
| **Tests** | Existing BookTools tests still pass; `BookTools.ts` has zero imports from `src/lib/` |
| **Verify** | `grep -r "@/lib/book-library" src/core/` returns nothing |

---

## Task 0.2 — Calculator move to core (Violation 2)

**What:** `CalculatorTool.ts` imports `calculate`, `isCalculatorOperation`, and `CalculatorResult` from `@/lib/calculator`. Move the entire module (all 4 exports) into the core entity layer — it's pure arithmetic with zero I/O.

| Item | Detail |
|------|--------|
| **Create** | `src/core/entities/calculator.ts` — move all 4 exports from `lib/calculator.ts`: type `CalculatorOperation`, type `CalculatorResult`, function `calculate()`, function `isCalculatorOperation()` |
| **Modify** | `src/core/use-cases/tools/CalculatorTool.ts` — change import from `@/lib/calculator` to `@/core/entities/calculator` (imports `calculate`, `isCalculatorOperation`, `CalculatorResult`) |
| **Modify** | `src/lib/calculator.ts` — replace implementation with re-exports from `@/core/entities/calculator` (backward compat for any other consumers) |
| **Spec** | §2A Violation 2, §8 Phase 0 step 2, NEG-ARCH-1 |
| **Tests** | Existing calculator tests pass; `CalculatorTool.ts` has zero imports from `src/lib/` |
| **Verify** | `grep -r "@/lib/calculator" src/core/` returns nothing |

---

## Task 0.3 — BookMeta to adapter layer (Violation 3)

**What:** `BookMeta` interface (with `chaptersDir` file-system path) and `BOOKS` constant are in `src/core/entities/library.ts`, coupling the entity layer to storage strategy. Move to adapter layer.

**Complication:** 4 Next.js page files also import `BOOKS` from `library.ts` for `generateStaticParams()` and rendering. These pages only use `slug`, `title`, `number` fields (not `chaptersDir`), so they should switch to importing via the `book-library.ts` facade or use the `BookRepository` port.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/entities/library.ts` — remove `BookMeta` interface and `BOOKS` constant; retain pure types: `Book`, `Chapter`, `LibrarySearchResult`, `Practitioner`, `Checklist` |
| **Modify** | `src/adapters/FileSystemBookRepository.ts` — absorb `BookMeta` interface + `BOOKS` constant; update imports |
| **Modify** | `src/lib/book-library.ts` — export a `getBooks(): Book[]` convenience function (maps `BOOKS` to pure `Book` shape) for page consumers |
| **Modify** | `src/app/books/page.tsx` — replace `import { BOOKS } from "@/core/entities/library"` with `import { getBooks } from "@/lib/book-library"` |
| **Modify** | `src/app/books/[book]/page.tsx` — same: switch `BOOKS` import to facade |
| **Modify** | `src/app/books/[book]/layout.tsx` — same: switch `BOOKS` import to facade |
| **Modify** | `src/app/books/[book]/[chapter]/page.tsx` — same: switch `BOOKS` import to facade |
| **Spec** | §2A Violation 3, §8 Phase 0 step 3, NEG-ARCH-1 |
| **Tests** | Existing book tests pass; `src/core/entities/library.ts` exports only pure domain types (no file-system references) |
| **Verify** | `grep -r "chaptersDir" src/core/` returns nothing; `grep -r "BOOKS.*library" src/app/` returns nothing |

---

## Task 0.4 — ChatMessage unification (Violation 4)

**What:** Two competing `ChatMessage` types exist with different shapes. Unify to single canonical source in `chat-message.ts`.

**Type differences to reconcile:**
- `MessageFactory.ts` version: no `id`, optional `timestamp`, role `"user" | "assistant"` only, `parts?: MessagePart[]`
- `chat-message.ts` version: has `id` (required), required `timestamp`, role includes `"system"`, `parts?: unknown[]`

**Resolution:** The canonical type in `chat-message.ts` wins (it has the richer shape). `MessageFactory` already generates `id` via `crypto.randomUUID()` and `timestamp` via `new Date()`, so it already produces the canonical shape — it just didn't declare it. The `parts` type should use the more specific `MessagePart[]` (from `message-parts.ts`) in the canonical definition, since `unknown[]` loses information.

| Item | Detail |
|------|--------|
| **Modify** | `src/core/entities/chat-message.ts` — update `parts` type from `unknown[]` to `MessagePart[]` (import from `message-parts.ts`); this is the canonical source |
| **Modify** | `src/core/entities/MessageFactory.ts` — delete duplicate `ChatMessage` interface; import `ChatMessage` from `./chat-message`; update `create()` return type |
| **Modify** | `src/hooks/useGlobalChat.tsx` — change `ChatMessage` import/re-export from `"@/core/entities/MessageFactory"` to `"@/core/entities/chat-message"` |
| **Spec** | §2A Violation 4, §8 Phase 0 step 4 |
| **Tests** | All existing tests pass; only one `ChatMessage` export exists in `src/core/entities/` |
| **Verify** | `grep -rn "interface ChatMessage" src/core/entities/` returns exactly 1 result (in `chat-message.ts`) |

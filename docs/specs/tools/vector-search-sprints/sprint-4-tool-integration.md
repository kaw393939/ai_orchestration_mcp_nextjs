# Sprint 4 — Tool Integration

> **Goal:** Wire the hybrid search engine into the existing `search_books` chat
> tool so users get passage-level semantic search results in the chat UI. The
> existing API contract is preserved — enhanced fields are additive.
> **Spec ref:** §8, §10.2, §12 (modified files), Phase 5 steps 20–23
> **Prerequisite:** Sprint 3 complete (hybrid search engine, handler chain,
> composition root `getSearchHandler()` factory — committed `1f9c14f`)

---

## Available Assets (from Sprints 0–3)

All ports, adapters, engines, and wiring listed below already exist and are
**imported, not created**, by Sprint 4.

### Composition Root (`src/lib/chat/tool-composition-root.ts`)

Currently exposes (added in Sprint 3):

| Export | Purpose |
| --- | --- |
| `getSearchHandler(): SearchHandler` | Constructs full chain: HybridSearchHandler → BM25SearchHandler → LegacyKeywordHandler → EmptyResultHandler |
| `getEmbeddingPipelineFactory()` | Factory for embedding pipelines (Sprint 2) |
| `getBookPipeline()` | Book-chunk embedding pipeline (Sprint 2) |
| `createToolRegistry(bookRepo)` | Creates registry from repo (used by tests with mock repo) |
| `getToolRegistry()` | Singleton: calls `createToolRegistry(getBookRepository())` |
| `getToolExecutor()` | Middleware-composed tool executor |

> **Test constraint:** `tests/tool-registry.integration.test.ts` calls
> `createToolRegistry(mockBookRepo)` with a mock repo and no DB connection.
> Any changes to `createToolRegistry()` must remain backward-compatible —
> the search handler parameter must be optional and the function must work
> without `getSearchHandler()` being called.

### Key Types

| Type | Location | Relevant Fields |
| --- | --- | --- |
| `HybridSearchResult` | `src/core/search/types.ts` | 14 fields: bookTitle, bookNumber, bookSlug, chapterTitle, chapterSlug, rrfScore, vectorRank, bm25Rank, relevance, matchPassage, matchSection, matchHighlight, passageOffset |
| `LibrarySearchResult` | `src/core/entities/library.ts` | bookTitle, bookNumber, bookSlug, chapterTitle, chapterSlug, matchContext, relevance, score |
| `SearchHandler` | `src/core/search/ports/SearchHandler.ts` | `canHandle()`, `search(query, filters?)`, `setNext(handler)` |

### Current Integration Point

`LibrarySearchInteractor` already accepts an optional `searchHandler?: SearchHandler`
constructor param (added in Sprint 3, Task 3.6). When present, it delegates to
hybrid search and maps `HybridSearchResult[]` → `LibrarySearchResult[]`:

```typescript
// Current mapping (Sprint 3):
matchPassage → matchContext
rrfScore → score
```

**Gap:** `SearchBooksCommand` constructs its own `LibrarySearchInteractor(repo)`
without passing a `searchHandler`. This means the hybrid path is never
activated at runtime. Sprint 4 must inject the search handler into the command.

### Current SearchBooksCommand Output

```typescript
// BookTools.ts — current output fields:
{ book, bookNumber, chapter, chapterSlug, bookSlug, matchContext, relevance }
```

Does **not** yet include: `matchPassage`, `matchSection`, `matchHighlight`,
`rrfScore`, `vectorRank`, `bm25Rank`, `passageOffset`.

---

## Task 4.1 — Inject SearchHandler into SearchBooksCommand (Phase 5.20)

**What:** Modify `SearchBooksCommand` to accept an optional `SearchHandler`,
pass it to `LibrarySearchInteractor`, and surface the enhanced
`HybridSearchResult` fields in the tool output alongside existing fields.

| Item | Detail |
| --- | --- |
| **Modify** | `src/core/use-cases/tools/BookTools.ts` |
| **Modify** | `src/core/use-cases/tools/search-books.tool.ts` |
| **Spec** | §8, Phase 5.20 |
| **Reqs** | VSEARCH-38 (API contract preserved), VSEARCH-05, VSEARCH-06, VSEARCH-07 |

### Changes to `SearchBooksCommand`

Add a second optional constructor parameter for the search handler:

```typescript
import type { SearchHandler } from "@/core/search/ports/SearchHandler";

export class SearchBooksCommand implements ToolCommand<{ query: string; max_results?: number }, unknown> {
  private readonly search: LibrarySearchInteractor;
  constructor(repo: BookRepository, searchHandler?: SearchHandler) {
    this.search = new LibrarySearchInteractor(repo, searchHandler);
  }

  async execute({ query, max_results = 5 }: { query: string; max_results?: number }, _context?: ToolExecutionContext) {
    const results = await this.search.execute({ query, maxResults: Math.min(max_results, 15) });
    if (results.length === 0) return `No results found for "${query}".`;

    return results.map(r => ({
      // Existing fields (always present — VSEARCH-38):
      book: `${r.bookNumber}. ${r.bookTitle}`,
      bookNumber: r.bookNumber,
      chapter: r.chapterTitle,
      chapterSlug: r.chapterSlug,
      bookSlug: r.bookSlug,
      matchContext: r.matchContext,
      relevance: r.relevance,
      // Additive hybrid fields (present when hybrid search active):
      ...(r.matchPassage !== undefined && {
        matchPassage: r.matchPassage,
        matchSection: r.matchSection,
        matchHighlight: r.matchHighlight,
        rrfScore: r.rrfScore,
        vectorRank: r.vectorRank,
        bm25Rank: r.bm25Rank,
        passageOffset: r.passageOffset,
      }),
    }));
  }
}
```

> **Import note:** `SearchHandler` is a port interface in `src/core/search/ports/`
> — this import is core→core and does NOT violate the dependency rule. The
> `search-books.tool.ts` factory must NEVER import from
> `src/lib/chat/tool-composition-root.ts` (core must not depend on lib).
> The composition root passes the handler in via parameter injection.

> **Note on additive fields:** The `LibrarySearchResult` type currently maps
> `matchPassage → matchContext` and `rrfScore → score`. To surface the enhanced
> fields (`matchPassage`, `matchSection`, `matchHighlight`, `rrfScore`,
> `vectorRank`, `bm25Rank`, `passageOffset`), `LibrarySearchResult` must be
> extended with optional hybrid fields. The tool output then includes them
> when present:

```typescript
// Extended LibrarySearchResult (additive — existing consumers unaffected):
export interface LibrarySearchResult {
  // ... existing fields ...
  // New optional fields (populated when hybrid search is active):
  matchPassage?: string;          // full 200-400 word passage
  matchSection?: string | null;   // section heading
  matchHighlight?: string;        // passage with **bold** query terms
  rrfScore?: number;              // numeric RRF score
  vectorRank?: number | null;     // rank in vector results
  bm25Rank?: number | null;       // rank in BM25 results
  passageOffset?: { start: number; end: number };
}
```

### Changes to `search-books.tool.ts`

Accept `searchHandler` as a parameter — do NOT import from composition root
(core must not depend on lib):

```typescript
import type { SearchHandler } from "@/core/search/ports/SearchHandler";

export function createSearchBooksTool(repo: BookRepository, searchHandler?: SearchHandler): ToolDescriptor {
  return {
    // ... schema unchanged ...
    command: new SearchBooksCommand(repo, searchHandler),
    // ...
  };
}
```

### Changes to `LibrarySearchInteractor`

Update the hybrid path mapping to populate the new optional fields:

```typescript
if (this.searchHandler) {
  const hybridResults = await this.searchHandler.search(request.query);
  return hybridResults.slice(0, maxResults).map(hr => ({
    // Existing fields:
    bookTitle: hr.bookTitle,
    bookNumber: hr.bookNumber,
    bookSlug: hr.bookSlug,
    chapterTitle: hr.chapterTitle,
    chapterSlug: hr.chapterSlug,
    matchContext: hr.matchPassage,
    relevance: hr.relevance,
    score: hr.rrfScore,
    // New optional hybrid fields (additive):
    matchPassage: hr.matchPassage,
    matchSection: hr.matchSection,
    matchHighlight: hr.matchHighlight,
    rrfScore: hr.rrfScore,
    vectorRank: hr.vectorRank,
    bm25Rank: hr.bm25Rank,
    passageOffset: hr.passageOffset,
  }));
}
```

### Verify

```bash
npm run build && npm test   # existing search tests still pass (VSEARCH-39)
```

---

## Task 4.2 — Update ToolResultFormatter for new fields (Phase 5.21)

**What:** Update `RoleAwareSearchFormatter` to format the new result fields
for the LLM context window. Passage text is included for AUTHENTICATED+ roles;
ANONYMOUS gets limited preview.

| Item | Detail |
| --- | --- |
| **Modify** | `src/core/tool-registry/ToolResultFormatter.ts` |
| **Spec** | §8, §12 modified files |
| **Reqs** | VSEARCH-05, VSEARCH-06, VSEARCH-07 |

### Changes

The current formatter only strips fields for ANONYMOUS. It must now:

1. **AUTHENTICATED+ roles:** Pass through all fields including hybrid fields.
   The LLM context gets the full passage, section heading, and highlights.
2. **ANONYMOUS role:** Strip hybrid fields (`matchPassage`, `matchHighlight`,
   `rrfScore`, `vectorRank`, `bm25Rank`, `passageOffset`). Keep only:
   `book`, `bookNumber`, `chapter`, `relevance`, `matchSection` (section
   heading is safe for ANONYMOUS).

```typescript
export class RoleAwareSearchFormatter implements ToolResultFormatter {
  format(toolName: string, result: unknown, context: ToolExecutionContext): unknown {
    if (toolName !== "search_books") return result;
    if (!Array.isArray(result)) return result;
    if (context.role === "ANONYMOUS") {
      return result.map((r: Record<string, unknown>) => ({
        book: r.book,
        bookNumber: r.bookNumber,
        chapter: r.chapterTitle ?? r.chapter,
        relevance: r.relevance,
        matchSection: r.matchSection ?? null,
      }));
    }
    return result;
  }
}
```

### Tests (`tests/tool-result-formatter.test.ts`)

> **Existing test impact:** The current `ANONYMOUS strips sensitive fields`
> test asserts that ANON results do NOT contain `matchContext`, `bookSlug`, or
> `chapterSlug`. The new formatter adds `matchSection` to the ANON allowlist.
> The existing test assertions remain valid (those 3 fields are still stripped),
> but the test fixture should be extended with hybrid fields so the new tests
> can verify they are stripped too.

Update existing formatter tests to cover hybrid fields:

| Test ID | Scenario |
| --- | --- |
| — | AUTHENTICATED: hybrid fields pass through unchanged |
| — | ANONYMOUS: matchPassage, matchHighlight, rrfScore, vectorRank, bm25Rank, passageOffset stripped |
| — | ANONYMOUS: matchSection preserved (safe metadata) |
| — | Non-search tool results pass through unmodified |

### Verify

```bash
npm run build && npm test
```

---

## Task 4.3 — Wire SearchHandler into tool registration (Phase 5.22)

**What:** Connect `getSearchHandler()` to `SearchBooksCommand` via the
composition root's tool registration. The `getSearchHandler()` factory already
exists (Sprint 3) — this task passes it through to the search tool.

| Item | Detail |
| --- | --- |
| **Modify** | `src/lib/chat/tool-composition-root.ts` |
| **Spec** | §10.2, Phase 5.22 |
| **Reqs** | VSEARCH-35, VSEARCH-36 |

> **Note:** The Sprint 3 composition root already builds the full chain in
> `getSearchHandler()`. This task only adds the `searchHandler` parameter
> to `createToolRegistry` and passes it through to `createSearchBooksTool()`.

> **Backward-compatibility constraint:** `createToolRegistry(bookRepo)` is
> used in `tests/tool-registry.integration.test.ts` with a mock repo and
> NO real database. The `searchHandler` parameter MUST be optional so that
> existing test code `createToolRegistry(mockBookRepo)` continues to compile
> and run without opening a DB connection.

### Changes

```typescript
// Signature change: add optional searchHandler parameter
export function createToolRegistry(
  bookRepo: BookRepository,
  searchHandler?: SearchHandler,
): ToolRegistry {
  const reg = new ToolRegistry(new RoleAwareSearchFormatter());

  // ... stateless tools unchanged ...

  // Book tools — now with optional hybrid search handler
  reg.register(createSearchBooksTool(bookRepo, searchHandler));
  // ... other book tools unchanged ...

  return reg;
}

// Singleton accessor wires the real searchHandler:
export function getToolRegistry(): ToolRegistry {
  // ... existing singleton logic ...
  return createToolRegistry(getBookRepository(), getSearchHandler());
}
```

### Verify

```bash
npm run build && npm test   # all tests green
```

---

## Task 4.4 — Integration tests (Phase 5.23)

**What:** Integration tests verifying the full path: tool registration →
command execute → hybrid search → formatted results with passage context.

| Item | Detail |
| --- | --- |
| **Create** | `tests/search/tool-integration.test.ts` |
| **Modify** | existing formatter tests if needed |
| **Spec** | Phase 5.23 |
| **Reqs** | VSEARCH-38, VSEARCH-39 |

### Tests (`tests/search/tool-integration.test.ts`)

Uses test doubles (MockEmbedder, InMemoryVectorStore, InMemoryBM25IndexStore)
to construct the full chain without requiring real embeddings.

| Test ID | Scenario |
| --- | --- |
| VSEARCH-38 | `search_books` returns existing fields (book, chapter, etc.) — backward compatible |
| VSEARCH-39 | All pre-Sprint-4 search tests still pass (verified via full test suite) |
| — | `SearchBooksCommand` with hybrid handler returns `matchPassage` in output |
| — | `SearchBooksCommand` with hybrid handler returns `matchHighlight` with `**bold**` terms |
| — | `SearchBooksCommand` with hybrid handler returns `matchSection` heading |
| — | `SearchBooksCommand` without handler falls back to legacy keyword scoring |
| — | `RoleAwareSearchFormatter` strips hybrid fields for ANONYMOUS |
| — | `RoleAwareSearchFormatter` preserves hybrid fields for AUTHENTICATED |

### Verify

```bash
npx vitest run tests/search/tool-integration.test.ts   # ~8 tests pass
npm run build && npm test                               # all tests green
```

---

## Sprint 4 — Completion Checklist

- [ ] `LibrarySearchResult` extended with optional hybrid fields (additive)
- [ ] `LibrarySearchInteractor` hybrid path populates new optional fields
- [ ] `SearchBooksCommand` accepts optional `SearchHandler` via constructor
- [ ] `search-books.tool.ts` accepts optional `searchHandler` param, passes to command
- [ ] `SearchBooksCommand` output includes hybrid fields when present
- [ ] `RoleAwareSearchFormatter` strips hybrid fields for ANONYMOUS
- [ ] `createToolRegistry(bookRepo, searchHandler?)` — optional param, backward-compatible
- [ ] `getToolRegistry()` singleton wires `getSearchHandler()` at call site
- [ ] Integration tests: command → hybrid search → formatted output (~8 tests)
- [ ] Existing `search_books` API contract unchanged (VSEARCH-38)
- [ ] All existing tests unmodified and passing (VSEARCH-39)
- [ ] `npm run build && npm test` — all tests green

---

## QA Deviations

_To be populated during implementation QA. Any deviations from this sprint doc
or the original spec will be documented here with rationale._

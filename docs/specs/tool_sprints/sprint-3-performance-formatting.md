# Sprint 3 — Performance & Formatting

> **Goal:** Add the caching decorator for `BookRepository` (eliminating repeated
> filesystem reads) and extract the ANONYMOUS truncation logic from
> `SearchBooksCommand` into a composable `ToolResultFormatter`.
> **Spec ref:** §3.5 caching, §3.6 formatter, §7 performance
> **Prerequisite:** Sprint 2 complete

---

## Task 3.1 — CachedBookRepository

**What:** Implement a GoF Decorator on `BookRepository` that caches all reads
in memory. Book content is static markdown — no cache invalidation needed.

| Item | Detail |
| --- | --- |
| **Create** | `src/adapters/CachedBookRepository.ts` |
| **Modify** | `src/adapters/RepositoryFactory.ts` — wrap `FileSystemBookRepository` with `CachedBookRepository` |
| **Create** | `tests/cached-book-repository.test.ts` |
| **Spec** | §3.5, TOOL-PERF-1, TOOL-PERF-2 |

### `CachedBookRepository.ts`

Implements all 5 methods of the `BookRepository` interface (`BookQuery` +
`ChapterQuery`):

```typescript
import type { BookRepository } from "@/core/use-cases/BookRepository";
import type { Book, Chapter } from "@/core/entities/library";

export class CachedBookRepository implements BookRepository {
  private allBooksCache: Book[] | null = null;
  private allChaptersCache: Chapter[] | null = null;
  private bookCache = new Map<string, Book | null>();
  private chaptersByBookCache = new Map<string, Chapter[]>();
  private chapterCache = new Map<string, Chapter>();

  constructor(private readonly inner: BookRepository) {}

  async getAllBooks(): Promise<Book[]> {
    if (!this.allBooksCache) {
      this.allBooksCache = await this.inner.getAllBooks();
    }
    return this.allBooksCache;
  }

  async getBook(slug: string): Promise<Book | null> {
    if (!this.bookCache.has(slug)) {
      this.bookCache.set(slug, await this.inner.getBook(slug));
    }
    return this.bookCache.get(slug)!;
  }

  async getChaptersByBook(bookSlug: string): Promise<Chapter[]> {
    if (!this.chaptersByBookCache.has(bookSlug)) {
      this.chaptersByBookCache.set(bookSlug, await this.inner.getChaptersByBook(bookSlug));
    }
    return this.chaptersByBookCache.get(bookSlug)!;
  }

  async getAllChapters(): Promise<Chapter[]> {
    if (!this.allChaptersCache) {
      this.allChaptersCache = await this.inner.getAllChapters();
    }
    return this.allChaptersCache;
  }

  async getChapter(bookSlug: string, chapterSlug: string): Promise<Chapter> {
    const key = `${bookSlug}/${chapterSlug}`;
    if (!this.chapterCache.has(key)) {
      this.chapterCache.set(key, await this.inner.getChapter(bookSlug, chapterSlug));
    }
    return this.chapterCache.get(key)!;
  }
}
```

### `RepositoryFactory.ts` change

```typescript
// Before:
repository = new FileSystemBookRepository();

// After:
repository = new CachedBookRepository(new FileSystemBookRepository());
```

### Tests (`tests/cached-book-repository.test.ts`)

Uses a mock `BookRepository` that counts how many times each method is called.

| Test ID | Scenario |
| --- | --- |
| TEST-CACHE-01 | `getAllChapters()` called twice → inner called once |
| TEST-CACHE-02 | `getChapter("x","y")` called twice → inner called once |
| TEST-CACHE-03 | `getChapter` with different keys → inner called for each unique key |
| TEST-CACHE-04 | `getAllBooks()` cached independently from `getAllChapters()` |

### Performance impact

| Operation | Before | After |
| --- | --- | --- |
| `search_books` (104 chapters) | ~200-400ms (full FS read) | ~1ms (cached) |
| `get_chapter` + `get_checklist` in same loop | ~100ms + ~200ms | ~1ms each |
| First request (cold cache) | Same as before | Same as before |
| Second+ request (warm cache) | Same as before | Near-instant |

### Verify

```bash
npx vitest run tests/cached-book-repository.test.ts   # 4 tests pass
npx vitest run                                         # all tests pass
npm run build                                          # passes
```

---

## Task 3.2 — ToolResultFormatter + SearchBooks RBAC extraction

**What:** Extract the ANONYMOUS truncation logic from `SearchBooksCommand` into
a `ToolResultFormatter` strategy. The command always returns full data; the
formatter shapes output based on role. This achieves SRP — the command does
search, the formatter does RBAC-aware presentation.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/tool-registry/ToolResultFormatter.ts` |
| **Modify** | `src/core/use-cases/tools/BookTools.ts` — `SearchBooksCommand.execute()` always returns full results. Remove the `if (role === "ANONYMOUS")` branch. Remove `role` from input type. |
| **Modify** | `src/core/tool-registry/ToolRegistry.ts` — accept optional `ToolResultFormatter` in constructor; call `formatter.format()` after `command.execute()`. |
| **Modify** | `src/lib/chat/tool-composition-root.ts` — inject `RoleAwareSearchFormatter` into registry |
| **Create** | `tests/tool-result-formatter.test.ts` |
| **Spec** | §3.6, TOOL-SRP-1 |

### `ToolResultFormatter.ts`

```typescript
import type { ToolExecutionContext } from "./ToolExecutionContext";

export interface ToolResultFormatter {
  format(toolName: string, result: unknown, context: ToolExecutionContext): unknown;
}

export class RoleAwareSearchFormatter implements ToolResultFormatter {
  format(toolName: string, result: unknown, context: ToolExecutionContext): unknown {
    if (toolName !== "search_books") return result;
    if (context.role === "ANONYMOUS") {
      // Strip matchContext, bookSlug, chapterSlug for ANON users
      return (result as Record<string, unknown>[]).map(r => ({
        book: r.book,
        bookNumber: r.bookNumber,
        chapter: r.chapterTitle ?? r.chapter,
        relevance: r.relevance,
      }));
    }
    return result;
  }
}
```

### `SearchBooksCommand` change

```typescript
// Before (in BookTools.ts):
async execute({ query, max_results = 5, role }: { ...; role?: RoleName }, context?: ToolExecutionContext) {
  const effectiveRole = context?.role ?? role;
  if (effectiveRole === "ANONYMOUS" || !effectiveRole) {
    // truncated output
  }
  // full output
}

// After:
async execute({ query, max_results = 5 }: { query: string; max_results?: number }, context?: ToolExecutionContext) {
  const results = await this.search.execute({ query, maxResults: Math.min(max_results, 15) });
  if (results.length === 0) return `No results found for "${query}".`;
  // Always return full structured data — formatter handles RBAC truncation
  return results.map(r => ({
    book: `${r.bookNumber}. ${r.bookTitle}`,
    bookNumber: r.bookNumber,
    chapter: r.chapterTitle,
    chapterSlug: r.chapterSlug,
    bookSlug: r.bookSlug,
    matchContext: r.matchContext,
    relevance: r.relevance,
  }));
}
```

### `ToolRegistry` change

```typescript
class ToolRegistry {
  constructor(private readonly formatter?: ToolResultFormatter) {}

  async execute(name, input, context) {
    // ... existing RBAC + dispatch
    const result = await descriptor.command.execute(input, context);
    // NEW: apply formatter if present
    return this.formatter
      ? this.formatter.format(name, result, context)
      : result;
  }
}
```

### Tests (`tests/tool-result-formatter.test.ts`)

| Test ID | Scenario |
| --- | --- |
| TEST-FMT-01 | ANON search result → stripped of `matchContext`, `bookSlug`, `chapterSlug` |
| TEST-FMT-02 | AUTH search result → full data preserved |
| TEST-FMT-03 | Non-search tool result → passes through unchanged |

### Verify

```bash
npx vitest run tests/tool-result-formatter.test.ts  # 3 tests pass
npx vitest run                                      # all tests pass
grep "ANONYMOUS" src/core/use-cases/tools/BookTools.ts   # returns nothing
```

---

## Sprint 3 Summary

| Metric | Value |
| --- | --- |
| **New files** | 2 (`CachedBookRepository.ts`, `ToolResultFormatter.ts`) |
| **Modified files** | 4 (`RepositoryFactory.ts`, `BookTools.ts`, `ToolRegistry.ts`, `tool-composition-root.ts`) |
| **New test files** | 2 (`tests/cached-book-repository.test.ts`, `tests/tool-result-formatter.test.ts`) |
| **New tests** | ~7 |
| **Existing tests** | All pass |
| **Requirement coverage** | TOOL-PERF-1, TOOL-PERF-2, TOOL-SRP-1 |

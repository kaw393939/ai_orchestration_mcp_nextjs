# Sprint 3 — Hybrid Search Engine

> **Goal:** Build the hybrid search engine (BM25 + Vector + RRF), the composable
> query processing pipeline, and the Chain of Responsibility fallback chain. After
> this sprint, `HybridSearchEngine.search()` returns ranked results from real
> embeddings. Not yet wired to the chat tool — that's Sprint 4.
> **Spec ref:** §6.1–6.7, §7.1–7.6, §8
> **Prerequisite:** Sprint 2 complete (embeddings populated in SQLite, 574 chunks
> from 104 chapters in `.data/local.db`, BM25 index with 6566 terms)

---

## Available Assets (from Sprints 0–2)

All ports, adapters, and utilities listed below already exist and are **imported,
not created**, by Sprint 3.

### Port Interfaces (`src/core/search/ports/`)

| Port | File | Key Signatures |
| --- | --- | --- |
| `Embedder` | `Embedder.ts` | `embed(text): Promise<Float32Array>`, `embedBatch(texts)`, `dimensions(): number`, `isReady(): boolean` |
| `VectorStore` | `VectorStore.ts` | `upsert(records)`, `getAll(query?): EmbeddingRecord[]`, `count()` |
| `BM25IndexStore` | `BM25IndexStore.ts` | `getIndex(sourceType): BM25Index \| null`, `saveIndex(sourceType, index)`, `isStale(sourceType): boolean` |
| `SearchHandler` | `SearchHandler.ts` | `canHandle(): boolean`, `search(query, filters?): Promise<HybridSearchResult[]>`, `setNext(handler): SearchHandler` |
| `QueryProcessingStep` | `QueryProcessingStep.ts` | `process(tokens: string[]): string[]`, `readonly name: string` |
| `Chunker` | `Chunker.ts` | `chunk(content, metadata, options?): Chunk[]` |

### Core Utilities (`src/core/search/`)

| Utility | File | Signature / Notes |
| --- | --- | --- |
| `BM25Scorer` | `BM25Scorer.ts` | `constructor(k1 = 1.2, b = 0.75)`, `score(queryTerms: string[], docTokens: string[], docLength: number, index: BM25Index): number` — needs per-document tokens at query time |
| `reciprocalRankFusion` | `ReciprocalRankFusion.ts` | `reciprocalRankFusion(rankings: Map<string, number>[], k = 60): Map<string, number>` — input: array of `(chunkId → rank)` maps, output: `(chunkId → rrfScore)` map |
| `dotSimilarity` | `dotSimilarity.ts` | `dotSimilarity(a: Float32Array, b: Float32Array): number` |
| `l2Normalize` | `l2Normalize.ts` | `l2Normalize(vec: Float32Array): Float32Array` |
| `MarkdownChunker` | `MarkdownChunker.ts` | Implements `Chunker` — 200-400 word chunks with heading context |
| `EmbeddingPipeline` | `EmbeddingPipeline.ts` | `indexDocuments(docs)`, `rebuildAll(docs)` |
| `EmbeddingPipelineFactory` | `EmbeddingPipelineFactory.ts` | `createForSource(sourceType)` |
| `ChangeDetector` | `ChangeDetector.ts` | Incremental rebuild via SHA-256 content hashing |
| `EmbeddingValidator` | `EmbeddingValidator.ts` | Validates embedding quality post-build |

### Types (`src/core/search/types.ts`)

Already defined and re-exported:

- `HybridSearchResult` — 14 fields: `bookTitle`, `bookNumber`, `bookSlug`, `chapterTitle`, `chapterSlug`, `rrfScore`, `vectorRank`, `bm25Rank`, `relevance`, `matchPassage`, `matchSection`, `matchHighlight`, `passageOffset`
- `IndexResult`, `RebuildResult`, `DocumentInput`
- `EmbeddingRecord` — includes `id`, `sourceType`, `sourceId`, `chunkIndex`, `chunkLevel`, `heading`, `content`, `embeddingInput`, `contentHash`, `modelVersion`, `embedding: Float32Array`, `metadata`
- `BM25Index` — `avgDocLength`, `docCount`, `docLengths: Map<string, number>`, `termDocFrequencies: Map<string, number>`
- `VectorQuery` — `sourceType?`, `chunkLevel?`, `limit?`
- All port type re-exports: `Chunker`, `Embedder`, `VectorStore`, `BM25IndexStore`, `SearchHandler`, `QueryProcessingStep`

### Adapters (Test Doubles) — `src/adapters/`

| Adapter | File | Use in Sprint 3 Tests |
| --- | --- | --- |
| `InMemoryVectorStore` | `InMemoryVectorStore.ts` | Seed with test embeddings for HybridSearchEngine tests |
| `InMemoryBM25IndexStore` | `InMemoryBM25IndexStore.ts` | Seed with test BM25 index for HybridSearchEngine tests |
| `MockEmbedder` | `MockEmbedder.ts` | Deterministic 384-dim vectors from text; `isReady()` returns true after first `embed()` call |

### Composition Root (`src/lib/chat/tool-composition-root.ts`)

Currently exposes: `getToolRegistry()`, `getToolExecutor()`,
`getEmbeddingPipelineFactory()`, `getBookPipeline()`.

Does **not** yet expose: HybridSearchEngine, SearchHandlerChain, QueryProcessors,
BM25Scorer, or BM25IndexStore instances. Sprint 3 must wire these.

### LibrarySearchInteractor (`src/core/use-cases/LibrarySearchInteractor.ts`)

Current signature:

```typescript
class LibrarySearchInteractor implements UseCase<SearchRequest, LibrarySearchResult[]> {
  constructor(private bookRepository: BookQuery & ChapterQuery) {}
  async execute(request: SearchRequest): Promise<LibrarySearchResult[]> { ... }
}
```

Returns `LibrarySearchResult` (entity type with `matchContext: string`, `score: number`),
**not** `HybridSearchResult`. Task 3.6 must bridge this gap.

---

## Task 3.1 — Composable query processing steps (GoF-3)

**What:** Implement the three query processing steps and the `QueryProcessor`
compositor. Each step is a Strategy — independently testable, independently
swappable.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/search/query-steps/LowercaseStep.ts` |
| **Create** | `src/core/search/query-steps/StopwordStep.ts` |
| **Create** | `src/core/search/query-steps/SynonymStep.ts` |
| **Create** | `src/core/search/QueryProcessor.ts` |
| **Create** | `tests/search/query-processing.test.ts` |
| **Spec** | §7.1–7.6 |
| **Reqs** | VSEARCH-08, VSEARCH-09, VSEARCH-46 |

### `LowercaseStep`

```typescript
class LowercaseStep implements QueryProcessingStep {
  readonly name = "lowercase";
  process(tokens: string[]): string[] {
    return tokens.map(t => t.toLowerCase());
  }
}
```

### `StopwordStep`

```typescript
class StopwordStep implements QueryProcessingStep {
  readonly name = "stopword";
  constructor(private stopwords: Set<string>) {}
  process(tokens: string[]): string[] {
    return tokens.filter(t => !this.stopwords.has(t));
  }
}
```

### `SynonymStep`

```typescript
class SynonymStep implements QueryProcessingStep {
  readonly name = "synonym";
  constructor(private synonyms: Record<string, string[]>) {}
  process(tokens: string[]): string[] {
    return tokens.flatMap(t => [t, ...(this.synonyms[t] ?? [])]);
  }
}
```

### `QueryProcessor`

```typescript
class QueryProcessor {
  constructor(private steps: QueryProcessingStep[]) {}

  process(query: string): string[] {
    let tokens = query.split(/\s+/).filter(Boolean);
    for (const step of this.steps) {
      tokens = step.process(tokens);
    }
    return tokens;
  }
}
```

### Pipeline construction

```typescript
// For BM25 branch (with synonyms):
const bm25Processor = new QueryProcessor([
  new LowercaseStep(),
  new StopwordStep(STOPWORDS),
  new SynonymStep(SYNONYMS),
]);

// For vector branch (no synonyms — model handles semantics):
const vectorProcessor = new QueryProcessor([
  new LowercaseStep(),
  new StopwordStep(STOPWORDS),
]);
```

### Tests (`tests/search/query-processing.test.ts`)

| Test ID | Scenario |
| --- | --- |
| TEST-VS-48 | `LowercaseStep.process(["Hello", "WORLD"])` → `["hello", "world"]` |
| TEST-VS-49 | `StopwordStep.process(["the", "best", "ux"])` → `["best", "ux"]` |
| TEST-VS-50 | `SynonymStep.process(["ux"])` → `["ux", "user experience", "usability"]` |
| — | Full pipeline: `"What are the best UX heuristics?"` → see §7.4 example |

### Verify

```bash
npx vitest run tests/search/query-processing.test.ts   # 4 tests pass
npm run build
```

---

## Task 3.2 — Stopword + synonym data files

**What:** Create the stopword set and synonym map as importable data modules.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/search/data/stopwords.ts` |
| **Create** | `src/core/search/data/synonyms.ts` |
| **Spec** | §7.5, §7.6 |

### `stopwords.ts`

Standard English stopwords plus domain noise words (~90 entries, per §7.6).

### `synonyms.ts`

Domain-specific synonym map (~40-60 entries, per §7.5). Applied to BM25 branch
only — embedding model handles semantics natively.

### Verify

```bash
npm run build   # type-checks
```

---

## Task 3.3 — HybridSearchEngine (BM25 + Vector + RRF)

**What:** Implement the core search engine that coordinates vector retrieval,
BM25 retrieval, and Reciprocal Rank Fusion.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/search/HybridSearchEngine.ts` |
| **Create** | `tests/search/hybrid-search-engine.test.ts` |
| **Spec** | §6.5, §6.6 |
| **Reqs** | VSEARCH-01 through VSEARCH-07, VSEARCH-10, VSEARCH-11, VSEARCH-24, VSEARCH-36, VSEARCH-49 |

### Constructor (GB-3 — explicit dependencies)

```typescript
class HybridSearchEngine {
  constructor(
    private embedder: Embedder,
    private vectorStore: VectorStore,
    private bm25Scorer: BM25Scorer,
    private bm25IndexStore: BM25IndexStore,
    private vectorQueryProcessor: QueryProcessor,
    private bm25QueryProcessor: QueryProcessor,
    private options: {
      vectorTopN: number;      // default 50
      bm25TopN: number;        // default 50
      rrfK: number;            // default 60
      maxResults: number;      // default 10
    }
  ) {}
}
```

### Search flow

```text
1. Process query via vectorQueryProcessor (no synonyms)
   → returns string[] of cleaned tokens
2. Process query via bm25QueryProcessor (with synonyms)
   → returns string[] of cleaned + expanded tokens
3. Embed vector-cleaned query (join tokens → embed → l2Normalize)
   → 384-dim Float32Array (~10ms)
4. Vector retrieval:
   a. vectorStore.getAll({ sourceType, chunkLevel: "passage" })
   b. dotSimilarity(queryVec, record.embedding) for each record
   c. Sort descending → take top vectorTopN (50)
   d. Build ranking: Map<chunkId, rank> (1-indexed)
5. BM25 retrieval:
   a. For each record from step 4a, tokenize record.content → docTokens
   b. bm25Scorer.score(bm25QueryTerms, docTokens, docTokens.length, bm25Index)
      ▸ Note: BM25Scorer.score() requires per-document tokens at query time
   c. Sort descending → take top bm25TopN (50)
   d. Build ranking: Map<chunkId, rank> (1-indexed)
6. Reciprocal Rank Fusion:
   a. reciprocalRankFusion([vectorRanking, bm25Ranking], options.rrfK)
   b. Returns Map<chunkId, rrfScore>
   c. Sort by rrfScore descending
7. Deduplication: multiple passages from same chapter → keep best
8. Attach metadata: bookTitle, chapterSlug, sectionHeading, passageOffset
9. Return top maxResults (10) as HybridSearchResult[]
```

### Tests (`tests/search/hybrid-search-engine.test.ts`)

| Test ID | Scenario |
| --- | --- |
| TEST-VS-01 | "user experience" returns UX chapters (vector match, no keyword "UX") |
| TEST-VS-02 | "accessibility" returns results via both BM25 and vector branches |
| TEST-VS-03 | RRF ranks results appearing in both branches above single-branch results |
| TEST-VS-04 | Synonym: "a11y" → BM25 searches for "accessibility" + "accessible" |
| TEST-VS-05 | Typo resilience: "accessiblity" still finds results via vector similarity |
| TEST-VS-06 | BM25: rare "heuristic" scores higher than common "design" |
| TEST-VS-07 | BM25: long chapter with 1 mention scores lower than short focused chapter |
| TEST-VS-53 | Constructor requires all 7 dependencies |

### Verify

```bash
npx vitest run tests/search/hybrid-search-engine.test.ts   # 8 tests pass
npm run build
```

---

## Task 3.4 — SearchHandlerChain (Chain of Responsibility — GoF-1)

**What:** Implement the fallback chain. Each handler checks capability and
delegates to the next handler if it cannot service the request.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/search/SearchHandlerChain.ts` |
| **Create** | `tests/search/search-handler-chain.test.ts` |
| **Spec** | §6.7 |
| **Reqs** | VSEARCH-26, VSEARCH-27, VSEARCH-28, VSEARCH-29, VSEARCH-44 |

### Handler chain

```typescript
class HybridSearchHandler implements SearchHandler {
  canHandle(): boolean {
    return this.embedder.isReady() && this.bm25IndexStore.getIndex("book_chunk") !== null;
  }
}

class BM25SearchHandler implements SearchHandler {
  canHandle(): boolean {
    return this.bm25IndexStore.getIndex("book_chunk") !== null;
  }
}

class LegacyKeywordHandler implements SearchHandler {
  canHandle(): boolean { return true; }  // always available
}

class EmptyResultHandler implements SearchHandler {
  canHandle(): boolean { return true; }  // terminal
  search(): Promise<HybridSearchResult[]> { return Promise.resolve([]); }
}
```

> **LegacyKeywordHandler result mapping:** This handler wraps the existing
> `Chapter.calculateSearchScore()` logic and must produce `HybridSearchResult[]`.
> Map: `matchContext → matchPassage`, `matchContext → matchHighlight` (no bold),
> `score → rrfScore`, `vectorRank: null`, `bm25Rank: null`,
> `matchSection: null`, `passageOffset: { start: 0, end: 0 }`.
> Constructor takes `BookQuery & ChapterQuery` (same as current
> `LibrarySearchInteractor.bookRepository`).

### Chain construction

```typescript
const chain = new HybridSearchHandler(engine)
  .setNext(new BM25SearchHandler(bm25Scorer, bm25IndexStore))
  .setNext(new LegacyKeywordHandler(bookRepository))
  .setNext(new EmptyResultHandler());
```

### Tests (`tests/search/search-handler-chain.test.ts`)

| Test ID | Scenario |
| --- | --- |
| TEST-VS-26 | Embeddings table empty → BM25-only results, no error |
| TEST-VS-27 | Embedding model fails → BM25-only results, no error |
| TEST-VS-28 | BM25 index unavailable → legacy keyword scoring, no error |
| TEST-VS-45 | Chain delegates to BM25SearchHandler when embedder unavailable |
| TEST-VS-46 | Chain delegates to LegacyKeywordHandler when BM25 index unavailable |

### Verify

```bash
npx vitest run tests/search/search-handler-chain.test.ts   # 5 tests pass
npm run build
```

---

## Task 3.5 — Result formatting (matchHighlight + deduplication)

**What:** Implement the result formatting utilities: bold highlighting of query
terms in match passages, and deduplication of multiple passages from the same
chapter.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/search/ResultFormatter.ts` |
| **Create** | `tests/search/result-formatter.test.ts` |
| **Spec** | §8 |
| **Reqs** | VSEARCH-05, VSEARCH-06, VSEARCH-07 |

### Key behaviors

```typescript
function highlightTerms(passage: string, queryTerms: string[]): string {
  // Wrap each query term occurrence in **bold** markers
}

function deduplicateByChapter(results: HybridSearchResult[]): HybridSearchResult[] {
  // If multiple passages from same chapter, keep highest-scoring passage
}

function assignRelevance(rrfScore: number, rank: number): "high" | "medium" | "low" {
  // Top 3 or rrfScore > 0.03 → "high"
  // Ranks 4-7 or rrfScore > 0.02 → "medium"
  // Everything else → "low"
}
```

### Tests

| Test ID | Scenario |
| --- | --- |
| TEST-VS-14 | Result includes matchPassage with 200-400 words |
| TEST-VS-15 | Result includes matchSection heading |
| TEST-VS-16 | matchHighlight contains **bold** markers around query terms |
| TEST-VS-17 | 3 passages from same chapter → 1 result with best passage |

### Verify

```bash
npx vitest run tests/search/result-formatter.test.ts   # 4 tests pass
```

---

## Task 3.6 — Wire into LibrarySearchInteractor (optional enhancer)

**What:** Modify `LibrarySearchInteractor` to accept an optional
`SearchHandler`. When present, it delegates to hybrid search and maps
`HybridSearchResult[]` → `LibrarySearchResult[]`. When absent, existing keyword
scoring continues to work unchanged.

| Item | Detail |
| --- | --- |
| **Modify** | `src/core/use-cases/LibrarySearchInteractor.ts` |
| **Modify** | `src/lib/chat/tool-composition-root.ts` (wire chain) |
| **Spec** | §6.7 (fallback chain construction) |
| **Reqs** | VSEARCH-38, VSEARCH-39 |

### Integration pattern

```typescript
class LibrarySearchInteractor implements UseCase<SearchRequest, LibrarySearchResult[]> {
  constructor(
    private bookRepository: BookQuery & ChapterQuery,
    private searchHandler?: SearchHandler,  // optional — fallback to legacy if absent
  ) {}

  async execute(request: SearchRequest): Promise<LibrarySearchResult[]> {
    if (this.searchHandler) {
      const hybridResults = await this.searchHandler.search(request.query);
      return hybridResults.slice(0, request.maxResults ?? 10).map(hr => ({
        bookTitle: hr.bookTitle,
        bookNumber: hr.bookNumber,
        bookSlug: hr.bookSlug,
        chapterTitle: hr.chapterTitle,
        chapterSlug: hr.chapterSlug,
        matchContext: hr.matchPassage,       // map matchPassage → matchContext
        relevance: hr.relevance,
        score: hr.rrfScore,                  // map rrfScore → score
      }));
    }
    // existing keyword scoring (unchanged)
  }
}
```

> **Note:** `LibrarySearchResult` has `matchContext: string` and `score: number`.
> The hybrid path maps `matchPassage → matchContext` and `rrfScore → score`.
> `LegacyKeywordHandler` must perform the reverse: produce `HybridSearchResult`
> from the legacy scoring, filling `vectorRank: null`, `bm25Rank: null`,
> `matchHighlight: matchContext` (no bold), `matchSection: null`,
> `passageOffset: { start: 0, end: 0 }`.

### Composition root wiring (`tool-composition-root.ts`)

Add factory function to construct the full chain and inject into
`LibrarySearchInteractor`:

```typescript
export function getSearchHandler(): SearchHandler {
  const embedder = new LocalEmbedder();
  const vectorStore = new SQLiteVectorStore(getDb());
  const bm25IndexStore = new SQLiteBM25IndexStore(getDb());
  const bm25Scorer = new BM25Scorer();

  const vectorProcessor = new QueryProcessor([
    new LowercaseStep(),
    new StopwordStep(STOPWORDS),
  ]);
  const bm25Processor = new QueryProcessor([
    new LowercaseStep(),
    new StopwordStep(STOPWORDS),
    new SynonymStep(SYNONYMS),
  ]);

  const engine = new HybridSearchEngine(
    embedder, vectorStore, bm25Scorer, bm25IndexStore,
    vectorProcessor, bm25Processor,
    { vectorTopN: 50, bm25TopN: 50, rrfK: 60, maxResults: 10 },
  );

  return new HybridSearchHandler(engine)
    .setNext(new BM25SearchHandler(bm25Scorer, bm25IndexStore))
    .setNext(new LegacyKeywordHandler(getBookRepository()))
    .setNext(new EmptyResultHandler());
}
```

### Verify

```bash
npm run build && npm test   # all existing search tests still pass (VSEARCH-39)
```

---

## Sprint 3 — Completion Checklist

- [x] 3 query processing steps + `QueryProcessor` compositor (GoF-3)
- [x] Stopword set (~90 entries) + synonym map (~40-60 entries)
- [x] `HybridSearchEngine` with dual query processors (GB-3)
- [x] `SearchHandlerChain` with 4 handlers (GoF-1)
- [x] Result formatting: highlight, deduplication, relevance assignment
- [x] `LibrarySearchInteractor` accepts optional search handler (VSEARCH-38)
- [x] Composition root wiring: `getSearchHandler()` factory exposed
- [x] ~32 new tests passing (7 query + 8 engine + 5 chain + 12 formatter)
- [x] Full fallback chain working: hybrid → BM25-only → legacy → empty
- [x] `npm run build && npm test` — all 282 tests green (250 existing + 32 new)

---

## QA Deviations

_To be populated during implementation QA. Any deviations from this sprint doc or
the original spec will be documented here with rationale._

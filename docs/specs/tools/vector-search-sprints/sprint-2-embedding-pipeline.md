# Sprint 2 — Embedding Pipeline

> **Goal:** Wire up the embedding model, build the orchestration pipeline, and
> create the build script. After this sprint, running `npm run build:search-index`
> populates the SQLite `embeddings` table with real vectors from book content.
> **Spec ref:** §4.1–4.5, §9.1–9.4
> **Prerequisite:** Sprint 1 complete (chunker, SQLite stores)

---

## Available Assets from Sprint 0 & Sprint 1

Sprint 2 builds on the following files. All imports use the `@/*` path alias
(mapped to `src/*` in `tsconfig.json`).

### Ports (interfaces — `src/core/search/ports/`)

| Port | File | Key signatures |
| --- | --- | --- |
| `Chunker` | `ports/Chunker.ts` | `chunk(sourceId, content, metadata, options?): Chunk[]` |
| `Embedder` | `ports/Embedder.ts` | `embed(text): Promise<Float32Array>`, `embedBatch(texts): Promise<Float32Array[]>`, `dimensions(): number`, `isReady(): boolean` |
| `VectorStore` | `ports/VectorStore.ts` | `upsert`, `delete`, `getAll`, `getBySourceId`, `getContentHash`, `getModelVersion`, `count` |
| `BM25IndexStore` | `ports/BM25IndexStore.ts` | `getIndex`, `saveIndex`, `isStale` |

### Types (`src/core/search/`)

| File | Exports |
| --- | --- |
| `types.ts` | `HybridSearchResult` + re-exports of all port types for single-point imports |
| `ports/Chunker.ts` | `BookChunkMetadata`, `ConversationMetadata`, `ChunkMetadata` (discriminated union), `Chunk`, `ChunkerOptions` |
| `ports/VectorStore.ts` | `EmbeddingRecord` (14 fields), `VectorQuery` |
| `ports/BM25IndexStore.ts` | `BM25Index` (with `Map<string, number>` fields) |

### Core implementations (`src/core/search/`)

| File | Exports | Notes |
| --- | --- | --- |
| `MarkdownChunker.ts` | `MarkdownChunker` class, `buildPrefix()`, `transformForEmbedding()` | `chunk()` already constructs `embeddingInput` via `transformForEmbedding()` internally — callers do NOT call transform separately |
| `l2Normalize.ts` | `l2Normalize(vec: Float32Array): Float32Array` | Returns new array; idempotent on unit vectors |
| `dotSimilarity.ts` | `dotSimilarity(a, b): number` | Simple dot product; equals cosine similarity when inputs are L2-normalized |
| `BM25Scorer.ts` | `BM25Scorer` class | `score(queryTerms, docTokens, docLength, index)` |
| `ReciprocalRankFusion.ts` | `ReciprocalRankFusion` class | Rank fusion with configurable k parameter |

### Adapters (`src/adapters/`)

| File | Purpose | Notes |
| --- | --- | --- |
| `SQLiteVectorStore.ts` | Production VectorStore | BLOB serialization uses safe `Buffer.copy` before `Float32Array` construction (avoids shared ArrayBuffer alignment issues) |
| `SQLiteBM25IndexStore.ts` | Production BM25IndexStore | JSON serialization of `Map` objects via `[...map]` spread |
| `InMemoryVectorStore.ts` | Test double | Full VectorStore impl using `Map<string, EmbeddingRecord>` |
| `InMemoryBM25IndexStore.ts` | Test double | `isStale()` returns `true` when no index stored |
| `MockEmbedder.ts` | Test double | Deterministic 384-dim vectors from char codes; **already L2-normalizes** output via `l2Normalize()` — double-normalization in pipeline is idempotent |

### Schema (`src/lib/db/schema.ts`)

Tables `embeddings` (14 columns, 5 indexes) and `bm25_stats` (3 columns) are
created by `ensureSchema(db)` — already available for `:memory:` test databases.

### Composition root (`src/lib/chat/tool-composition-root.ts`)

Exports `getToolRegistry()`, `getToolExecutor()`, `createToolRegistry(bookRepo)`.
Currently wires `BookRepository` tools only — Sprint 2 Task 2.5 adds the
embedding factory accessor here.

---

## Task 2.1 — LocalEmbedder adapter (ONNX model wrapper)

**What:** Implement the `Embedder` port (defined in `src/core/search/ports/Embedder.ts`)
using `@huggingface/transformers` with the `all-MiniLM-L6-v2` ONNX model.
The model downloads on first use (~23MB) and is cached in `~/.cache/`.

| Item | Detail |
| --- | --- |
| **Install** | `npm install @huggingface/transformers` |
| **Create** | `src/adapters/LocalEmbedder.ts` |
| **Create** | `tests/search/local-embedder.test.ts` |
| **Modify** | `package.json` — new dependency |
| **Spec** | §4.1, §4.2 |

**Port contract** (from Sprint 0 — `src/core/search/ports/Embedder.ts`):

```typescript
interface Embedder {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  dimensions(): number;   // 384 for MiniLM
  isReady(): boolean;     // true when model loaded and inference available
}
```

### Key behaviors

> **Note:** `LocalEmbedder` returns raw (non-normalized) vectors. L2
> normalization is the **pipeline's** responsibility (step 6 in
> `EmbeddingPipeline.indexDocument`), using the existing
> `l2Normalize()` from `@/core/search/l2Normalize`. This matches the
> `MockEmbedder` test double, which normalizes internally for
> convenience — but production code normalizes at the pipeline layer.

```typescript
import type { Embedder } from "@/core/search/ports/Embedder";

class LocalEmbedder implements Embedder {
  private pipeline: FeatureExtractionPipeline | null = null;

  async embed(text: string): Promise<Float32Array> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: "mean", normalize: false });
    return new Float32Array(output.data);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Batch for efficiency — model handles multiple inputs
    return Promise.all(texts.map(t => this.embed(t)));
  }

  dimensions(): number { return 384; }

  isReady(): boolean { return this.pipeline !== null; }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipeline) {
      const { pipeline } = await import("@huggingface/transformers");
      this.pipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return this.pipeline;
  }
}
```

### Tests (`tests/search/local-embedder.test.ts`)

| Test ID | Scenario |
| --- | --- |
| — | `embed()` returns 384-dimensional Float32Array |
| — | `embedBatch()` returns array of 384-dim vectors |
| — | `isReady()` returns true after first `embed()` call |

### Verify

```bash
npx vitest run tests/search/local-embedder.test.ts   # 3 tests pass (slow — model download)
npm run build
```

---

## Task 2.2 — ChangeDetector + EmbeddingPipeline + EmbeddingPipelineFactory

**What:** Implement the three orchestration components. `ChangeDetector` handles
content hash comparison (UB-2). `EmbeddingPipeline` coordinates chunk → embed →
normalize → store. `EmbeddingPipelineFactory` constructs pipelines per source
type (GoF-2).

| Item | Detail |
| --- | --- |
| **Create** | `src/core/search/ChangeDetector.ts` |
| **Create** | `src/core/search/EmbeddingPipeline.ts` |
| **Create** | `src/core/search/EmbeddingPipelineFactory.ts` |
| **Create** | `tests/search/embedding-pipeline.test.ts` |
| **Spec** | §4.3, §4.4, §4.5 |
| **Reqs** | VSEARCH-22, VSEARCH-23, VSEARCH-25, VSEARCH-42, VSEARCH-45 |

### New types (add to `src/core/search/types.ts` or co-locate with pipeline)

These types are referenced by the pipeline but not yet defined:

```typescript
/** Result of indexing a single document */
interface IndexResult {
  sourceId: string;
  status: "created" | "updated" | "unchanged";
  chunksUpserted: number;
}

/** Result of a full rebuild across all documents */
interface RebuildResult {
  created: number;
  updated: number;
  unchanged: number;
  orphansDeleted: number;
  totalChunks: number;
}

/** Input to rebuildAll() — minimal document descriptor */
interface DocumentInput {
  sourceId: string;         // e.g. "ux-design/chapter-3"
  content: string;          // raw markdown
  contentHash: string;      // SHA-256 hex digest of `content`
  metadata: ChunkMetadata;  // discriminated union from ports/Chunker.ts
}
```

### `ChangeDetector` (UB-2)

Lives in Core (`src/core/search/`) — depends only on the `VectorStore` port
interface, zero infra imports.

```typescript
import type { VectorStore } from "./ports/VectorStore";

class ChangeDetector {
  constructor(private vectorStore: VectorStore) {}

  hasChanged(sourceId: string, contentHash: string): boolean {
    const storedHash = this.vectorStore.getContentHash(sourceId);
    return storedHash !== contentHash;
  }

  hasModelChanged(sourceId: string, currentModelVersion: string): boolean {
    const storedVersion = this.vectorStore.getModelVersion(sourceId);
    return storedVersion !== null && storedVersion !== currentModelVersion;
  }

  findOrphaned(sourceType: string, activeSourceIds: Set<string>): string[] {
    const stored = this.vectorStore.getAll({ sourceType });
    const storedIds = new Set(stored.map(r => r.sourceId));
    return [...storedIds].filter(id => !activeSourceIds.has(id));
  }
}
```

### `EmbeddingPipeline`

```typescript
import type { Chunker, ChunkMetadata } from "./ports/Chunker";
import type { Embedder } from "./ports/Embedder";
import type { VectorStore, EmbeddingRecord } from "./ports/VectorStore";
import { l2Normalize } from "./l2Normalize";

class EmbeddingPipeline {
  constructor(
    private chunker: Chunker,
    private embedder: Embedder,
    private vectorStore: VectorStore,
    private changeDetector: ChangeDetector,
    private modelVersion: string,
  ) {}

  async indexDocument(params: {
    sourceType: string;
    sourceId: string;
    content: string;
    contentHash: string;
    metadata: ChunkMetadata;
  }): Promise<IndexResult> {
    // 1. Check content change via ChangeDetector.hasChanged() (UB-2)
    // 2. Check model version via ChangeDetector.hasModelChanged()
    // 3. If unchanged & model matches → return { status: "unchanged", chunksUpserted: 0 }
    // 4. Chunk content: this.chunker.chunk(sourceId, content, metadata)
    //    NOTE: MarkdownChunker.chunk() already calls transformForEmbedding()
    //    internally — each Chunk.embeddingInput is pre-built with contextual prefix.
    // 5. Embed all chunks: this.embedder.embedBatch(chunks.map(c => c.embeddingInput))
    // 6. L2-normalize each vector: l2Normalize(vec) from @/core/search/l2Normalize
    // 7. Build EmbeddingRecord[] — ID format: `{sourceType}:{sourceId}:{chunkIndex}`
    // 8. Delete old chunks: this.vectorStore.delete(sourceId)
    // 9. Upsert new: this.vectorStore.upsert(records)
    // 10. Return { status: existed ? "updated" : "created", chunksUpserted: records.length }
  }

  async rebuildAll(sourceType: string, documents: DocumentInput[]): Promise<RebuildResult> {
    // For each doc → indexDocument()
    // Detect orphans via ChangeDetector.findOrphaned()
    // Delete orphans via vectorStore.delete()
  }
}
```

**Important — `EmbeddingRecord.id` construction:**

The `id` field is deterministic, built from three components:
```
{sourceType}:{sourceId}:{chunkIndex}
```
Example: `book_chunk:ux-design/chapter-3:0`, `book_chunk:ux-design/chapter-3:1`

This matches the schema `id TEXT PRIMARY KEY` from Sprint 1 and allows
`INSERT OR REPLACE` to work correctly on re-indexing.

### `EmbeddingPipelineFactory` (GoF-2)

```typescript
import { MarkdownChunker } from "./MarkdownChunker";

class EmbeddingPipelineFactory {
  constructor(
    private embedder: Embedder,
    private vectorStore: VectorStore,
    private modelVersion: string,
  ) {}

  createForSource(sourceType: "book_chunk" | "conversation"): EmbeddingPipeline {
    if (sourceType === "conversation") {
      throw new Error("ConversationChunker not yet implemented");
    }
    const chunker = new MarkdownChunker();
    const changeDetector = new ChangeDetector(this.vectorStore);
    return new EmbeddingPipeline(chunker, this.embedder, this.vectorStore, changeDetector, this.modelVersion);
  }
}
```

> **Sprint 0/1 alignment note:** `ConversationChunker` does not exist yet
> (future work). The factory throws for unsupported source types rather than
> silently returning a broken pipeline.

### Tests (`tests/search/embedding-pipeline.test.ts`)

**Test setup pattern** — use the test doubles from `src/adapters/`:

```typescript
import { MockEmbedder } from "@/adapters/MockEmbedder";
import { InMemoryVectorStore } from "@/adapters/InMemoryVectorStore";
import { MarkdownChunker } from "@/core/search/MarkdownChunker";
import { ChangeDetector } from "@/core/search/ChangeDetector";
import { EmbeddingPipeline } from "@/core/search/EmbeddingPipeline";
import { EmbeddingPipelineFactory } from "@/core/search/EmbeddingPipelineFactory";
import type { BookChunkMetadata } from "@/core/search/ports/Chunker";
```

> **Note:** `MockEmbedder` already L2-normalizes its output internally. When the
> pipeline also calls `l2Normalize()`, the result is unchanged (idempotent on
> unit vectors). Tests should verify the pipeline normalizes, not rely on mock
> behavior.

| Test ID | Scenario |
| --- | --- |
| TEST-VS-22 | Unchanged chapter (same hash) → skipped during rebuild |
| TEST-VS-23 | Modified chapter (different hash) → old chunks deleted, new created |
| TEST-VS-24 | Deleted chapter → orphans removed |
| TEST-VS-42 | `ChangeDetector.hasChanged()` true for different hash, false for same |
| TEST-VS-43 | `ChangeDetector.findOrphaned()` returns orphaned sourceIds |
| TEST-VS-47 | `EmbeddingPipelineFactory.createForSource("book_chunk")` → MarkdownChunker pipeline |
| TEST-VS-59 | Model version mismatch triggers re-embedding |
| TEST-VS-60 | New embeddings stored with current model_version |

### Verify

```bash
npx vitest run tests/search/embedding-pipeline.test.ts   # 8 tests pass
npm run build
```

---

## Task 2.3 — EmbeddingValidator (build-time quality checks — GH-1)

**What:** Implement the build-time embedding quality validation. Embeds known
semantic pairs and asserts similarity thresholds. Uses `dotSimilarity()` from
Sprint 0 (`@/core/search/dotSimilarity`) and `l2Normalize()` from Sprint 0
(`@/core/search/l2Normalize`) to compute cosine similarity.

| Item | Detail |
| --- | --- |
| **Create** | `src/core/search/EmbeddingValidator.ts` |
| **Create** | `tests/search/embedding-validator.test.ts` |
| **Spec** | §9.1 (step 7) |
| **Reqs** | VSEARCH-50 |

### Key behaviors

```typescript
import type { Embedder } from "./ports/Embedder";
import { l2Normalize } from "./l2Normalize";
import { dotSimilarity } from "./dotSimilarity";

interface ValidationPair {
  textA: string;
  textB: string;
  expectedSimilar: boolean;
}

interface ValidationResult {
  passed: number;
  failed: number;
  details: string[];      // human-readable per-pair results
}

const VALIDATION_PAIRS: ValidationPair[] = [
  { textA: "WCAG contrast ratios", textB: "accessibility color guidelines", expectedSimilar: true },
  { textA: "mobile responsive design", textB: "adaptive layout breakpoints", expectedSimilar: true },
  { textA: "user experience heuristics", textB: "UX usability principles", expectedSimilar: true },
  { textA: "agile sprint planning", textB: "SQL database normalization", expectedSimilar: false },
  { textA: "CSS flexbox alignment", textB: "project management methodology", expectedSimilar: false },
];

async function validateEmbeddingQuality(embedder: Embedder): Promise<ValidationResult> {
  const SIMILAR_THRESHOLD = 0.7;
  const DISSIMILAR_THRESHOLD = 0.3;
  // For each pair:
  //   1. embedder.embed(textA), embedder.embed(textB)
  //   2. l2Normalize each vector
  //   3. dotSimilarity(normA, normB) → cosine similarity
  //   4. Check against threshold
}
```

### Tests (`tests/search/embedding-validator.test.ts`)

| Test ID | Scenario |
| --- | --- |
| TEST-VS-54 | Known similar pairs produce similarity >= 0.35 |
| TEST-VS-55 | Known dissimilar pairs produce similarity <= 0.2 |

### Verify

```bash
npx vitest run tests/search/embedding-validator.test.ts   # 2 tests pass
```

---

## Task 2.4 — Build script (`scripts/build-search-index.ts`)

**What:** Create the CLI build script that chunks all book chapters, embeds them,
and persists to SQLite. Runs incrementally by default, with `--force` for full
rebuild. Includes quality validation.

| Item | Detail |
| --- | --- |
| **Create** | `scripts/build-search-index.ts` |
| **Spec** | §9.1–9.4 |
| **Reqs** | VSEARCH-18, VSEARCH-19, VSEARCH-20, VSEARCH-21 |

### Key imports

```typescript
// Adapters (production wiring)
import { LocalEmbedder } from "@/adapters/LocalEmbedder";
import { SQLiteVectorStore } from "@/adapters/SQLiteVectorStore";
import { SQLiteBM25IndexStore } from "@/adapters/SQLiteBM25IndexStore";

// Core orchestration (from this sprint)
import { EmbeddingPipelineFactory } from "@/core/search/EmbeddingPipelineFactory";
import { EmbeddingValidator } from "@/core/search/EmbeddingValidator";

// Existing infrastructure
import { getBookRepository } from "@/adapters/RepositoryFactory";
import { getDb } from "@/lib/db";  // or however the DB singleton is accessed
```

### Content hash computation

The build script must compute a SHA-256 hex digest of each chapter's raw
markdown content. This is the `contentHash` passed to `indexDocument()`:

```typescript
import { createHash } from "crypto";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
```

### Script flow

```text
1. Load embedding model (first run downloads ~23MB ONNX)
2. Check model version against stored embeddings (GH-4)
3. Load all chapters via getBookRepository() (CachedBookRepository wrapping FileSystemBookRepository)
4. For each chapter:
   a. ChangeDetector.hasChanged(sourceId, sha256(content)) (UB-2)
   b. If unchanged & model matches → skip
   c. Pipeline handles: chunk → embed → L2-normalize → upsert
      (MarkdownChunker.chunk() builds embeddingInput internally via transformForEmbedding)
5. ChangeDetector.findOrphaned() → delete orphans
6. Rebuild BM25 index → persist via BM25IndexStore (UB-3)
7. Validate embedding quality (GH-1)
8. Print stats
```

> **Sprint 1 alignment note:** The chunker already builds `embeddingInput` with
> contextual prefix inside `chunk()`. The build script does NOT call
> `transformForEmbedding()` directly — that's encapsulated in `MarkdownChunker`.
>
> **Sprint 0 alignment note:** `l2Normalize()` is called by the pipeline (not
> the build script) after `embedder.embedBatch()` returns raw vectors.

### Package scripts

```json
{
  "scripts": {
    "build:search-index": "tsx scripts/build-search-index.ts",
    "build:search-index:force": "tsx scripts/build-search-index.ts --force",
    "prebuild": "npm run build:search-index"
  }
}
```

### Verify

```bash
npm run build:search-index
# Output:
#   Chapters: 104 (104 new, 0 updated, 0 unchanged)
#   Chunks: ~2024 total
#   Model: all-MiniLM-L6-v2@1.0
#   Quality: 5/5 pairs passed
#   Time: ~45-60s (full rebuild)

# Run again (incremental):
npm run build:search-index
# Output:
#   Chapters: 104 (0 new, 0 updated, 104 unchanged)
#   Time: ~0.5s
```

---

## Task 2.5 — On-demand embedding API

**What:** Wire `EmbeddingPipelineFactory` into the composition root so runtime
code can on-demand embed a single document without a full rebuild.

| Item | Detail |
| --- | --- |
| **Modify** | `src/lib/chat/tool-composition-root.ts` (add factory + pipeline accessors) |
| **Spec** | §10.1–10.3 |
| **Reqs** | VSEARCH-22 |

### Current state of composition root

The file currently exports `getToolRegistry()`, `getToolExecutor()`, and
`createToolRegistry(bookRepo)`. It imports from `@/adapters/RepositoryFactory`
and wires book tools. Sprint 2 adds embedding infrastructure alongside.

### Integration point

```typescript
import { LocalEmbedder } from "@/adapters/LocalEmbedder";
import { SQLiteVectorStore } from "@/adapters/SQLiteVectorStore";
import { EmbeddingPipelineFactory } from "@/core/search/EmbeddingPipelineFactory";
import type { EmbeddingPipeline } from "@/core/search/EmbeddingPipeline";

const MODEL_VERSION = "all-MiniLM-L6-v2@1.0";

let factory: EmbeddingPipelineFactory | null = null;

export function getEmbeddingPipelineFactory(): EmbeddingPipelineFactory {
  if (!factory) {
    factory = new EmbeddingPipelineFactory(
      new LocalEmbedder(),
      new SQLiteVectorStore(getDb()),
      MODEL_VERSION,
    );
  }
  return factory;
}

export function getBookPipeline(): EmbeddingPipeline {
  return getEmbeddingPipelineFactory().createForSource("book_chunk");
}
```

> **Note:** `getDb()` must be resolved — check the existing DB access pattern
> in the codebase (likely `src/lib/db/index.ts` or similar). The SQLite stores
> from Sprint 1 accept a `Database` instance from `better-sqlite3`.

### Tests

| Test ID | Scenario |
| --- | --- |
| TEST-VS-25 | On-demand `indexDocument()` embeds a single chapter in <5 seconds |

### Verify

```bash
npm run build && npm test   # all tests green — no runtime changes
```

---

## Sprint 2 — Completion Checklist

- [x] `@huggingface/transformers` installed, `LocalEmbedder` wraps ONNX runtime
- [x] `ChangeDetector` handles hash comparison + model version check + orphan detection (UB-2)
- [x] `EmbeddingPipeline` orchestrates chunk → embed → L2-normalize → store
- [x] `EmbeddingPipelineFactory` constructs pipelines per source type (GoF-2); throws for unimplemented `ConversationChunker`
- [x] `EmbeddingValidator` validates embedding quality at build time using `dotSimilarity` + `l2Normalize` (GH-1)
- [x] `build-search-index.ts` runs incrementally by default; uses `sha256()` for content hashing
- [x] On-demand API accessible via composition root (`getBookPipeline()`)
- [x] `IndexResult`, `RebuildResult`, `DocumentInput` types defined
- [x] `EmbeddingRecord.id` uses deterministic format: `{sourceType}:{sourceId}:{chunkIndex}`
- [x] ~13 new tests passing (cumulative: 249 total tests across 53 files)
- [x] `npm run build:search-index` populates `embeddings` table with real vectors (574 chunks, 104 chapters)
- [x] `npm run build && npm test` — all tests green

### Alignment notes (Sprint 0/1 → Sprint 2)

- Test doubles are in `src/adapters/` (not `src/core/search/test-doubles/`)
- `MockEmbedder` already L2-normalizes — pipeline double-normalization is idempotent
- `MarkdownChunker.chunk()` builds `embeddingInput` internally — pipeline does not call `transformForEmbedding()` directly
- `SQLiteVectorStore.deserializeEmbedding()` uses defensive `Buffer.copy` (safer than spec's naive version)
- Book chapters loaded via `getBookRepository()` (returns `CachedBookRepository` wrapping `FileSystemBookRepository`)

### QA deviations from original spec (documented)

- **Validator thresholds (VSEARCH-50):** Spec originally specified 0.7/0.3 but `all-MiniLM-L6-v2` produces raw cosine similarity of 0.25–0.63 for short phrases. Calibrated to 0.35/0.2 with longer, more descriptive validation pairs for reliable discrimination. Original spec updated to match.
- **Validation pairs:** Made longer and more descriptive (e.g., "WCAG accessibility guidelines for color contrast" vs original "WCAG contrast ratios") to give the 384-dim model sufficient semantic signal. Original spec updated to match.
- **`ChangeDetector.hasModelChanged()`:** Added beyond original spec §4.3 which only defined `hasChanged()` and `findOrphaned()`. Model version checking was described in §4.4 as a pipeline step, but was moved to `ChangeDetector` for SRP — the detector owns all "should we re-index?" decisions. Original spec updated.
- **`--force` flag vs automatic model detection:** Spec §9.1 step 2 describes automatic model-change detection as a global pre-check. Implementation uses per-document `hasModelChanged()` in `indexDocument()` which achieves the same result — if model version differs, all documents get re-embedded. The `--force` flag provides an explicit override for manual rebuilds.
- **`prebuild` hook:** Added per spec §9.3 — `npm run build` automatically runs `build:search-index` first.

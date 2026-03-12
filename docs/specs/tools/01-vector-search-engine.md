# Tool Spec 01 — Vector Search & Embedding Infrastructure

> **Status:** Draft v2.2 — QA-hardened (8 consistency fixes: diagram, ports, interfaces, numbering)
> **Priority:** Critical — highest-impact single improvement
> **Scope:** General-purpose embedding infrastructure with hybrid BM25 + vector
>   search, markdown-aware chunking, SQLite storage, MCP server, and on-demand
>   embedding for any content type
> **Dependencies:** None (new capability, backward-compatible)
> **Affects:** `search_books` tool, `LibrarySearchInteractor`, new MCP server,
>   SQLite schema, future conversation history search

---

## 1. Problem Statement

### 1.1 Search Quality

The current `search_books` implementation uses a hand-rolled keyword scoring
algorithm that splits queries into tokens and scans all 104 chapters linearly:

- **No semantic understanding:** "user experience" won't find chapters about
  "UX" or "usability." "Good design principles" won't find "design heuristics."
- **No stemming or fuzzy matching:** "designing" ≠ "design," typos return zero.
- **Naive scoring:** Flat point values (+5 title, +1 content) ignore term
  frequency saturation and inverse document frequency — fundamental IR failures.
- **No passage-level retrieval:** Results point to whole chapters, not to the
  specific paragraph that answers the query. Context is a dumb 300-char snippet.
- **No synonym awareness:** "SDLC," "software development lifecycle," and
  "development process" are treated as completely unrelated strings.

### 1.2 Architectural Gap

The v1.0 spec treated search as a static, book-only concern stored in a JSON
file. This cannot support:

- **On-demand embedding** when a book chapter is added or edited
- **Conversation history search** (planned future feature) — embedding chat
  messages so the LLM can recall what was discussed across sessions
- **Any new content type** without rewriting the indexing pipeline

### 1.3 Scale Context

10 books × 10-14 chapters = **104 documents**, producing ~2000 chunks. At this
scale, brute-force cosine similarity over precomputed embeddings in JavaScript
completes in <5ms. No vector database extension is needed — SQLite BLOBs are
sufficient. But the architecture must support growth to ~50K+ vectors (when
conversation history is added) without a rewrite.

---

## 2. Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                        CONSUMERS                                │
│                                                                 │
│  search_books    MCP Embedding     Build Script    Future:      │
│  tool (chat)     Server (stdio)    (CLI)           conv history │
│       │                │                │               │       │
└───────┼────────────────┼────────────────┼───────────────┼───────┘
        │                │                │               │
        ▼                ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CORE  (zero infra imports)                   │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Ports            │  │ Engine           │  │ Pipeline      │  │
│  │  Chunker         │  │ HybridSearch     │  │ Embedding     │  │
│  │  Embedder        │  │  Engine          │  │  Pipeline     │  │
│  │  VectorStore     │  │  (BM25+Vec+RRF)  │  │ Embedding     │  │
│  │  BM25IndexStore  │  │ SearchHandler    │  │  PipelineFactory│ │
│  │  SearchHandler   │  │  Chain (GoF-1)   │  │ ChangeDetector│  │
│  │  QueryProcessing │  │ QueryProcessor   │  │ Embedding     │  │
│  │   Step           │  │  (step chain)    │  │  Validator    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Chunking         │  │ Scoring          │  │ Query Steps   │  │
│  │  MarkdownChunker │  │ BM25Scorer       │  │ LowercaseStep │  │
│  │  (heading-aware, │  │ dotSimilarity    │  │ StopwordStep  │  │
│  │   UB-1: Core)    │  │ l2Normalize      │  │ SynonymStep   │  │
│  │                  │  │ ReciprocalRank   │  │               │  │
│  │                  │  │  Fusion          │  │               │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                    │
        ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ADAPTERS  (implement ports)                  │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ LocalEmbedder    │  │ SQLiteVectorStore │                    │
│  │ (HuggingFace     │  │ (better-sqlite3   │                    │
│  │  ONNX Runtime)   │  │  BLOB storage)    │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ SQLiteBM25Index  │  │ InMemoryVector   │                    │
│  │ Store            │  │ Store (tests)    │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐                                          │
│  │ InMemoryBM25     │                                          │
│  │ IndexStore(tests)│                                          │
│  └──────────────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Embedding model | `all-MiniLM-L6-v2` via `@huggingface/transformers` | Best quality-to-size ratio for passage retrieval; local ONNX, zero API cost |
| Keyword algorithm | **BM25** (Okapi BM25) | Industry-standard IR scoring with TF-IDF saturation; replaces naive flat scoring |
| Score fusion | **Reciprocal Rank Fusion (RRF)** | Rank-based fusion is more robust than linear score blending; no α/β tuning needed |
| Vector storage | **SQLite BLOBs** (Float32Array → Buffer) | Already have better-sqlite3 with WAL; <5K vectors don't need a vector extension |
| Chunking | **Markdown-structure-aware recursive** | Never breaks mid-list, mid-code-block, or mid-paragraph; produces coherent embeddings |
| Pipeline abstraction | **Source-agnostic ports** | Same infrastructure for books today, conversation history tomorrow |
| L2 normalization | **Normalize embeddings before storage** | Cosine similarity simplifies to dot product; consistent magnitude across vectors (GH-3) |
| Model versioning | **`model_version` column in embeddings table** | Detects model changes → triggers full rebuild; prevents stale vector comparisons (GH-4) |
| Fallback pattern | **Chain of Responsibility** | Each handler checks capability and delegates to successor; independently testable degradation (GoF-1) |
| Query pipeline | **Composable step chain** | `LowercaseStep → StopwordStep → SynonymStep` — each step is single-responsibility, Strategy-swappable (GoF-3) |
| Metadata typing | **Discriminated union on `source_type`** | `BookChunkMetadata \| ConversationMetadata` — eliminates `Record<string, unknown>` (GB-1) |
| Change detection | **Extracted `ChangeDetector` service** | Content hash comparison decoupled from `EmbeddingPipeline` orchestration (UB-2) |
| Embedding quality | **Build-time validation** | Embed known pairs, assert similarity thresholds; catches degraded models early (GH-1) |

---

## 3. Chunking Strategy — Markdown-Aware Recursive Splitting

### 3.1 Why Not Sliding Window?

The v1.0 spec used a 400-word sliding window with 200-word overlap. This
produces incoherent chunks: splitting mid-paragraph, mid-list, mid-code-block.
Embedding a chunk like `"...contrast ratios. ## Color Theory\nColor is..."` is
meaningless — the embedding captures two unrelated half-thoughts.

### 3.2 Recursive Markdown Splitter

Split on **structural boundaries** in priority order. If a chunk is still too
large after the highest-priority split, recurse to the next level:

```text
Split priority (highest to lowest):
  1. ## headings (H2) — primary section boundaries
  2. ### headings (H3) — subsection boundaries
  3. Double newline (paragraph breaks)
  4. Single newline (within paragraphs — last resort)

Never split inside:
  - Fenced code blocks (``` ... ```)
  - Ordered/unordered lists (treat as atomic block)
  - Blockquotes (> ... multiline)
  - Tables (| ... | rows)
```

### 3.3 Contextual Prefix Injection

Every chunk is **prefixed with its document context** before embedding. This
solves the "orphan passage" problem where a chunk about "contrast ratios" loses
all context about which book and section it belongs to.

**Prefix hierarchy** (coarse → fine):

```text
{Book Title}: {Chapter Title (first sentence of chapter)} > {Section Heading} > {chunk text}
```

**Example:**

```text
Stored text (for retrieval display):
  "Color contrast ratios ensure that text remains readable..."

Embedding input (what gets embedded):
  "Accessibility: This chapter covers WCAG compliance and inclusive design principles. > WCAG Guidelines > Color contrast ratios ensure that text remains readable..."
```

The prefix includes a **semantic summary** at the book/chapter level (the
chapter title plus its first sentence), not just navigation labels. This gives
the embedding model rich domain context — it understands not just *where* this
passage lives but *what the surrounding topic is about*. (GH-2)

**Prefix construction:**

```typescript
function buildPrefix(bookTitle: string, chapterTitle: string, chapterFirstSentence: string, sectionHeading: string | null): string {
  const chapterContext = `${bookTitle}: ${chapterTitle}. ${chapterFirstSentence}`;
  return sectionHeading
    ? `${chapterContext} > ${sectionHeading}`
    : chapterContext;
}
```

### 3.4 Chunk Levels

| Level | Granularity | Embedding Input | Purpose |
| --- | --- | --- | --- |
| `document` | 1 per chapter | `{book}: {chapter title}. {first sentence} > {all H2 headings} > {first 200 words}` | Broad topic matching |
| `section` | 1 per `##` section | `{book}: {chapter title}. {first sentence} > {heading} > {section text, ≤512 tokens}` | Mid-level discovery |
| `passage` | 1 per structural chunk | `{book}: {chapter title}. {first sentence} > {heading} > {passage text, ≤400 words}` | Fine-grained retrieval |

### 3.5 Chunk Size Targets

| Parameter | Value | Rationale |
| --- | --- | --- |
| Target passage size | 200–400 words | Fits within model's 256-token sweet spot |
| Maximum passage size | 500 words | Hard cap; recursive split if exceeded |
| Minimum passage size | 50 words | Merge with previous chunk if below threshold |
| Overlap | None | Structure-aware splits don't need overlap — each chunk is a coherent unit |

### 3.6 Estimated Chunk Counts

| Content | Source | Documents | Sections | Passages | Total |
| --- | --- | --- | --- | --- | --- |
| Book chapters | `book_chunk` | 104 | ~520 | ~1400 | ~2024 |
| Conversation messages (future) | `conversation` | — | — | ~variable | grows over time |

At 384 dims × 4 bytes × 2024 embeddings = **~3.0 MB** in SQLite. Trivially
small.

### 3.7 Chunker Port (Source-Agnostic)

```typescript
// src/core/search/ports/Chunker.ts

/** Discriminated union for type-safe, source-specific chunk metadata (GB-1) */
interface BookChunkMetadata {
  sourceType: "book_chunk";
  bookSlug: string;
  chapterSlug: string;
  bookTitle: string;
  chapterTitle: string;
  chapterFirstSentence: string;   // for enriched prefix (GH-2)
  practitioners?: string[];
  checklistItems?: string[];
}

interface ConversationMetadata {
  sourceType: "conversation";
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  turnIndex: number;
}

type ChunkMetadata = BookChunkMetadata | ConversationMetadata;

interface Chunk {
  content: string;          // the raw text (for display)
  embeddingInput: string;   // the context-prefixed text (for embedding)
  level: "document" | "section" | "passage";
  heading: string | null;   // section heading, if applicable
  startOffset: number;      // char offset in source document
  endOffset: number;
  metadata: ChunkMetadata;  // discriminated union — no Record<string, unknown>
}

interface ChunkerOptions {
  maxChunkWords: number;    // default 400
  minChunkWords: number;    // default 50
}

interface Chunker {
  chunk(sourceId: string, content: string, metadata: ChunkMetadata, options?: ChunkerOptions): Chunk[];
}
```

**Concrete implementations:**

| Chunker | Source | Behavior |
| --- | --- | --- |
| `MarkdownChunker` | Book chapters | Heading-aware recursive splitting, code/list protection |
| `ConversationChunker` (future) | Chat messages | Message-boundary splitting, speaker-aware context |

### 3.8 Embedding Input Transformation Rules (GB-2)

Before embedding, chunk text undergoes a deterministic transformation pipeline.
These rules are applied by the `Chunker` implementation when constructing
`embeddingInput`, not by the `Embedder`:

| Step | Rule | Rationale |
| --- | --- | --- |
| 1. Strip markdown | Remove `#`, `**`, `_`, `>`, `- `, `|` table syntax | Formatting noise dilutes semantic signal |
| 2. Remove code blocks | Delete fenced code (`` ``` ``...`` ``` ``) entirely | Code syntax is not natural language; model handles prose |
| 3. Normalize whitespace | Collapse `\n+` → single space, trim | Consistent token density |
| 4. Prepend context prefix | `{book}: {chapter}. {first sentence} > {heading} > ...` | Domain + hierarchical context (§3.3, GH-2) |
| 5. Truncate to model limit | Cap at 256 tokens (~200 words) | `all-MiniLM-L6-v2` context window |

```typescript
function transformForEmbedding(rawText: string, prefix: string): string {
  const stripped = rawText
    .replace(/```[\s\S]*?```/g, '')       // remove fenced code blocks
    .replace(/^#{1,6}\s+/gm, '')          // remove heading markers
    .replace(/\*\*|__|[*_`]/g, '')        // remove bold/italic/code markers
    .replace(/^>\s?/gm, '')               // remove blockquote markers
    .replace(/^[-*+]\s/gm, '')            // remove list markers
    .replace(/\|/g, ' ')                  // remove table pipes
    .replace(/\s+/g, ' ')                 // normalize whitespace
    .trim();
  return `${prefix} > ${stripped}`;
}
```

The stored `content` field retains the original markdown for display purposes.
Only `embeddingInput` undergoes this transformation.

---

## 4. Embedding Model & Pipeline

### 4.1 Model Selection

| Property | Value |
| --- | --- |
| Model | `Xenova/all-MiniLM-L6-v2` |
| Runtime | `@huggingface/transformers` (ONNX Runtime, Node.js) |
| Embedding dimension | 384 |
| Model size | ~23MB (ONNX quantized, downloaded on first use, cached) |
| Token limit | 256 tokens (~200 words) |
| Inference speed | ~10ms per embedding (commodity hardware) |
| License | Apache 2.0 |
| API keys required | None |
| External services | None — fully local |

### 4.2 Embedder Port

```typescript
// src/core/search/ports/Embedder.ts
interface Embedder {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  dimensions(): number;  // 384 for MiniLM
  isReady(): boolean;    // true when model is loaded and inference is available
}
```

**Adapters:**

| Adapter | Purpose |
| --- | --- |
| `LocalEmbedder` | Wraps `@huggingface/transformers` pipeline; loads ONNX model on first call, caches globally |
| `MockEmbedder` | Returns deterministic fake vectors for unit tests |

The core search engine never imports the model library. It receives
`Float32Array` vectors from the adapter.

### 4.3 ChangeDetector — Content Hash Service (UB-2)

Extracted from `EmbeddingPipeline` to uphold the Single Responsibility Principle.
The pipeline orchestrates; the `ChangeDetector` decides whether work is needed:

```typescript
// src/core/search/ChangeDetector.ts
class ChangeDetector {
  constructor(private vectorStore: VectorStore) {}

  /** Returns true if the document content has changed since last indexing */
  hasChanged(sourceId: string, contentHash: string): boolean {
    const storedHash = this.vectorStore.getContentHash(sourceId);
    return storedHash !== contentHash;
  }

  /** Returns true if the stored model version differs from the current one (GH-4) */
  hasModelChanged(sourceId: string, currentModelVersion: string): boolean {
    const storedVersion = this.vectorStore.getModelVersion(sourceId);
    return storedVersion !== null && storedVersion !== currentModelVersion;
  }

  /** Returns list of sourceIds present in store but absent from provided set */
  findOrphaned(sourceType: string, activeSourceIds: Set<string>): string[] {
    const stored = this.vectorStore.getAll({ sourceType });
    const storedIds = new Set(stored.map(r => r.sourceId));
    return [...storedIds].filter(id => !activeSourceIds.has(id));
  }
}
```

### 4.4 EmbeddingPipeline — The Orchestrator

The pipeline coordinates chunking, embedding, and storage for any source type.
Change detection is **delegated** to `ChangeDetector` (UB-2):

```typescript
// src/core/search/EmbeddingPipeline.ts
class EmbeddingPipeline {
  constructor(
    private chunker: Chunker,
    private embedder: Embedder,
    private vectorStore: VectorStore,
    private changeDetector: ChangeDetector,
    private modelVersion: string,          // e.g. "all-MiniLM-L6-v2@1.0" (GH-4)
  ) {}

  /** Embed a single document (chapter, message, etc.) */
  async indexDocument(params: {
    sourceType: string;        // "book_chunk", "conversation", ...
    sourceId: string;          // "ux-design/chapter-3" or conversation ID
    content: string;           // raw document text
    contentHash: string;       // SHA-256 for change detection
    metadata: ChunkMetadata;   // discriminated union (GB-1)
  }): Promise<IndexResult> {
    // 1. Delegate change check to ChangeDetector (UB-2)
    // 2. If unchanged AND vectorStore.getModelVersion(sourceId) matches, skip (return early)
    // 3. Chunk the content (metadata passed for enriched prefix construction — GH-2)
    // 4. Embed all chunks (batched)
    // 5. L2-normalize each embedding vector (GH-3)
    // 6. Upsert into VectorStore with modelVersion (delete old chunks first)
    // 7. Return stats
  }

  /** Rebuild all embeddings for a source type */
  async rebuildAll(sourceType: string, documents: DocumentInput[]): Promise<RebuildResult> {
    // For each document, call indexDocument
    // Delegate unchanged detection to ChangeDetector (UB-2)
    // Delegate orphan detection to ChangeDetector.findOrphaned()
  }
}
```

This is the single entry point for all embedding operations — used by the
build script, the MCP server, and the runtime on-demand API.

### 4.5 EmbeddingPipelineFactory (GoF-2)

The pipeline is constructed in 3 places (composition root, build script, MCP
server). A factory encapsulates the complex construction:

```typescript
// src/core/search/EmbeddingPipelineFactory.ts
class EmbeddingPipelineFactory {
  constructor(
    private embedder: Embedder,
    private vectorStore: VectorStore,
    private modelVersion: string,
  ) {}

  /** Create a pipeline for a specific content type */
  createForSource(sourceType: "book_chunk" | "conversation"): EmbeddingPipeline {
    const chunker = sourceType === "book_chunk"
      ? new MarkdownChunker()
      : new ConversationChunker();  // future
    const changeDetector = new ChangeDetector(this.vectorStore);
    return new EmbeddingPipeline(chunker, this.embedder, this.vectorStore, changeDetector, this.modelVersion);
  }
}
```

The factory owns chunker selection — callers specify intent, not implementation.

---

## 5. Vector Storage — SQLite

### 5.1 Why SQLite, Not JSON

| Concern | JSON File (v1.0) | SQLite (v2.0) |
| --- | --- | --- |
| On-demand updates | Impossible — must regenerate entire file | Single `INSERT`/`UPDATE` per document |
| Concurrent access | Unsafe — file writes can corrupt | WAL mode handles concurrency |
| Change detection | None — rebuilds everything every time | Content hashes enable incremental updates |
| Multiple source types | Single schema per file | `source_type` discriminator column |
| Query by metadata | Load entire file, filter in JS | SQL `WHERE` clauses |
| Startup cost | Parse 3MB JSON on first search | Lazy per-query reads, instant startup |
| Already in stack | No | Yes — `better-sqlite3` with WAL already running |

### 5.2 Schema

```sql
-- Stored in existing .data/local.db alongside users/sessions/conversations

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,                        -- deterministic: {sourceType}:{sourceId}:{chunkIndex}
  source_type TEXT NOT NULL,                  -- 'book_chunk', 'conversation' (future)
  source_id TEXT NOT NULL,                    -- 'ux-design/chapter-3', conv ID, etc.
  chunk_index INTEGER NOT NULL,               -- ordering within the document
  chunk_level TEXT NOT NULL,                  -- 'document', 'section', 'passage'
  heading TEXT,                               -- section heading (nullable)
  content TEXT NOT NULL,                      -- display text (raw passage)
  embedding_input TEXT NOT NULL,              -- context-prefixed text that was embedded
  content_hash TEXT NOT NULL,                 -- SHA-256 of the source document content
  model_version TEXT NOT NULL,                -- e.g. 'all-MiniLM-L6-v2@1.0' (GH-4)
  embedding BLOB NOT NULL,                    -- L2-normalized Float32Array as Buffer (GH-3)
  metadata TEXT NOT NULL DEFAULT '{}',        -- JSON: typed per ChunkMetadata union (GB-1)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emb_source_type ON embeddings(source_type);
CREATE INDEX IF NOT EXISTS idx_emb_source_id ON embeddings(source_id);
CREATE INDEX IF NOT EXISTS idx_emb_level ON embeddings(chunk_level);
CREATE INDEX IF NOT EXISTS idx_emb_hash ON embeddings(source_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_emb_model ON embeddings(model_version);
```

### 5.3 VectorStore Port

```typescript
// src/core/search/ports/VectorStore.ts
interface EmbeddingRecord {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  chunkLevel: "document" | "section" | "passage";
  heading: string | null;
  content: string;
  embeddingInput: string;
  contentHash: string;
  modelVersion: string;              // e.g. "all-MiniLM-L6-v2@1.0" (GH-4)
  embedding: Float32Array;           // L2-normalized (GH-3)
  metadata: ChunkMetadata;           // discriminated union (GB-1)
}

interface VectorQuery {
  sourceType?: string;              // filter by source type
  chunkLevel?: "document" | "section" | "passage";  // filter by level
  limit?: number;                   // max results (default 10)
}

interface VectorStore {
  upsert(records: EmbeddingRecord[]): void;
  delete(sourceId: string): void;
  getAll(query?: VectorQuery): EmbeddingRecord[];
  getBySourceId(sourceId: string): EmbeddingRecord[];
  getContentHash(sourceId: string): string | null;
  getModelVersion(sourceId: string): string | null;  // for stale-model detection (GH-4)
  count(sourceType?: string): number;
}
```

**Adapters:**

| Adapter | Purpose |
| --- | --- |
| `SQLiteVectorStore` | Production — reads/writes BLOB embeddings in `.data/local.db` |
| `InMemoryVectorStore` | Tests — in-memory `Map<string, EmbeddingRecord>` |

### 5.4 BLOB Serialization & L2 Normalization (GH-3)

All embeddings are **L2-normalized before storage.** This guarantees unit
vectors, which means cosine similarity reduces to a simple dot product:
$\cos(\mathbf{a}, \mathbf{b}) = \mathbf{a} \cdot \mathbf{b}$ when
$\|\mathbf{a}\| = \|\mathbf{b}\| = 1$.

```typescript
// L2 normalize a vector to unit length (GH-3)
function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;  // zero vector edge case
  const result = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) result[i] = vec[i] / norm;
  return result;
}

// Float32Array → Buffer (for SQLite BLOB)
function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

// Buffer → Float32Array (from SQLite BLOB)
function deserializeEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}
```

**Embedding storage flow:**

```text
raw text → Embedder.embed() → Float32Array → l2Normalize() → serializeEmbedding() → SQLite BLOB
```
```

---

## 6. Hybrid Search — BM25 + Vector + Reciprocal Rank Fusion

### 6.1 BM25 Scoring (Keyword Branch)

The existing naive scoring is replaced with **Okapi BM25**, the standard bag-of-
words ranking function used by Elasticsearch, Lucene, and every serious search
engine for 30 years:

```text
BM25(D, Q) = Σ IDF(qi) × [ f(qi, D) × (k1 + 1) ] / [ f(qi, D) + k1 × (1 − b + b × |D|/avgDL) ]

Where:
  qi    = query term i
  f     = term frequency in document D
  |D|   = document length (words)
  avgDL = average document length across corpus
  k1    = 1.2 (term frequency saturation — default)
  b     = 0.75 (length normalization — default)
  IDF   = log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)
  N     = total documents
  n(qi) = documents containing term qi
```

**Why BM25 over the current scoring:**

| Current behavior | BM25 behavior |
| --- | --- |
| "design" in title: +5, always | IDF-weighted: common terms score low |
| "design" in content: +1, always | TF saturates: 50 mentions ≈ 5 mentions |
| Short and long chapters score the same | Length-normalized: short focused chapters aren't penalized |
| No IDF: "the" scores same as "heuristic" | Rare terms score much higher than common ones |

### 6.2 BM25 Index (Precomputed at Build Time)

Computing IDF requires knowing document frequencies across the corpus. These
are computed once at build time and stored:

```typescript
interface BM25Index {
  avgDocLength: number;                   // average chunk length in words
  docCount: number;                       // total chunks
  docLengths: Map<string, number>;        // chunkId → word count
  termDocFrequencies: Map<string, number>; // term → number of chunks containing it
}
```

Stored as a JSON column or separate SQLite table. Rebuilt with embeddings.

#### BM25IndexStore Port (UB-3)

The BM25 index statistics need a dedicated persistence port, following the
same pattern as `VectorStore`. This keeps the `BM25Scorer` a pure function
that reads from an interface, not a concrete storage mechanism:

```typescript
// src/core/search/ports/BM25IndexStore.ts
interface BM25IndexStore {
  /** Retrieve precomputed BM25 statistics for the corpus */
  getIndex(sourceType: string): BM25Index | null;

  /** Persist recomputed BM25 statistics after a rebuild */
  saveIndex(sourceType: string, index: BM25Index): void;

  /** Check if statistics are stale (e.g., embeddings changed since last compute) */
  isStale(sourceType: string): boolean;
}
```

**Adapters:**

| Adapter | Purpose |
| --- | --- |
| `SQLiteBM25IndexStore` | Production — stores stats in `bm25_stats` SQLite table |
| `InMemoryBM25IndexStore` | Tests — in-memory Map |

The `BM25Scorer` receives a `BM25Index` value object (not the store). The store
is used by the build pipeline and the `HybridSearchEngine` initialization.

### 6.3 Vector Scoring (Semantic Branch)

Because all stored embeddings are **L2-normalized** (§5.4, GH-3), cosine
similarity between unit vectors simplifies to a **dot product**:

```typescript
/**
 * Dot product similarity for L2-normalized vectors.
 * Equivalent to cosine similarity when ||a|| = ||b|| = 1.
 */
function dotSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
```

This eliminates the norm computation at query time, saving ~30% per comparison.
At query time: embed the query (~10ms), L2-normalize, compute dot product
against all passage embeddings (~1.5ms for 2000 vectors). No approximate
nearest neighbor needed at this scale.

### 6.4 Reciprocal Rank Fusion (RRF)

The v1.0 spec used `α × vector + β × keyword` linear blending. This is fragile
because vector scores (cosine similarity 0–1) and keyword scores (BM25, unbounded)
are on different scales, and normalizing them requires tuning.

**RRF** fuses **rankings** instead of **scores**:

```text
RRF(d) = Σ  1 / (k + rank_i(d))

Where:
  d      = a document (chunk)
  rank_i = the rank of d in result list i (1-indexed)
  k      = 60 (standard constant, prevents over-weighting rank 1)
```

**Example:**

| Chunk | Vector Rank | BM25 Rank | RRF Score |
| --- | --- | --- | --- |
| Passage A | 1 | 3 | 1/61 + 1/63 = 0.0164 + 0.0159 = **0.0323** |
| Passage B | 5 | 1 | 1/65 + 1/61 = 0.0154 + 0.0164 = **0.0318** |
| Passage C | 2 | 10 | 1/62 + 1/70 = 0.0161 + 0.0143 = **0.0304** |

**Why RRF:** Used by Elasticsearch, Pinecone, and Weaviate for hybrid search.
No weight tuning. Robust to score distribution differences. Well-understood.

### 6.5 HybridSearchEngine Constructor (GB-3)

The `HybridSearchEngine` coordinates the full hybrid search flow. Its
constructor signature makes all dependencies explicit:

```typescript
// src/core/search/HybridSearchEngine.ts
class HybridSearchEngine {
  constructor(
    private embedder: Embedder,
    private vectorStore: VectorStore,
    private bm25Scorer: BM25Scorer,
    private bm25IndexStore: BM25IndexStore,   // UB-3
    private vectorQueryProcessor: QueryProcessor,   // no synonyms — model handles semantics
    private bm25QueryProcessor: QueryProcessor,     // with synonym expansion for keyword branch
    private options: {
      vectorTopN: number;      // default 50
      bm25TopN: number;        // default 50
      rrfK: number;            // default 60
      maxResults: number;      // default 10
    }
  ) {}

  async search(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]> {
    // 1. Process query via vectorQueryProcessor for embedding (GoF-3)
    // 2. Process query via bm25QueryProcessor for BM25 scoring (GoF-3)
    // 3. Vector retrieval (embed → dot product → rank)
    // 4. BM25 retrieval (tokenize → score → rank)
    // 5. Reciprocal Rank Fusion
    // 6. Deduplication & rollup
    // 7. Return top N results
  }
}
```

### 6.6 Full Search Flow

```text
1. QUERY PROCESSING (via two composable step chains — §7)
   a. Vector branch: vectorQueryProcessor (LowercaseStep → StopwordStep)
   b. BM25 branch: bm25QueryProcessor (LowercaseStep → StopwordStep → SynonymStep)
   c. Embed the vector-cleaned query → 384-dim vector (~10ms)
   d. L2-normalize the query vector (GH-3)

2. VECTOR RETRIEVAL (top 50)
   a. Load all passage-level embeddings from VectorStore
   b. Compute dot product against L2-normalized query vector (GH-3)
   c. Sort by similarity descending → vector_rankings

3. BM25 RETRIEVAL (top 50)
   a. Tokenize query (with synonym-expanded terms)
   b. For each passage chunk, compute BM25 score
   c. Sort by BM25 score descending → bm25_rankings

4. RECIPROCAL RANK FUSION
   a. Merge vector_rankings and bm25_rankings via RRF
   b. Sort by RRF score descending

5. DEDUPLICATION & ROLLUP
   a. If multiple passages from the same chapter, keep best passage
   b. Attach section heading and passage offsets

6. RETURN top N results with passage-level context

Total latency: <50ms (embedding ~10ms, dot scan ~1.5ms, BM25 ~5ms, RRF ~1ms)
```

### 6.7 Fallback Chain — Chain of Responsibility (GoF-1)

The fallback cascade from v2.0 was prose-only. Here it is formalized as a
**Chain of Responsibility** pattern where each handler checks its capability
and delegates to the next handler if it cannot service the request:

```typescript
// src/core/search/ports/SearchHandler.ts
interface SearchHandler {
  canHandle(): boolean;
  search(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]>;
  setNext(handler: SearchHandler): SearchHandler;
}

// src/core/search/SearchHandlerChain.ts
class HybridSearchHandler implements SearchHandler {
  // Requires: embedder loaded + vectorStore populated + BM25 index ready
  // Produces: full RRF-fused results
  canHandle(): boolean { return this.embedder.isReady() && this.bm25IndexStore.getIndex("book_chunk") !== null; }
}

class BM25SearchHandler implements SearchHandler {
  // Requires: BM25 index ready (embeddings not needed)
  // Produces: BM25-only results with vectorRank = null
  canHandle(): boolean { return this.bm25IndexStore.getIndex("book_chunk") !== null; }
}

class LegacyKeywordHandler implements SearchHandler {
  // Always can handle — uses the current naive scoring
  // Produces: legacy results mapped to HybridSearchResult format
  canHandle(): boolean { return true; }
}

class EmptyResultHandler implements SearchHandler {
  // Terminal handler — returns empty results with error diagnostics
  canHandle(): boolean { return true; }
  search(): Promise<HybridSearchResult[]> { return Promise.resolve([]); }
}
```

**Chain construction (in composition root):**

```typescript
const chain = new HybridSearchHandler(engine)
  .setNext(new BM25SearchHandler(bm25Scorer, bm25IndexStore))
  .setNext(new LegacyKeywordHandler(bookRepository))
  .setNext(new EmptyResultHandler());
```

Each handler is independently unit-testable. The chain order is explicit.
The system **never breaks** — it degrades gracefully through the chain.

---

## 7. Query Processing — Composable Step Chain (GoF-3)

The `QueryProcessor` from v2.0 bundled stopword removal, synonym expansion, and
lowercasing into a single class. Per the audit, this violates SRP and prevents
independent testing/swapping of each strategy.

### 7.1 QueryProcessingStep Interface

```typescript
// src/core/search/ports/QueryProcessingStep.ts
interface QueryProcessingStep {
  process(tokens: string[]): string[];
  readonly name: string;  // for logging/debugging
}
```

### 7.2 Concrete Steps

```typescript
class LowercaseStep implements QueryProcessingStep {
  readonly name = "lowercase";
  process(tokens: string[]): string[] {
    return tokens.map(t => t.toLowerCase());
  }
}

class StopwordStep implements QueryProcessingStep {
  readonly name = "stopword";
  constructor(private stopwords: Set<string>) {}
  process(tokens: string[]): string[] {
    return tokens.filter(t => !this.stopwords.has(t));
  }
}

class SynonymStep implements QueryProcessingStep {
  readonly name = "synonym";
  constructor(private synonyms: Record<string, string[]>) {}
  process(tokens: string[]): string[] {
    return tokens.flatMap(t => [t, ...(this.synonyms[t] ?? [])]);
  }
}
```

### 7.3 QueryProcessor as Pipeline Compositor

```typescript
// src/core/search/QueryProcessor.ts
class QueryProcessor {
  constructor(private steps: QueryProcessingStep[]) {}

  /** Run all steps in order */
  process(query: string): string[] {
    let tokens = query.split(/\s+/).filter(Boolean);
    for (const step of this.steps) {
      tokens = step.process(tokens);
    }
    return tokens;
  }
}
```

**Pipeline construction:**

```typescript
// For BM25 branch (with synonyms):
const bm25Processor = new QueryProcessor([
  new LowercaseStep(),
  new StopwordStep(STOPWORDS),
  new SynonymStep(SYNONYMS),
]);

// For vector branch (no synonyms — model handles semantics natively):
const vectorProcessor = new QueryProcessor([
  new LowercaseStep(),
  new StopwordStep(STOPWORDS),
]);
```

Each step is a Strategy (GoF) — independently testable, independently swappable.
Adding a new step (e.g., `SpellingCorrectionStep`) requires zero changes to
existing code.

### 7.4 Processing Pipeline Example

| Step | Example |
| --- | --- |
| Original | "What are the best UX design heuristics?" |
| Lowercased | "what are the best ux design heuristics?" |
| Stopwords removed | "best ux design heuristics" |
| For BM25: Synonym expansion | "best ux user experience usability design heuristics" |
| For Vector: Original cleaned text | "best ux design heuristics" (model handles semantics natively) |

### 7.5 Synonym Map (Domain-Specific, Hand-Curated)

Applied to the **BM25 branch only.** The embedding model already understands
semantic similarity — adding synonyms to the embedding input would dilute the
query vector.

```typescript
const SYNONYMS: Record<string, string[]> = {
  "ux":         ["user experience", "usability"],
  "ui":         ["user interface", "interface design"],
  "a11y":       ["accessibility", "accessible"],
  "sdlc":       ["software development lifecycle", "development process"],
  "api":        ["application programming interface", "endpoint"],
  "ci/cd":      ["continuous integration", "continuous deployment", "devops"],
  "ci":         ["continuous integration"],
  "cd":         ["continuous deployment", "continuous delivery"],
  "seo":        ["search engine optimization"],
  "responsive": ["responsive design", "mobile-first", "adaptive layout"],
  "agile":      ["scrum", "sprint", "kanban", "iterative"],
  "oop":        ["object-oriented programming", "object oriented"],
  "solid":      ["single responsibility", "open closed", "liskov", "interface segregation", "dependency inversion"],
  "tdd":        ["test driven development", "test-driven"],
  "mvp":        ["minimum viable product"],
  "cta":        ["call to action"],
  "kpi":        ["key performance indicator"],
  "roi":        ["return on investment"],
  "wcag":       ["web content accessibility guidelines"],
  "aria":       ["accessible rich internet applications"],
  "hci":        ["human computer interaction"],
  // ... ~40-60 entries total for domain coverage
};
```

### 7.6 Stopword List

Standard English stopwords plus domain noise words:

```typescript
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you",
  "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself",
  "she", "her", "hers", "herself", "it", "its", "itself", "they", "them",
  "their", "theirs", "themselves", "am", "about", "up", "just", "but",
  "and", "or", "if", "because", "until", "while",
  // Domain noise
  "book", "chapter", "section", "page", "tell", "explain", "describe",
  "show", "find", "search", "look", "want", "know", "think", "say",
]);
```

---

## 8. Result Format

```typescript
interface HybridSearchResult {
  // Identity
  bookTitle: string;
  bookNumber: string;
  bookSlug: string;
  chapterTitle: string;
  chapterSlug: string;

  // Scoring
  rrfScore: number;                 // Reciprocal Rank Fusion score
  vectorRank: number | null;        // rank in vector results (null if not in top 50)
  bm25Rank: number | null;          // rank in BM25 results (null if not in top 50)
  relevance: "high" | "medium" | "low";  // derived from rrfScore thresholds

  // Passage context
  matchPassage: string;             // the actual chunk text (~200-400 words)
  matchSection: string | null;      // heading of the section containing the match
  matchHighlight: string;           // passage with query terms wrapped in **bold**
  passageOffset: {                  // char offsets in original chapter for deep linking
    start: number;
    end: number;
  };
}
```

**Relevance thresholds** (tunable after live testing):

| Relevance | Condition |
| --- | --- |
| `"high"` | Top 3 results OR rrfScore > 0.03 |
| `"medium"` | Ranks 4-7 OR rrfScore > 0.02 |
| `"low"` | Everything else above minimum threshold |

---

## 9. Build-Time Pipeline

### 9.1 Script: `scripts/build-search-index.ts`

```text
1. Load the embedding model (first run downloads ~23MB ONNX, cached after)
2. Check model version against stored model_version in embeddings table (GH-4)
   a. If model changed → force full rebuild (all embeddings are stale)
3. Load all chapters via FileSystemBookRepository
4. For each chapter:
   a. Delegate to ChangeDetector.hasChanged(sourceId, hash) (UB-2)
   b. If unchanged AND model matches, skip
   c. Chunk via MarkdownChunker (heading-aware recursive splitting)
   d. Transform embedding input (§3.8 rules) (GB-2)
   e. Embed all chunks (batched, ~10ms each)
   f. L2-normalize each embedding vector (GH-3)
   g. Upsert into SQLiteVectorStore with modelVersion
5. Delegate orphan detection to ChangeDetector.findOrphaned() (UB-2)
6. Rebuild BM25 index and persist via BM25IndexStore (UB-3)
7. EMBEDDING QUALITY VALIDATION (GH-1)
   a. Embed 5-10 known semantic pairs from the corpus:
      - ("WCAG contrast ratios", "accessibility color guidelines") → expect sim > 0.7
      - ("responsive breakpoints", "Agile sprint planning") → expect sim < 0.3
   b. If any pair fails threshold → WARN (build continues, logged for investigation)
   c. If >50% pairs fail → ABORT build, likely model corruption
8. Print stats:
     Chapters: 104 (3 new, 2 updated, 99 unchanged)
     Chunks: 2024 total (45 re-embedded)
     Model: all-MiniLM-L6-v2@1.0 (unchanged)
     Quality: 5/5 pairs passed (sim range 0.43-0.63 similar, 0.02-0.20 dissimilar)
     Time: 8.3s (incremental) / 45s (full rebuild)
```

#### Embedding Quality Validation Detail (GH-1)

```typescript
interface ValidationPair {
  textA: string;
  textB: string;
  expectedSimilar: boolean;     // true = should be similar, false = should be dissimilar
}

const VALIDATION_PAIRS: ValidationPair[] = [
  { textA: "WCAG accessibility guidelines for color contrast", textB: "ensuring sufficient contrast ratios for visually impaired users", expectedSimilar: true },
  { textA: "responsive mobile web design with media queries", textB: "adaptive layout using CSS breakpoints for different screen sizes", expectedSimilar: true },
  { textA: "user experience heuristic evaluation methods", textB: "UX usability principles for interface design", expectedSimilar: true },
  { textA: "agile sprint planning and backlog refinement", textB: "SQL database normalization and indexing strategies", expectedSimilar: false },
  { textA: "CSS flexbox alignment and grid layout", textB: "project management methodology and risk assessment", expectedSimilar: false },
];

async function validateEmbeddingQuality(embedder: Embedder): Promise<{ passed: number; failed: number; details: string[] }> {
  const SIMILAR_THRESHOLD = 0.35;
  const DISSIMILAR_THRESHOLD = 0.2;
  // Embed pairs, compute dot product (L2-normalized), check thresholds
  // Note: all-MiniLM-L6-v2 produces lower raw cosine similarity on short
  // phrases than larger models. Longer validation phrases and calibrated
  // thresholds ensure reliable pass/fail discrimination while still
  // catching model corruption or loading errors.
}
```

### 9.2 Incremental Updates

The build script is **incremental by default.** Change detection is delegated
to `ChangeDetector` (UB-2):

```typescript
// ChangeDetector handles hash comparison (UB-2)
const changeDetector = new ChangeDetector(vectorStore);
const needsReindex = changeDetector.hasChanged(sourceId, sha256(content));
```

**Performance impact:**

| Scenario | Time |
| --- | --- |
| Full rebuild (first run, 104 chapters) | ~45-60 seconds |
| Incremental (1 chapter changed) | ~1-2 seconds |
| Incremental (nothing changed) | ~0.5 seconds (hash checks only) |

### 9.3 Integration with Build

```json
{
  "scripts": {
    "build:search-index": "tsx scripts/build-search-index.ts",
    "build:search-index:force": "tsx scripts/build-search-index.ts --force",
    "prebuild": "npm run build:search-index"
  }
}
```

- `npm run build:search-index` — Incremental rebuild (default)
- `npm run build:search-index:force` — Full rebuild (ignore hashes)
- Runs automatically before `next build` via `prebuild` hook

### 9.4 Git and Deployment

- Embeddings live in `.data/local.db` (already gitignored)
- CI/CD runs the build script to generate fresh embeddings
- No separate artifact file — everything in the existing SQLite database

---

## 10. On-Demand Embedding API

### 10.1 Runtime Embedding for New Content

When a book chapter is added or edited, the system should re-embed it without
requiring a full rebuild. The `EmbeddingPipeline.indexDocument()` method
supports this natively — it's the same code path the build script uses, just
triggered at runtime instead of build time.

### 10.2 Integration Point

The composition root uses `EmbeddingPipelineFactory` (GoF-2) instead of manual
construction:

```typescript
// In tool-composition-root.ts
const MODEL_VERSION = "all-MiniLM-L6-v2@1.0";  // (GH-4)

export function getEmbeddingPipelineFactory(): EmbeddingPipelineFactory {
  if (!factory) {
    factory = new EmbeddingPipelineFactory(
      new LocalEmbedder(),           // loads ONNX model on first call
      new SQLiteVectorStore(getDb()),
      MODEL_VERSION,
    );
  }
  return factory;
}

// Caller specifies intent, factory selects chunker:
export function getBookPipeline(): EmbeddingPipeline {
  return getEmbeddingPipelineFactory().createForSource("book_chunk");
}
```

### 10.3 Future: Conversation History Embedding

When conversation history management is implemented, the same pipeline embeds
messages:

```typescript
// Future — no implementation now, just showing the architecture fits
const pipeline = getEmbeddingPipelineFactory().createForSource("conversation");
await pipeline.indexDocument({
  sourceType: "conversation",
  sourceId: `conv-${conversationId}/msg-${messageId}`,
  content: messageContent,
  contentHash: sha256(messageContent),
  metadata: { sourceType: "conversation", conversationId, userId, role: "user", turnIndex: 0 } as ConversationMetadata,
});
```

The `VectorStore` query filters by `sourceType`:
- `search_books` queries `sourceType = "book_chunk"`
- Future conversation search queries `sourceType = "conversation"`
- Cross-source search queries both

---

## 11. MCP Embedding Server

### 11.1 Purpose

An MCP server that exposes embedding operations over stdio transport — the same
pattern as the existing `mcp/calculator-server.ts`. This gives:

- **CLI access** for manual index operations
- **External tool access** for any MCP-compatible client
- **Decoupled embedding** — CPU-intensive embedding doesn't block web requests
- **Reusable infrastructure** — same tools for books, conversations, any future
  content

### 11.2 MCP Tools

| Tool | Description | Input |
| --- | --- | --- |
| `embed_text` | Embed arbitrary text, return the vector | `{text: string}` |
| `embed_document` | Chunk and embed a document into the vector store | `{source_type, source_id, content}` |
| `search_similar` | Vector similarity search | `{query: string, source_type?, limit?}` |
| `rebuild_index` | Full or incremental rebuild for a source type | `{source_type, force?}` |
| `get_index_stats` | Embedding counts, staleness, coverage | `{source_type?}` |
| `delete_embeddings` | Remove embeddings for a specific source | `{source_id}` |

### 11.3 Server Structure

```typescript
// mcp/embedding-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Tools defined following MCP specification
// Each tool delegates to EmbeddingPipeline, VectorStore, or Embedder
// The server is a thin transport layer — all logic lives in core/adapters
```

### 11.4 Package Script

```json
{
  "scripts": {
    "mcp:embeddings": "tsx mcp/embedding-server.ts"
  }
}
```

---

## 12. File Plan

### New Files

| File | Layer | Purpose |
| --- | --- | --- |
| **Core — Ports** | | |
| `src/core/search/ports/Chunker.ts` | Core | `Chunker` interface + `ChunkMetadata` discriminated union (GB-1) |
| `src/core/search/ports/Embedder.ts` | Core | `Embedder` interface — text → vector |
| `src/core/search/ports/VectorStore.ts` | Core | `VectorStore` interface — storage & retrieval |
| `src/core/search/ports/BM25IndexStore.ts` | Core | `BM25IndexStore` interface — BM25 stats persistence (UB-3) |
| `src/core/search/ports/SearchHandler.ts` | Core | `SearchHandler` interface — Chain of Responsibility (GoF-1) |
| `src/core/search/ports/QueryProcessingStep.ts` | Core | `QueryProcessingStep` interface — composable pipeline (GoF-3) |
| **Core — Engine** | | |
| `src/core/search/ChangeDetector.ts` | Core | Content hash comparison, orphan detection (UB-2) |
| `src/core/search/EmbeddingPipeline.ts` | Core | Orchestrates chunk → embed → normalize → store |
| `src/core/search/EmbeddingPipelineFactory.ts` | Core | Factory for pipeline construction (GoF-2) |
| `src/core/search/EmbeddingValidator.ts` | Core | Build-time embedding quality validation (GH-1) |
| `src/core/search/HybridSearchEngine.ts` | Core | BM25 + vector + RRF fusion (GB-3 constructor) |
| `src/core/search/SearchHandlerChain.ts` | Core | Chain of Responsibility impl (GoF-1) |
| `src/core/search/BM25Scorer.ts` | Core | Okapi BM25 implementation |
| `src/core/search/dotSimilarity.ts` | Core | Pure math — dot product for L2-normalized vectors (GH-3) |
| `src/core/search/l2Normalize.ts` | Core | Pure math — vector normalization (GH-3) |
| `src/core/search/MarkdownChunker.ts` | Core | Heading-aware recursive markdown splitter (UB-1: moved from Adapters) |
| `src/core/search/QueryProcessor.ts` | Core | Composable step pipeline compositor (GoF-3) |
| `src/core/search/query-steps/LowercaseStep.ts` | Core | Lowercase token processing step (GoF-3) |
| `src/core/search/query-steps/StopwordStep.ts` | Core | Stopword removal step (GoF-3) |
| `src/core/search/query-steps/SynonymStep.ts` | Core | Synonym expansion step (GoF-3) |
| `src/core/search/ReciprocalRankFusion.ts` | Core | RRF score computation |
| `src/core/search/types.ts` | Core | `HybridSearchResult`, `EmbeddingRecord`, shared types |
| **Adapters** | | |
| `src/adapters/LocalEmbedder.ts` | Adapter | `@huggingface/transformers` ONNX wrapper |
| `src/adapters/SQLiteVectorStore.ts` | Adapter | BLOB storage in `better-sqlite3` |
| `src/adapters/SQLiteBM25IndexStore.ts` | Adapter | BM25 stats persistence in SQLite (UB-3) |
| `src/adapters/InMemoryVectorStore.ts` | Adapter | Test double for `VectorStore` |
| `src/adapters/InMemoryBM25IndexStore.ts` | Adapter | Test double for `BM25IndexStore` |
| **Scripts & MCP** | | |
| `scripts/build-search-index.ts` | Script | Build-time incremental embedding pipeline |
| `mcp/embedding-server.ts` | MCP | Stdio MCP server for embedding operations |

### Modified Files

| File | Change |
| --- | --- |
| `src/core/use-cases/LibrarySearchInteractor.ts` | Accept optional `HybridSearchEngine`; delegate when available |
| `src/core/use-cases/tools/BookTools.ts` | `SearchBooksCommand` returns `HybridSearchResult` fields |
| `src/lib/chat/tool-composition-root.ts` | Wire via `EmbeddingPipelineFactory` (GoF-2), construct `SearchHandlerChain` (GoF-1) |
| `src/core/tool-registry/ToolResultFormatter.ts` | Format new result fields (`matchPassage`, `matchSection`, `matchHighlight`) |
| `src/lib/db/schema.ts` | Add `embeddings` table (with `model_version`) + `bm25_stats` table to `ensureSchema()` |
| `package.json` | Add `@huggingface/transformers`, new scripts |

### Dependency Direction (Verified)

```text
Core (ZERO infra imports):
  ports/Chunker.ts              — interface + ChunkMetadata union (GB-1)
  ports/Embedder.ts             — interface only
  ports/VectorStore.ts          — interface only
  ports/BM25IndexStore.ts       — interface only (UB-3)
  ports/SearchHandler.ts        — interface only (GoF-1)
  ports/QueryProcessingStep.ts  — interface only (GoF-3)
  ChangeDetector.ts             — depends only on VectorStore port (UB-2)
  EmbeddingPipeline.ts          — depends on ports + ChangeDetector
  EmbeddingPipelineFactory.ts   — depends on ports + pipeline (GoF-2)
  EmbeddingValidator.ts         — depends on Embedder port only (GH-1)
  HybridSearchEngine.ts         — depends on ports + pure math
  SearchHandlerChain.ts         — depends on SearchHandler port (GoF-1)
  BM25Scorer.ts                 — pure math + Map<string, number>
  dotSimilarity.ts              — pure math (Float32Array → number) (GH-3)
  l2Normalize.ts                — pure math (Float32Array → Float32Array) (GH-3)
  MarkdownChunker.ts            — pure string processing (UB-1: in Core, not Adapters)
  QueryProcessor.ts             — composes QueryProcessingStep chain (GoF-3)
  query-steps/*.ts              — pure string processing (GoF-3)
  ReciprocalRankFusion.ts       — pure math

Adapters:
  LocalEmbedder                 → imports @huggingface/transformers
  SQLiteVectorStore             → imports better-sqlite3
  SQLiteBM25IndexStore          → imports better-sqlite3 (UB-3)
  InMemoryVectorStore           → no imports
  InMemoryBM25IndexStore        → no imports

Composition Root:
  tool-composition-root.ts → wires adapters into core
```

### New Dependencies

| Package | Size | License | Purpose |
| --- | --- | --- | --- |
| `@huggingface/transformers` | ~25MB (ONNX model downloaded on first use, cached in `~/.cache/`) | Apache 2.0 | Local sentence embeddings — `all-MiniLM-L6-v2` |

No other new dependencies. BM25, RRF, cosine similarity are all implemented
from scratch (each is <50 lines of code).

---

## 13. Requirement IDs

### Functional — Search Quality

| ID | Requirement |
| --- | --- |
| VSEARCH-01 | Semantic queries return relevant results even without keyword overlap ("user experience" → UX chapters) |
| VSEARCH-02 | "UX" finds chapters about "user experience" and "usability" via vector similarity |
| VSEARCH-03 | BM25 scoring replaces naive flat-point keyword scoring |
| VSEARCH-04 | Hybrid search uses Reciprocal Rank Fusion to combine vector and BM25 rankings |
| VSEARCH-05 | Results include passage-level match context (200-400 words, not 300-char snippets) |
| VSEARCH-06 | Results include the section heading where the match occurred |
| VSEARCH-07 | Match highlights wrap query terms in `**bold**` markers |
| VSEARCH-08 | Synonym expansion improves BM25 branch for domain abbreviations (a11y, SDLC, etc.) |
| VSEARCH-09 | Stopwords are removed before both BM25 and embedding |
| VSEARCH-10 | Typos partially tolerated via vector similarity ("accessiblity" → accessibility content) |
| VSEARCH-11 | Search completes in <50ms for any query (all data in SQLite/memory) |

### Functional — Chunking

| ID | Requirement |
| --- | --- |
| VSEARCH-12 | Chunks split on markdown heading boundaries, not mid-paragraph |
| VSEARCH-13 | Code blocks, lists, blockquotes, and tables are never split |
| VSEARCH-14 | Each chunk is prefixed with enriched contextual path before embedding (`Book: Chapter. FirstSentence > Section > text` — see §3.3) |
| VSEARCH-15 | Chunks are 200-400 words (soft target), max 500 words (hard cap) |
| VSEARCH-16 | Chunks below 50 words are merged with the previous chunk |

### Functional — Storage & Indexing

| ID | Requirement |
| --- | --- |
| VSEARCH-17 | Embeddings stored as Float32Array BLOBs in SQLite `embeddings` table |
| VSEARCH-18 | Build script is incremental — only re-embeds chapters whose content hash changed |
| VSEARCH-19 | Full rebuild of 104 chapters completes in <120 seconds |
| VSEARCH-20 | Incremental rebuild (1 chapter changed) completes in <5 seconds |
| VSEARCH-21 | Orphaned embeddings (deleted chapters) are cleaned up on rebuild |

### Functional — On-Demand & Multi-Source

| ID | Requirement |
| --- | --- |
| VSEARCH-22 | `EmbeddingPipeline.indexDocument()` embeds a single document at runtime |
| VSEARCH-23 | `source_type` discriminator allows multiple content types in the same table |
| VSEARCH-24 | Search can filter by `source_type` (e.g., books only, conversations only, or all) |
| VSEARCH-25 | Adding a new source type requires only a new `Chunker` implementation — no pipeline changes |

### Fallback & Resilience

| ID | Requirement |
| --- | --- |
| VSEARCH-26 | If embedding model fails to load, search falls back to BM25-only |
| VSEARCH-27 | If BM25 index is unavailable, search falls back to legacy keyword scoring |
| VSEARCH-28 | If embeddings table is empty, search falls back to legacy keyword scoring |
| VSEARCH-29 | Fallback path returns same result format (HybridSearchResult) with null ranks |

### MCP Server

| ID | Requirement |
| --- | --- |
| VSEARCH-30 | MCP embedding server exposes `embed_text` tool |
| VSEARCH-31 | MCP embedding server exposes `embed_document` tool (chunk + embed + store) |
| VSEARCH-32 | MCP embedding server exposes `search_similar` tool |
| VSEARCH-33 | MCP embedding server exposes `rebuild_index` tool |
| VSEARCH-34 | MCP embedding server exposes `get_index_stats` tool |

### Architectural

| ID | Requirement |
| --- | --- |
| VSEARCH-35 | `src/core/search/` has zero imports from `src/adapters/` or `src/lib/` |
| VSEARCH-36 | `HybridSearchEngine` depends only on ports, not concrete implementations |
| VSEARCH-37 | `BM25Scorer` and `dotSimilarity` are pure functions with no side effects |
| VSEARCH-38 | Existing `search_books` API contract unchanged — enhanced results are additive |
| VSEARCH-39 | All existing search tests continue to pass (backward compatibility) |
| VSEARCH-40 | `VectorStore` port is swappable — SQLite today, `sqlite-vec` at 50K+ vectors |

### Audit-Hardened (v2.1)

| ID | Requirement | Audit Issue |
| --- | --- | --- |
| VSEARCH-41 | `MarkdownChunker` resides in `src/core/search/`, not `src/adapters/` (zero external imports) | UB-1 |
| VSEARCH-42 | `ChangeDetector` is a separate class from `EmbeddingPipeline`; pipeline delegates hash checks | UB-2 |
| VSEARCH-43 | `BM25IndexStore` port exists in `src/core/search/ports/` with `getIndex`, `saveIndex`, `isStale` | UB-3 |
| VSEARCH-44 | Fallback uses Chain of Responsibility: `HybridSearchHandler → BM25SearchHandler → LegacyKeywordHandler → EmptyResultHandler` | GoF-1 |
| VSEARCH-45 | `EmbeddingPipelineFactory` constructs pipelines; no manual `new EmbeddingPipeline()` in composition root | GoF-2 |
| VSEARCH-46 | `QueryProcessor` is a compositor over `QueryProcessingStep[]`; each step is independently testable | GoF-3 |
| VSEARCH-47 | `Chunk.metadata` uses `ChunkMetadata` discriminated union (`BookChunkMetadata \| ConversationMetadata`), not `Record<string, unknown>` | GB-1 |
| VSEARCH-48 | Embedding input transformation is explicit: strip markdown, remove code blocks, normalize whitespace, prepend prefix | GB-2 |
| VSEARCH-49 | `HybridSearchEngine` constructor signature declares all dependencies explicitly (embedder, vectorStore, bm25Scorer, bm25IndexStore, vectorQueryProcessor, bm25QueryProcessor, options) | GB-3 |
| VSEARCH-50 | Build-time validation embeds known pairs and asserts similarity thresholds (>=0.35 similar, <=0.2 dissimilar) — calibrated to `all-MiniLM-L6-v2` on descriptive phrases | GH-1 |
| VSEARCH-51 | Contextual prefix includes semantic summary (chapter title + first sentence), not just navigation path | GH-2 |
| VSEARCH-52 | All embeddings are L2-normalized before storage; vector similarity uses dot product | GH-3 |
| VSEARCH-53 | `embeddings` table includes `model_version` column; model change triggers full rebuild | GH-4 |

---

## 14. Test Scenarios

```text
=== Search Quality ===
TEST-VS-01: "user experience" returns UX Design book chapters (vector match, no keyword "UX")
TEST-VS-02: "accessibility" returns high-quality results via both BM25 and vector branches
TEST-VS-03: Hybrid RRF: "responsive design" ranks results appearing in both branches above single-branch results
TEST-VS-04: Synonym expansion: "a11y" query → BM25 branch searches for "accessibility" + "accessible"
TEST-VS-05: Typo resilience: "accessiblity" still finds results via vector similarity
TEST-VS-06: BM25: rare term "heuristic" scores higher than common term "design" in same document
TEST-VS-07: BM25: long chapter with 1 mention of "usability" scores lower than short focused chapter

=== Chunking ===
TEST-VS-08: Markdown with ## headings → chunks split at heading boundaries
TEST-VS-09: Code block spanning 20 lines is never split across chunks
TEST-VS-10: Ordered list with 15 items stays as one chunk
TEST-VS-11: Chunk embedding input starts with "BookTitle: ChapterTitle. FirstSentence > SectionHeading > ..." (GH-2)
TEST-VS-12: 800-word section with no sub-headings → recursively split on paragraph breaks
TEST-VS-13: 30-word orphan paragraph → merged with previous chunk

=== Result Format ===
TEST-VS-14: Result includes matchPassage with 200-400 words (not 300-char snippet)
TEST-VS-15: Result includes matchSection heading
TEST-VS-16: matchHighlight contains **bold** markers around query terms
TEST-VS-17: Deduplication: 3 passages from same chapter → 1 result with best passage

=== Storage ===
TEST-VS-18: Float32Array → Buffer → Float32Array round-trip preserves all values
TEST-VS-19: SQLiteVectorStore.upsert() stores and retrieves embedding records
TEST-VS-20: SQLiteVectorStore.delete() removes all chunks for a source_id
TEST-VS-21: SQLiteVectorStore.getContentHash() returns stored hash for change detection

=== Incremental Updates ===
TEST-VS-22: Unchanged chapter (same hash) → skipped during rebuild (0 embeddings generated)
TEST-VS-23: Modified chapter (different hash) → old chunks deleted, new chunks created
TEST-VS-24: Deleted chapter → orphaned embeddings removed
TEST-VS-25: On-demand indexDocument() embeds a single chapter in <5 seconds

=== Fallback ===
TEST-VS-26: When embeddings table is empty → BM25-only results returned, no error
TEST-VS-27: When embedding model fails → BM25-only results returned, no error
TEST-VS-28: When BM25 index unavailable → legacy keyword scoring used, no error

=== RRF & Scoring ===
TEST-VS-29: RRF([rank 1 in A, rank 3 in B, k=60]) = 1/61 + 1/63 = 0.0323
TEST-VS-30: dotSimilarity([1,0,0], [1,0,0]) = 1.0 (L2-normalized, GH-3)
TEST-VS-31: dotSimilarity([1,0,0], [0,1,0]) = 0.0 (orthogonal, L2-normalized)
TEST-VS-32: BM25 with k1=1.2, b=0.75 matches reference implementation output

=== MCP Server ===
TEST-VS-33: embed_text returns 384-dimensional Float32Array
TEST-VS-34: embed_document chunks and stores embeddings in VectorStore
TEST-VS-35: search_similar returns ranked results for a query
TEST-VS-36: rebuild_index processes all chapters and reports stats
TEST-VS-37: get_index_stats returns counts by source_type and chunk_level

=== Multi-Source ===
TEST-VS-38: Embeddings with source_type "book_chunk" are separate from "conversation"
TEST-VS-39: Search with sourceType filter returns only matching source type
TEST-VS-40: Search without filter returns results across all source types

=== Audit-Hardened (v2.1) ===
TEST-VS-41: MarkdownChunker in src/core/search/ has zero imports from node_modules (UB-1)
TEST-VS-42: ChangeDetector.hasChanged() returns true for different hash, false for same hash (UB-2)
TEST-VS-43: ChangeDetector.findOrphaned() returns sourceIds present in store but absent from active set (UB-2)
TEST-VS-44: BM25IndexStore.saveIndex() persists and getIndex() retrieves BM25 statistics (UB-3)
TEST-VS-45: SearchHandlerChain delegates to BM25SearchHandler when embedder is unavailable (GoF-1)
TEST-VS-46: SearchHandlerChain delegates to LegacyKeywordHandler when BM25 index is unavailable (GoF-1)
TEST-VS-47: EmbeddingPipelineFactory.createForSource("book_chunk") returns pipeline with MarkdownChunker (GoF-2)
TEST-VS-48: LowercaseStep.process(["Hello", "WORLD"]) returns ["hello", "world"] (GoF-3)
TEST-VS-49: StopwordStep.process(["the", "best", "ux"]) returns ["best", "ux"] (GoF-3)
TEST-VS-50: SynonymStep.process(["ux"]) returns ["ux", "user experience", "usability"] (GoF-3)
TEST-VS-51: BookChunkMetadata includes bookSlug, chapterSlug, bookTitle, chapterFirstSentence (GB-1)
TEST-VS-52: transformForEmbedding() strips markdown, removes code blocks, normalizes whitespace (GB-2)
TEST-VS-53: HybridSearchEngine constructor requires all 7 dependencies (embedder, vectorStore, bm25Scorer, bm25IndexStore, vectorQueryProcessor, bm25QueryProcessor, options) (GB-3)
TEST-VS-54: validateEmbeddingQuality() passes for known semantic pairs (sim > 0.7) (GH-1)
TEST-VS-55: validateEmbeddingQuality() fails for dissimilar pairs exceeding threshold (GH-1)
TEST-VS-56: Contextual prefix includes chapter first sentence, not just title (GH-2)
TEST-VS-57: l2Normalize([3,4,0,...]) produces unit vector [0.6, 0.8, 0,...] (GH-3)
TEST-VS-58: dotSimilarity of two L2-normalized identical vectors = 1.0 (GH-3)
TEST-VS-59: Model version mismatch in embeddings table triggers full rebuild (GH-4)
TEST-VS-60: New embeddings stored with current model_version string (GH-4)
```

---

## 15. Migration Strategy

### Phase 1 — Core Infrastructure (No Runtime Changes)

Build the foundation. No changes to the running application.

1. Create core ports: `Chunker` (with `ChunkMetadata` union), `Embedder`, `VectorStore`, `BM25IndexStore`, `SearchHandler`, `QueryProcessingStep`
2. Implement `dotSimilarity`, `l2Normalize`, `BM25Scorer`, `ReciprocalRankFusion` (pure math)
3. Implement `InMemoryVectorStore`, `InMemoryBM25IndexStore` (test doubles)
4. Unit tests for all pure functions

### Phase 2 — Chunking & Storage

5. Implement `MarkdownChunker` (in `src/core/search/`, not adapters — UB-1) with `transformForEmbedding` (GB-2)
6. Add `embeddings` table (with `model_version` column — GH-4) to SQLite schema
7. Implement `SQLiteVectorStore`, `SQLiteBM25IndexStore`
8. Unit tests for chunking edge cases, BLOB round-trips, and L2 normalization (GH-3)

### Phase 3 — Embedding Pipeline

9. Implement `LocalEmbedder` (ONNX model wrapper)
10. Implement `ChangeDetector` (UB-2), `EmbeddingPipeline`, `EmbeddingPipelineFactory` (GoF-2)
11. Implement `EmbeddingValidator` (GH-1) for build-time quality checks
12. Create `scripts/build-search-index.ts` with validation step
13. Run against real content — verify chunk counts, embedding quality, L2 norms

### Phase 4 — Hybrid Search Engine

14. Implement `HybridSearchEngine` with explicit constructor (GB-3)
15. Implement composable query steps: `LowercaseStep`, `StopwordStep`, `SynonymStep` (GoF-3)
16. Implement `QueryProcessor` as step compositor
17. Implement `SearchHandlerChain` with Chain of Responsibility (GoF-1)
18. Wire into `LibrarySearchInteractor` as optional enhancer
19. Integration tests with real embeddings

### Phase 5 — Tool Integration

20. Update `SearchBooksCommand` result format
21. Update `ToolResultFormatter` for new fields
22. Wire everything in `tool-composition-root.ts` via `EmbeddingPipelineFactory` (GoF-2)
23. End-to-end test: chat → search_books → hybrid results

### Phase 6 — MCP Server

24. Create `mcp/embedding-server.ts`
25. Expose embed_text, embed_document, search_similar, rebuild_index, get_index_stats
26. Integration tests via stdio transport

Each phase is independently deployable. The search tool works at every stage,
degrading gracefully:

```text
Phase 5+ → Full hybrid (BM25 + Vector + RRF)
Phase 4  → Hybrid search works but not wired to tool
Phase 3  → Embeddings exist but search unchanged
Phase 2  → Storage ready, no embeddings yet
Phase 1  → Pure math functions, no runtime impact
Phase 0  → Current keyword-only search (unchanged)
```

---

## 16. Resolved Questions (from v1.0 and v2.0 audit)

| Question | Resolution |
| --- | --- |
| Embed full text or processed? | **Processed with enriched context prefix.** Strip markdown formatting (§3.8), prepend `Book: Chapter. FirstSentence > Section >` path (GH-2). This gives the model both domain context and clean content. |
| Synonyms for embedding query? | **No.** The embedding model handles semantic similarity natively. Synonyms are BM25-only — adding them to the embedding input dilutes the query vector. |
| Float32 or Int8 quantization? | **Float32.** At <3MB total, the size difference is negligible. Float32 avoids quantization error and simplifies the code. |
| Expose vector score to LLM? | **Expose RRF score and ranks.** The LLM gets `rrfScore`, `vectorRank`, and `bm25Rank` — enough to assess confidence without raw cosine values. |
| JSON file or database? | **SQLite.** Enables incremental updates, concurrent access, multi-source storage, and avoids parsing 3MB JSON on startup. |
| Sliding window or structure-aware? | **Structure-aware.** Markdown-boundary chunking produces coherent passages. No overlap needed because chunks are semantically complete units. |
| Linear score blend or RRF? | **RRF.** Rank-based fusion is more robust than score normalization. No α/β weights to tune. Industry standard. |
| Cosine or dot product? | **Dot product on L2-normalized vectors** (GH-3). Mathematically identical to cosine but ~30% faster (no norm computation at query time). |
| Should MarkdownChunker be an Adapter? | **No — Core** (UB-1). It has zero external imports; pure string processing belongs in `src/core/search/`. |
| Model version tracking? | **`model_version` column + full rebuild on mismatch** (GH-4). Prevents stale vector comparisons across model upgrades. |
| Metadata typing? | **Discriminated union** (GB-1). `BookChunkMetadata \| ConversationMetadata` keyed on `sourceType`. Eliminates `Record<string, unknown>`. |
| Fallback pattern? | **Chain of Responsibility** (GoF-1). Four handlers in sequence, each independently testable. Replaces prose-only spec. |
| Query processing design? | **Composable step chain** (GoF-3). `LowercaseStep → StopwordStep → SynonymStep`. Each step is a Strategy, independently swappable. |
| BM25 index storage? | **`BM25IndexStore` port** (UB-3) with `SQLiteBM25IndexStore` adapter. Compute in-memory on startup (~100ms for 2000 docs), persist to SQLite for durability, recompute after any index change. |

---

## 17. Open Questions

1. **Embedding model warm-up:** The ONNX model takes ~2-3 seconds to load on
   first inference. Recommend lazy-load with a cache — first search pays the
   2-3s penalty, all subsequent searches are instant.

2. **MCP server vs. API route for on-demand embedding:** Should on-demand
   embedding (when a chapter changes) go through the MCP server or be a direct
   function call in the Next.js process? For the build script and CLI, MCP
   makes sense. For runtime hot-reload, a direct function call avoids the
   stdio transport overhead. Recommend both paths share the same
   `EmbeddingPipeline` core.

3. **Conversation chunking strategy:** When conversation history embedding is
   implemented, how should messages be chunked? Options: (a) one embedding per
   message, (b) sliding window over conversation turns, (c) topic-segmented
   chunks. This is deferred to the conversation history spec — the pipeline
   architecture supports any strategy via a new `Chunker` implementation.

4. **Cross-source search ranking:** When searching across book content AND
   conversation history simultaneously, should results be interleaved by RRF
   score, or grouped by source type? Recommend interleaved — the user wants
   the most relevant result regardless of source.

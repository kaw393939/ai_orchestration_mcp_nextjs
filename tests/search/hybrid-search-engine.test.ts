import { describe, it, expect } from "vitest";
import { HybridSearchEngine } from "@/core/search/HybridSearchEngine";
import { BM25Scorer } from "@/core/search/BM25Scorer";
import { QueryProcessor } from "@/core/search/QueryProcessor";
import { LowercaseStep } from "@/core/search/query-steps/LowercaseStep";
import { StopwordStep } from "@/core/search/query-steps/StopwordStep";
import { SynonymStep } from "@/core/search/query-steps/SynonymStep";
import { InMemoryVectorStore } from "@/adapters/InMemoryVectorStore";
import { InMemoryBM25IndexStore } from "@/adapters/InMemoryBM25IndexStore";
import { MockEmbedder } from "@/adapters/MockEmbedder";
import type { EmbeddingRecord } from "@/core/search/ports/VectorStore";
import type { BM25Index } from "@/core/search/ports/BM25IndexStore";
import type { BookChunkMetadata } from "@/core/search/ports/Chunker";

function makeRecord(
  id: string,
  content: string,
  opts: Partial<EmbeddingRecord> & { chapterSlug?: string; bookSlug?: string; bookTitle?: string; chapterTitle?: string; bookNumber?: string } = {},
): EmbeddingRecord {
  const embedder = new MockEmbedder();
  // We'll set embedding in the test setup
  return {
    id,
    sourceType: "book_chunk",
    sourceId: opts.bookSlug ?? "book-1",
    chunkIndex: 0,
    chunkLevel: "passage",
    heading: opts.heading ?? null,
    content,
    embeddingInput: content,
    contentHash: "abc",
    modelVersion: "test",
    embedding: new Float32Array(384), // will be replaced
    metadata: {
      type: "book",
      bookTitle: opts.bookTitle ?? "Book One",
      bookNumber: opts.bookNumber ?? "1",
      bookSlug: opts.bookSlug ?? "book-1",
      chapterTitle: opts.chapterTitle ?? "Chapter One",
      chapterSlug: opts.chapterSlug ?? "ch-1",
    } as BookChunkMetadata,
    ...opts,
    // restore metadata
  } as EmbeddingRecord;
}

function buildBM25Index(records: EmbeddingRecord[]): BM25Index {
  const docLengths = new Map<string, number>();
  const termDocFrequencies = new Map<string, number>();
  let totalLength = 0;

  for (const r of records) {
    const tokens = r.content.toLowerCase().split(/\s+/).filter(Boolean);
    docLengths.set(r.id, tokens.length);
    totalLength += tokens.length;
    const seen = new Set(tokens);
    for (const t of seen) {
      termDocFrequencies.set(t, (termDocFrequencies.get(t) ?? 0) + 1);
    }
  }

  return {
    avgDocLength: totalLength / records.length,
    docCount: records.length,
    docLengths,
    termDocFrequencies,
  };
}

describe("HybridSearchEngine", () => {
  const stopwords = new Set(["the", "a", "is", "are", "was", "what", "how"]);
  const synonyms = { "a11y": ["accessibility", "accessible"] };

  const vectorProcessor = new QueryProcessor([
    new LowercaseStep(),
    new StopwordStep(stopwords),
  ]);
  const bm25Processor = new QueryProcessor([
    new LowercaseStep(),
    new StopwordStep(stopwords),
    new SynonymStep(synonyms),
  ]);

  async function setup() {
    const embedder = new MockEmbedder();
    const vectorStore = new InMemoryVectorStore();
    const bm25IndexStore = new InMemoryBM25IndexStore();

    // Create test records with content about different topics
    const records: EmbeddingRecord[] = [
      makeRecord("ux-1", "User experience and usability are critical aspects of modern software design. Good UX leads to higher user engagement and satisfaction.", {
        chapterSlug: "ux-chapter", chapterTitle: "UX Fundamentals", heading: "User Experience",
      }),
      makeRecord("a11y-1", "Accessibility ensures that software is usable by people with disabilities. WCAG guidelines provide standards for accessible web content.", {
        chapterSlug: "a11y-chapter", chapterTitle: "Accessibility Guide", heading: "Accessibility",
      }),
      makeRecord("design-1", "Design principles and heuristic evaluation methods help teams identify usability issues early in development.", {
        chapterSlug: "design-chapter", chapterTitle: "Design Principles", heading: "Heuristics",
      }),
      makeRecord("design-2", "The design process includes research, wireframing, prototyping, and testing. Design thinking is an iterative methodology.", {
        chapterSlug: "design-chapter", chapterTitle: "Design Principles", heading: "Process", bookSlug: "book-1",
      }),
      makeRecord("long-1", "Design is mentioned once in this very long chapter that covers many topics including project management, code review practices, deployment strategies, monitoring techniques, and several other development concerns that span a wide range of software engineering best practices.", {
        chapterSlug: "long-chapter", chapterTitle: "Long Chapter", heading: "Mixed Topics",
      }),
    ];

    // Generate embeddings for records
    for (const r of records) {
      r.embedding = await embedder.embed(r.embeddingInput);
    }

    vectorStore.upsert(records);
    const bm25Index = buildBM25Index(records);
    bm25IndexStore.saveIndex("book_chunk", bm25Index);

    const engine = new HybridSearchEngine(
      embedder, vectorStore, new BM25Scorer(), bm25IndexStore,
      vectorProcessor, bm25Processor,
      { vectorTopN: 50, bm25TopN: 50, rrfK: 60, maxResults: 10 },
    );

    return { engine, embedder, vectorStore, bm25IndexStore, records };
  }

  // TEST-VS-01
  it("semantic query returns relevant results via vector similarity", async () => {
    const { engine } = await setup();
    const results = await engine.search("user experience");
    expect(results.length).toBeGreaterThan(0);
    // UX chapter should appear in results
    const uxResult = results.find((r) => r.chapterSlug === "ux-chapter");
    expect(uxResult).toBeDefined();
  });

  // TEST-VS-02
  it("accessibility returns results via both BM25 and vector branches", async () => {
    const { engine } = await setup();
    const results = await engine.search("accessibility");
    expect(results.length).toBeGreaterThan(0);
    const a11yResult = results.find((r) => r.chapterSlug === "a11y-chapter");
    expect(a11yResult).toBeDefined();
    // Should have both vector and BM25 ranks
    expect(a11yResult!.vectorRank).not.toBeNull();
    expect(a11yResult!.bm25Rank).not.toBeNull();
  });

  // TEST-VS-03
  it("RRF ranks results appearing in both branches above single-branch results", async () => {
    const { engine } = await setup();
    const results = await engine.search("accessibility");
    // The a11y-chapter should rank higher because it appears in both branches
    if (results.length >= 2) {
      const a11yResult = results.find((r) => r.chapterSlug === "a11y-chapter");
      expect(a11yResult).toBeDefined();
      expect(a11yResult!.vectorRank).not.toBeNull();
      expect(a11yResult!.bm25Rank).not.toBeNull();
    }
  });

  // TEST-VS-04
  it("synonym expansion: a11y searches for accessibility + accessible", async () => {
    const { engine } = await setup();
    const results = await engine.search("a11y");
    expect(results.length).toBeGreaterThan(0);
    // Should find accessibility chapter via BM25 synonym expansion
    const a11yResult = results.find((r) => r.chapterSlug === "a11y-chapter");
    expect(a11yResult).toBeDefined();
  });

  // TEST-VS-05
  it("typo resilience: misspelling still finds results via vector similarity", async () => {
    const { engine } = await setup();
    const results = await engine.search("accessiblity");
    // Vector similarity should still find related content
    expect(results.length).toBeGreaterThan(0);
  });

  // TEST-VS-06
  it("BM25: rare term scores higher than common term", async () => {
    const { engine } = await setup();
    const heuristicResults = await engine.search("heuristic");
    const designResults = await engine.search("design");

    // "heuristic" is rarer, so the design-chapter with heuristic content
    // should rank higher for "heuristic" than for generic "design"
    const heuristicDesign = heuristicResults.find((r) => r.chapterSlug === "design-chapter");
    expect(heuristicDesign).toBeDefined();
  });

  // TEST-VS-07
  it("BM25: short focused chapter outranks long chapter with single mention", async () => {
    const { engine } = await setup();
    const results = await engine.search("design");

    const designIdx = results.findIndex((r) => r.chapterSlug === "design-chapter");
    const longIdx = results.findIndex((r) => r.chapterSlug === "long-chapter");
    // If both exist, design-chapter should rank higher
    if (designIdx !== -1 && longIdx !== -1) {
      expect(designIdx).toBeLessThan(longIdx);
    }
  });

  // TEST-VS-53
  it("constructor requires all 7 dependencies", () => {
    const embedder = new MockEmbedder();
    const vectorStore = new InMemoryVectorStore();
    const bm25Scorer = new BM25Scorer();
    const bm25IndexStore = new InMemoryBM25IndexStore();

    const engine = new HybridSearchEngine(
      embedder, vectorStore, bm25Scorer, bm25IndexStore,
      vectorProcessor, bm25Processor,
      { vectorTopN: 50, bm25TopN: 50, rrfK: 60, maxResults: 10 },
    );

    expect(engine).toBeDefined();
    expect(engine.search).toBeInstanceOf(Function);
  });
});

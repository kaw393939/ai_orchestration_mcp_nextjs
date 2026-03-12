import { describe, expect, it, beforeEach } from "vitest";
import { MockEmbedder } from "@/adapters/MockEmbedder";
import { InMemoryVectorStore } from "@/adapters/InMemoryVectorStore";
import { MarkdownChunker } from "@/core/search/MarkdownChunker";
import { ChangeDetector } from "@/core/search/ChangeDetector";
import { EmbeddingPipeline } from "@/core/search/EmbeddingPipeline";
import { EmbeddingPipelineFactory } from "@/core/search/EmbeddingPipelineFactory";
import type { BookChunkMetadata } from "@/core/search/ports/Chunker";

const MODEL_VERSION = "all-MiniLM-L6-v2@1.0";

const metadata: BookChunkMetadata = {
  sourceType: "book_chunk",
  bookSlug: "ux-design",
  chapterSlug: "chapter-3",
  bookTitle: "UX Design",
  chapterTitle: "Design Principles",
  chapterFirstSentence: "This chapter covers core design principles.",
};

const chapterContent = [
  "## Introduction",
  "Design principles guide the creation of effective user interfaces and experiences. ".repeat(6),
  "",
  "## Principles",
  "Heuristic evaluation is a method for finding usability problems in a user interface. ".repeat(6),
  "",
  "## Conclusion",
  "In conclusion these principles form the foundation of effective UX design practice today. ".repeat(6),
].join("\n");

describe("EmbeddingPipeline", () => {
  let embedder: MockEmbedder;
  let vectorStore: InMemoryVectorStore;
  let pipeline: EmbeddingPipeline;

  beforeEach(() => {
    embedder = new MockEmbedder();
    vectorStore = new InMemoryVectorStore();
    const chunker = new MarkdownChunker();
    const changeDetector = new ChangeDetector(vectorStore);
    pipeline = new EmbeddingPipeline(
      chunker,
      embedder,
      vectorStore,
      changeDetector,
      MODEL_VERSION,
    );
  });

  // TEST-VS-22: Unchanged chapter (same hash) → skipped during rebuild
  it("skips unchanged chapter during rebuild", async () => {
    // First indexing
    await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent,
      contentHash: "hash-abc",
      metadata,
    });

    const countAfterFirst = vectorStore.count();

    // Second indexing with same hash
    const result = await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent,
      contentHash: "hash-abc",
      metadata,
    });

    expect(result.status).toBe("unchanged");
    expect(result.chunksUpserted).toBe(0);
    expect(vectorStore.count()).toBe(countAfterFirst);
  });

  // TEST-VS-23: Modified chapter (different hash) → old chunks deleted, new created
  it("re-indexes modified chapter with new content", async () => {
    // First indexing
    await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent,
      contentHash: "hash-v1",
      metadata,
    });

    // Modified content with different hash
    const result = await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent + "\n\n## Appendix\nExtra content for the appendix section here. ".repeat(6),
      contentHash: "hash-v2",
      metadata,
    });

    expect(result.status).toBe("updated");
    expect(result.chunksUpserted).toBeGreaterThan(0);
    // Old chunks were deleted and new ones created
    const records = vectorStore.getBySourceId("ux-design/chapter-3");
    expect(records.every((r) => r.contentHash === "hash-v2")).toBe(true);
  });

  // TEST-VS-24: Deleted chapter → orphans removed
  it("removes orphaned chapters during rebuildAll", async () => {
    // Index two chapters
    await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-1",
      content: chapterContent,
      contentHash: "hash-ch1",
      metadata: { ...metadata, chapterSlug: "chapter-1" },
    });
    await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-2",
      content: chapterContent,
      contentHash: "hash-ch2",
      metadata: { ...metadata, chapterSlug: "chapter-2" },
    });

    expect(vectorStore.getBySourceId("ux-design/chapter-1").length).toBeGreaterThan(0);
    expect(vectorStore.getBySourceId("ux-design/chapter-2").length).toBeGreaterThan(0);

    // Rebuild with only chapter-1 (chapter-2 is "deleted")
    const result = await pipeline.rebuildAll("book_chunk", [
      {
        sourceId: "ux-design/chapter-1",
        content: chapterContent,
        contentHash: "hash-ch1",
        metadata: { ...metadata, chapterSlug: "chapter-1" },
      },
    ]);

    expect(result.orphansDeleted).toBe(1);
    expect(vectorStore.getBySourceId("ux-design/chapter-2")).toHaveLength(0);
    expect(vectorStore.getBySourceId("ux-design/chapter-1").length).toBeGreaterThan(0);
  });

  // TEST-VS-59: Model version mismatch triggers re-embedding
  it("re-embeds when model version changes", async () => {
    // Index with v1 model
    await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent,
      contentHash: "hash-abc",
      metadata,
    });

    // Create new pipeline with different model version
    const newPipeline = new EmbeddingPipeline(
      new MarkdownChunker(),
      embedder,
      vectorStore,
      new ChangeDetector(vectorStore),
      "all-MiniLM-L6-v2@2.0",
    );

    // Same content + same hash but different model → should re-embed
    const result = await newPipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent,
      contentHash: "hash-abc",
      metadata,
    });

    expect(result.status).toBe("updated");
    expect(result.chunksUpserted).toBeGreaterThan(0);
    const records = vectorStore.getBySourceId("ux-design/chapter-3");
    expect(records[0].modelVersion).toBe("all-MiniLM-L6-v2@2.0");
  });

  // TEST-VS-60: New embeddings stored with current model_version
  it("stores embeddings with current model version", async () => {
    await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent,
      contentHash: "hash-abc",
      metadata,
    });

    const records = vectorStore.getBySourceId("ux-design/chapter-3");
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.modelVersion).toBe(MODEL_VERSION);
      expect(record.embedding).toBeInstanceOf(Float32Array);
      expect(record.embedding.length).toBe(384);
      // Verify ID format: {sourceType}:{sourceId}:{chunkIndex}
      expect(record.id).toMatch(/^book_chunk:ux-design\/chapter-3:\d+$/);
    }
  });
});

describe("ChangeDetector", () => {
  let vectorStore: InMemoryVectorStore;
  let changeDetector: ChangeDetector;

  beforeEach(() => {
    vectorStore = new InMemoryVectorStore();
    changeDetector = new ChangeDetector(vectorStore);
  });

  // TEST-VS-42: hasChanged() true for different hash, false for same
  it("detects content changes by hash comparison", () => {
    // No stored hash → always changed
    expect(changeDetector.hasChanged("ch1", "hash-abc")).toBe(true);

    // Store a record with known hash
    vectorStore.upsert([
      {
        id: "book_chunk:ch1:0",
        sourceType: "book_chunk",
        sourceId: "ch1",
        chunkIndex: 0,
        chunkLevel: "document",
        heading: null,
        content: "test",
        embeddingInput: "test",
        contentHash: "hash-abc",
        modelVersion: MODEL_VERSION,
        embedding: new Float32Array(384),
        metadata,
      },
    ]);

    expect(changeDetector.hasChanged("ch1", "hash-abc")).toBe(false);
    expect(changeDetector.hasChanged("ch1", "hash-different")).toBe(true);
  });

  // TEST-VS-43: findOrphaned() returns orphaned sourceIds
  it("finds orphaned sourceIds not in active set", () => {
    vectorStore.upsert([
      {
        id: "book_chunk:ch1:0",
        sourceType: "book_chunk",
        sourceId: "ch1",
        chunkIndex: 0,
        chunkLevel: "document",
        heading: null,
        content: "test",
        embeddingInput: "test",
        contentHash: "hash-1",
        modelVersion: MODEL_VERSION,
        embedding: new Float32Array(384),
        metadata,
      },
      {
        id: "book_chunk:ch2:0",
        sourceType: "book_chunk",
        sourceId: "ch2",
        chunkIndex: 0,
        chunkLevel: "document",
        heading: null,
        content: "test",
        embeddingInput: "test",
        contentHash: "hash-2",
        modelVersion: MODEL_VERSION,
        embedding: new Float32Array(384),
        metadata,
      },
      {
        id: "book_chunk:ch3:0",
        sourceType: "book_chunk",
        sourceId: "ch3",
        chunkIndex: 0,
        chunkLevel: "document",
        heading: null,
        content: "test",
        embeddingInput: "test",
        contentHash: "hash-3",
        modelVersion: MODEL_VERSION,
        embedding: new Float32Array(384),
        metadata,
      },
    ]);

    const orphaned = changeDetector.findOrphaned(
      "book_chunk",
      new Set(["ch1", "ch3"]),
    );
    expect(orphaned).toEqual(["ch2"]);
  });
});

describe("EmbeddingPipelineFactory", () => {
  // TEST-VS-47: createForSource("book_chunk") returns pipeline with MarkdownChunker
  it("creates book_chunk pipeline", () => {
    const factory = new EmbeddingPipelineFactory(
      new MockEmbedder(),
      new InMemoryVectorStore(),
      MODEL_VERSION,
    );

    const pipeline = factory.createForSource("book_chunk");
    expect(pipeline).toBeInstanceOf(EmbeddingPipeline);
  });

  it("throws for conversation source type", () => {
    const factory = new EmbeddingPipelineFactory(
      new MockEmbedder(),
      new InMemoryVectorStore(),
      MODEL_VERSION,
    );

    expect(() => factory.createForSource("conversation")).toThrow(
      "ConversationChunker not yet implemented",
    );
  });

  // TEST-VS-25: On-demand indexDocument() embeds a single chapter end-to-end
  it("on-demand single-chapter indexing via factory pipeline", async () => {
    const store = new InMemoryVectorStore();
    const factory = new EmbeddingPipelineFactory(
      new MockEmbedder(),
      store,
      MODEL_VERSION,
    );
    const pipeline = factory.createForSource("book_chunk");

    const result = await pipeline.indexDocument({
      sourceType: "book_chunk",
      sourceId: "ux-design/chapter-3",
      content: chapterContent,
      contentHash: "hash-ondemand",
      metadata,
    });

    expect(result.status).toBe("created");
    expect(result.chunksUpserted).toBeGreaterThan(0);
    expect(store.getBySourceId("ux-design/chapter-3").length).toBeGreaterThan(0);
  });
});

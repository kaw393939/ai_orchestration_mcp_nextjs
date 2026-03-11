import { describe, expect, it } from "vitest";
import { InMemoryVectorStore } from "@/adapters/InMemoryVectorStore";
import { InMemoryBM25IndexStore } from "@/adapters/InMemoryBM25IndexStore";
import type { EmbeddingRecord } from "@/core/search/ports/VectorStore";
import type { BookChunkMetadata } from "@/core/search/ports/Chunker";

describe("in-memory test doubles", () => {
  // Float32Array → EmbeddingRecord → retrieve → Float32Array round-trip
  it("preserves Float32Array through upsert and retrieval", () => {
    const store = new InMemoryVectorStore();
    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);

    const record: EmbeddingRecord = {
      id: "book_chunk:ux/ch1:0",
      sourceType: "book_chunk",
      sourceId: "ux/ch1",
      chunkIndex: 0,
      chunkLevel: "passage",
      heading: "Introduction",
      content: "Test content",
      embeddingInput: "UX: Chapter 1 > Introduction > Test content",
      contentHash: "abc123",
      modelVersion: "all-MiniLM-L6-v2@1.0",
      embedding,
      metadata: {
        sourceType: "book_chunk",
        bookSlug: "ux",
        chapterSlug: "ch1",
        bookTitle: "UX Design",
        chapterTitle: "Chapter 1",
        chapterFirstSentence: "This chapter covers UX basics.",
      },
    };

    store.upsert([record]);
    const retrieved = store.getBySourceId("ux/ch1");

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].embedding).toBeInstanceOf(Float32Array);
    expect(retrieved[0].embedding.length).toBe(5);
    expect(retrieved[0].embedding[0]).toBeCloseTo(0.1, 5);
    expect(retrieved[0].embedding[4]).toBeCloseTo(0.5, 5);
  });

  // TEST-VS-44: BM25IndexStore.saveIndex() persists, getIndex() retrieves
  it("BM25IndexStore saves and retrieves index", () => {
    const store = new InMemoryBM25IndexStore();

    expect(store.isStale("book_chunk")).toBe(true);
    expect(store.getIndex("book_chunk")).toBeNull();

    const index = {
      avgDocLength: 200,
      docCount: 50,
      docLengths: new Map([["doc1", 180], ["doc2", 220]]),
      termDocFrequencies: new Map([["design", 10], ["pattern", 5]]),
    };

    store.saveIndex("book_chunk", index);

    expect(store.isStale("book_chunk")).toBe(false);
    const retrieved = store.getIndex("book_chunk");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.avgDocLength).toBe(200);
    expect(retrieved!.docCount).toBe(50);
    expect(retrieved!.docLengths.get("doc1")).toBe(180);
    expect(retrieved!.termDocFrequencies.get("design")).toBe(10);
  });

  // TEST-VS-51: BookChunkMetadata round-trip preserves all fields
  it("BookChunkMetadata round-trip preserves all fields", () => {
    const store = new InMemoryVectorStore();

    const metadata: BookChunkMetadata = {
      sourceType: "book_chunk",
      bookSlug: "accessibility",
      chapterSlug: "wcag-compliance",
      bookTitle: "Accessibility",
      chapterTitle: "WCAG Compliance",
      chapterFirstSentence: "This chapter covers WCAG guidelines.",
      practitioners: ["Don Norman", "Jakob Nielsen"],
      checklistItems: ["Ensure color contrast", "Add alt text"],
    };

    const record: EmbeddingRecord = {
      id: "book_chunk:accessibility/wcag:0",
      sourceType: "book_chunk",
      sourceId: "accessibility/wcag",
      chunkIndex: 0,
      chunkLevel: "section",
      heading: "Color Contrast",
      content: "Color contrast ratios ensure readability.",
      embeddingInput: "Accessibility: WCAG > Color Contrast > ...",
      contentHash: "def456",
      modelVersion: "all-MiniLM-L6-v2@1.0",
      embedding: new Float32Array([0.5, 0.5]),
      metadata,
    };

    store.upsert([record]);
    const retrieved = store.getBySourceId("accessibility/wcag");

    expect(retrieved).toHaveLength(1);
    const m = retrieved[0].metadata;
    expect(m.sourceType).toBe("book_chunk");

    // Narrow to BookChunkMetadata via discriminated union
    if (m.sourceType === "book_chunk") {
      expect(m.bookSlug).toBe("accessibility");
      expect(m.chapterSlug).toBe("wcag-compliance");
      expect(m.bookTitle).toBe("Accessibility");
      expect(m.chapterTitle).toBe("WCAG Compliance");
      expect(m.chapterFirstSentence).toBe(
        "This chapter covers WCAG guidelines.",
      );
      expect(m.practitioners).toEqual(["Don Norman", "Jakob Nielsen"]);
      expect(m.checklistItems).toEqual([
        "Ensure color contrast",
        "Add alt text",
      ]);
    } else {
      throw new Error("Expected BookChunkMetadata, got ConversationMetadata");
    }
  });
});

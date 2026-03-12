import { describe, it, expect, vi } from "vitest";
import {
  HybridSearchHandler,
  BM25SearchHandler,
  LegacyKeywordHandler,
  EmptyResultHandler,
} from "@/core/search/SearchHandlerChain";
import { HybridSearchEngine } from "@/core/search/HybridSearchEngine";
import { BM25Scorer } from "@/core/search/BM25Scorer";
import { QueryProcessor } from "@/core/search/QueryProcessor";
import { LowercaseStep } from "@/core/search/query-steps/LowercaseStep";
import { InMemoryBM25IndexStore } from "@/adapters/InMemoryBM25IndexStore";
import type { Embedder } from "@/core/search/ports/Embedder";
import type { BookRepository } from "@/core/use-cases/BookRepository";
import type { Book } from "@/core/entities/library";
import { Chapter } from "@/core/entities/library";

const mockBooks: Book[] = [
  { slug: "book-1", title: "Book One", number: "1" },
];

const mockChapters: Chapter[] = [
  new Chapter(
    "book-1", "ch-1", "Bauhaus History",
    "The Bauhaus movement was founded by Walter Gropius. It focused on functional design.",
    ["Walter Gropius"], ["Check functionality"], ["Founding"],
  ),
];

function makeMockRepo(): BookRepository {
  return {
    getAllBooks: vi.fn().mockResolvedValue(mockBooks),
    getAllChapters: vi.fn().mockResolvedValue(mockChapters),
    getChaptersByBook: vi.fn().mockResolvedValue(mockChapters),
    getChapter: vi.fn().mockResolvedValue(mockChapters[0]),
    getBook: vi.fn().mockResolvedValue(mockBooks[0]),
  };
}

function makeMockEmbedder(ready: boolean): Embedder {
  return {
    embed: vi.fn().mockResolvedValue(new Float32Array(384)),
    embedBatch: vi.fn().mockResolvedValue([new Float32Array(384)]),
    dimensions: () => 384,
    isReady: () => ready,
  };
}

describe("SearchHandlerChain", () => {
  // TEST-VS-26
  it("embeddings table empty → BM25-only results via fallback", async () => {
    const bm25IndexStore = new InMemoryBM25IndexStore();
    bm25IndexStore.saveIndex("book_chunk", {
      avgDocLength: 10, docCount: 1,
      docLengths: new Map([["doc1", 10]]),
      termDocFrequencies: new Map([["bauhaus", 1]]),
    });

    const embedder = makeMockEmbedder(false);
    const engine = {} as HybridSearchEngine; // won't be called
    const bm25Processor = new QueryProcessor([new LowercaseStep()]);

    const vectorStore = {
      getAll: () => [{
        id: "doc1", content: "The Bauhaus movement was important.", heading: null,
        chunkIndex: 0, metadata: { bookTitle: "Book One", bookNumber: "1", bookSlug: "book-1", chapterTitle: "Ch", chapterSlug: "ch-1" },
      }],
    };

    const hybrid = new HybridSearchHandler(engine, embedder, bm25IndexStore);
    const bm25 = new BM25SearchHandler(new BM25Scorer(), bm25IndexStore, vectorStore, bm25Processor);
    const legacy = new LegacyKeywordHandler(makeMockRepo());
    const empty = new EmptyResultHandler();

    hybrid.setNext(bm25);
    bm25.setNext(legacy);
    legacy.setNext(empty);

    const results = await hybrid.search("Bauhaus");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].vectorRank).toBeNull(); // no vector used
  });

  // TEST-VS-27
  it("embedding model fails → BM25-only results via fallback", async () => {
    const bm25IndexStore = new InMemoryBM25IndexStore();
    bm25IndexStore.saveIndex("book_chunk", {
      avgDocLength: 10, docCount: 1,
      docLengths: new Map([["doc1", 10]]),
      termDocFrequencies: new Map([["bauhaus", 1]]),
    });

    const embedder = makeMockEmbedder(false);
    const engine = {} as HybridSearchEngine;
    const bm25Processor = new QueryProcessor([new LowercaseStep()]);

    const vectorStore = {
      getAll: () => [{
        id: "doc1", content: "The Bauhaus movement was important.", heading: null,
        chunkIndex: 0, metadata: { bookTitle: "Book One", bookNumber: "1", bookSlug: "book-1", chapterTitle: "Ch", chapterSlug: "ch-1" },
      }],
    };

    const hybrid = new HybridSearchHandler(engine, embedder, bm25IndexStore);
    const bm25 = new BM25SearchHandler(new BM25Scorer(), bm25IndexStore, vectorStore, bm25Processor);
    const legacy = new LegacyKeywordHandler(makeMockRepo());
    const empty = new EmptyResultHandler();

    hybrid.setNext(bm25);
    bm25.setNext(legacy);
    legacy.setNext(empty);

    const results = await hybrid.search("Bauhaus");
    expect(results.length).toBeGreaterThan(0);
  });

  // TEST-VS-28
  it("BM25 index unavailable → legacy keyword scoring", async () => {
    const bm25IndexStore = new InMemoryBM25IndexStore(); // empty — no index
    const embedder = makeMockEmbedder(false);
    const engine = {} as HybridSearchEngine;
    const bm25Processor = new QueryProcessor([new LowercaseStep()]);
    const vectorStore = { getAll: () => [] };

    const hybrid = new HybridSearchHandler(engine, embedder, bm25IndexStore);
    const bm25 = new BM25SearchHandler(new BM25Scorer(), bm25IndexStore, vectorStore, bm25Processor);
    const legacy = new LegacyKeywordHandler(makeMockRepo());
    const empty = new EmptyResultHandler();

    hybrid.setNext(bm25);
    bm25.setNext(legacy);
    legacy.setNext(empty);

    const results = await hybrid.search("Bauhaus");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].vectorRank).toBeNull();
    expect(results[0].bm25Rank).toBeNull();
  });

  // TEST-VS-45
  it("chain delegates to BM25SearchHandler when embedder unavailable", async () => {
    const bm25IndexStore = new InMemoryBM25IndexStore();
    bm25IndexStore.saveIndex("book_chunk", {
      avgDocLength: 10, docCount: 1,
      docLengths: new Map([["doc1", 10]]),
      termDocFrequencies: new Map([["test", 1]]),
    });

    const embedder = makeMockEmbedder(false); // not ready
    const engine = {} as HybridSearchEngine;
    const bm25Processor = new QueryProcessor([new LowercaseStep()]);

    const vectorStore = {
      getAll: () => [{
        id: "doc1", content: "Test content for testing.", heading: null,
        chunkIndex: 0, metadata: { bookTitle: "B", bookNumber: "1", bookSlug: "b-1", chapterTitle: "C", chapterSlug: "c-1" },
      }],
    };

    const hybrid = new HybridSearchHandler(engine, embedder, bm25IndexStore);
    const bm25 = new BM25SearchHandler(new BM25Scorer(), bm25IndexStore, vectorStore, bm25Processor);
    const legacy = new LegacyKeywordHandler(makeMockRepo());

    hybrid.setNext(bm25);
    bm25.setNext(legacy);

    const results = await hybrid.search("test");
    // Should get BM25 results (vectorRank is null)
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].vectorRank).toBeNull();
    expect(results[0].bm25Rank).not.toBeNull();
  });

  // TEST-VS-46
  it("chain delegates to LegacyKeywordHandler when BM25 index unavailable", async () => {
    const bm25IndexStore = new InMemoryBM25IndexStore(); // empty
    const embedder = makeMockEmbedder(false);
    const engine = {} as HybridSearchEngine;
    const bm25Processor = new QueryProcessor([new LowercaseStep()]);
    const vectorStore = { getAll: () => [] };

    const hybrid = new HybridSearchHandler(engine, embedder, bm25IndexStore);
    const bm25 = new BM25SearchHandler(new BM25Scorer(), bm25IndexStore, vectorStore, bm25Processor);
    const legacy = new LegacyKeywordHandler(makeMockRepo());
    const empty = new EmptyResultHandler();

    hybrid.setNext(bm25);
    bm25.setNext(legacy);
    legacy.setNext(empty);

    const results = await hybrid.search("Walter Gropius");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].vectorRank).toBeNull();
    expect(results[0].bm25Rank).toBeNull();
    expect(results[0].chapterSlug).toBe("ch-1");
  });
});

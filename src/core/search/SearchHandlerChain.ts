import type { SearchHandler } from "./ports/SearchHandler";
import type { HybridSearchResult, VectorQuery, VectorStore } from "./types";
import type { Embedder } from "./ports/Embedder";
import type { BM25IndexStore } from "./ports/BM25IndexStore";
import type { BookQuery, ChapterQuery } from "../use-cases/BookRepository";
import { HybridSearchEngine } from "./HybridSearchEngine";
import { BM25Scorer } from "./BM25Scorer";
import { QueryProcessor } from "./QueryProcessor";

abstract class BaseSearchHandler implements SearchHandler {
  private nextHandler: SearchHandler | null = null;

  setNext(handler: SearchHandler): SearchHandler {
    this.nextHandler = handler;
    return handler;
  }

  abstract canHandle(): boolean;
  abstract search(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]>;

  protected async passToNext(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]> {
    if (this.nextHandler) {
      if (this.nextHandler.canHandle()) {
        return this.nextHandler.search(query, filters);
      }
      // Walk the chain manually if current next can't handle
      if (this.nextHandler instanceof BaseSearchHandler) {
        return this.nextHandler.passToNext(query, filters);
      }
    }
    return [];
  }
}

export class HybridSearchHandler extends BaseSearchHandler {
  constructor(
    private readonly engine: HybridSearchEngine,
    private readonly embedder: Embedder,
    private readonly bm25IndexStore: BM25IndexStore,
  ) {
    super();
  }

  canHandle(): boolean {
    return this.embedder.isReady() && this.bm25IndexStore.getIndex("book_chunk") !== null;
  }

  async search(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]> {
    if (!this.canHandle()) return this.passToNext(query, filters);
    return this.engine.search(query, filters);
  }
}

export class BM25SearchHandler extends BaseSearchHandler {
  constructor(
    private readonly bm25Scorer: BM25Scorer,
    private readonly bm25IndexStore: BM25IndexStore,
    private readonly vectorStore: VectorStore,
    private readonly bm25QueryProcessor: QueryProcessor,
  ) {
    super();
  }

  canHandle(): boolean {
    return this.bm25IndexStore.getIndex("book_chunk") !== null;
  }

  async search(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]> {
    if (!this.canHandle()) return this.passToNext(query, filters);

    const bm25Index = this.bm25IndexStore.getIndex("book_chunk")!;
    const queryTerms = this.bm25QueryProcessor.process(query);
    const records = this.vectorStore.getAll({ ...filters, chunkLevel: "passage" });

    const scored = records.map((r) => {
      const docTokens = r.content.toLowerCase().split(/\s+/).filter(Boolean);
      return {
        record: r,
        score: this.bm25Scorer.score(queryTerms, docTokens, docTokens.length, bm25Index),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((s) => s.score > 0).slice(0, 10);

    return top.map((item, rank) => {
      const meta = item.record.metadata as {
        bookTitle?: string;
        bookNumber?: string;
        bookSlug?: string;
        chapterTitle?: string;
        chapterSlug?: string;
      };
      return {
        bookTitle: meta.bookTitle ?? "",
        bookNumber: meta.bookNumber ?? "",
        bookSlug: meta.bookSlug ?? "",
        chapterTitle: meta.chapterTitle ?? "",
        chapterSlug: meta.chapterSlug ?? "",
        rrfScore: item.score,
        vectorRank: null,
        bm25Rank: rank + 1,
        relevance: (rank < 3 ? "high" : rank < 7 ? "medium" : "low") as "high" | "medium" | "low",
        matchPassage: item.record.content,
        matchSection: item.record.heading,
        matchHighlight: item.record.content,
        passageOffset: { start: 0, end: item.record.content.length },
      };
    });
  }
}

export class LegacyKeywordHandler extends BaseSearchHandler {
  constructor(
    private readonly bookRepository: BookQuery & ChapterQuery,
  ) {
    super();
  }

  canHandle(): boolean {
    return true;
  }

  async search(query: string): Promise<HybridSearchResult[]> {
    const books = await this.bookRepository.getAllBooks();
    const chapters = await this.bookRepository.getAllChapters();
    const results: HybridSearchResult[] = [];

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

    if (queryTerms.length === 0 && queryLower.length <= 2) return [];

    for (const chapter of chapters) {
      const book = books.find((b) => b.slug === chapter.bookSlug);
      if (!book) continue;

      const { score, matchContext } = chapter.calculateSearchScore(queryLower, queryTerms);
      if (score > 0) {
        results.push({
          bookTitle: book.title,
          bookNumber: book.number,
          bookSlug: book.slug,
          chapterTitle: chapter.title,
          chapterSlug: chapter.chapterSlug,
          rrfScore: score,
          vectorRank: null,
          bm25Rank: null,
          relevance: score >= 8 ? "high" : score >= 4 ? "medium" : "low",
          matchPassage: matchContext,
          matchSection: null,
          matchHighlight: matchContext,
          passageOffset: { start: 0, end: 0 },
        });
      }
    }

    return results.sort((a, b) => b.rrfScore - a.rrfScore).slice(0, 10);
  }
}

export class EmptyResultHandler extends BaseSearchHandler {
  canHandle(): boolean {
    return true;
  }

  async search(): Promise<HybridSearchResult[]> {
    return [];
  }
}

import { describe, it, expect, vi } from "vitest";
import { SearchBooksCommand } from "@/core/use-cases/tools/BookTools";
import { RoleAwareSearchFormatter } from "@/core/tool-registry/ToolResultFormatter";
import type { SearchHandler } from "@/core/search/ports/SearchHandler";
import type { HybridSearchResult } from "@/core/search/types";
import type { BookRepository } from "@/core/use-cases/BookRepository";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";

const sampleHybridResults: HybridSearchResult[] = [
  {
    bookTitle: "Software Engineering",
    bookNumber: "1",
    bookSlug: "software-engineering",
    chapterTitle: "Bauhaus History",
    chapterSlug: "bauhaus-history",
    rrfScore: 0.85,
    vectorRank: 1,
    bm25Rank: 3,
    relevance: "high",
    matchPassage: "The Bauhaus movement was founded by Walter Gropius in 1919. It focused on functional design and the unity of art and craft.",
    matchSection: "Origins",
    matchHighlight: "The **Bauhaus** movement was founded by Walter Gropius in 1919.",
    passageOffset: { start: 0, end: 120 },
  },
];

function makeMockSearchHandler(results: HybridSearchResult[]): SearchHandler {
  const handler: SearchHandler = {
    canHandle: () => true,
    search: vi.fn().mockResolvedValue(results),
    setNext: vi.fn().mockReturnThis(),
  };
  return handler;
}

function makeMockBookRepo(): BookRepository {
  return {
    getAllBooks: vi.fn().mockResolvedValue([]),
    getAllChapters: vi.fn().mockResolvedValue([]),
    getChaptersByBook: vi.fn().mockResolvedValue([]),
    getChapter: vi.fn().mockResolvedValue(null),
    getBook: vi.fn().mockResolvedValue(null),
  };
}

describe("Sprint 4 — Tool Integration", () => {
  const mockRepo = makeMockBookRepo();
  const authCtx: ToolExecutionContext = { role: "AUTHENTICATED", userId: "user-1" };
  const anonCtx: ToolExecutionContext = { role: "ANONYMOUS", userId: "anon" };

  describe("SearchBooksCommand with hybrid handler", () => {
    const handler = makeMockSearchHandler(sampleHybridResults);
    const command = new SearchBooksCommand(mockRepo, handler);

    // VSEARCH-38 — backward compatible existing fields
    it("returns existing fields (book, chapter, etc.) — backward compatible", async () => {
      const result = await command.execute({ query: "bauhaus" }, authCtx) as Record<string, unknown>[];
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("book", "1. Software Engineering");
      expect(result[0]).toHaveProperty("bookNumber", "1");
      expect(result[0]).toHaveProperty("chapter", "Bauhaus History");
      expect(result[0]).toHaveProperty("chapterSlug", "bauhaus-history");
      expect(result[0]).toHaveProperty("bookSlug", "software-engineering");
      expect(result[0]).toHaveProperty("matchContext");
      expect(result[0]).toHaveProperty("relevance", "high");
    });

    it("returns matchPassage in output", async () => {
      const result = await command.execute({ query: "bauhaus" }, authCtx) as Record<string, unknown>[];
      expect(result[0]).toHaveProperty("matchPassage", sampleHybridResults[0].matchPassage);
    });

    it("returns matchHighlight with **bold** terms", async () => {
      const result = await command.execute({ query: "bauhaus" }, authCtx) as Record<string, unknown>[];
      expect(result[0]).toHaveProperty("matchHighlight");
      expect(result[0].matchHighlight as string).toContain("**Bauhaus**");
    });

    it("returns matchSection heading", async () => {
      const result = await command.execute({ query: "bauhaus" }, authCtx) as Record<string, unknown>[];
      expect(result[0]).toHaveProperty("matchSection", "Origins");
    });

    it("returns rrfScore, vectorRank, bm25Rank, passageOffset", async () => {
      const result = await command.execute({ query: "bauhaus" }, authCtx) as Record<string, unknown>[];
      expect(result[0]).toHaveProperty("rrfScore", 0.85);
      expect(result[0]).toHaveProperty("vectorRank", 1);
      expect(result[0]).toHaveProperty("bm25Rank", 3);
      expect(result[0]).toHaveProperty("passageOffset", { start: 0, end: 120 });
    });
  });

  describe("SearchBooksCommand without handler (legacy fallback)", () => {
    it("falls back to legacy keyword scoring", async () => {
      const legacyCommand = new SearchBooksCommand(mockRepo);
      const result = await legacyCommand.execute({ query: "bauhaus" }, authCtx);
      // With empty mock repo, no results
      expect(result).toBe('No results found for "bauhaus".');
    });
  });

  describe("RoleAwareSearchFormatter with hybrid fields", () => {
    const formatter = new RoleAwareSearchFormatter();
    const handler = makeMockSearchHandler(sampleHybridResults);
    const command = new SearchBooksCommand(mockRepo, handler);

    it("strips hybrid fields for ANONYMOUS", async () => {
      const rawResult = await command.execute({ query: "bauhaus" }, authCtx);
      const formatted = formatter.format("search_books", rawResult, anonCtx) as Record<string, unknown>[];
      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toHaveProperty("book");
      expect(formatted[0]).toHaveProperty("matchSection", "Origins");
      expect(formatted[0]).not.toHaveProperty("matchPassage");
      expect(formatted[0]).not.toHaveProperty("matchHighlight");
      expect(formatted[0]).not.toHaveProperty("rrfScore");
      expect(formatted[0]).not.toHaveProperty("vectorRank");
      expect(formatted[0]).not.toHaveProperty("bm25Rank");
      expect(formatted[0]).not.toHaveProperty("passageOffset");
      expect(formatted[0]).not.toHaveProperty("matchContext");
      expect(formatted[0]).not.toHaveProperty("bookSlug");
      expect(formatted[0]).not.toHaveProperty("chapterSlug");
    });

    it("preserves hybrid fields for AUTHENTICATED", async () => {
      const rawResult = await command.execute({ query: "bauhaus" }, authCtx);
      const formatted = formatter.format("search_books", rawResult, authCtx) as Record<string, unknown>[];
      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toHaveProperty("matchPassage");
      expect(formatted[0]).toHaveProperty("matchHighlight");
      expect(formatted[0]).toHaveProperty("matchSection");
      expect(formatted[0]).toHaveProperty("rrfScore");
      expect(formatted[0]).toHaveProperty("vectorRank");
      expect(formatted[0]).toHaveProperty("bm25Rank");
      expect(formatted[0]).toHaveProperty("passageOffset");
    });
  });
});

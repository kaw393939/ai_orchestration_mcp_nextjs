import { UseCase } from "../common/UseCase";
import { BookQuery, ChapterQuery } from "./BookRepository";
import { LibrarySearchResult } from "../entities/library";
import type { SearchHandler } from "../search/ports/SearchHandler";

export interface SearchRequest {
  query: string;
  maxResults?: number;
}

export class LibrarySearchInteractor implements UseCase<SearchRequest, LibrarySearchResult[]> {
  constructor(
    private bookRepository: BookQuery & ChapterQuery,
    private searchHandler?: SearchHandler,
  ) {}

  async execute(request: SearchRequest): Promise<LibrarySearchResult[]> {
    const { query, maxResults = 10 } = request;

    if (this.searchHandler) {
      const hybridResults = await this.searchHandler.search(query);
      return hybridResults.slice(0, maxResults).map((hr) => ({
        bookTitle: hr.bookTitle,
        bookNumber: hr.bookNumber,
        bookSlug: hr.bookSlug,
        chapterTitle: hr.chapterTitle,
        chapterSlug: hr.chapterSlug,
        matchContext: hr.matchPassage,
        relevance: hr.relevance,
        score: hr.rrfScore,
      }));
    }

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

    if (queryTerms.length === 0 && queryLower.length <= 2) {
      return [];
    }

    const books = await this.bookRepository.getAllBooks();
    const chapters = await this.bookRepository.getAllChapters();
    const results: LibrarySearchResult[] = [];

    for (const chapter of chapters) {
      const book = books.find((b) => b.slug === chapter.bookSlug);
      if (!book) continue;

      const { score, matchContext } = chapter.calculateSearchScore(
        queryLower,
        queryTerms,
      );

      if (score > 0) {
        results.push({
          bookTitle: book.title,
          bookNumber: book.number,
          bookSlug: book.slug,
          chapterTitle: chapter.title,
          chapterSlug: chapter.chapterSlug,
          matchContext,
          relevance: score >= 8 ? "high" : score >= 4 ? "medium" : "low",
          score,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  private extractContext(content: string, query: string): string {
    const lowerContent = content.toLowerCase();
    const idx = lowerContent.indexOf(query.toLowerCase());
    if (idx === -1) return content.slice(0, 200);

    const start = Math.max(0, idx - 100);
    const end = Math.min(content.length, idx + query.length + 200);
    const snippet = content.slice(start, end).replace(/\n/g, " ").trim();
    return start > 0 ? `...${snippet}...` : `${snippet}...`;
  }
}

export interface Book {
  slug: string;
  title: string;
  number: string;
}

export class Chapter {
  constructor(
    public readonly bookSlug: string,
    public readonly chapterSlug: string,
    public readonly title: string,
    public readonly content: string,
    public readonly practitioners: string[],
    public readonly checklistItems: string[],
    public readonly headings: string[],
  ) {}

  public calculateSearchScore(
    queryLower: string,
    queryTerms: string[],
  ): { score: number; matchContext: string } {
    let score = 0;
    let matchContext = "";
    const contentLower = this.content.toLowerCase();

    if (contentLower.includes(queryLower)) {
      score += 10;
      matchContext = this.extractContext(this.content, queryLower);
    }

    for (const term of queryTerms) {
      if (this.title.toLowerCase().includes(term)) score += 5;
      if (this.practitioners.some((p) => p.toLowerCase().includes(term)))
        score += 4;
      if (this.checklistItems.some((c) => c.toLowerCase().includes(term)))
        score += 3;
      if (contentLower.includes(term)) score += 1;
    }

    return {
      score,
      matchContext:
        matchContext || this.content.slice(0, 200).replace(/\\n/g, " ").trim(),
    };
  }

  private extractContext(content: string, query: string): string {
    const lowerContent = content.toLowerCase();
    const idx = lowerContent.indexOf(query.toLowerCase());
    if (idx === -1) return content.slice(0, 200);

    const start = Math.max(0, idx - 100);
    const end = Math.min(content.length, idx + query.length + 200);
    const snippet = content.slice(start, end).replace(/\\n/g, " ").trim();
    return start > 0 ? `...${snippet}...` : `${snippet}...`;
  }
}

export interface LibrarySearchResult {
  bookTitle: string;
  bookNumber: string;
  bookSlug: string;
  chapterTitle: string;
  chapterSlug: string;
  matchContext: string;
  relevance: "high" | "medium" | "low";
  score: number;
  // Optional hybrid search fields (populated when hybrid search is active)
  matchPassage?: string;
  matchSection?: string | null;
  matchHighlight?: string;
  rrfScore?: number;
  vectorRank?: number | null;
  bm25Rank?: number | null;
  passageOffset?: { start: number; end: number };
}

export interface Practitioner {
  name: string;
  books: { slug: string; title: string; number: string }[];
  chapters: { slug: string; title: string }[];
}

export interface Checklist {
  bookTitle: string;
  chapterTitle: string;
  items: string[];
}

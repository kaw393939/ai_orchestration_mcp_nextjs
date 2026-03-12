import { describe, it, expect } from "vitest";
import {
  highlightTerms,
  deduplicateByChapter,
  assignRelevance,
} from "@/core/search/ResultFormatter";
import type { HybridSearchResult } from "@/core/search/types";

function makeResult(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    bookTitle: "Book One",
    bookNumber: "1",
    bookSlug: "book-1",
    chapterTitle: "Chapter One",
    chapterSlug: "ch-1",
    rrfScore: 0.03,
    vectorRank: 1,
    bm25Rank: 2,
    relevance: "high",
    matchPassage: "This is a test passage with enough words to be meaningful. ".repeat(8),
    matchSection: "Test Section",
    matchHighlight: "",
    passageOffset: { start: 0, end: 400 },
    ...overrides,
  };
}

describe("ResultFormatter", () => {
  // TEST-VS-14
  it("result includes matchPassage with meaningful content", () => {
    const result = makeResult();
    expect(result.matchPassage.length).toBeGreaterThan(50);
  });

  // TEST-VS-15
  it("result includes matchSection heading", () => {
    const result = makeResult({ matchSection: "User Experience" });
    expect(result.matchSection).toBe("User Experience");
  });

  // TEST-VS-16
  it("matchHighlight contains **bold** markers around query terms", () => {
    const passage = "The design process includes heuristic evaluation for usability.";
    const highlighted = highlightTerms(passage, ["design", "heuristic"]);
    expect(highlighted).toContain("**design**");
    expect(highlighted).toContain("**heuristic**");
    // Non-query words should not be bolded
    expect(highlighted).toContain("process");
    expect(highlighted).not.toContain("**process**");
  });

  it("highlightTerms handles empty query terms", () => {
    const passage = "Some text here.";
    expect(highlightTerms(passage, [])).toBe(passage);
  });

  it("highlightTerms is case-insensitive", () => {
    const passage = "Design and DESIGN are the same.";
    const highlighted = highlightTerms(passage, ["design"]);
    expect(highlighted).toContain("**Design**");
    expect(highlighted).toContain("**DESIGN**");
  });

  // TEST-VS-17
  it("3 passages from same chapter → 1 result with best passage", () => {
    const results: HybridSearchResult[] = [
      makeResult({ chapterSlug: "ch-1", rrfScore: 0.05 }),
      makeResult({ chapterSlug: "ch-1", rrfScore: 0.03 }),
      makeResult({ chapterSlug: "ch-1", rrfScore: 0.01 }),
    ];

    const deduped = deduplicateByChapter(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].rrfScore).toBe(0.05); // kept the best
  });

  it("deduplicateByChapter keeps results from different chapters", () => {
    const results: HybridSearchResult[] = [
      makeResult({ chapterSlug: "ch-1", rrfScore: 0.05 }),
      makeResult({ chapterSlug: "ch-2", rrfScore: 0.03 }),
    ];

    const deduped = deduplicateByChapter(results);
    expect(deduped).toHaveLength(2);
  });

  describe("assignRelevance", () => {
    it("top 3 → high", () => {
      expect(assignRelevance(0.01, 1)).toBe("high");
      expect(assignRelevance(0.01, 3)).toBe("high");
    });

    it("rrfScore > 0.03 → high regardless of rank", () => {
      expect(assignRelevance(0.031, 10)).toBe("high");
    });

    it("ranks 4-7 → medium", () => {
      expect(assignRelevance(0.01, 4)).toBe("medium");
      expect(assignRelevance(0.01, 7)).toBe("medium");
    });

    it("rrfScore > 0.02 → medium regardless of rank", () => {
      expect(assignRelevance(0.021, 10)).toBe("medium");
    });

    it("rank 8+ with low score → low", () => {
      expect(assignRelevance(0.01, 8)).toBe("low");
      expect(assignRelevance(0.005, 15)).toBe("low");
    });
  });
});

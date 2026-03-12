import type { HybridSearchResult } from "./types";

export function highlightTerms(passage: string, queryTerms: string[]): string {
  if (queryTerms.length === 0) return passage;

  // Build regex that matches any query term (word-boundary, case-insensitive)
  // Escape special regex characters in terms
  const escaped = queryTerms
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return passage;

  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return passage.replace(pattern, "**$1**");
}

export function deduplicateByChapter(
  results: HybridSearchResult[],
): HybridSearchResult[] {
  const seen = new Map<string, HybridSearchResult>();

  for (const result of results) {
    const key = `${result.bookSlug}::${result.chapterSlug}`;
    const existing = seen.get(key);
    if (!existing || result.rrfScore > existing.rrfScore) {
      seen.set(key, result);
    }
  }

  return [...seen.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}

export function assignRelevance(
  rrfScore: number,
  rank: number,
): "high" | "medium" | "low" {
  if (rank <= 3 || rrfScore > 0.03) return "high";
  if (rank <= 7 || rrfScore > 0.02) return "medium";
  return "low";
}

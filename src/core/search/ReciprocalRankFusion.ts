export function reciprocalRankFusion(
  rankings: Map<string, number>[], // array of (chunkId → rank) maps
  k: number = 60,
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    for (const [id, rank] of ranking) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }

  return scores;
}

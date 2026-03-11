import type { BM25Index } from "./ports/BM25IndexStore";

export class BM25Scorer {
  constructor(
    private readonly k1: number = 1.2,
    private readonly b: number = 0.75,
  ) {}

  score(
    queryTerms: string[],
    docTokens: string[],
    docLength: number,
    index: BM25Index,
  ): number {
    let total = 0;
    const tf = new Map<string, number>();
    for (const token of docTokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    for (const term of queryTerms) {
      const termFreq = tf.get(term) ?? 0;
      if (termFreq === 0) continue;

      const idfValue = this.idf(term, index);
      const numerator = termFreq * (this.k1 + 1);
      const denominator =
        termFreq +
        this.k1 * (1 - this.b + this.b * (docLength / index.avgDocLength));
      total += idfValue * (numerator / denominator);
    }

    return total;
  }

  private idf(term: string, index: BM25Index): number {
    const n = index.termDocFrequencies.get(term) ?? 0;
    return Math.log((index.docCount - n + 0.5) / (n + 0.5) + 1);
  }
}

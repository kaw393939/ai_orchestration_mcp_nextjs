import type { Embedder } from "./ports/Embedder";
import type { VectorStore, EmbeddingRecord, VectorQuery } from "./ports/VectorStore";
import type { BM25IndexStore } from "./ports/BM25IndexStore";
import type { HybridSearchResult } from "./types";
import { BM25Scorer } from "./BM25Scorer";
import { QueryProcessor } from "./QueryProcessor";
import { dotSimilarity } from "./dotSimilarity";
import { l2Normalize } from "./l2Normalize";
import { reciprocalRankFusion } from "./ReciprocalRankFusion";
import { highlightTerms, deduplicateByChapter, assignRelevance } from "./ResultFormatter";

export interface HybridSearchOptions {
  vectorTopN: number;
  bm25TopN: number;
  rrfK: number;
  maxResults: number;
}

export class HybridSearchEngine {
  constructor(
    private readonly embedder: Embedder,
    private readonly vectorStore: VectorStore,
    private readonly bm25Scorer: BM25Scorer,
    private readonly bm25IndexStore: BM25IndexStore,
    private readonly vectorQueryProcessor: QueryProcessor,
    private readonly bm25QueryProcessor: QueryProcessor,
    private readonly options: HybridSearchOptions,
  ) {}

  async search(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]> {
    // 1. Process query through both pipelines
    const vectorTokens = this.vectorQueryProcessor.process(query);
    const bm25Tokens = this.bm25QueryProcessor.process(query);

    // 2. Get all passage records
    const storeQuery: VectorQuery = {
      ...filters,
      chunkLevel: "passage",
    };
    const records = this.vectorStore.getAll(storeQuery);

    // 3. Vector retrieval
    const vectorText = vectorTokens.join(" ");
    const queryEmbedding = l2Normalize(await this.embedder.embed(vectorText));

    const vectorScored = records.map((r) => ({
      record: r,
      similarity: dotSimilarity(queryEmbedding, r.embedding),
    }));
    vectorScored.sort((a, b) => b.similarity - a.similarity);
    const vectorTop = vectorScored.slice(0, this.options.vectorTopN);

    const vectorRanking = new Map<string, number>();
    vectorTop.forEach((item, i) => vectorRanking.set(item.record.id, i + 1));

    // 4. BM25 retrieval
    const bm25Index = this.bm25IndexStore.getIndex(
      filters?.sourceType ?? "book_chunk",
    );

    const bm25Ranking = new Map<string, number>();
    if (bm25Index) {
      const bm25Scored = records.map((r) => {
        const docTokens = r.content.toLowerCase().split(/\s+/).filter(Boolean);
        return {
          record: r,
          score: this.bm25Scorer.score(bm25Tokens, docTokens, docTokens.length, bm25Index),
        };
      });
      bm25Scored.sort((a, b) => b.score - a.score);
      const bm25Top = bm25Scored.slice(0, this.options.bm25TopN);
      bm25Top.forEach((item, i) => bm25Ranking.set(item.record.id, i + 1));
    }

    // 5. Reciprocal Rank Fusion
    const rrfScores = reciprocalRankFusion(
      [vectorRanking, bm25Ranking],
      this.options.rrfK,
    );

    // 6. Sort by RRF score
    const recordMap = new Map<string, EmbeddingRecord>();
    for (const r of records) recordMap.set(r.id, r);

    const merged = [...rrfScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, score], rank) => {
        const record = recordMap.get(id)!;
        const meta = record.metadata as {
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
          rrfScore: score,
          vectorRank: vectorRanking.get(id) ?? null,
          bm25Rank: bm25Ranking.get(id) ?? null,
          relevance: assignRelevance(score, rank + 1),
          matchPassage: record.content,
          matchSection: record.heading,
          matchHighlight: highlightTerms(record.content, bm25Tokens),
          passageOffset: {
            start: record.chunkIndex * 400,
            end: record.chunkIndex * 400 + record.content.length,
          },
        } satisfies HybridSearchResult;
      });

    // 7. Deduplication
    const deduped = deduplicateByChapter(merged);

    // 8. Return top N
    return deduped.slice(0, this.options.maxResults);
  }
}

export interface HybridSearchResult {
  bookTitle: string;
  bookNumber: string;
  bookSlug: string;
  chapterTitle: string;
  chapterSlug: string;
  rrfScore: number;
  vectorRank: number | null;
  bm25Rank: number | null;
  relevance: "high" | "medium" | "low";
  matchPassage: string;
  matchSection: string | null;
  matchHighlight: string;
  passageOffset: { start: number; end: number };
}

// Re-export all port types for convenient single-point imports
export type {
  BookChunkMetadata,
  Chunk,
  ChunkMetadata,
  Chunker,
  ChunkerOptions,
  ConversationMetadata,
} from "./ports/Chunker";
export type { Embedder } from "./ports/Embedder";
export type {
  EmbeddingRecord,
  VectorQuery,
  VectorStore,
} from "./ports/VectorStore";
export type {
  BM25Index,
  BM25IndexStore,
} from "./ports/BM25IndexStore";
export type { SearchHandler } from "./ports/SearchHandler";
export type { QueryProcessingStep } from "./ports/QueryProcessingStep";

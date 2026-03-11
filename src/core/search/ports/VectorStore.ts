import type { ChunkMetadata } from "./Chunker";

export interface EmbeddingRecord {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  chunkLevel: "document" | "section" | "passage";
  heading: string | null;
  content: string;
  embeddingInput: string;
  contentHash: string;
  modelVersion: string;
  embedding: Float32Array;
  metadata: ChunkMetadata;
}

export interface VectorQuery {
  sourceType?: string;
  chunkLevel?: "document" | "section" | "passage";
  limit?: number;
}

export interface VectorStore {
  upsert(records: EmbeddingRecord[]): void;
  delete(sourceId: string): void;
  getAll(query?: VectorQuery): EmbeddingRecord[];
  getBySourceId(sourceId: string): EmbeddingRecord[];
  getContentHash(sourceId: string): string | null;
  getModelVersion(sourceId: string): string | null;
  count(sourceType?: string): number;
}

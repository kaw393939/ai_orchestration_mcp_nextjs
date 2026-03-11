import type {
  EmbeddingRecord,
  VectorQuery,
  VectorStore,
} from "@/core/search/ports/VectorStore";

export class InMemoryVectorStore implements VectorStore {
  private records = new Map<string, EmbeddingRecord>();

  upsert(records: EmbeddingRecord[]): void {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  delete(sourceId: string): void {
    for (const [id, record] of this.records) {
      if (record.sourceId === sourceId) {
        this.records.delete(id);
      }
    }
  }

  getAll(query?: VectorQuery): EmbeddingRecord[] {
    let results = [...this.records.values()];
    if (query?.sourceType) {
      results = results.filter((r) => r.sourceType === query.sourceType);
    }
    if (query?.chunkLevel) {
      results = results.filter((r) => r.chunkLevel === query.chunkLevel);
    }
    if (query?.limit) {
      results = results.slice(0, query.limit);
    }
    return results;
  }

  getBySourceId(sourceId: string): EmbeddingRecord[] {
    return [...this.records.values()].filter((r) => r.sourceId === sourceId);
  }

  getContentHash(sourceId: string): string | null {
    for (const record of this.records.values()) {
      if (record.sourceId === sourceId) return record.contentHash;
    }
    return null;
  }

  getModelVersion(sourceId: string): string | null {
    for (const record of this.records.values()) {
      if (record.sourceId === sourceId) return record.modelVersion;
    }
    return null;
  }

  count(sourceType?: string): number {
    if (!sourceType) return this.records.size;
    let count = 0;
    for (const record of this.records.values()) {
      if (record.sourceType === sourceType) count++;
    }
    return count;
  }
}

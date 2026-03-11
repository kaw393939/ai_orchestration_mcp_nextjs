import type {
  BM25Index,
  BM25IndexStore,
} from "@/core/search/ports/BM25IndexStore";

export class InMemoryBM25IndexStore implements BM25IndexStore {
  private indices = new Map<string, BM25Index>();

  getIndex(sourceType: string): BM25Index | null {
    return this.indices.get(sourceType) ?? null;
  }

  saveIndex(sourceType: string, index: BM25Index): void {
    this.indices.set(sourceType, index);
  }

  isStale(sourceType: string): boolean {
    return !this.indices.has(sourceType);
  }
}

export interface BM25Index {
  avgDocLength: number;
  docCount: number;
  docLengths: Map<string, number>;
  termDocFrequencies: Map<string, number>;
}

export interface BM25IndexStore {
  getIndex(sourceType: string): BM25Index | null;
  saveIndex(sourceType: string, index: BM25Index): void;
  isStale(sourceType: string): boolean;
}

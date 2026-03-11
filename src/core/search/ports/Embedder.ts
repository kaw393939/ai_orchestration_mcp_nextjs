export interface Embedder {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  dimensions(): number; // 384 for MiniLM
  isReady(): boolean; // true when model is loaded and inference is available
}

import type { Embedder } from "@/core/search/ports/Embedder";
import { l2Normalize } from "@/core/search/l2Normalize";

export class MockEmbedder implements Embedder {
  private ready = false;

  async embed(text: string): Promise<Float32Array> {
    this.ready = true;
    const vec = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      vec[i] = ((text.charCodeAt(i % text.length) + i) % 100) / 100;
    }
    return l2Normalize(vec);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  dimensions(): number {
    return 384;
  }

  isReady(): boolean {
    return this.ready;
  }
}

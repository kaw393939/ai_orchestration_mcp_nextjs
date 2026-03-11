import type { HybridSearchResult } from "../types";
import type { VectorQuery } from "./VectorStore";

export interface SearchHandler {
  canHandle(): boolean;
  search(query: string, filters?: VectorQuery): Promise<HybridSearchResult[]>;
  setNext(handler: SearchHandler): SearchHandler;
}

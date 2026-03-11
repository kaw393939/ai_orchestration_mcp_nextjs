/** Discriminated union for type-safe, source-specific chunk metadata (GB-1) */
export interface BookChunkMetadata {
  sourceType: "book_chunk";
  bookSlug: string;
  chapterSlug: string;
  bookTitle: string;
  chapterTitle: string;
  chapterFirstSentence: string; // for enriched prefix (GH-2)
  practitioners?: string[];
  checklistItems?: string[];
}

export interface ConversationMetadata {
  sourceType: "conversation";
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  turnIndex: number;
}

export type ChunkMetadata = BookChunkMetadata | ConversationMetadata;

export interface Chunk {
  content: string; // the raw text (for display)
  embeddingInput: string; // the context-prefixed text (for embedding)
  level: "document" | "section" | "passage";
  heading: string | null; // section heading, if applicable
  startOffset: number; // char offset in source document
  endOffset: number;
  metadata: ChunkMetadata; // discriminated union — no Record<string, unknown>
}

export interface ChunkerOptions {
  maxChunkWords: number; // default 400
  minChunkWords: number; // default 50
}

export interface Chunker {
  chunk(
    sourceId: string,
    content: string,
    metadata: ChunkMetadata,
    options?: ChunkerOptions,
  ): Chunk[];
}

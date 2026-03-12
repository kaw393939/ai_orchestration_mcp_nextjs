import { ToolRegistry } from "@/core/tool-registry/ToolRegistry";
import { composeMiddleware, type ToolExecuteFn } from "@/core/tool-registry/ToolMiddleware";
import { LoggingMiddleware } from "@/core/tool-registry/LoggingMiddleware";
import { RbacGuardMiddleware } from "@/core/tool-registry/RbacGuardMiddleware";
import { RoleAwareSearchFormatter } from "@/core/tool-registry/ToolResultFormatter";
import { getBookRepository } from "@/adapters/RepositoryFactory";
import type { BookRepository } from "@/core/use-cases/BookRepository";

import { LocalEmbedder } from "@/adapters/LocalEmbedder";
import { SQLiteVectorStore } from "@/adapters/SQLiteVectorStore";
import { SQLiteBM25IndexStore } from "@/adapters/SQLiteBM25IndexStore";
import { EmbeddingPipelineFactory } from "@/core/search/EmbeddingPipelineFactory";
import type { EmbeddingPipeline } from "@/core/search/EmbeddingPipeline";
import { BM25Scorer } from "@/core/search/BM25Scorer";
import { QueryProcessor } from "@/core/search/QueryProcessor";
import { LowercaseStep } from "@/core/search/query-steps/LowercaseStep";
import { StopwordStep } from "@/core/search/query-steps/StopwordStep";
import { SynonymStep } from "@/core/search/query-steps/SynonymStep";
import { HybridSearchEngine } from "@/core/search/HybridSearchEngine";
import {
  HybridSearchHandler,
  BM25SearchHandler,
  LegacyKeywordHandler,
  EmptyResultHandler,
} from "@/core/search/SearchHandlerChain";
import type { SearchHandler } from "@/core/search/ports/SearchHandler";
import { STOPWORDS } from "@/core/search/data/stopwords";
import { SYNONYMS } from "@/core/search/data/synonyms";
import { getDb } from "@/lib/db";

import { calculatorTool } from "@/core/use-cases/tools/calculator.tool";
import { setThemeTool } from "@/core/use-cases/tools/set-theme.tool";
import { adjustUiTool } from "@/core/use-cases/tools/adjust-ui.tool";
import { navigateTool } from "@/core/use-cases/tools/navigate.tool";
import { generateChartTool } from "@/core/use-cases/tools/generate-chart.tool";
import { generateAudioTool } from "@/core/use-cases/tools/generate-audio.tool";
import { createSearchBooksTool } from "@/core/use-cases/tools/search-books.tool";
import { createGetChapterTool } from "@/core/use-cases/tools/get-chapter.tool";
import { createGetChecklistTool } from "@/core/use-cases/tools/get-checklist.tool";
import { createListPractitionersTool } from "@/core/use-cases/tools/list-practitioners.tool";
import { createGetBookSummaryTool } from "@/core/use-cases/tools/get-book-summary.tool";

let registry: ToolRegistry | null = null;
let composedExecute: ToolExecuteFn | null = null;
let embeddingFactory: EmbeddingPipelineFactory | null = null;
let searchHandler: SearchHandler | null = null;

const MODEL_VERSION = "all-MiniLM-L6-v2@1.0";

export function createToolRegistry(bookRepo: BookRepository): ToolRegistry {
  const reg = new ToolRegistry(new RoleAwareSearchFormatter());

  // Stateless tools (no deps)
  reg.register(calculatorTool);
  reg.register(setThemeTool);
  reg.register(adjustUiTool);
  reg.register(navigateTool);
  reg.register(generateChartTool);
  reg.register(generateAudioTool);

  // Book tools (need BookRepository)
  reg.register(createSearchBooksTool(bookRepo));
  reg.register(createGetChapterTool(bookRepo));
  reg.register(createGetChecklistTool(bookRepo));
  reg.register(createListPractitionersTool(bookRepo));
  reg.register(createGetBookSummaryTool(bookRepo));

  return reg;
}

export function getToolRegistry(): ToolRegistry {
  if (!registry) {
    registry = createToolRegistry(getBookRepository());
  }
  return registry;
}

export function getToolExecutor(): ToolExecuteFn {
  if (!composedExecute) {
    const reg = getToolRegistry();
    composedExecute = composeMiddleware(
      [new LoggingMiddleware(), new RbacGuardMiddleware(reg)],
      reg.execute.bind(reg),
    );
  }
  return composedExecute;
}

export function getEmbeddingPipelineFactory(): EmbeddingPipelineFactory {
  if (!embeddingFactory) {
    embeddingFactory = new EmbeddingPipelineFactory(
      new LocalEmbedder(),
      new SQLiteVectorStore(getDb()),
      MODEL_VERSION,
    );
  }
  return embeddingFactory;
}

export function getBookPipeline(): EmbeddingPipeline {
  return getEmbeddingPipelineFactory().createForSource("book_chunk");
}

export function getSearchHandler(): SearchHandler {
  if (!searchHandler) {
    const embedder = new LocalEmbedder();
    const db = getDb();
    const vectorStore = new SQLiteVectorStore(db);
    const bm25IndexStore = new SQLiteBM25IndexStore(db);
    const bm25Scorer = new BM25Scorer();

    const vectorProcessor = new QueryProcessor([
      new LowercaseStep(),
      new StopwordStep(STOPWORDS),
    ]);
    const bm25Processor = new QueryProcessor([
      new LowercaseStep(),
      new StopwordStep(STOPWORDS),
      new SynonymStep(SYNONYMS),
    ]);

    const engine = new HybridSearchEngine(
      embedder, vectorStore, bm25Scorer, bm25IndexStore,
      vectorProcessor, bm25Processor,
      { vectorTopN: 50, bm25TopN: 50, rrfK: 60, maxResults: 10 },
    );

    const hybrid = new HybridSearchHandler(engine, embedder, bm25IndexStore);
    const bm25 = new BM25SearchHandler(bm25Scorer, bm25IndexStore, vectorStore, bm25Processor);
    const legacy = new LegacyKeywordHandler(getBookRepository());
    const empty = new EmptyResultHandler();

    hybrid.setNext(bm25);
    bm25.setNext(legacy);
    legacy.setNext(empty);

    searchHandler = hybrid;
  }
  return searchHandler;
}

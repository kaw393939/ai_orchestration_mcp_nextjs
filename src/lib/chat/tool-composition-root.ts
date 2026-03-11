import { ToolRegistry } from "@/core/tool-registry/ToolRegistry";
import { composeMiddleware, type ToolExecuteFn } from "@/core/tool-registry/ToolMiddleware";
import { LoggingMiddleware } from "@/core/tool-registry/LoggingMiddleware";
import { RbacGuardMiddleware } from "@/core/tool-registry/RbacGuardMiddleware";
import { getBookRepository } from "@/adapters/RepositoryFactory";
import type { BookRepository } from "@/core/use-cases/BookRepository";

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

export function createToolRegistry(bookRepo: BookRepository): ToolRegistry {
  const reg = new ToolRegistry();

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

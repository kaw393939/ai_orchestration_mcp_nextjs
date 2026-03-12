import type { ToolExecutionContext } from "./ToolExecutionContext";

export interface ToolResultFormatter {
  format(toolName: string, result: unknown, context: ToolExecutionContext): unknown;
}

export class RoleAwareSearchFormatter implements ToolResultFormatter {
  format(toolName: string, result: unknown, context: ToolExecutionContext): unknown {
    if (toolName !== "search_books") return result;
    if (!Array.isArray(result)) return result;
    if (context.role === "ANONYMOUS") {
      return result.map((r: Record<string, unknown>) => ({
        book: r.book,
        bookNumber: r.bookNumber,
        chapter: r.chapterTitle ?? r.chapter,
        relevance: r.relevance,
        matchSection: r.matchSection ?? null,
      }));
    }
    return result;
  }
}

import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import type { BookRepository } from "../BookRepository";
import { GetBookSummaryCommand } from "./BookTools";

export function createGetBookSummaryTool(repo: BookRepository): ToolDescriptor {
  return {
    name: "get_book_summary",
    schema: {
      description: "Get an overview of all 10 books and their chapters.",
      input_schema: {
        type: "object",
        properties: {},
      },
    },
    command: new GetBookSummaryCommand(repo),
    roles: "ALL",
    category: "content",
  };
}

import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import type { BookRepository } from "../BookRepository";
import { SearchBooksCommand } from "./BookTools";

export function createSearchBooksTool(repo: BookRepository): ToolDescriptor {
  return {
    name: "search_books",
    schema: {
      description: "Search across all 10 books (104 chapters) in the Product Development Library.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query (concept, person, topic)." },
          max_results: { type: "number", description: "Max results (1-15)." },
        },
        required: ["query"],
      },
    },
    command: new SearchBooksCommand(repo),
    roles: "ALL",
    category: "content",
  };
}

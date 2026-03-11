import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import type { BookRepository } from "../BookRepository";
import { GetChapterCommand } from "./BookTools";

export function createGetChapterTool(repo: BookRepository): ToolDescriptor {
  return {
    name: "get_chapter",
    schema: {
      description: "Retrieve full content of a specific chapter.",
      input_schema: {
        type: "object",
        properties: {
          book_slug: { type: "string" },
          chapter_slug: { type: "string" },
        },
        required: ["book_slug", "chapter_slug"],
      },
    },
    command: new GetChapterCommand(repo),
    roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
    category: "content",
  };
}

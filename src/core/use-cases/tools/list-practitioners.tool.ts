import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import type { BookRepository } from "../BookRepository";
import { ListPractitionersCommand } from "./BookTools";

export function createListPractitionersTool(repo: BookRepository): ToolDescriptor {
  return {
    name: "list_practitioners",
    schema: {
      description: "List key practitioners referenced in the series.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional name filter." },
        },
      },
    },
    command: new ListPractitionersCommand(repo),
    roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
    category: "content",
  };
}

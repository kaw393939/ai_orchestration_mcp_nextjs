import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { NavigateCommand } from "./UiTools";

export const navigateTool: ToolDescriptor = {
  name: "navigate",
  schema: {
    description: "Navigate to a different page.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  command: new NavigateCommand(),
  roles: "ALL",
  category: "ui",
};

import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { GenerateChartCommand } from "./UiTools";

export const generateChartTool: ToolDescriptor = {
  name: "generate_chart",
  schema: {
    description: "Generate a visual Mermaid.js chart.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Mermaid code." },
        caption: { type: "string" },
      },
      required: ["code"],
    },
  },
  command: new GenerateChartCommand(),
  roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
  category: "ui",
};

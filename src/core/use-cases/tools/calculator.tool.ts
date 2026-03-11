import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { CalculatorCommand } from "./CalculatorTool";

export const calculatorTool: ToolDescriptor = {
  name: "calculator",
  schema: {
    description: "Performs arithmetic. Mandatory for every math calculation.",
    input_schema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"] },
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["operation", "a", "b"],
    },
  },
  command: new CalculatorCommand(),
  roles: "ALL",
  category: "math",
};

import { ToolCommand } from "../ToolCommand";
import { calculate, isCalculatorOperation, type CalculatorResult } from "@/core/entities/calculator";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";

export class CalculatorCommand implements ToolCommand<{ operation: string; a: number; b: number }, CalculatorResult> {
  async execute({ operation, a, b }: { operation: string; a: number; b: number }, _context?: ToolExecutionContext) {
    if (!isCalculatorOperation(operation)) {
      throw new Error("Invalid operation. Use add, subtract, multiply, or divide.");
    }
    return calculate(operation, a, b);
  }
}

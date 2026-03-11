import { ToolCommand } from "../ToolCommand";
import { calculate, isCalculatorOperation, type CalculatorResult } from "@/core/entities/calculator";

export class CalculatorCommand implements ToolCommand<{ operation: string; a: number; b: number }, CalculatorResult> {
  async execute({ operation, a, b }: { operation: string; a: number; b: number }) {
    if (!isCalculatorOperation(operation)) {
      throw new Error("Invalid operation. Use add, subtract, multiply, or divide.");
    }
    return calculate(operation, a, b);
  }
}

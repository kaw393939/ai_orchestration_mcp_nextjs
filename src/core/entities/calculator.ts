export type CalculatorOperation = "add" | "subtract" | "multiply" | "divide";

export type CalculatorResult = {
  operation: CalculatorOperation;
  a: number;
  b: number;
  result: number;
};

export function calculate(
  operation: CalculatorOperation,
  a: number,
  b: number,
): CalculatorResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error("Calculator inputs must be finite numbers.");
  }

  if (operation === "divide" && b === 0) {
    throw new Error("Division by zero is not allowed.");
  }

  const result =
    operation === "add"
      ? a + b
      : operation === "subtract"
        ? a - b
        : operation === "multiply"
          ? a * b
          : a / b;

  return { operation, a, b, result };
}

export function isCalculatorOperation(
  value: unknown,
): value is CalculatorOperation {
  return (
    value === "add" ||
    value === "subtract" ||
    value === "multiply" ||
    value === "divide"
  );
}

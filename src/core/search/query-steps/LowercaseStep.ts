import type { QueryProcessingStep } from "../ports/QueryProcessingStep";

export class LowercaseStep implements QueryProcessingStep {
  readonly name = "lowercase";

  process(tokens: string[]): string[] {
    return tokens.map((t) => t.toLowerCase());
  }
}

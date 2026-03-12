import type { QueryProcessingStep } from "./ports/QueryProcessingStep";

export class QueryProcessor {
  constructor(private readonly steps: QueryProcessingStep[]) {}

  process(query: string): string[] {
    let tokens = query.split(/\s+/).filter(Boolean);
    for (const step of this.steps) {
      tokens = step.process(tokens);
    }
    return tokens;
  }
}

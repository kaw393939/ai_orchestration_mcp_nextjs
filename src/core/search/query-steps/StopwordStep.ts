import type { QueryProcessingStep } from "../ports/QueryProcessingStep";

export class StopwordStep implements QueryProcessingStep {
  readonly name = "stopword";

  constructor(private readonly stopwords: Set<string>) {}

  process(tokens: string[]): string[] {
    return tokens.filter((t) => !this.stopwords.has(t));
  }
}

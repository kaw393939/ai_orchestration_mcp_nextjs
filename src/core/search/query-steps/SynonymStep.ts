import type { QueryProcessingStep } from "../ports/QueryProcessingStep";

export class SynonymStep implements QueryProcessingStep {
  readonly name = "synonym";

  constructor(private readonly synonyms: Record<string, string[]>) {}

  process(tokens: string[]): string[] {
    return tokens.flatMap((t) => [t, ...(this.synonyms[t] ?? [])]);
  }
}

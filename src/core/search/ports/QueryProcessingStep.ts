export interface QueryProcessingStep {
  process(tokens: string[]): string[];
  readonly name: string;
}

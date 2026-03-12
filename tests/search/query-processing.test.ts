import { describe, it, expect } from "vitest";
import { LowercaseStep } from "@/core/search/query-steps/LowercaseStep";
import { StopwordStep } from "@/core/search/query-steps/StopwordStep";
import { SynonymStep } from "@/core/search/query-steps/SynonymStep";
import { QueryProcessor } from "@/core/search/QueryProcessor";
import { STOPWORDS } from "@/core/search/data/stopwords";
import { SYNONYMS } from "@/core/search/data/synonyms";

describe("Query Processing Steps", () => {
  // TEST-VS-48
  it("LowercaseStep lowercases all tokens", () => {
    const step = new LowercaseStep();
    expect(step.process(["Hello", "WORLD"])).toEqual(["hello", "world"]);
  });

  // TEST-VS-49
  it("StopwordStep removes stopwords", () => {
    const stopwords = new Set(["the", "are"]);
    const step = new StopwordStep(stopwords);
    expect(step.process(["the", "best", "ux"])).toEqual(["best", "ux"]);
  });

  // TEST-VS-50
  it("SynonymStep expands synonyms", () => {
    const synonyms = { ux: ["user experience", "usability"] };
    const step = new SynonymStep(synonyms);
    expect(step.process(["ux"])).toEqual(["ux", "user experience", "usability"]);
  });

  it("SynonymStep passes through tokens without synonyms", () => {
    const synonyms = { ux: ["user experience"] };
    const step = new SynonymStep(synonyms);
    expect(step.process(["design"])).toEqual(["design"]);
  });

  describe("Full pipeline", () => {
    it("BM25 pipeline: lowercase → stopword → synonym (§7.4)", () => {
      const processor = new QueryProcessor([
        new LowercaseStep(),
        new StopwordStep(STOPWORDS),
        new SynonymStep(SYNONYMS),
      ]);
      const result = processor.process("What are the best UX heuristics?");
      // After lowercase: ["what", "are", "the", "best", "ux", "heuristics?"]
      // After stopword removal: ["best", "ux", "heuristics?"]
      // After synonym expansion: ["best", "ux", "user experience", "usability", "heuristics?"]
      expect(result).toContain("best");
      expect(result).toContain("ux");
      expect(result).toContain("user experience");
      expect(result).toContain("usability");
      expect(result).not.toContain("what");
      expect(result).not.toContain("are");
      expect(result).not.toContain("the");
    });

    it("Vector pipeline: lowercase → stopword (no synonyms)", () => {
      const processor = new QueryProcessor([
        new LowercaseStep(),
        new StopwordStep(STOPWORDS),
      ]);
      const result = processor.process("What are the best UX heuristics?");
      expect(result).toContain("best");
      expect(result).toContain("ux");
      expect(result).not.toContain("user experience"); // no synonym expansion
      expect(result).not.toContain("what");
    });

    it("QueryProcessor with empty steps returns raw tokens", () => {
      const processor = new QueryProcessor([]);
      expect(processor.process("Hello World")).toEqual(["Hello", "World"]);
    });
  });
});

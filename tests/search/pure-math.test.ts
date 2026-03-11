import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "@/core/search/ReciprocalRankFusion";
import { dotSimilarity } from "@/core/search/dotSimilarity";
import { l2Normalize } from "@/core/search/l2Normalize";
import { BM25Scorer } from "@/core/search/BM25Scorer";
import type { BM25Index } from "@/core/search/ports/BM25IndexStore";

describe("pure math — search primitives", () => {
  // TEST-VS-29: RRF score calculation
  it("RRF([rank 1 in A, rank 3 in B], k=60) = 1/61 + 1/63", () => {
    const rankingA = new Map([["doc1", 1]]);
    const rankingB = new Map([["doc1", 3]]);
    const scores = reciprocalRankFusion([rankingA, rankingB], 60);
    const expected = 1 / 61 + 1 / 63;
    expect(scores.get("doc1")).toBeCloseTo(expected, 10);
  });

  // TEST-VS-30: dot similarity of identical unit vectors = 1.0
  it("dotSimilarity([1,0,0], [1,0,0]) = 1.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(dotSimilarity(a, b)).toBeCloseTo(1.0, 10);
  });

  // TEST-VS-31: dot similarity of orthogonal vectors = 0.0
  it("dotSimilarity([1,0,0], [0,1,0]) = 0.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(dotSimilarity(a, b)).toBeCloseTo(0.0, 10);
  });

  // TEST-VS-32: BM25 with k1=1.2, b=0.75 matches reference output
  it("BM25 with k1=1.2, b=0.75 matches reference output", () => {
    const scorer = new BM25Scorer(1.2, 0.75);

    const index: BM25Index = {
      avgDocLength: 100,
      docCount: 10,
      docLengths: new Map([["doc1", 120]]),
      termDocFrequencies: new Map([
        ["design", 3],
        ["pattern", 2],
      ]),
    };

    const queryTerms = ["design", "pattern"];
    const docTokens = ["design", "design", "pattern", "software", "architecture"];
    const docLength = 120;

    const score = scorer.score(queryTerms, docTokens, docLength, index);

    // Manually compute expected:
    // IDF("design") = ln((10 - 3 + 0.5) / (3 + 0.5) + 1) = ln(7.5/3.5 + 1) = ln(3.1429) ≈ 1.1451
    // IDF("pattern") = ln((10 - 2 + 0.5) / (2 + 0.5) + 1) = ln(8.5/2.5 + 1) = ln(4.4) ≈ 1.4816
    // TF("design") = 2, TF("pattern") = 1
    // BM25_design = 1.1451 * (2 * 2.2) / (2 + 1.2 * (1 - 0.75 + 0.75 * 120/100))
    //             = 1.1451 * 4.4 / (2 + 1.2 * 1.15) = 1.1451 * 4.4 / 3.38 ≈ 1.4895
    // BM25_pattern = 1.4816 * (1 * 2.2) / (1 + 1.2 * 1.15)
    //             = 1.4816 * 2.2 / 2.38 ≈ 1.3691
    // Total ≈ 2.8586

    expect(score).toBeGreaterThan(0);
    // Verify against manual calculation
    const idfDesign = Math.log((10 - 3 + 0.5) / (3 + 0.5) + 1);
    const idfPattern = Math.log((10 - 2 + 0.5) / (2 + 0.5) + 1);
    const denom = 1.2 * (1 - 0.75 + 0.75 * (120 / 100));
    const bm25Design = idfDesign * ((2 * 2.2) / (2 + denom));
    const bm25Pattern = idfPattern * ((1 * 2.2) / (1 + denom));
    const expected = bm25Design + bm25Pattern;

    expect(score).toBeCloseTo(expected, 10);
  });

  // TEST-VS-57: l2Normalize([3,4,0,...]) → [0.6, 0.8, 0,...]
  it("l2Normalize([3,4,0]) produces unit vector [0.6, 0.8, 0]", () => {
    const vec = new Float32Array([3, 4, 0]);
    const normalized = l2Normalize(vec);
    expect(normalized[0]).toBeCloseTo(0.6, 5);
    expect(normalized[1]).toBeCloseTo(0.8, 5);
    expect(normalized[2]).toBeCloseTo(0.0, 5);
  });

  // TEST-VS-58: dot similarity of two identical L2-normalized vectors = 1.0
  it("dotSimilarity of two identical L2-normalized vectors = 1.0", () => {
    const raw = new Float32Array([3, 4, 5, 6, 7]);
    const normalized = l2Normalize(raw);
    expect(dotSimilarity(normalized, normalized)).toBeCloseTo(1.0, 5);
  });
});

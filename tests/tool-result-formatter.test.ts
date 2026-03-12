import { describe, it, expect } from "vitest";
import { RoleAwareSearchFormatter } from "@/core/tool-registry/ToolResultFormatter";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";

const anonCtx: ToolExecutionContext = { role: "ANONYMOUS", userId: "anon" };
const authCtx: ToolExecutionContext = { role: "AUTHENTICATED", userId: "user-1" };

const fullResults = [
  {
    book: "1. Software Engineering",
    bookNumber: "1",
    chapter: "Intro",
    chapterSlug: "intro",
    bookSlug: "software-engineering",
    matchContext: "some context...",
    relevance: 15,
  },
];

const hybridResults = [
  {
    book: "1. Software Engineering",
    bookNumber: "1",
    chapter: "Intro",
    chapterSlug: "intro",
    bookSlug: "software-engineering",
    matchContext: "some context...",
    relevance: "high",
    matchPassage: "A long passage about software engineering...",
    matchSection: "Introduction",
    matchHighlight: "A long passage about **software engineering**...",
    rrfScore: 0.85,
    vectorRank: 1,
    bm25Rank: 3,
    passageOffset: { start: 0, end: 200 },
  },
];

describe("RoleAwareSearchFormatter", () => {
  const formatter = new RoleAwareSearchFormatter();

  // TEST-FMT-01
  it("ANON search result strips matchContext, bookSlug, chapterSlug", () => {
    const result = formatter.format("search_books", fullResults, anonCtx) as Record<string, unknown>[];
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("book");
    expect(result[0]).toHaveProperty("bookNumber");
    expect(result[0]).toHaveProperty("chapter");
    expect(result[0]).toHaveProperty("relevance");
    expect(result[0]).not.toHaveProperty("matchContext");
    expect(result[0]).not.toHaveProperty("bookSlug");
    expect(result[0]).not.toHaveProperty("chapterSlug");
  });

  // TEST-FMT-02
  it("AUTH search result preserves full data", () => {
    const result = formatter.format("search_books", fullResults, authCtx);
    expect(result).toEqual(fullResults);
  });

  // TEST-FMT-03
  it("non-search tool result passes through unchanged", () => {
    const data = { operation: "add", a: 2, b: 3, result: 5 };
    const result = formatter.format("calculator", data, anonCtx);
    expect(result).toEqual(data);
  });

  // TEST-FMT-04
  it("AUTH search result preserves hybrid fields unchanged", () => {
    const result = formatter.format("search_books", hybridResults, authCtx);
    expect(result).toEqual(hybridResults);
  });

  // TEST-FMT-05
  it("ANON search result strips hybrid fields but preserves matchSection", () => {
    const result = formatter.format("search_books", hybridResults, anonCtx) as Record<string, unknown>[];
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("matchSection", "Introduction");
    expect(result[0]).not.toHaveProperty("matchPassage");
    expect(result[0]).not.toHaveProperty("matchHighlight");
    expect(result[0]).not.toHaveProperty("rrfScore");
    expect(result[0]).not.toHaveProperty("vectorRank");
    expect(result[0]).not.toHaveProperty("bm25Rank");
    expect(result[0]).not.toHaveProperty("passageOffset");
    expect(result[0]).not.toHaveProperty("matchContext");
    expect(result[0]).not.toHaveProperty("bookSlug");
    expect(result[0]).not.toHaveProperty("chapterSlug");
  });

  // TEST-FMT-06
  it("ANON search result has matchSection null when not present", () => {
    const noSectionResults = [{ ...hybridResults[0], matchSection: undefined }];
    const result = formatter.format("search_books", noSectionResults, anonCtx) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("matchSection", null);
  });
});

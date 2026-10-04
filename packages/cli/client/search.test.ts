import { describe, expect, test } from "bun:test";
import { tokenizeLines } from "../src/hsm-view-tokens";
import { findMatches, type SearchState, step } from "./search";

const files = [
  {
    lines: tokenizeLines(
      `const canJump = (ctx) => ctx.grounded;\r\n// canJump and canJumpTwice\nguard: canJump,\n`,
    ),
  },
  { lines: tokenizeLines("export const nothing = 1;\n") },
  { lines: tokenizeLines(`/* CANJUMP */ import { canJump } from "./main";\n`) },
];

describe("findMatches", () => {
  test("finds every occurrence across files, in file then position order", () => {
    expect(findMatches(files, "canJump")).toEqual([
      { file: 0, line: 0, start: 6, end: 13 },
      { file: 0, line: 1, start: 3, end: 10 },
      { file: 0, line: 1, start: 15, end: 22 },
      { file: 0, line: 2, start: 7, end: 14 },
      { file: 2, line: 0, start: 3, end: 10 },
      { file: 2, line: 0, start: 23, end: 30 },
    ]);
  });

  test("returns nothing for an empty query", () => {
    expect(findMatches(files, "")).toEqual([]);
  });
});

describe("step", () => {
  const state = (current: number | undefined, count: number): SearchState => ({
    query: "canJump",
    matches: findMatches(files, "canJump").slice(0, count),
    current,
  });

  test("moves forward and wraps from the last match to the first", () => {
    expect(step(state(0, 3), 1).current).toBe(1);
    expect(step(state(2, 3), 1).current).toBe(0);
  });

  test("moves back and wraps from the first match to the last", () => {
    expect(step(state(0, 3), -1).current).toBe(2);
  });

  test("stays empty with no matches", () => {
    expect(step(state(undefined, 0), 1).current).toBeUndefined();
  });
});

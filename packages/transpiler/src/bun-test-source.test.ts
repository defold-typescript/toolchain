import { describe, expect, test } from "bun:test";
import { isBunTestSource } from "./bun-test-source";

describe("isBunTestSource", () => {
  test.each([
    "src/score.test.ts",
    "src/a/b_test.ts",
    "src/view.spec.tsx",
    "src/c_spec.mts",
    "src\\win\\d.test.ts",
  ])("%s is a file bun test runs", (path) => {
    expect(isBunTestSource(path)).toBe(true);
  });

  test.each([
    "src/test.ts",
    "src/latest.ts",
    "src/attest.ts",
    "src/spec.ts",
    "src/test/env.d.ts",
    "src/score.test.d.ts",
    "src/score.test.lua",
  ])("%s is not a file bun test runs", (path) => {
    expect(isBunTestSource(path)).toBe(false);
  });
});

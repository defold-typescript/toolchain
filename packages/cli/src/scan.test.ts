import { describe, expect, test } from "bun:test";
import { normalizeScannedPath } from "./scan";
import { isSkipped } from "./script-kind";

describe("scan path normalization", () => {
  test("normalizes Windows separators to POSIX project paths", () => {
    expect(normalizeScannedPath("src\\player.ts")).toBe("src/player.ts");
  });

  test("normalized skipped paths still expose skip segments", () => {
    expect(isSkipped(normalizeScannedPath("build\\player.ts"))).toBe(true);
  });
});

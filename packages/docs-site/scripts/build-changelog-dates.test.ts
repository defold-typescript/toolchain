import { describe, expect, test } from "bun:test";
import { parseTagDates, type RunGit, resolveTagDates } from "./build-changelog-dates";

describe("parseTagDates", () => {
  test("parses `<version> <isoDate>` lines into a record", () => {
    expect(parseTagDates("v0.20.4 2026-07-17\nv0.20.3 2026-07-16\n")).toEqual({
      "v0.20.4": "2026-07-17",
      "v0.20.3": "2026-07-16",
    });
  });

  test("skips blank and whitespace-only lines", () => {
    expect(parseTagDates("\nv0.20.4 2026-07-17\n   \n")).toEqual({ "v0.20.4": "2026-07-17" });
  });
});

describe("resolveTagDates", () => {
  test("reads the annotated-tag date via for-each-ref and returns the record", () => {
    const seen: string[][] = [];
    const run: RunGit = (args) => {
      seen.push(args);
      return { status: 0, stdout: "v0.20.4 2026-07-17\nv0.20.3 2026-07-16\n" };
    };
    expect(resolveTagDates(run)).toEqual({
      "v0.20.4": "2026-07-17",
      "v0.20.3": "2026-07-16",
    });
    expect(seen[0]?.[0]).toBe("for-each-ref");
    expect(seen[0]?.join(" ")).toContain("%(creatordate:short)");
    expect(seen[0]?.join(" ")).toContain("refs/tags/v*");
  });

  test("a non-zero git exit throws instead of returning a silent empty map", () => {
    const run: RunGit = () => ({ status: 128, stdout: "" });
    expect(() => resolveTagDates(run)).toThrow();
  });

  test("empty tag output throws (guards the shallow-clone deploy build)", () => {
    const run: RunGit = () => ({ status: 0, stdout: "\n" });
    expect(() => resolveTagDates(run)).toThrow();
  });
});

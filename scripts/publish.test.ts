import { describe, expect, test } from "bun:test";
import { bumpVersion, compareVersions, maxVersion, parseArgs, resolveTarget } from "./publish.ts";

describe("parseArgs", () => {
  test("defaults to a dry-run patch bump", () => {
    expect(parseArgs([])).toEqual({ spec: "patch", doPublish: false });
  });

  test("reads a bump keyword and the --publish flag in any order", () => {
    expect(parseArgs(["minor", "--publish"])).toEqual({ spec: "minor", doPublish: true });
    expect(parseArgs(["--publish", "0.3.0"])).toEqual({ spec: "0.3.0", doPublish: true });
  });

  test("rejects unknown flags and extra positionals", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown flag/);
    expect(() => parseArgs(["patch", "minor"])).toThrow(/one version\/bump/);
  });
});

describe("version math", () => {
  test("compareVersions orders by major, minor, then patch", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });

  test("maxVersion ignores non-semver entries and floors at 0.0.0", () => {
    expect(maxVersion(["0.1.0", "", "(unpublished)", "0.1.0"])).toBe("0.1.0");
    expect(maxVersion(["", "garbage"])).toBe("0.0.0");
  });

  test("bumpVersion increments and resets lower fields", () => {
    expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(bumpVersion("0.1.5", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.9.9", "major")).toBe("1.0.0");
  });
});

describe("resolveTarget", () => {
  test("bumps from the current published version", () => {
    expect(resolveTarget("0.1.0", "patch")).toBe("0.1.1");
    expect(resolveTarget("0.1.0", "minor")).toBe("0.2.0");
  });

  test("accepts an explicit version greater than current", () => {
    expect(resolveTarget("0.1.0", "0.5.0")).toBe("0.5.0");
  });

  test("rejects an explicit version that is not strictly greater", () => {
    expect(() => resolveTarget("0.1.0", "0.1.0")).toThrow(/not greater/);
    expect(() => resolveTarget("0.2.0", "0.1.0")).toThrow(/not greater/);
  });

  test("rejects a malformed explicit version", () => {
    expect(() => resolveTarget("0.1.0", "1.2")).toThrow(/bump keyword or an x\.y\.z/);
    expect(() => resolveTarget("0.1.0", "v1.2.3")).toThrow(/bump keyword or an x\.y\.z/);
  });
});

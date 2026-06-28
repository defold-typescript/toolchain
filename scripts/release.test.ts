import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  bumpVersion,
  compareVersions,
  maxVersion,
  parseArgs,
  resolveTarget,
  sleepSync,
} from "./release.ts";

describe("parseArgs", () => {
  test("defaults to a patch bump", () => {
    expect(parseArgs([])).toEqual({ spec: "patch", help: false, skipCiCheck: false });
  });

  test("reads a bump keyword or explicit version", () => {
    expect(parseArgs(["minor"]).spec).toBe("minor");
    expect(parseArgs(["1.2.3"]).spec).toBe("1.2.3");
  });

  test("reads the --skip-ci-check flag", () => {
    expect(parseArgs(["--skip-ci-check"]).skipCiCheck).toBe(true);
    expect(parseArgs([]).skipCiCheck).toBe(false);
  });

  test("recognizes --help and -h", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  test("rejects the retired --publish flag", () => {
    expect(() => parseArgs(["--publish"])).toThrow(/unknown flag/);
  });

  test("rejects unknown flags and extra positionals", () => {
    expect(() => parseArgs(["--nope"])).toThrow();
    expect(() => parseArgs(["patch", "minor"])).toThrow();
  });
});

describe("version math", () => {
  test("compareVersions orders by major, minor, then patch", () => {
    expect(compareVersions("1.2.3", "1.2.2")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.3.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  test("maxVersion ignores non-semver entries and floors at 0.0.0", () => {
    expect(maxVersion(["0.9.0", "0.10.0", "", "garbage"])).toBe("0.10.0");
    expect(maxVersion([])).toBe("0.0.0");
  });

  test("bumpVersion increments and resets lower fields", () => {
    expect(bumpVersion("0.10.0", "patch")).toBe("0.10.1");
    expect(bumpVersion("0.10.0", "minor")).toBe("0.11.0");
    expect(bumpVersion("0.10.0", "major")).toBe("1.0.0");
  });
});

describe("resolveTarget", () => {
  test("bumps from the current published version", () => {
    expect(resolveTarget("0.10.0", "patch")).toBe("0.10.1");
    expect(resolveTarget("0.10.0", "minor")).toBe("0.11.0");
    expect(resolveTarget("0.10.0", "major")).toBe("1.0.0");
  });

  test("accepts an explicit version greater than current", () => {
    expect(resolveTarget("0.10.0", "0.11.0")).toBe("0.11.0");
  });

  test("rejects an explicit version not strictly greater than current", () => {
    expect(() => resolveTarget("0.10.0", "0.10.0")).toThrow();
    expect(() => resolveTarget("0.10.0", "0.9.0")).toThrow();
  });

  test("rejects a malformed explicit version", () => {
    expect(() => resolveTarget("0.10.0", "1.2")).toThrow();
  });
});

describe("sleepSync", () => {
  test("blocks for at least the requested interval", () => {
    const start = performance.now();
    sleepSync(40);
    expect(performance.now() - start).toBeGreaterThanOrEqual(30);
  });

  test("returns immediately for a zero wait", () => {
    expect(() => sleepSync(0)).not.toThrow();
  });

  test("the source no longer spawns the sleep binary", () => {
    const src = readFileSync(new URL("./release.ts", import.meta.url), "utf8");
    expect(src.includes('"sleep"')).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  compareVersions,
  latestReleaseTag,
  maxVersion,
  parseArgs,
  releaseTagsAt,
  resolveReleaseTarget,
  sleepSync,
} from "./release.ts";

describe("parseArgs", () => {
  test("defaults to no bump spec", () => {
    expect(parseArgs([])).toEqual({ help: false, skipCiCheck: false });
  });

  test("reads the --skip-ci-check flag", () => {
    expect(parseArgs(["--skip-ci-check"]).skipCiCheck).toBe(true);
    expect(parseArgs([]).skipCiCheck).toBe(false);
  });

  test("recognizes --help and -h", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  test("rejects a bare positional now that the verb is gone", () => {
    expect(() => parseArgs(["patch"])).toThrow(/patch/);
  });

  test("rejects the retired --publish flag", () => {
    expect(() => parseArgs(["--publish"])).toThrow(/unknown flag/);
  });

  test("rejects unknown flags", () => {
    expect(() => parseArgs(["--nope"])).toThrow();
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
});

describe("releaseTagsAt", () => {
  test("keeps only v<x.y.z> release tags", () => {
    expect(releaseTagsAt(["v0.19.2", "nightly", "v1.2.3"])).toEqual(["v0.19.2", "v1.2.3"]);
  });

  test("ignores non-release and non-plain-semver tags", () => {
    expect(releaseTagsAt(["latest", "v1.2", "v1.2.3-rc.1", "release-1", "0.19.2"])).toEqual([]);
  });

  test("trims entries and drops blanks", () => {
    expect(releaseTagsAt(["  v2.0.0  ", ""])).toEqual(["v2.0.0"]);
  });
});

describe("latestReleaseTag", () => {
  test("filters to plain v<x.y.z> tags and picks the semver-max", () => {
    expect(latestReleaseTag(["v0.19.0", "v0.20.4", "nightly", "0.20.4"])).toBe("v0.20.4");
  });

  test("floors at v0.0.0 for a first-ever release", () => {
    expect(latestReleaseTag([])).toBe("v0.0.0");
  });
});

describe("resolveReleaseTarget", () => {
  test("returns the changelog-projected version above the latest tag", () => {
    expect(resolveReleaseTarget("## v0.20.5\n\n### Fixed\n", ["v0.20.4"])).toBe("0.20.5");
  });

  test("throws when the top heading is already tagged", () => {
    expect(() => resolveReleaseTarget("## v0.20.5\n", ["v0.20.4", "v0.20.5"])).toThrow(/0\.20\.5/);
  });

  test("uses the v0.0.0 floor when no tags exist", () => {
    expect(resolveReleaseTarget("## v0.1.0\n", [])).toBe("0.1.0");
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

  test("the source no longer reads the published npm version", () => {
    const src = readFileSync(new URL("./release.ts", import.meta.url), "utf8");
    expect(src.includes("bun pm view")).toBe(false);
    expect(src.includes("publishedBase")).toBe(false);
  });
});

describe("changelog flip on release", () => {
  test("release dispatches deploy-docs after tagging so the /changelog re-renders", () => {
    const src = readFileSync(new URL("./release.ts", import.meta.url), "utf8");
    expect(src.includes('"deploy-docs.yml"')).toBe(true);
  });

  // The github-pages environment allows only the default branch to deploy, so a
  // tag-triggered build renders the date but its deploy is rejected. The flip is
  // driven from release.ts (default-branch dispatch) instead; the workflow must
  // not re-add the always-rejected tag trigger.
  test("deploy-docs no longer triggers on the release tag", () => {
    const yml = readFileSync(
      new URL("../.github/workflows/deploy-docs.yml", import.meta.url),
      "utf8",
    );
    expect(yml.includes('tags: ["v*"]')).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  bumpVersion,
  compareVersions,
  maxVersion,
  PACKAGES,
  parseArgs,
  resolveTarget,
} from "./publish.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");

interface Manifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(path.join(PACKAGES_DIR, dir, "package.json"), "utf8"));
}

describe("PACKAGES publish set tracks the workspace", () => {
  // Without this guard, extracting a new publishable package (as `docs` was)
  // leaves it out of the stamp/publish set: its workspace:* deps resolve to
  // 0.0.0 and `verifyCoordinated` rejects the dependent tarball at publish time.
  test("lists exactly the publishable packages/* dirs", () => {
    const publishable = readdirSync(PACKAGES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((dir) => readManifest(dir).private !== true)
      .sort();
    expect([...PACKAGES].sort()).toEqual(publishable);
  });

  test("each dir maps to its @defold-typescript/<dir> package name", () => {
    for (const dir of PACKAGES) {
      expect(readManifest(dir).name).toBe(`@defold-typescript/${dir}`);
    }
  });

  test("publishes every inter-package dependency before its dependents", () => {
    PACKAGES.forEach((dir, index) => {
      const deps = readManifest(dir).dependencies ?? {};
      for (const name of Object.keys(deps)) {
        if (!name.startsWith("@defold-typescript/")) continue;
        const depDir = name.slice("@defold-typescript/".length);
        expect(PACKAGES.indexOf(depDir as (typeof PACKAGES)[number])).toBeLessThan(index);
      }
    });
  });
});

describe("parseArgs", () => {
  test("defaults to a dry-run patch bump", () => {
    expect(parseArgs([])).toEqual({
      spec: "patch",
      doPublish: false,
      help: false,
      skipCiCheck: false,
    });
  });

  test("reads a bump keyword and the --publish flag in any order", () => {
    expect(parseArgs(["minor", "--publish"])).toEqual({
      spec: "minor",
      doPublish: true,
      help: false,
      skipCiCheck: false,
    });
    expect(parseArgs(["--publish", "0.3.0"])).toEqual({
      spec: "0.3.0",
      doPublish: true,
      help: false,
      skipCiCheck: false,
    });
  });

  test("reads the --skip-ci-check escape hatch", () => {
    expect(parseArgs(["minor", "--publish", "--skip-ci-check"])).toEqual({
      spec: "minor",
      doPublish: true,
      help: false,
      skipCiCheck: true,
    });
  });

  test("recognizes --help and -h", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs([]).help).toBe(false);
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

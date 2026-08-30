import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { normalizeScannedPath, scanFilesSync } from "./scan";
import { isSkipped } from "./script-kind";

describe("scan path normalization", () => {
  test("normalizes Windows separators to POSIX project paths", () => {
    expect(normalizeScannedPath("src\\player.ts")).toBe("src/player.ts");
  });

  test("normalized skipped paths still expose skip segments", () => {
    expect(isSkipped(normalizeScannedPath("build\\player.ts"))).toBe(true);
  });
});

describe("scanFilesSync", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-scan-"));
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    mkdirSync(path.join(cwd, ".defold-types"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "main.ts"), "export {};\n");
    writeFileSync(path.join(cwd, ".defold-types", "scene-addresses.d.ts"), "export {};\n");
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("resolves a wildcard pattern", () => {
    expect(scanFilesSync(cwd, "src/**/*.ts")).toEqual(["src/main.ts"]);
  });

  test("resolves a wildcard-free path", () => {
    expect(scanFilesSync(cwd, "src/main.ts")).toEqual(["src/main.ts"]);
  });

  // Bun's `globSync` never descends a dot-directory and ignores `dot: true`,
  // while node's matches one by default. A wildcard-free entry must resolve the
  // same way under both, or `.defold-types/scene-addresses.d.ts` reaches the
  // compiler on one runtime and not the other.
  test("resolves a wildcard-free path inside a dot-directory", () => {
    expect(scanFilesSync(cwd, ".defold-types/scene-addresses.d.ts")).toEqual([
      ".defold-types/scene-addresses.d.ts",
    ]);
  });

  test("a wildcard-free path that names nothing yields no match", () => {
    expect(scanFilesSync(cwd, ".defold-types/absent.d.ts")).toEqual([]);
  });

  test("a wildcard-free path that names a directory yields no match", () => {
    expect(scanFilesSync(cwd, "src")).toEqual([]);
  });
});

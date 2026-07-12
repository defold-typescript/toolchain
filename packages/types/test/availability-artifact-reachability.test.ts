import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PKG_DIR = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")) as {
  files: string[];
  exports: Record<string, unknown>;
};

// The Combined-surface agent workflow reads these two JSON artifacts offline
// (llms-full points at them), so an install must ship them and resolve each as a
// bare package subpath — not just carry them incidentally in the tarball.
const OFFLINE_ARTIFACTS = ["api-availability.json", "api-signatures.json"] as const;

describe("offline availability/signature artifacts are package-reachable", () => {
  for (const artifact of OFFLINE_ARTIFACTS) {
    test(`${artifact} is committed on disk`, () => {
      expect(existsSync(join(PKG_DIR, artifact))).toBe(true);
    });

    test(`${artifact} is listed in package.json files`, () => {
      expect(manifest.files).toContain(artifact);
    });

    test(`@defold-typescript/types/${artifact} is a resolvable subpath export`, () => {
      expect(manifest.exports[`./${artifact}`]).toBe(`./${artifact}`);
    });
  }
});

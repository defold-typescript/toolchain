import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir, "..");

function packedPaths(cwd: string): string[] {
  const proc = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0) {
    throw new Error(`bun pm pack --dry-run failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
  return stdout
    .split("\n")
    .map((line) => line.match(/^packed\s+\S+\s+(.+)$/)?.[1])
    .filter((path): path is string => path !== undefined);
}

describe("@defold-typescript/library-types publish surface", () => {
  const paths = packedPaths(PKG_DIR);

  test("ships the per-library resolve manifest the CLI reads to recognize libraries", () => {
    expect(paths).toContain("luals-targets.json");
    expect(paths).toContain("generated/druid.d.ts");
  });

  test("keeps the already-shipped registry JSONs", () => {
    expect(paths).toContain("library-targets.json");
    expect(paths).toContain("library-classification.json");
  });

  test("excludes tests from the published tarball", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/\.test\.ts$/);
    }
  });
});

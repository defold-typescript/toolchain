import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(PKG_DIR, "..", "..");

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

describe("@defold-typescript/docs package", () => {
  test("manifest declares the docs package name", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.name).toBe("@defold-typescript/docs");
  });

  test("guide moved here, not copied (old root path is gone)", () => {
    expect(existsSync(resolve(PKG_DIR, "guide", "README.md"))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, "docs", "guide", "README.md"))).toBe(false);
  });

  test("packs the whole guide tree", () => {
    const paths = packedPaths(PKG_DIR);
    expect(paths).toContain("guide/README.md");
    expect(paths).toContain("guide/agent-runbooks.md");
    expect(paths).toContain("guide/script-lifecycle.md");
  });

  test("packs the generated offline knowledge pack", () => {
    const paths = packedPaths(PKG_DIR);
    expect(paths).toContain("llms.txt");
    expect(paths).toContain("llms-full.txt");
  });
});

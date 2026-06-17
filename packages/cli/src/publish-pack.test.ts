import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir, "..");

function build(cwd: string): void {
  const proc = Bun.spawnSync(["bun", "run", "build"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
}

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

function relativeImportSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const pattern = /^(?:import|export)\b[^\n;]*?\bfrom\s*["'](\.\.?\/[^"']*)["']/gm;
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

describe("@defold-typescript/cli publish surface", () => {
  build(PKG_DIR);
  const paths = packedPaths(PKG_DIR);

  test("ships the built dist surface", () => {
    expect(paths).toContain("package.json");
    expect(paths).toContain("dist/bin.js");
    expect(paths).toContain("dist/index.js");
  });

  test("excludes tests and snapshots", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/\.test\.ts$/);
      expect(path).not.toMatch(/(^|\/)__snapshots__\//);
    }
  });

  test("ships the src target the bun export condition resolves to", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    const bunEntry = (manifest.exports["."].bun as string).replace(/^\.\//, "");
    // A bun consumer of the published package loads this file directly; if it
    // is not packed, `import "@defold-typescript/cli"` fails under bun.
    expect(paths).toContain(bunEntry);
  });

  test("bin points at the built dist entry", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.bin["defold-typescript"]).toBe("./dist/bin.js");
  });

  test("manifest opts into public publish access", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.publishConfig?.access).toBe("public");
  });

  test("ships a README and LICENSE", () => {
    expect(paths).toContain("README.md");
    expect(paths).toContain("LICENSE");
  });

  test("no longer copies or packs the guide (it ships from @defold-typescript/docs)", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/^docs\/guide\//);
    }
  });

  test("depends on the docs package the init-agents block points at", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.dependencies["@defold-typescript/docs"]).toBe("workspace:*");
  });

  test("declares the MIT license", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.license).toBe("MIT");
  });

  test("dist bin carries the node shebang", () => {
    const source = readFileSync(resolve(PKG_DIR, "dist/bin.js"), "utf8");
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  test("built entries have no extensionless relative imports", () => {
    for (const entry of ["dist/index.js", "dist/bin.js"]) {
      for (const specifier of relativeImportSpecifiers(resolve(PKG_DIR, entry))) {
        expect(specifier).toMatch(/\.js$/);
      }
    }
  });
});

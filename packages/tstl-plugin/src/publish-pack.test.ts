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

describe("@defold-typescript/tstl-plugin publish surface", () => {
  build(PKG_DIR);
  const paths = packedPaths(PKG_DIR);

  test("ships the built dist surface", () => {
    expect(paths).toContain("package.json");
    expect(paths).toContain("dist/index.js");
    expect(paths).toContain("dist/index.d.ts");
  });

  test("excludes tests, snapshots, and dev scripts", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/^scripts\//);
      expect(path).not.toMatch(/\.test\.ts$/);
      expect(path).not.toMatch(/(^|\/)__snapshots__\//);
    }
  });

  test("ships the src target the bun export condition resolves to", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    const bunEntry = (manifest.exports["."].bun as string).replace(/^\.\//, "");
    // A bun consumer of the published package loads this file directly; if it
    // is not packed, `import "@defold-typescript/tstl-plugin"` fails under bun.
    expect(paths).toContain(bunEntry);
  });

  test("manifest points main/types at dist and keeps the bun src condition", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.main).toMatch(/^\.\/dist\//);
    expect(manifest.types).toMatch(/^\.\/dist\//);
    expect(manifest.exports["."].bun).toBe("./src/index.ts");
  });

  test("manifest opts into public publish access", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.publishConfig?.access).toBe("public");
  });

  test("ships a README and LICENSE", () => {
    expect(paths).toContain("README.md");
    expect(paths).toContain("LICENSE");
  });

  test("declares the MIT license", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.license).toBe("MIT");
  });

  test("built entry has no extensionless relative imports", () => {
    for (const specifier of relativeImportSpecifiers(resolve(PKG_DIR, "dist/index.js"))) {
      expect(specifier).toMatch(/\.js$/);
    }
  });
});

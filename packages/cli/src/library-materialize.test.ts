import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { VendoredLibrary } from "./library-match";
import { ensureLibraryTypesReference, materializeVendoredLibraries } from "./library-materialize";
import { ensureMaterializedReference } from "./materialize";

let cwd: string;
let generatedDir: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-lib-materialize-"));
  generatedDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-lib-generated-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(generatedDir, { recursive: true, force: true });
});

function seedGenerated(module: string, contents: string): void {
  writeFileSync(path.join(generatedDir, `${module}.d.ts`), contents);
}

function library(sourceId: string, modules: string[]): VendoredLibrary {
  return { sourceId, modules };
}

const librariesDir = (): string => path.join(cwd, ".defold-types", "libraries");

describe("materializeVendoredLibraries", () => {
  test("copies each module byte-identical, including dotted names", () => {
    const dicebag = "declare module 'dicebag.dicebag' { export const x: number; }\n";
    const monarchGui = "declare module 'monarch.transitions.gui' { export const y: Hash; }\n";
    seedGenerated("dicebag.dicebag", dicebag);
    seedGenerated("monarch.transitions.gui", monarchGui);

    const result = materializeVendoredLibraries({
      cwd,
      matched: [
        library("dicebag", ["dicebag.dicebag"]),
        library("monarch", ["monarch.transitions.gui"]),
      ],
      generatedDir,
    });

    expect(result).toEqual({
      materializedDir: ".defold-types/libraries",
      modules: ["dicebag.dicebag", "monarch.transitions.gui"],
    });
    const dir = librariesDir();
    expect(readFileSync(path.join(dir, "dicebag.dicebag.d.ts"), "utf8")).toBe(dicebag);
    expect(readFileSync(path.join(dir, "monarch.transitions.gui.d.ts"), "utf8")).toBe(monarchGui);
  });

  test("emits a sorted barrel and a faux package.json", () => {
    seedGenerated("zeta.zeta", "declare module 'zeta.zeta' {}\n");
    seedGenerated("alpha.alpha", "declare module 'alpha.alpha' {}\n");

    materializeVendoredLibraries({
      cwd,
      matched: [library("zeta", ["zeta.zeta"]), library("alpha", ["alpha.alpha"])],
      generatedDir,
    });

    const dir = librariesDir();
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./alpha.alpha";\nimport "./zeta.zeta";\n\nexport {};\n',
    );
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      name: string;
      types: string;
    };
    expect(pkg.name).toBe("@defold-typescript/materialized-libraries");
    expect(pkg.types).toBe("index.d.ts");
  });

  test("re-running with a smaller match set prunes the now-unwanted module but keeps index.d.ts", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    seedGenerated("gone.gone", "declare module 'gone.gone' {}\n");
    materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"]), library("gone", ["gone.gone"])],
      generatedDir,
    });

    const result = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
    });

    const dir = librariesDir();
    expect(result.modules).toEqual(["keep.keep"]);
    expect(existsSync(path.join(dir, "gone.gone.d.ts"))).toBe(false);
    expect(existsSync(path.join(dir, "keep.keep.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "index.d.ts"))).toBe(true);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./keep.keep";\n\nexport {};\n',
    );
  });

  test("no matches (or a null generatedDir) writes no dir and returns nulls", () => {
    expect(materializeVendoredLibraries({ cwd, matched: [], generatedDir })).toEqual({
      materializedDir: null,
      modules: [],
    });
    expect(existsSync(librariesDir())).toBe(false);

    expect(
      materializeVendoredLibraries({
        cwd,
        matched: [library("keep", ["keep.keep"])],
        generatedDir: null,
      }),
    ).toEqual({ materializedDir: null, modules: [] });
    expect(existsSync(librariesDir())).toBe(false);
  });
});

describe("ensureLibraryTypesReference", () => {
  function writeTsconfig(value: unknown): void {
    writeFileSync(path.join(cwd, "tsconfig.json"), `${JSON.stringify(value, null, 2)}\n`);
  }

  function readTsconfig(): { compilerOptions: { types?: string[]; typeRoots?: string[] } } {
    return JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
  }

  test("appends libraries additively, preserving engine surfaceId and an extensions entry", () => {
    writeTsconfig({
      compilerOptions: {
        strict: true,
        typeRoots: [".defold-types"],
        types: ["defold-1.12.4", "extensions"],
      },
    });

    ensureLibraryTypesReference(cwd, ".defold-types/libraries");

    const tsconfig = readTsconfig();
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.12.4", "extensions", "libraries"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("adds the .defold-types/ gitignore line", () => {
    writeTsconfig({ compilerOptions: {} });
    writeFileSync(path.join(cwd, ".gitignore"), "src/**/*.lua\n");

    ensureLibraryTypesReference(cwd, ".defold-types/libraries");

    const gitignore = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toContain(".defold-types/");
    expect(gitignore).toContain("src/**/*.lua");
  });

  test("a null materializedDir is a no-op", () => {
    writeTsconfig({ compilerOptions: { types: ["defold-1.12.4"] } });
    const before = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureLibraryTypesReference(cwd, null);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(before);
    expect(existsSync(path.join(cwd, ".gitignore"))).toBe(false);
  });
});

describe("ensureMaterializedReference carries sibling surfaces through the engine re-point", () => {
  function writeTsconfig(value: unknown): void {
    writeFileSync(path.join(cwd, "tsconfig.json"), `${JSON.stringify(value, null, 2)}\n`);
  }

  function readTypes(): string[] {
    return (
      JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
        compilerOptions: { types: string[] };
      }
    ).compilerOptions.types;
  }

  test("preserves both extensions and libraries when re-pointing the engine surface", () => {
    writeTsconfig({
      compilerOptions: {
        typeRoots: [".defold-types"],
        types: ["old-surface", "extensions", "libraries"],
      },
    });

    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");

    expect(readTypes()).toEqual(["defold-1.12.4", "extensions", "libraries"]);
  });

  test("carries a lone libraries entry through when extensions is absent", () => {
    writeTsconfig({
      compilerOptions: { typeRoots: [".defold-types"], types: ["old-surface", "libraries"] },
    });

    ensureMaterializedReference(cwd, ".defold-types/defold-1.12.4");

    expect(readTypes()).toEqual(["defold-1.12.4", "libraries"]);
  });
});

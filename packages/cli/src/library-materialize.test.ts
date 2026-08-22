import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readCliVersion } from "./cli-version";
import type { VendoredLibrary } from "./library-match";
import {
  ensureLibraryTypesReference,
  librariesDirName,
  materializeVendoredLibraries,
} from "./library-materialize";
import { ensureMaterializedReference, surfaceDirName } from "./materialize";

// The materialized surface directory carries the generating toolchain version;
// these tests defend other behavior, so they derive the name from production
// rather than restating it.
function surfaceDir(surfaceId: string): string {
  return surfaceDirName(surfaceId, readCliVersion());
}

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

const librariesDir = (cliVersion: string = readCliVersion()): string =>
  path.join(cwd, ".defold-types", librariesDirName(cliVersion));

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
      materializedDir: `.defold-types/${librariesDirName(readCliVersion())}`,
      modules: ["dicebag.dicebag", "monarch.transitions.gui"],
      skipped: [],
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
      skipped: [],
    });
    expect(existsSync(librariesDir())).toBe(false);

    expect(
      materializeVendoredLibraries({
        cwd,
        matched: [library("keep", ["keep.keep"])],
        generatedDir: null,
      }),
    ).toEqual({ materializedDir: null, modules: [], skipped: [] });
    expect(existsSync(librariesDir())).toBe(false);
  });

  test("an empty match set removes a previously-materialized surface (reconcile to zero)", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    materializeVendoredLibraries({ cwd, matched: [library("keep", ["keep.keep"])], generatedDir });
    expect(existsSync(librariesDir())).toBe(true);

    const result = materializeVendoredLibraries({ cwd, matched: [], generatedDir });

    expect(result).toEqual({ materializedDir: null, modules: [], skipped: [] });
    expect(existsSync(librariesDir())).toBe(false);
  });

  test("a null generatedDir leaves an existing surface intact (corpus unavailable, not a removal)", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    materializeVendoredLibraries({ cwd, matched: [library("keep", ["keep.keep"])], generatedDir });
    expect(existsSync(librariesDir())).toBe(true);

    const result = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir: null,
    });

    expect(result).toEqual({ materializedDir: null, modules: [], skipped: [] });
    expect(existsSync(path.join(librariesDir(), "keep.keep.d.ts"))).toBe(true);
  });

  test("a LuaLS entry sources by generated stem but names the surface by module id", () => {
    const druid = "declare module 'druid.druid' { export const version: string; }\n";
    seedGenerated("druid", druid);

    const result = materializeVendoredLibraries({
      cwd,
      matched: [
        { sourceId: "druid", modules: ["druid.druid"], generatedStems: { "druid.druid": "druid" } },
      ],
      generatedDir,
    });

    expect(result).toEqual({
      materializedDir: `.defold-types/${librariesDirName(readCliVersion())}`,
      modules: ["druid.druid"],
      skipped: [],
    });
    const dir = librariesDir();
    expect(readFileSync(path.join(dir, "druid.druid.d.ts"), "utf8")).toBe(druid);
    expect(existsSync(path.join(dir, "druid.d.ts"))).toBe(false);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./druid.druid";\n\nexport {};\n',
    );
  });

  test("a LuaLS entry whose generated stem file is absent is skipped, not thrown", () => {
    const result = materializeVendoredLibraries({
      cwd,
      matched: [
        { sourceId: "druid", modules: ["druid.druid"], generatedStems: { "druid.druid": "druid" } },
      ],
      generatedDir,
    });

    expect(result).toEqual({ materializedDir: null, modules: [], skipped: ["druid.druid"] });
    expect(existsSync(librariesDir())).toBe(false);
  });

  test("a matched module whose generated file is absent is skipped; present siblings materialize", () => {
    seedGenerated("present.present", "declare module 'present.present' {}\n");

    const result = materializeVendoredLibraries({
      cwd,
      matched: [library("present", ["present.present"]), library("missing", ["missing.missing"])],
      generatedDir,
    });

    expect(result).toEqual({
      materializedDir: `.defold-types/${librariesDirName(readCliVersion())}`,
      modules: ["present.present"],
      skipped: ["missing.missing"],
    });
    const dir = librariesDir();
    expect(existsSync(path.join(dir, "present.present.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "missing.missing.d.ts"))).toBe(false);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./present.present";\n\nexport {};\n',
    );
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

    ensureLibraryTypesReference(cwd, `.defold-types/${librariesDirName(readCliVersion())}`);

    const tsconfig = readTsconfig();
    expect(tsconfig.compilerOptions.types).toEqual([
      "defold-1.12.4",
      "extensions",
      librariesDirName(readCliVersion()),
    ]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("adds the .defold-types/ gitignore line", () => {
    writeTsconfig({ compilerOptions: {} });
    writeFileSync(path.join(cwd, ".gitignore"), "src/**/*.lua\n");

    ensureLibraryTypesReference(cwd, `.defold-types/${librariesDirName(readCliVersion())}`);

    const gitignore = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toContain(".defold-types/");
    expect(gitignore).toContain("src/**/*.lua");
  });

  test("a null materializedDir with no libraries entry rewrites nothing", () => {
    writeTsconfig({ compilerOptions: { types: ["defold-1.12.4"] } });
    const before = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureLibraryTypesReference(cwd, null);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(before);
    expect(existsSync(path.join(cwd, ".gitignore"))).toBe(false);
  });

  test("a null materializedDir removes an existing libraries entry, leaving siblings and typeRoots", () => {
    writeTsconfig({
      compilerOptions: {
        strict: true,
        typeRoots: [".defold-types"],
        types: ["defold-1.12.4", "extensions", "libraries"],
      },
    });

    ensureLibraryTypesReference(cwd, null);

    const tsconfig = readTsconfig();
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.12.4", "extensions"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
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

    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);

    expect(readTypes()).toEqual([surfaceDir("defold-1.12.4"), "extensions", "libraries"]);
  });

  test("carries a lone libraries entry through when extensions is absent", () => {
    writeTsconfig({
      compilerOptions: { typeRoots: [".defold-types"], types: ["old-surface", "libraries"] },
    });

    ensureMaterializedReference(cwd, `.defold-types/${surfaceDir("defold-1.12.4")}`);

    expect(readTypes()).toEqual([surfaceDir("defold-1.12.4"), "libraries"]);
  });
});

describe("library surface identity and reuse", () => {
  function writeBareTsconfig(): void {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`,
    );
  }

  test("the library directory and the tsconfig entry both name the generating toolchain", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    writeBareTsconfig();

    const { materializedDir } = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.26.0",
    });
    ensureLibraryTypesReference(cwd, materializedDir);

    expect(materializedDir).toBe(".defold-types/libraries@0.26.0");
    expect(existsSync(path.join(cwd, ".defold-types", "libraries@0.26.0", "keep.keep.d.ts"))).toBe(
      true,
    );
    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types?: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual(["libraries@0.26.0"]);
  });

  test("an uninjected version falls back to the running toolchain", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");

    const { materializedDir } = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
    });

    expect(materializedDir).toBe(`.defold-types/libraries@${readCliVersion()}`);
  });

  test("a toolchain upgrade leaves the earlier library surface intact", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    const first = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.26.0",
    });
    const firstDir = path.join(cwd, first.materializedDir as string);
    writeFileSync(path.join(firstDir, "sentinel.txt"), "written by 0.26.0\n");

    const second = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.27.0",
    });

    expect(second.materializedDir).toBe(".defold-types/libraries@0.27.0");
    expect(readFileSync(path.join(firstDir, "sentinel.txt"), "utf8")).toBe("written by 0.26.0\n");
    expect(existsSync(path.join(firstDir, "keep.keep.d.ts"))).toBe(true);
    expect(readdirSync(path.join(cwd, ".defold-types")).sort()).toEqual([
      "libraries@0.26.0",
      "libraries@0.27.0",
    ]);
  });

  test("a repeat materialization of a stamped surface reuses it instead of rewriting", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    const first = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.26.0",
    });
    const dir = path.join(cwd, first.materializedDir as string);

    // `index.d.ts` is rewritten on every run, so its surviving verbatim proves
    // the write was skipped — not merely that no wipe happened.
    writeFileSync(path.join(dir, "index.d.ts"), "// reused\n");

    const second = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.26.0",
    });

    expect(second.materializedDir).toBe(first.materializedDir);
    expect(second.modules).toEqual(["keep.keep"]);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe("// reused\n");
  });

  test("a library surface missing its stamp is rewritten, not reused", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    const first = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.26.0",
    });
    const dir = path.join(cwd, first.materializedDir as string);
    rmSync(path.join(dir, "package.json"), { force: true });
    writeFileSync(path.join(dir, "index.d.ts"), "// stale\n");

    materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.26.0",
    });

    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).not.toBe("// stale\n");
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toContain('import "./keep.keep";');
  });

  test("a changed match set is not mistaken for a reusable surface", () => {
    seedGenerated("keep.keep", "declare module 'keep.keep' {}\n");
    seedGenerated("extra.extra", "declare module 'extra.extra' {}\n");
    const first = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"])],
      generatedDir,
      cliVersion: "0.26.0",
    });
    const dir = path.join(cwd, first.materializedDir as string);

    const second = materializeVendoredLibraries({
      cwd,
      matched: [library("keep", ["keep.keep"]), library("extra", ["extra.extra"])],
      generatedDir,
      cliVersion: "0.26.0",
    });

    expect(second.modules).toEqual(["extra.extra", "keep.keep"]);
    expect(existsSync(path.join(dir, "extra.extra.d.ts"))).toBe(true);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toContain('import "./extra.extra";');
  });

  test("a null materializedDir removes a versioned libraries entry", () => {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            typeRoots: [".defold-types"],
            types: ["defold-1.12.4", "libraries@0.26.0"],
          },
        },
        null,
        2,
      )}\n`,
    );

    ensureLibraryTypesReference(cwd, null);

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types?: string[]; typeRoots?: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.12.4"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });
});

describe("ensureLibraryTypesReference across a toolchain upgrade", () => {
  test("the new entry replaces a legacy flat one, leaving siblings alone", () => {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            typeRoots: [".defold-types"],
            types: ["defold-1.12.4", "extensions", "libraries"],
          },
        },
        null,
        2,
      )}\n`,
    );

    ensureLibraryTypesReference(cwd, ".defold-types/libraries@0.27.0");

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types?: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual([
      "defold-1.12.4",
      "extensions",
      "libraries@0.27.0",
    ]);
  });

  test("the new entry replaces the previous toolchain's entry, not both at once", () => {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        { compilerOptions: { typeRoots: [".defold-types"], types: ["libraries@0.26.0"] } },
        null,
        2,
      )}\n`,
    );

    ensureLibraryTypesReference(cwd, ".defold-types/libraries@0.27.0");

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types?: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual(["libraries@0.27.0"]);
  });

  test("re-running at the same toolchain version rewrites nothing", () => {
    writeFileSync(
      path.join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        { compilerOptions: { typeRoots: [".defold-types"], types: ["libraries@0.27.0"] } },
        null,
        2,
      )}\n`,
    );
    const before = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureLibraryTypesReference(cwd, ".defold-types/libraries@0.27.0");

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(before);
  });
});

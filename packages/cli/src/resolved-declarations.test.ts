import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readCliVersion } from "./cli-version";
import { ensureExtensionTypesReference } from "./extension-materialize";
import { ensureLibraryTypesReference, librariesDirName } from "./library-materialize";
import { collectResolvedDeclarations } from "./resolved-declarations";
import { installEngineSurface, scaffoldResolvedProject } from "./resolved-project-fixture";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-resolved-declarations-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function libraries(file: string): string {
  return `.defold-types/${librariesDirName(readCliVersion())}/${file}`;
}

function resolvedFiles(): string[] {
  return [
    ".defold-types/extensions/index.d.ts",
    ".defold-types/extensions/png.d.ts",
    ".defold-types/extensions/shipped/defold-pixels/pixels.d.ts",
    ".defold-types/extensions/uuid4.d.ts",
    libraries("checkpoint.checkpoint.d.ts"),
    libraries("index.d.ts"),
  ];
}

describe("collectResolvedDeclarations", () => {
  test("returns the extensions closure and the libraries surface, read from disk", () => {
    scaffoldResolvedProject(cwd);

    const files = collectResolvedDeclarations(cwd);

    expect(Object.keys(files).sort()).toEqual(resolvedFiles());
    for (const [rel, text] of Object.entries(files)) {
      expect(text).toBe(readFileSync(path.join(cwd, rel), "utf8"));
    }
  });

  test("returns nothing once resolve has dropped both types entries", () => {
    scaffoldResolvedProject(cwd);
    ensureExtensionTypesReference(cwd, null);
    ensureLibraryTypesReference(cwd, null);

    expect(collectResolvedDeclarations(cwd)).toEqual({});
  });

  test("returns nothing when the entries name a .defold-types that is not there", () => {
    scaffoldResolvedProject(cwd);
    rmSync(path.join(cwd, ".defold-types"), { recursive: true, force: true });

    expect(collectResolvedDeclarations(cwd)).toEqual({});
  });

  test("returns nothing for a tsconfig with no compilerOptions", () => {
    writeFileSync(path.join(cwd, "tsconfig.json"), '{ "include": ["src/**/*.ts"] }\n');

    expect(collectResolvedDeclarations(cwd)).toEqual({});
  });

  test("skips the engine surface entry", () => {
    scaffoldResolvedProject(cwd);
    installEngineSurface(cwd);
    expect(readTypes()).toHaveLength(3);

    expect(Object.keys(collectResolvedDeclarations(cwd)).sort()).toEqual(resolvedFiles());
  });

  test("skips a type directive that resolves into node_modules", () => {
    scaffoldResolvedProject(cwd);
    const typesPackage = path.join(cwd, "node_modules", "@defold-typescript", "types");
    mkdirSync(typesPackage, { recursive: true });
    writeFileSync(path.join(typesPackage, "package.json"), '{ "types": "index.d.ts" }\n');
    writeFileSync(path.join(typesPackage, "index.d.ts"), "export {};\n");
    expect(readTypes()).toContain("@defold-typescript/types");

    expect(Object.keys(collectResolvedDeclarations(cwd)).sort()).toEqual(resolvedFiles());
  });
});

function readTypes(): string[] {
  const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")) as {
    compilerOptions: { types: string[] };
  };
  return tsconfig.compilerOptions.types;
}

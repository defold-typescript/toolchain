import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import * as ts from "typescript";
import { EXTENSION_GOLDEN_MANIFEST, EXTENSION_GOLDENS_DIR } from "../scripts/extension-goldens";
import { typecheckSurface as typecheck } from "./strict-resolution";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const EXTENSIONS_DIR = resolve(PACKAGE_ROOT, "test-d", "extensions");
const PROOF_CONFIG = resolve(EXTENSIONS_DIR, "tsconfig.extensions.json");

describe("extension golden proofs — isolated from the ambient surface", () => {
  test("the curated extension slots type-check against the committed goldens alone", () => {
    const { exitCode, output } = typecheck(PROOF_CONFIG);
    if (exitCode !== 0) {
      throw new Error(
        `extension proofs failed — a curation regressed (unused @ts-expect-error) ` +
          `or an accepted shape no longer resolves:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("harness can fail: an uncurated call without @ts-expect-error errors", () => {
    const { exitCode } = typecheck(resolve(EXTENSIONS_DIR, "tsconfig.extensions-neg.json"));
    expect(exitCode).not.toBe(0);
  });

  test("the proof program loads neither the package entrypoint nor any generated declaration", () => {
    const proc = Bun.spawnSync(["bunx", "tsc", "--listFilesOnly", "-p", PROOF_CONFIG], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
    if (proc.exitCode !== 0) {
      throw new Error(`tsc --listFilesOnly failed:\n${proc.stdout}${proc.stderr}`);
    }
    const inPackage = proc.stdout
      .toString()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => relative(PACKAGE_ROOT, line).split(sep).join("/"))
      .filter((path) => !path.startsWith(".."));
    for (const entry of EXTENSION_GOLDEN_MANIFEST) {
      expect(inPackage).toContain(`extension-goldens/${entry.outFile}`);
    }
    expect(inPackage).not.toContain("index.d.ts");
    expect(inPackage.filter((path) => path.startsWith("generated/"))).toEqual([]);
  });
});

function moduleDeclarations(file: string): ts.ModuleDeclaration[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(resolve(PACKAGE_ROOT, EXTENSION_GOLDENS_DIR, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: ts.ModuleDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isModuleDeclaration(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("extension golden forms", () => {
  for (const entry of EXTENSION_GOLDEN_MANIFEST) {
    test(`${entry.namespace}: the module is a tagged global table with no ambient twin`, () => {
      const module = moduleDeclarations(entry.outFile).find(
        (node) => ts.isStringLiteral(node.name) && node.name.text === entry.namespace,
      );
      if (module === undefined) throw new Error(`no declare module "${entry.namespace}"`);
      expect(ts.getJSDocTags(module).map((tag) => tag.tagName.text)).toEqual(["globalTable"]);
      expect(ts.getJSDocDeprecatedTag(module)).toBeUndefined();
    });
  }

  test("the goldens directory holds exactly the manifest's modules", () => {
    expect(readdirSync(resolve(PACKAGE_ROOT, EXTENSION_GOLDENS_DIR)).sort()).toEqual(
      EXTENSION_GOLDEN_MANIFEST.map((entry) => entry.outFile).sort(),
    );
  });
});

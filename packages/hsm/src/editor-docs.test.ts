import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { hsmModules } from "@defold-typescript/transpiler";
import ts from "typescript";
import { HSM_DECLARATIONS_DIR } from "../scripts/emit-declarations";

const PACKAGE_DIR = resolve(import.meta.dir, "..");
const TSCONFIG = resolve(PACKAGE_DIR, "tsconfig.json");
// TypeScript names every source file with forward slashes, on every platform.
const DECLARATIONS_DIR = HSM_DECLARATIONS_DIR.replaceAll("\\", "/");

const MODULES = hsmModules().map(({ name }) => name);

function declarationFile(name: string): string {
  return `${DECLARATIONS_DIR}/${name}.d.ts`;
}

function compilerOptions(): ts.CompilerOptions {
  const { config, error } = ts.readConfigFile(TSCONFIG, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  const { include: _include, ...rest } = config;
  return ts.parseJsonConfigFileContent(rest, ts.sys, dirname(TSCONFIG)).options;
}

const program = ts.createProgram(
  [...MODULES.map(declarationFile), resolve(PACKAGE_DIR, "src", "env.d.ts")],
  compilerOptions(),
);
const checker = program.getTypeChecker();

// The call hover and completion details make. A comment holding only a tag yields no text.
function isDocumented(symbol: ts.Symbol): boolean {
  return ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() !== "";
}

// Drops the members a type inherits from the lib, such as `String`'s on a string alias.
function isShipped(symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some((declaration) =>
    declaration.getSourceFile().fileName.startsWith(`${DECLARATIONS_DIR}/`),
  );
}

interface Walk {
  readonly checked: number;
  readonly undocumented: readonly string[];
}

function walk(name: string): Walk {
  const sourceFile = program.getSourceFile(declarationFile(name));
  const moduleSymbol =
    sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    throw new Error(`packages/types/hsm/${name}.d.ts is not a module in the program`);
  }
  const names: [string, ts.Symbol][] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    names.push([exported.name, exported]);
    if ((exported.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) === 0) {
      continue;
    }
    for (const member of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(exported))) {
      if (isShipped(member)) {
        names.push([`${exported.name}.${member.name}`, member]);
      }
    }
  }
  return {
    checked: names.length,
    undocumented: names.filter(([, symbol]) => !isDocumented(symbol)).map(([label]) => label),
  };
}

describe("hsm editor docs", () => {
  test("the walk covers every hsm module", () => {
    expect(MODULES.length).toBeGreaterThan(0);
  });

  for (const name of MODULES) {
    test(`${name}: the walk reaches at least one name`, () => {
      expect(walk(name).checked).toBeGreaterThan(0);
    });

    test(`${name}: every export and member carries a doc comment`, () => {
      expect(walk(name).undocumented).toEqual([]);
    });
  }
});

import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { isEditorFactoryOnlyImport } from "./editor-script-erasure";
import { transpile } from "./transpile";

const ONE_COMMAND = [
  'import { defineEditorScript } from "@defold-typescript/types";',
  "",
  "export default defineEditorScript({",
  "  get_commands: () => [",
  '    { label: "Say Hi", locations: ["Edit"], run: () => print("hi") },',
  "  ],",
  "});",
  "",
].join("\n");

const COMBINED_IMPORT = [
  'import { defineEditorScript, type EditorCommand } from "@defold-typescript/types";',
  "",
  "const commands: EditorCommand[] = [",
  '  { label: "Say Hi", locations: ["Edit"], run: () => print("hi") },',
  "];",
  "",
  "export default defineEditorScript({",
  "  get_commands: () => commands,",
  "});",
  "",
].join("\n");

function parseImport(source: string): ts.ImportDeclaration {
  const sourceFile = ts.createSourceFile(
    "t.ts",
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
  );
  return sourceFile.statements[0] as ts.ImportDeclaration;
}

describe("editor-script erasure", () => {
  test("lowers export default defineEditorScript to a chunk-level return of the hooks table", () => {
    const result = transpile(ONE_COMMAND);
    expect(result.diagnostics).toEqual([]);
    // The editor loads the chunk and uses its return value: the hooks table must
    // be returned directly, not wrapped as `{ default = hooks }`.
    expect(result.lua).toContain("return {");
    expect(result.lua).toContain("get_commands =");
    expect(result.lua).not.toContain("default");
    // The hooks table itself is returned, never the module `____exports` wrapper.
    expect(result.lua).not.toContain("return ____exports");
  });

  test("erases the defineEditorScript import (no require of the types package)", () => {
    const result = transpile(ONE_COMMAND);
    expect(result.lua).not.toContain("defineEditorScript");
    expect(result.lua).not.toContain("require(");
  });

  test("snapshots the full lowering of a trivial one-command editor script", () => {
    const result = transpile(ONE_COMMAND);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      return {get_commands = function() return {{
          label = "Say Hi",
          locations = {"Edit"},
          run = function() return print("hi") end
      }} end}
      "
    `);
  });

  test("erases a combined factory+type import (no require of the types package)", () => {
    const result = transpile(COMBINED_IMPORT);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).not.toContain("require(");
    expect(result.lua).not.toContain("____types");
    // The type-only `EditorCommand` specifier rides along and is dropped with the
    // erased statement; the final statement still returns the hooks table.
    expect(result.lua.trimEnd().endsWith("end}")).toBe(true);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local commands = {{
          label = "Say Hi",
          locations = {"Edit"},
          run = function() return print("hi") end
      }}
      return {get_commands = function() return commands end}
      "
    `);
  });
});

describe("isEditorFactoryOnlyImport", () => {
  test("a factory import with a trailing type-only specifier is erasable", () => {
    const node = parseImport(
      'import { defineEditorScript, type EditorCommand } from "@defold-typescript/types";',
    );
    expect(isEditorFactoryOnlyImport(node)).toBe(true);
  });

  test("a second runtime specifier keeps the import (not factory-only)", () => {
    const node = parseImport(
      'import { defineEditorScript, EditorCommand } from "@defold-typescript/types";',
    );
    expect(isEditorFactoryOnlyImport(node)).toBe(false);
  });

  test("a whole-clause type-only import binds nothing at runtime and is left alone", () => {
    const node = parseImport('import type { defineEditorScript } from "@defold-typescript/types";');
    expect(isEditorFactoryOnlyImport(node)).toBe(false);
  });

  test("a type-only specifier with no factory specifier is not erasable", () => {
    const node = parseImport('import { type EditorCommand } from "@defold-typescript/types";');
    expect(isEditorFactoryOnlyImport(node)).toBe(false);
  });

  test("a bare factory import is erasable (regression)", () => {
    const node = parseImport('import { defineEditorScript } from "@defold-typescript/types";');
    expect(isEditorFactoryOnlyImport(node)).toBe(true);
  });
});

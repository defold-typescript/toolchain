import { describe, expect, test } from "bun:test";
import type { TranspileDiagnostic } from "./project-output";
import { transpileProject } from "./transpile";

function warningsIn(
  diagnostics: readonly TranspileDiagnostic[],
  file: string,
): TranspileDiagnostic[] {
  return diagnostics.filter((d) => d.category === "warning" && d.file === file);
}

// The 1-based line and column of `name` where it follows `before` in `source`.
function positionOf(
  source: string,
  before: string,
  name: string,
): { line: number; column: number } {
  const index = source.indexOf(`${before}${name}`);
  if (index < 0) {
    throw new Error(`\`${before}${name}\` is not in the source`);
  }
  const offset = index + before.length;
  const lines = source.slice(0, offset).split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

const SHADOWING_MAIN = [
  'import { label } from "./ui";',
  "",
  "function next(): void {}",
  "const select = (...xs: number[]) => xs.length;",
  "let { tonumber } = { tonumber: 1 };",
  "class timer {}",
  "enum go {",
  "  A,",
  "}",
  "",
  "export const used = [next, select, tonumber, timer, go.A, label];",
  "",
].join("\n");

const UI = "export const label = 1;\n";

describe("file-level Lua global shadow warning", () => {
  test("warns once per top-level local that hides a Lua or Defold global, at its name", () => {
    const result = transpileProject({ files: { "main.ts": SHADOWING_MAIN, "ui.ts": UI } });
    expect(result.diagnostics.filter((d) => d.category !== "warning")).toEqual([]);
    expect(result.lua["main.ts"]).toBeDefined();

    const expected: [before: string, name: string][] = [
      ["import { ", "label"],
      ["function ", "next"],
      ["const ", "select"],
      ["let { ", "tonumber"],
      ["class ", "timer"],
      ["enum ", "go"],
    ];
    const warnings = warningsIn(result.diagnostics, "main.ts");
    expect(warnings).toHaveLength(expected.length);
    for (const [before, name] of expected) {
      const at = positionOf(SHADOWING_MAIN, before, name);
      const matching = warnings.filter((w) => w.line === at.line && w.column === at.column);
      expect(matching).toHaveLength(1);
      expect(matching[0]?.message).toContain(`\`${name}\``);
    }
    expect(warningsIn(result.diagnostics, "ui.ts")).toEqual([]);
  });

  test.each([
    [
      "a destructured `type`, which TypeScript-to-Lua renames",
      "let { type } = { type: 1 };\nexport const t = type;\n",
    ],
    [
      "a top-level `function print`, which TypeScript-to-Lua renames",
      "function print(): void {}\nexport const p = print;\n",
    ],
    [
      "a name only TypeScript's default library declares",
      "const Math = 1;\nexport const m = Math;\n",
    ],
    [
      "a name only the language extensions declare",
      "const LuaTable = 1;\nexport const t = LuaTable;\n",
    ],
    ["an exported function", "export function next(): void {}\n"],
    ["a default-exported function", "export default function select(): void {}\n"],
    ["a const enum", "const enum go {\n  A,\n}\nexport const a = go.A;\n"],
    ["a declared name", "declare const rawequal: number;\nexport const r = rawequal;\n"],
    [
      "a local inside a function body",
      'export function find(): void {\n  const label = gui.get_node("label");\n  print(label);\n}\n',
    ],
    ["a name no global has", "const speed = 1;\nexport const s = speed;\n"],
    [
      "a file with no import or export, whose top-level names are globals",
      "function helper(): void {}\nhelper();\n",
    ],
  ])("does not warn for %s", (_case, source) => {
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toEqual([]);
  });

  test.each(["isMessage", "onMessage", "isPhysicsEvent", "isWindowEvent"])(
    "does not warn for `%s`, a global the build lowers away before Lua runs",
    (name) => {
      const source = `function ${name}(): boolean {\n  return true;\n}\nexport const v = ${name}();\n`;
      const result = transpileProject({ files: { "main.ts": source } });
      expect(result.diagnostics).toEqual([]);
    },
  );

  test("warns for a local that an export clause re-exports, since its emit stays a local", () => {
    const source = "function next(): void {}\nexport { next };\n";
    const result = transpileProject({ files: { "main.ts": source } });
    const warnings = warningsIn(result.diagnostics, "main.ts");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject(positionOf(source, "function ", "next"));
  });

  test("reports a helper both an editor script and a runtime script import once", () => {
    const helper = "function next(): number {\n  return 1;\n}\nexport const one = next();\n";
    const editorScript = [
      'import { defineEditorScript } from "@defold-typescript/types/editor-script";',
      'import { one } from "./helper";',
      "",
      "export default defineEditorScript({",
      '  get_commands: () => [{ label: "One", locations: ["Edit"], run: () => print(one) }],',
      "});",
      "",
    ].join("\n");
    const runtimeScript = [
      'import { defineScript } from "@defold-typescript/types";',
      'import { one } from "./helper";',
      "",
      "export default defineScript({ init: () => ({ n: one }) });",
      "",
    ].join("\n");
    const result = transpileProject({
      files: { "helper.ts": helper, "tool.ts": editorScript, "main.ts": runtimeScript },
    });
    expect(result.diagnostics.filter((d) => d.category !== "warning")).toEqual([]);
    const warnings = warningsIn(result.diagnostics, "helper.ts");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject(positionOf(helper, "function ", "next"));
  });
});

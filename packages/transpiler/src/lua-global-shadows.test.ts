import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import { isUnsafeName } from "typescript-to-lua/dist/transformation/utils/safe-names.js";
import {
  isLuaGlobal,
  luaGlobalShadowMessage,
  luaLocalShadowMessage,
  readGlobalShadowsSetting,
} from "./lua-global-shadows";
import { PROBE, positionOf } from "./lua-global-shadows.test-support";
import type { TranspileDiagnostic } from "./project-output";
import { createTranspileSession } from "./session";
import { transpileProject } from "./transpile";

const GOTCHAS_GUIDE = resolve(
  import.meta.dir,
  "..",
  "..",
  "docs",
  "guide",
  "typescript-gotchas.md",
);
const RENAME_LEAD = "TypeScriptToLua renames these globals wherever you declare them:";

function warningsIn(
  diagnostics: readonly TranspileDiagnostic[],
  file: string,
): TranspileDiagnostic[] {
  return diagnostics.filter((d) => d.category === "warning" && d.file === file);
}

function byPosition(diagnostics: readonly TranspileDiagnostic[]): TranspileDiagnostic[] {
  return [...diagnostics].sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0),
  );
}

const SHADOWING_MAIN = [
  'import { label, sound } from "./ui";',
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

const UI = "export const label = 1;\nexport const sound = 1;\n";

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

  test.each([
    ["an unused named import", 'import { label } from "./ui";\nexport const s = 1;\n'],
    [
      "a binding read only in a type position",
      'import { label } from "./ui";\nexport const s: typeof label = 1;\n',
    ],
    ["an unused namespace import", 'import * as sound from "./ui";\nexport const s = 1;\n'],
    ["an unused default import", 'import timer from "./ui";\nexport const s = 1;\n'],
  ])("does not warn for an import binding TypeScript-to-Lua elides: %s", (_case, source) => {
    const result = transpileProject({
      files: { "main.ts": source, "ui.ts": "export const label = 1;\nexport default 1;\n" },
    });
    expect(result.diagnostics).toEqual([]);
  });

  test.each([
    [
      "main.ts",
      'import { defineScript as next } from "@defold-typescript/types";\nexport default next({ init: () => ({ n: 1 }) });\n',
    ],
    [
      "tool.ts",
      'import { defineEditorScript as next } from "@defold-typescript/types/editor-script";\nexport default next({ get_commands: () => [] });\n',
    ],
  ])("does not warn for a factory import the build erases: %s", (file, source) => {
    const result = transpileProject({ files: { [file]: source } });
    expect(result.diagnostics).toEqual([]);
  });

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

describe("readGlobalShadowsSetting", () => {
  test.each([
    ["no package.json", undefined],
    ["a package with no namespace", { name: "game" }],
    ["a namespace without the key", { "defold-typescript": { "runtime-dir": "lib/rt" } }],
    ['"warn"', { "defold-typescript": { "global-shadows": "warn" } }],
  ])("reads %s as warn", (_case, pkg) => {
    expect(readGlobalShadowsSetting(pkg)).toBe("warn");
  });

  test('reads "error" as error', () => {
    expect(readGlobalShadowsSetting({ "defold-typescript": { "global-shadows": "error" } })).toBe(
      "error",
    );
  });

  test.each([true, "Error", 1])(
    "rejects %p, naming the setting and both accepted values",
    (value) => {
      expect(() =>
        readGlobalShadowsSetting({ "defold-typescript": { "global-shadows": value } }),
      ).toThrow(
        `package.json "defold-typescript"."global-shadows" is ${JSON.stringify(value)}; it must be "warn" or "error".`,
      );
    },
  );
});

type Expected = [before: string, name: string, scope: "file" | "local"];

// The error each expected name produces in `file`, located from `source`.
function errorsAt(
  file: string,
  source: string,
  expected: readonly Expected[],
): TranspileDiagnostic[] {
  return byPosition(
    expected.map(([before, name, scope]) => ({
      file,
      ...positionOf(source, before, name),
      message: scope === "file" ? luaGlobalShadowMessage(name) : luaLocalShadowMessage(name),
    })),
  );
}

describe("global-shadows mode", () => {
  test('"error" reports the file-level shadow and every inner name that hides a global', () => {
    const result = transpileProject({ files: { "probe.ts": PROBE }, globalShadows: "error" });
    expect(byPosition(result.diagnostics)).toEqual(
      errorsAt("probe.ts", PROBE, [
        ["function ", "next", "file"],
        ["paramNext(", "next", "local"],
        ["  const ", "select", "local"],
        ["paramSelectFind(", "select", "local"],
      ]),
    );
  });

  test.each([
    ["no setting", {}],
    ['"warn"', { globalShadows: "warn" as const }],
  ])("%s reports only the file-level shadow, as a warning", (_case, mode) => {
    const result = transpileProject({ files: { "probe.ts": PROBE }, ...mode });
    expect(result.diagnostics).toEqual([
      {
        file: "probe.ts",
        line: 1,
        column: 10,
        message: luaGlobalShadowMessage("next"),
        category: "warning",
      },
    ]);
  });
});

const SCOPES = [
  "export function guarded(xs: number[]): number {",
  "  let total = 0;",
  "  try {",
  "    total = xs[0];",
  "  } catch (tonumber) {",
  "    total = -1;",
  "  }",
  "  for (const next of xs) {",
  "    total += next;",
  "  }",
  "  if (total > 0) {",
  "    let setmetatable = total;",
  "    total = setmetatable;",
  "  }",
  "  class go {",
  "    n = 1;",
  "  }",
  "  enum vmath {",
  "    A,",
  "  }",
  "  return total + new go().n + vmath.A;",
  "}",
  "export function unpacked({ select }: { select: number }): number {",
  "  return select;",
  "}",
  "export const labelled = (label: string): string => label;",
  "export class Holder {",
  "  constructor(public timer: number) {}",
  "  play(sound: number): number {",
  "    return sound + this.timer;",
  "  }",
  "}",
  "namespace msg {",
  "  const select = 1;",
  "  export const posted = select;",
  "}",
  "export const posted = msg.posted;",
  "",
].join("\n");

// TypeScript-to-Lua keeps a local by the name of each exported class and of an
// exported namespace that holds a value, but puts an exported function, enum or
// const on the export table alone. A named function expression keeps its name
// only when its body calls it; a named class expression always does.
const EXPORTED = [
  "export class go {}",
  "export default class sys {}",
  "export namespace sound {",
  "  export const gain = 1;",
  "  export function select(): number {",
  "    return gain;",
  "  }",
  "  export class timer {}",
  "}",
  "export namespace window {",
  "  export type Size = number;",
  "}",
  "export enum vmath {",
  "  A,",
  "}",
  "export const countdown = function next(n: number): number {",
  "  return n > 0 ? next(n - 1) : 0;",
  "};",
  "export const once = function select(n: number): number {",
  "  return n;",
  "};",
  "export const Made = class physics {};",
  "",
].join("\n");

describe('"global-shadows": "error" at every scope', () => {
  test("reports each inner declaration form once, at its name", () => {
    const result = transpileProject({ files: { "scopes.ts": SCOPES }, globalShadows: "error" });
    expect(byPosition(result.diagnostics)).toEqual(
      errorsAt("scopes.ts", SCOPES, [
        ["catch (", "tonumber", "local"],
        ["for (const ", "next", "local"],
        ["  let ", "setmetatable", "local"],
        ["  class ", "go", "local"],
        ["  enum ", "vmath", "local"],
        ["unpacked({ ", "select", "local"],
        ["= (", "label", "local"],
        ["public ", "timer", "local"],
        ["play(", "sound", "local"],
        ["namespace ", "msg", "file"],
        ["  const ", "select", "local"],
      ]),
    );
  });

  test("reports the exported forms that still emit a local, and no others", () => {
    const result = transpileProject({ files: { "exported.ts": EXPORTED }, globalShadows: "error" });
    expect(byPosition(result.diagnostics)).toEqual(
      errorsAt("exported.ts", EXPORTED, [
        ["export class ", "go", "file"],
        ["default class ", "sys", "file"],
        ["namespace ", "sound", "file"],
        ["  export class ", "timer", "local"],
        ["function ", "next", "local"],
        ["class ", "physics", "local"],
      ]),
    );
  });

  test.each([
    ["scopes.ts", SCOPES],
    ["exported.ts", EXPORTED],
  ])('reports nothing in %s under "warn"', (file, source) => {
    const result = transpileProject({ files: { [file]: source } });
    expect(result.diagnostics).toEqual([]);
  });

  test("reports a script file's parameter but none of its top-level names", () => {
    const source = "function select(next: number): number {\n  return next;\n}\nselect(1);\n";
    const result = transpileProject({ files: { "main.ts": source }, globalShadows: "error" });
    expect(result.diagnostics).toEqual(errorsAt("main.ts", source, [["select(", "next", "local"]]));
  });

  test.each([
    [
      "an overload signature's parameter",
      "export function f(next: number): number;\nexport function f(n: string): number;\nexport function f(n: number | string): number {\n  return Number(n);\n}\n",
    ],
    ["an interface method's parameter", "export interface I {\n  m(next: number): void;\n}\n"],
    ["a function type's parameter", "export type F = (select: number) => void;\n"],
    [
      "a declared function's parameter",
      "declare function g(next: number): void;\nexport const r = 1;\n",
    ],
    ["an object property", "export const o = { next: 1 };\n"],
    [
      "a class property and a method name",
      "export class K {\n  next = 1;\n  select(): number {\n    return this.next;\n  }\n}\n",
    ],
    [
      "an exported const in a namespace",
      "namespace ns {\n  export const select = 1;\n}\nexport const s = ns.select;\n",
    ],
    [
      "an inner `const print`, which TypeScript-to-Lua renames",
      "export function f(): number {\n  const print = 1;\n  return print;\n}\n",
    ],
    [
      "an inner name only TypeScript's default library declares",
      "export function f(): number {\n  const Math = 1;\n  return Math;\n}\n",
    ],
    [
      "an inner name no global has",
      "export function f(): number {\n  const speed = 1;\n  return speed;\n}\n",
    ],
  ])("reports nothing for %s", (_case, source) => {
    const result = transpileProject({ files: { "main.ts": source }, globalShadows: "error" });
    expect(result.diagnostics).toEqual([]);
  });
});

describe("the TypeScript gotchas guide", () => {
  test("lists exactly the declared globals TypeScript-to-Lua renames", () => {
    const session = createTranspileSession();
    session.update({ "main.ts": "export const x = 1;\n" });
    const program = session.getProgram();
    const sourceFile = program?.getSourceFile("main.ts");
    if (program === undefined || sourceFile === undefined) {
      throw new Error("session produced no program for main.ts");
    }
    const checker = program.getTypeChecker();
    const renamed = new Set(
      checker
        .getSymbolsInScope(sourceFile, ts.SymbolFlags.Value)
        .map((symbol) => symbol.name)
        // A `declare module "..."` is in scope under its quoted specifier,
        // which no declaration can take as a name.
        .filter(
          (name) =>
            ts.isIdentifierStart(name.charCodeAt(0), ts.ScriptTarget.Latest) &&
            isUnsafeName(name, { luaTarget: tstl.LuaTarget.Lua51 }) &&
            isLuaGlobal(program, checker, name),
        ),
    );

    const paragraph = readFileSync(GOTCHAS_GUIDE, "utf8")
      .split(/\r?\n\r?\n/)
      .find((p) => p.startsWith(RENAME_LEAD));
    expect(paragraph).toBeDefined();
    const listed = new Set([...(paragraph ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]));

    expect([...listed].sort()).toEqual([...renamed].sort());
  });
});

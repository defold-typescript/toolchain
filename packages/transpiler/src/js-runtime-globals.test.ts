import { describe, expect, test } from "bun:test";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import * as ts from "typescript";
import {
  findMissingJsGlobals,
  MISSING_JS_GLOBALS,
  missingJsGlobalMessage,
} from "./js-runtime-globals";
import { createTranspileSession } from "./session";

const LUA_OK = 0;
const MEASURE_TIMEOUT_MS = 120_000;

// Each form a lib global takes in source: the bare value, a call, `new`, and
// every named static member, called when it is a method. TypeScript-to-Lua
// lowers some globals only in some forms (`Math.floor(x)` but not a bare
// `Math`), so a global counts as missing only when no form lowers it.
function probeForms(checker: ts.TypeChecker, symbol: ts.Symbol): string[] {
  const name = symbol.name;
  const type = checker.getTypeOfSymbol(symbol);
  const forms = [name];
  if (type.getCallSignatures().length > 0) {
    forms.push(`${name}(value)`);
  }
  if (type.getConstructSignatures().length > 0) {
    forms.push(`new ${name}(value)`);
  }
  for (const member of checker.getPropertiesOfType(type)) {
    // A well-known-symbol key (`[Symbol.iterator]`) has no dotted spelling.
    if (member.name.startsWith("__@")) {
      continue;
    }
    // `RegExp["$&"]` has no dotted spelling either.
    const access = /^[A-Za-z_$][\w$]*$/.test(member.name)
      ? `${name}.${member.name}`
      : `${name}[${JSON.stringify(member.name)}]`;
    const isMethod = checker.getTypeOfSymbol(member).getCallSignatures().length > 0;
    forms.push(isMethod ? `${access}(value)` : access);
  }
  return forms;
}

interface AbsentGlobalProbe {
  absentReads(chunk: string): Set<string>;
  close(): void;
}

// One Lua 5.1 state with the lualib bundle loaded, whose `_G` records every read
// of a global it lacks: the read that yields nil, and raises on first use, in
// the engine.
function createAbsentGlobalProbe(bundle: string): AbsentGlobalProbe {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_getglobal(L, "package");
  lua.lua_getfield(L, -1, "preload");
  if (lauxlib.luaL_loadbuffer(L, bundle, Buffer.byteLength(bundle), "=lualib_bundle") !== LUA_OK) {
    throw new Error(`Lua failed to load the lualib bundle: ${lua.lua_tostring(L, -1)}`);
  }
  lua.lua_setfield(L, -2, "lualib_bundle");
  lua.lua_settop(L, 0);
  const hook = [
    'require("lualib_bundle")',
    "____absent = {}",
    "setmetatable(_G, { __index = function(_, key) ____absent[key] = true end })",
  ].join("\n");
  if (lauxlib.luaL_dostring(L, hook) !== LUA_OK) {
    throw new Error(`Lua failed to install the global hook: ${lua.lua_tostring(L, -1)}`);
  }
  const collect = [
    "local keys = {}",
    "for key in pairs(____absent) do keys[#keys + 1] = tostring(key) end",
    "____absent = {}",
    'return table.concat(keys, ",")',
  ].join("\n");
  return {
    absentReads(chunk) {
      if (lauxlib.luaL_loadbuffer(L, chunk, Buffer.byteLength(chunk), "=probe") !== LUA_OK) {
        throw new Error(`Lua failed to load a probe chunk: ${lua.lua_tostring(L, -1)}`);
      }
      // A chunk that indexes or calls the nil global raises; the read before it
      // is already recorded.
      lua.lua_pcall(L, 0, 0, 0);
      lua.lua_settop(L, 0);
      if (lauxlib.luaL_dostring(L, collect) !== LUA_OK) {
        throw new Error(`Lua failed to read the absent globals: ${lua.lua_tostring(L, -1)}`);
      }
      const keys = lua.lua_tostring(L, -1);
      lua.lua_settop(L, 0);
      return new Set(keys === "" ? [] : keys.split(","));
    },
    close() {
      lua.lua_close(L);
    },
  };
}

let measured: ReadonlySet<string> | undefined;

// The lib globals the production compile leaves as an absent Lua global in
// every form: measured from TypeScript-to-Lua and Lua 5.1, never written down.
function measureMissingJsGlobals(): ReadonlySet<string> {
  if (measured !== undefined) {
    return measured;
  }
  const session = createTranspileSession();
  const bundle = session.update({
    "main.ts": "export const m = new Map<string, number>();\n",
  }).lualib;
  const program = session.getProgram();
  const sourceFile = program?.getSourceFile("main.ts");
  if (bundle === undefined || program === undefined || sourceFile === undefined) {
    throw new Error("the session produced no lualib bundle or program");
  }
  const checker = program.getTypeChecker();
  const isDefaultLibrary = (declaration: ts.Declaration): boolean =>
    program.isSourceFileDefaultLibrary(declaration.getSourceFile());
  const globals = checker
    .getSymbolsInScope(sourceFile, ts.SymbolFlags.Value)
    .filter((symbol) => {
      const declarations = symbol.declarations ?? [];
      return declarations.length > 0 && declarations.every(isDefaultLibrary);
    })
    .map((symbol) => ({ name: symbol.name, forms: probeForms(checker, symbol) }));

  const probe = createAbsentGlobalProbe(bundle);
  try {
    const missing = new Set<string>();
    for (const { name, forms } of globals) {
      const lowered = forms.some((form) => {
        const source = `declare const value: any;\nexport const probe = ${form};\n`;
        // A probe that does not parse emits a recovery, not the form.
        if (
          (ts.transpileModule(source, { reportDiagnostics: true }).diagnostics ?? []).length > 0
        ) {
          throw new Error(`the probe \`${form}\` does not parse`);
        }
        const chunk = session.update({ "main.ts": source }).lua["main.ts"];
        if (chunk === undefined) {
          throw new Error(`the compile emitted no Lua for \`${form}\``);
        }
        return !probe.absentReads(chunk).has(name);
      });
      if (!lowered) {
        missing.add(name);
      }
    }
    measured = missing;
    return missing;
  } finally {
    probe.close();
  }
}

describe("MISSING_JS_GLOBALS", () => {
  test(
    "equals the lib globals the Lua compile leaves absent in every form",
    () => {
      expect([...MISSING_JS_GLOBALS.keys()].sort()).toEqual([...measureMissingJsGlobals()].sort());
    },
    MEASURE_TIMEOUT_MS,
  );

  test(
    "holds the unlowered globals and none TypeScript-to-Lua lowers",
    () => {
      const missing = measureMissingJsGlobals();
      for (const name of ["JSON", "Date", "encodeURIComponent"]) {
        expect(missing.has(name)).toBe(true);
      }
      for (const name of ["Math", "Number", "Object", "Map", "parseFloat", "Promise"]) {
        expect(missing.has(name)).toBe(false);
      }
    },
    MEASURE_TIMEOUT_MS,
  );
});

function mainOf(source: string, extra: Record<string, string> = {}) {
  const session = createTranspileSession();
  session.update({ "main.ts": source, ...extra });
  const program = session.getProgram();
  const sourceFile = program?.getSourceFile("main.ts");
  if (program === undefined || sourceFile === undefined) {
    throw new Error("session produced no program for main.ts");
  }
  return { program, sourceFile };
}

function flatten(message: ts.Diagnostic["messageText"]): string {
  return typeof message === "string" ? message : message.messageText;
}

describe("findMissingJsGlobals", () => {
  test("reports each value reference at the global's name", () => {
    const source = [
      "declare const text: string;",
      "export const a = JSON.stringify({ a: 1 });",
      "export const b = Date.now();",
      "export const c = new Date();",
      "export const d = encodeURIComponent(text);",
      "export const e = { JSON };",
      "export class Stamp extends Date {}",
      "const Ref = WeakRef<Date>;",
      "export const r = new Ref({});",
      "",
    ].join("\n");
    const expected = [
      ["= JSON.", "JSON"],
      ["= Date.", "Date"],
      ["new Date", "Date"],
      ["= encodeURIComponent", "encodeURIComponent"],
      ["{ JSON }", "JSON"],
      ["extends Date", "Date"],
      ["= WeakRef<", "WeakRef"],
    ] as const;
    const { program, sourceFile } = mainOf(source);
    const diagnostics = findMissingJsGlobals(program, sourceFile);
    expect(
      diagnostics.map((d) => ({
        start: d.start,
        length: d.length,
        category: d.category,
        message: flatten(d.messageText),
      })),
    ).toEqual(
      expected.map(([context, name]) => ({
        start: source.indexOf(context) + context.indexOf(name),
        length: name.length,
        category: ts.DiagnosticCategory.Error,
        message: missingJsGlobalMessage(name),
      })),
    );
  });

  test("names the global and its Defold replacement", () => {
    for (const name of ["JSON", "Date", "encodeURIComponent"]) {
      const replacement = MISSING_JS_GLOBALS.get(name);
      expect(replacement).toBeTruthy();
      expect(missingJsGlobalMessage(name)).toContain(`\`${name}\``);
      expect(missingJsGlobalMessage(name)).toContain(replacement ?? "");
    }
  });

  test.each([
    [
      "a local of the same name",
      'const JSON = { stringify: (v: unknown) => "" };\nexport const a = JSON.stringify(1);\n',
      {},
    ],
    [
      "an import of the same name",
      'import { Date } from "./clock";\nexport const b = Date.now();\n',
      { "clock.ts": "export const Date = { now: () => 0 };\n" },
    ],
    [
      "a property of the same name",
      "declare const obj: { JSON: number };\nexport const c = obj.JSON;\n",
      {},
    ],
    ["a type reference", "export let d: Date | undefined;\n", {}],
    ["a `typeof` inside a type", "export type J = typeof JSON;\n", {}],
    [
      "a global the project itself declares",
      "export const f = JSON.stringify(1);\n",
      { "globals.d.ts": "declare var JSON: JSON;\n" },
    ],
    ["an interface inheriting the global", "export interface Stamp extends Date {}\n", {}],
    ["a class implementing the global", "export class Stamp implements Date {}\n", {}],
    [
      "an instantiation of a local of the same name",
      "function WeakRef<T>(value: T): T {\n  return value;\n}\nexport const r = WeakRef<number>;\n",
      {},
    ],
  ])("reports nothing for %s", (_label, source, extra) => {
    const { program, sourceFile } = mainOf(source, extra);
    expect(findMissingJsGlobals(program, sourceFile)).toEqual([]);
  });
});

import { describe, expect, test } from "bun:test";
import { COMPANION_INTERNAL_FIELD } from "./companion-closure";
import { findEmittedRequires } from "./emitted-requires";
import { createTranspileSession } from "./session";
import type { TranspileProjectResult } from "./transpile";

const FACTORY_IMPORT = 'import { defineScript } from "@defold-typescript/types";';

function lines(...rows: readonly string[]): string {
  return `${rows.join("\n")}\n`;
}

// Through the session rather than a hand-assembled plugin list, so every case
// runs in the pipeline the build runs, alongside the lifecycle erasure whose
// output the split has to survive.
function emit(files: Readonly<Record<string, string>>): TranspileProjectResult {
  const session = createTranspileSession();
  const result = session.update(files);
  expect(result.diagnostics.filter((d) => d.category !== "warning")).toEqual([]);
  return result;
}

function chunkFor(result: TranspileProjectResult, rel: string): string {
  const lua = result.lua[rel];
  expect(lua).toBeString();
  return lua as string;
}

function companionFor(result: TranspileProjectResult, rel: string): string {
  const companion = result.companions?.[rel];
  expect(companion).toBeString();
  return companion as string;
}

// How many times a name is bound or assigned at all — the question "is this
// member defined twice" reduces to, and the one a redeclaration bug moves.
function definitionCount(lua: string, member: string): number {
  const patterns = [
    new RegExp(String.raw`\blocal\s+${member}\s*=`, "g"),
    new RegExp(String.raw`\blocal\s+function\s+${member}\b`, "g"),
    new RegExp(String.raw`\bfunction\s+${member}\s*\(`, "g"),
    new RegExp(String.raw`____exports\.${member}\s*=`, "g"),
  ];
  return patterns.reduce((total, re) => total + (lua.match(re)?.length ?? 0), 0);
}

const DOOR = lines(
  FACTORY_IMPORT,
  "",
  "const RATE = 2;",
  "export const DOOR_SPEED = 3 * RATE;",
  "export const state = { open: false };",
  "",
  "defineScript({",
  "  init() {",
  "    state.open = true;",
  "    print(DOOR_SPEED + RATE);",
  "  },",
  "});",
);

describe("companion emit — the two chunks", () => {
  test("a script-kind source with a non-empty closure produces a companion and a script", () => {
    const result = emit({ "game/doors/door.ts": DOOR });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    // The companion is a module: it opens the exports table and returns it.
    expect(companion).toContain("____exports.DOOR_SPEED =");
    expect(companion).toContain("____exports.state =");
    expect(companion).toMatch(/return\s+____exports\s*$/m);

    // The script reaches that table through a require of the companion's path.
    expect(findEmittedRequires(script)).toContain("game.doors.door");
    expect(script).toContain('require("game.doors.door")');
  });

  test("the script declares no closure member a second time", () => {
    const result = emit({ "game/doors/door.ts": DOOR });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    for (const member of ["DOOR_SPEED", "state"]) {
      expect(definitionCount(companion, member)).toBe(1);
      expect(definitionCount(script, member)).toBe(0);
    }
    // The initializers themselves live in the companion alone.
    expect(companion).toContain("3 * RATE");
    expect(script).not.toContain("3 * RATE");
    expect(script).not.toContain("{open = false}");
  });

  test("a mutable exported object is the script's own required table, not a fresh one", () => {
    const result = emit({ "game/doors/door.ts": DOOR });
    const script = chunkFor(result, "game/doors/door.ts");

    // The hook mutates the required module's field rather than a local copy.
    expect(script).toContain("____exports.state.open = true");
    expect(script).toMatch(/local\s+____exports\s*=\s*require\("game\.doors\.door"\)/);
  });

  test("a private closure member reaches the script off the reserved internals field", () => {
    const result = emit({ "game/doors/door.ts": DOOR });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    expect(companion).toContain(`____exports.${COMPANION_INTERNAL_FIELD}`);
    expect(companion).toContain("local RATE = 2");
    expect(script).toContain(`____exports.${COMPANION_INTERNAL_FIELD}.RATE`);
    expect(script).not.toContain("local RATE = 2");
  });

  test("a runtime import above the earliest closure member still loads first", () => {
    const result = emit({
      "game/lib/log.ts": "export function log(message: string): void {\n  print(message);\n}\n",
      "game/doors/door.ts": lines(
        FACTORY_IMPORT,
        'import { log } from "../lib/log";',
        "",
        "export const DOOR_SPEED = 3;",
        "",
        "defineScript({",
        "  init() {",
        "    log('opened');",
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "game/doors/door.ts");

    const requires = findEmittedRequires(script);
    expect(requires).toEqual(["game.lib.log", "game.doors.door"]);
  });

  test("a dotted source name is canonicalized the same way the require check reads it", () => {
    const result = emit({
      "src/foo.bar.ts": lines(
        FACTORY_IMPORT,
        "",
        "export const VALUE = 1;",
        "",
        "defineScript({",
        "  init() {",
        "    print(VALUE);",
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "src/foo.bar.ts");

    expect(script).toContain('require("src.foo_bar")');
  });
});

describe("companion emit — every name a chunk reads is bound in that chunk", () => {
  for (const [spelling, clause] of [
    ["aliased", "export { value as speed };"],
    ["plain", "export { value };"],
  ] as const) {
    const exported = spelling === "aliased" ? "speed" : "value";

    test(`an ${spelling} export declaration is assigned in the companion, not the script`, () => {
      const result = emit({
        "game/doors/door.ts": lines(
          FACTORY_IMPORT,
          "",
          "const value = 1;",
          clause,
          "",
          "defineScript({",
          "  init() {",
          '    print("hi");',
          "  },",
          "});",
        ),
      });
      const script = chunkFor(result, "game/doors/door.ts");
      const companion = companionFor(result, "game/doors/door.ts");

      expect(companion).toContain(`____exports.${exported} =`);
      expect(companion).toContain("local value = 1");
      expect(script).not.toContain(`____exports.${exported} =`);
      expect(definitionCount(script, "value")).toBe(0);
      expect(script).not.toMatch(/(^|[^.\w])value\b/m);
    });
  }

  test("a re-export is carried by the companion's table", () => {
    const result = emit({
      "game/lib/rates.ts": "export const x = 7;\n",
      "game/doors/door.ts": lines(
        FACTORY_IMPORT,
        'export { x } from "../lib/rates";',
        "",
        "export const DOOR_SPEED = 3;",
        "",
        "defineScript({",
        "  init() {",
        '    print("hi");',
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    expect(companion).toContain("____exports.x");
    expect(findEmittedRequires(companion)).toContain("game.lib.rates");
    expect(script).not.toContain("____exports.x =");
  });

  test("a module both imported and re-exported leaves the script its own binding", () => {
    const result = emit({
      "game/lib/rates.ts": "export const x = 7;\nexport const y = 9;\n",
      "game/doors/door.ts": lines(
        FACTORY_IMPORT,
        'import { y } from "../lib/rates";',
        'export { x } from "../lib/rates";',
        "",
        "export const DOOR_SPEED = 3;",
        "",
        "defineScript({",
        "  init() {",
        "    print(y);",
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    expect(findEmittedRequires(script)).toContain("game.lib.rates");
    expect(definitionCount(script, "y")).toBe(1);
    expect(companion).toContain("____exports.x");
    expect(findEmittedRequires(companion)).toContain("game.lib.rates");
  });

  test("a private sibling of a multi-binding declaration is bound once, in the companion", () => {
    const result = emit({
      "game/doors/door.ts": lines(
        FACTORY_IMPORT,
        "",
        "const a = 1, b = 2;",
        "export function speed(): number {",
        "  return a;",
        "}",
        "",
        "defineScript({",
        "  init() {",
        "    print(b);",
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    // Bound once where its initializer runs; the script only re-reads it off
    // the reserved field, the way any other private member reaches the script.
    expect(definitionCount(companion, "b")).toBe(1);
    expect(companion).toContain("local b = 2");
    expect(script).not.toContain("local b = 2");
    expect(script).toContain(`____exports.${COMPANION_INTERNAL_FIELD}.b`);
  });

  test("a named import the closure depends on is copied into the companion", () => {
    const result = emit({
      "game/lib/rates.ts": "export const x = 7;\n",
      "game/doors/door.ts": lines(
        FACTORY_IMPORT,
        'import { x } from "../lib/rates";',
        "",
        "export const wrapped = x + 1;",
        "",
        "defineScript({",
        "  init() {",
        '    print("hi");',
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    expect(findEmittedRequires(companion)).toContain("game.lib.rates");
    expect(definitionCount(companion, "x")).toBe(1);
    expect(companion).toContain("____exports.wrapped = x + 1");

    // The script keeps the binding it already had, and its require order stands.
    expect(findEmittedRequires(script)).toEqual(["game.lib.rates", "game.doors.door"]);
    expect(definitionCount(script, "x")).toBe(1);
  });

  test("a namespace import the closure depends on is copied the same way", () => {
    const result = emit({
      "game/lib/rates.ts": "export const x = 7;\n",
      "game/doors/door.ts": lines(
        FACTORY_IMPORT,
        'import * as rates from "../lib/rates";',
        "",
        "export const wrapped = rates.x + 1;",
        "",
        "defineScript({",
        "  init() {",
        '    print("hi");',
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    expect(findEmittedRequires(companion)).toContain("game.lib.rates");
    expect(companion).toContain("____exports.wrapped =");
    expect(findEmittedRequires(script)).toEqual(["game.lib.rates", "game.doors.door"]);
  });
});

describe("companion emit — only genuinely free names pull a declaration across", () => {
  const BOOT = lines("export function warm(): number {", '  print("warming");', "  return 7;", "}");

  // The effectful declaration sits below the exported one on purpose: above it
  // the initialization-order rule declines the split and nothing is emitted.
  function doorShadowing(...body: readonly string[]): string {
    return lines(
      FACTORY_IMPORT,
      'import { warm } from "../lib/boot";',
      "",
      ...body,
      "",
      "const gain = warm();",
      "",
      "defineScript({",
      "  init() {",
      "    print(gain);",
      "  },",
      "});",
    );
  }

  for (const [spelling, body] of [
    ["a parameter", ["export function bump(gain: number): number {", "  return gain + 1;", "}"]],
    [
      "a local inside the body",
      [
        "export function bump(n: number): number {",
        "  const gain = n * 2;",
        "  return gain + 1;",
        "}",
      ],
    ],
    [
      "a loop variable",
      [
        "export function bump(values: number[]): number {",
        "  let total = 0;",
        "  for (const gain of values) {",
        "    total += gain;",
        "  }",
        "  return total;",
        "}",
      ],
    ],
  ] as const) {
    test(`${spelling} shadowing a script-side declaration does not copy it across`, () => {
      const result = emit({
        "game/lib/boot.ts": BOOT,
        "game/doors/door.ts": doorShadowing(...body),
      });
      const script = chunkFor(result, "game/doors/door.ts");
      const companion = companionFor(result, "game/doors/door.ts");

      expect(companion).toContain("function ____exports.bump(");
      expect(companion).not.toContain("warm");
      expect(findEmittedRequires(companion)).toEqual([]);

      // The effect stays where the source put it, and runs once.
      expect(definitionCount(script, "gain")).toBe(1);
      expect(script).toContain("warm(");
      expect(findEmittedRequires(script)).toEqual(["game.lib.boot", "game.doors.door"]);
    });
  }

  test("a name both read free and shadowed deeper still brings its prelude across", () => {
    const result = emit({
      "game/lib/boot.ts": BOOT,
      "game/doors/door.ts": lines(
        FACTORY_IMPORT,
        'import { warm } from "../lib/boot";',
        "",
        "export const seed = warm();",
        "export function bump(warm: number): number {",
        "  return warm + 1;",
        "}",
        "",
        "defineScript({",
        "  init() {",
        "    print(seed);",
        "  },",
        "});",
      ),
    });
    const script = chunkFor(result, "game/doors/door.ts");
    const companion = companionFor(result, "game/doors/door.ts");

    expect(findEmittedRequires(companion)).toContain("game.lib.boot");
    expect(definitionCount(companion, "warm")).toBe(1);
    expect(companion).toContain("____exports.seed =");

    expect(definitionCount(script, "warm")).toBe(1);
    expect(script).toContain("____exports.seed");
  });
});

describe("companion emit — sources that are left alone", () => {
  test("a script-kind source with an empty closure emits one chunk", () => {
    const source = lines(
      FACTORY_IMPORT,
      "",
      "const RATE = 2;",
      "",
      "defineScript({",
      "  init() {",
      "    print(RATE);",
      "  },",
      "});",
    );
    const result = emit({ "game/doors/door.ts": source });

    expect(result.companions?.["game/doors/door.ts"]).toBeUndefined();
    expect(chunkFor(result, "game/doors/door.ts")).toContain("local RATE = 2");
  });

  test("a module-kind source is untouched", () => {
    const result = emit({
      "game/lib/rates.ts": "export const RATE = 2;\nexport const DOUBLE = RATE * 2;\n",
    });

    expect(result.companions?.["game/lib/rates.ts"]).toBeUndefined();
    const lua = chunkFor(result, "game/lib/rates.ts");
    expect(lua).toContain("____exports.RATE = 2");
    expect(findEmittedRequires(lua)).toEqual([]);
  });
});

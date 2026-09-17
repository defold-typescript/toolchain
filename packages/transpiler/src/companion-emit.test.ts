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

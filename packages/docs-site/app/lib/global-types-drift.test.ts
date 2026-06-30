import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGlobalTypes } from "./global-types";

const TYPES_SRC = join(import.meta.dir, "../../../../packages/types/src");
const coreSource = readFileSync(join(TYPES_SRC, "core-types.ts"), "utf8");
const globalsSource = readFileSync(join(TYPES_SRC, "engine-globals.d.ts"), "utf8");

const KNOWN_OPERATOR_METHODS = [
  "LuaAdditionMethod",
  "LuaSubtractionMethod",
  "LuaMultiplicationMethod",
  "LuaDivisionMethod",
  "LuaNegationMethod",
];

describe("global-types drift guard", () => {
  test("documented page set equals engine-globals value-type re-exports", () => {
    const reexported = [
      ...globalsSource.matchAll(/type (\w+)(?:<[^>]*>)? = Core\.\w+(?:<[^>]*>)?;/g),
    ].map((m) => m[1] as string);
    const documented = parseGlobalTypes(coreSource).map((p) => p.namespace);
    expect(documented.slice().sort()).toEqual(reexported.slice().sort());
  });

  test("every operator-method RHS uses one of the five known Lua<Op>Method types", () => {
    // The parser throws on an unrecognised operator-method type, so a clean
    // parse of the real source already proves every method RHS is known; the
    // explicit set check makes the failure message name the offending type.
    expect(() => parseGlobalTypes(coreSource)).not.toThrow();
    const found = new Set([...coreSource.matchAll(/(Lua\w+Method)</g)].map((m) => m[1] as string));
    for (const name of found) expect(KNOWN_OPERATOR_METHODS).toContain(name);
  });
});

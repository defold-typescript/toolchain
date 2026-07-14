import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("narrowing transpile", () => {
  test("snapshots how TS narrowing constructs lower to Lua", () => {
    const source = [
      "export function inspect(x: unknown): string {",
      "  let out = '';",
      "  if (x) {",
      "    out = 'truthy';",
      "  }",
      "  if (typeof x === 'number') {",
      "    out = 'number';",
      "  }",
      "  if (typeof x === 'string') {",
      "    out = 'string';",
      "  }",
      "  if (typeof x === 'object') {",
      "    out = 'object';",
      "  }",
      "  if (typeof x === 'undefined') {",
      "    out = 'undefined';",
      "  }",
      "  if (x === null) {",
      "    out = 'null';",
      "  }",
      "  if (x === undefined) {",
      "    out = 'undef';",
      "  }",
      "  if (x !== undefined) {",
      "    out = 'present';",
      "  }",
      "  const kind = typeof x;",
      "  const n = x as number;",
      "  return out + kind + n;",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("`===` and `==` both lower to the non-coercing Lua `==`", () => {
    const source = [
      "export function eq(cell: number): boolean {",
      "  const strict = cell === 0;",
      "  const loose = cell == 0;",
      "  return strict || loose;",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    // Both operators emit the same `cell == 0`: the loose form gets no
    // coercion helper, so the strict and loose lines are byte-identical.
    expect(result.lua.match(/cell == 0/g) ?? []).toHaveLength(2);
  });
});

import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("data-structures transpile", () => {
  test("lowers an exported tuple to a plain Lua table with no lualib", () => {
    const source = ['export const t: [number, string] = [1, "a"];', ""].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).not.toContain('require("lualib_bundle")');
    expect(result.lua).toMatchSnapshot();
  });

  test("lowers Map and Set construction through the lualib runtime", () => {
    const source = [
      "export const m = new Map<string, number>();",
      'm.set("a", 1);',
      "export const s = new Set<number>();",
      "s.add(1);",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain('require("lualib_bundle")');
    expect(result.lua).toMatchSnapshot();
  });

  test("lowers a class to __TS__Class plus __TS__New on instantiation", () => {
    const source = [
      "export class Counter {",
      "  n = 0;",
      "  bump(): void {",
      "    this.n += 1;",
      "  }",
      "}",
      "export const c = new Counter();",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("__TS__Class");
    expect(result.lua).toContain("__TS__New");
    expect(result.lua).toMatchSnapshot();
  });

  test("rejects a regex match with the documented diagnostic", () => {
    const source = ['export const hit = "x".match(/b/);', ""].join("\n");
    const result = transpile(source);
    expect(result.diagnostics.some((d) => d.includes("string.match is unsupported"))).toBe(true);
  });

  test("rejects a BigInt literal with the documented diagnostic", () => {
    const source = ["export const big = 1n;", ""].join("\n");
    const result = transpile(source);
    expect(result.diagnostics.some((d) => d.includes("Unsupported node kind BigIntLiteral"))).toBe(
      true,
    );
  });
});

import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

const SOURCE = [
  "function helper(x: number): number {",
  "  return x + 1;",
  "}",
  "export const y = helper(1);",
  "",
].join("\n");

describe("noImplicitSelf emit", () => {
  test("a free function emits without an injected self context parameter", () => {
    const result = transpile(SOURCE);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("function helper(x)");
    expect(result.lua).not.toContain("function helper(self, x)");
  });

  test("call sites pass no _G context filler", () => {
    const result = transpile(SOURCE);
    expect(result.lua).toContain("helper(1)");
    expect(result.lua).not.toContain("_G");
  });
});

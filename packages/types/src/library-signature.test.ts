import { describe, expect, test } from "bun:test";
import {
  hasTopLevelUnion,
  luaMultiReturn,
  needsArrayParens,
  varargElementType,
} from "./library-signature";

describe("hasTopLevelUnion", () => {
  test("detects a top-level union but ignores one nested in brackets", () => {
    expect(hasTopLevelUnion("a | b")).toBe(true);
    expect(hasTopLevelUnion("Array<a | b>")).toBe(false);
    expect(hasTopLevelUnion("string")).toBe(false);
  });
});

describe("needsArrayParens", () => {
  test("true for a union, a function, or an object; false for a plain type", () => {
    expect(needsArrayParens("a | b")).toBe(true);
    expect(needsArrayParens("(x: number) => void")).toBe(true);
    expect(needsArrayParens("{ x: number }")).toBe(true);
    expect(needsArrayParens("string")).toBe(false);
  });
});

describe("varargElementType", () => {
  test("arrayifies a plain type", () => {
    expect(varargElementType("string")).toBe("string[]");
  });

  test("parenthesizes a union, function, or object before arrayifying", () => {
    expect(varargElementType("a | b")).toBe("(a | b)[]");
    expect(varargElementType("(x: number) => void")).toBe("((x: number) => void)[]");
    expect(varargElementType("{ x: number }")).toBe("({ x: number })[]");
  });
});

describe("luaMultiReturn", () => {
  test("wraps mapped return tokens in a LuaMultiReturn tuple", () => {
    expect(luaMultiReturn(["number", "number"])).toBe("LuaMultiReturn<[number, number]>");
    expect(luaMultiReturn(["a", "b", "c"])).toBe("LuaMultiReturn<[a, b, c]>");
  });
});

import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("vector math operator emit", () => {
  test("v.add(other) emits native Lua + (no userland helper)", () => {
    const source = [
      "export function go() {",
      "  const a = vmath.vector3(1, 2, 3);",
      "  const b = vmath.vector3(4, 5, 6);",
      "  return a.add(b);",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
    expect(result.lua).toContain("a + b");
    expect(result.lua).not.toContain(":add");
    expect(result.lua).not.toContain(".add(");
  });

  test("v.sub(other) emits Lua -", () => {
    const source = [
      "export function go() {",
      "  const a = vmath.vector3(1, 2, 3);",
      "  const b = vmath.vector3(4, 5, 6);",
      "  return a.sub(b);",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("a - b");
  });

  test("v.mul(scalar) emits Lua *", () => {
    const source = [
      "export function go() {",
      "  const a = vmath.vector3(1, 2, 3);",
      "  return a.mul(2);",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("a * 2");
  });

  test("v.div(scalar) emits Lua /", () => {
    const source = [
      "export function go() {",
      "  const a = vmath.vector3(2, 4, 6);",
      "  return a.div(2);",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("a / 2");
  });

  test("v.unm() emits Lua unary minus", () => {
    const source = [
      "export function go() {",
      "  const a = vmath.vector3(1, 2, 3);",
      "  return a.unm();",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
    expect(result.lua).toMatch(/-a\b/);
  });

  test("m.mul(v4) emits Lua *", () => {
    const source = [
      "export function go() {",
      "  const m = vmath.matrix4();",
      "  const v = vmath.vector4(1, 2, 3, 4);",
      "  return m.mul(v);",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
    expect(result.lua).toContain("m * v");
  });
});

describe("userdata metamethod emit", () => {
  test("v.length() emits the Lua length operator", () => {
    const source = [
      "export function go() {",
      "  const v = vmath.vector([1, 2, 3]);",
      "  return v.length();",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("m.mul(scalar) emits Lua *", () => {
    const source = [
      "export function go() {",
      "  const m = vmath.matrix4();",
      "  return m.mul(2);",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("v[i] = x passes the 1-based index to Defold unchanged", () => {
    const source = [
      "export function go() {",
      "  const v = vmath.vector([1, 2, 3]);",
      "  v[1] = 2;",
      "  return v;",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("url.path = x emits a plain field assignment", () => {
    const source = [
      "export function go() {",
      "  const url = msg.url();",
      '  url.path = "go";',
      "  return url;",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });
});

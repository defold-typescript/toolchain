import { describe, expect, test } from "bun:test";
import { compileHsmModules } from "@defold-typescript/transpiler";

const LUA_LINE_BUDGET = 850;

// The Lua the build writes into a project, from the transpiler's own compile:
// `compileHsmModules` throws on any diagnostic, or on a lualib dependency outside
// `async`, so reaching these assertions already proves both.
describe("hsm core Lua output", () => {
  const lua = compileHsmModules().index ?? "";

  test("does not require the lualib bundle", () => {
    expect(lua).not.toContain('require("lualib_bundle")');
  });

  test(`stays under ${LUA_LINE_BUDGET} Lua lines`, () => {
    expect(lua.split("\n").length).toBeLessThan(LUA_LINE_BUDGET);
  });

  test("matches the reviewed Lua snapshot", () => {
    expect(lua).toMatchSnapshot();
  });
});

describe("hsm Defold adapter Lua output", () => {
  const lua = compileHsmModules().defold ?? "";

  test("does not require the lualib bundle", () => {
    expect(lua).not.toContain('require("lualib_bundle")');
  });

  test("matches the reviewed Lua snapshot", () => {
    expect(lua).toMatchSnapshot();
  });
});

describe("hsm debug inspector Lua output", () => {
  const lua = compileHsmModules().debug ?? "";

  test("does not require the lualib bundle", () => {
    expect(lua).not.toContain('require("lualib_bundle")');
  });

  test("matches the reviewed Lua snapshot", () => {
    expect(lua).toMatchSnapshot();
  });
});

describe("hsm async module Lua output", () => {
  const lua = compileHsmModules().async ?? "";

  test("requires the lualib bundle for its promises", () => {
    expect(lua).toContain('require("lualib_bundle")');
  });

  test("matches the reviewed Lua snapshot", () => {
    expect(lua).toMatchSnapshot();
  });
});

import { describe, expect, test } from "bun:test";
import { compileLibraryModules, ECS_LIBRARY } from "@defold-typescript/transpiler";

const LUA_LINE_BUDGET = 900;

// The Lua the build writes into a project, from the transpiler's own compile:
// `compileLibraryModules` throws on any diagnostic, or on a lualib dependency,
// so reaching these assertions already proves both.
describe("ecs Lua output", () => {
  const lua = compileLibraryModules(ECS_LIBRARY).index ?? "";

  test("opens with the tiny-ecs license block", () => {
    expect(lua.startsWith("--[[\nCopyright (c) 2016 Calvin Rose\n")).toBe(true);
  });

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

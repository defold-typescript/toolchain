import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileLibraryModules, ECS_LIBRARY } from "@defold-typescript/transpiler";

const LUA_LINE_BUDGET = 1100;
const BRIDGE_LUA_LINE_BUDGET = 106;

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

describe("ecs/hsm bridge Lua output", () => {
  const lua = compileLibraryModules(ECS_LIBRARY).hsm ?? "";
  const copyright = readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8")
    .split("\n")
    .find((line) => line.startsWith("Copyright"));

  test("opens with a license block holding the repo copyright line", () => {
    expect(copyright).toBeDefined();
    expect(lua.startsWith("--[[\n")).toBe(true);
    const block = lua.slice(0, lua.indexOf("]]"));
    expect(block.split("\n")).toContain(copyright as string);
  });

  test("does not require the lualib bundle", () => {
    expect(lua).not.toContain('require("lualib_bundle")');
  });

  test(`stays under ${BRIDGE_LUA_LINE_BUDGET} Lua lines`, () => {
    expect(lua.split("\n").length).toBeLessThan(BRIDGE_LUA_LINE_BUDGET);
  });

  test("matches the reviewed Lua snapshot", () => {
    expect(lua).toMatchSnapshot();
  });
});

describe("ecs/debug Lua output", () => {
  const lua = compileLibraryModules(ECS_LIBRARY).debug ?? "";
  const copyright = readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8")
    .split("\n")
    .find((line) => line.startsWith("Copyright"));

  test("opens with a license block holding the repo copyright line", () => {
    expect(copyright).toBeDefined();
    expect(lua.startsWith("--[[\n")).toBe(true);
    const block = lua.slice(0, lua.indexOf("]]"));
    expect(block.split("\n")).toContain(copyright as string);
  });

  test("matches the reviewed Lua snapshot", () => {
    expect(lua).toMatchSnapshot();
  });
});

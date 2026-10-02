import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";

const LUA_LINE_BUDGET = 600;

describe("hsm core Lua output", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const result = transpileProject({ files: { "hsm/index.ts": source } });
  const lua = result.lua["hsm/index.ts"] ?? "";

  test("transpiles with no diagnostics and no lualib", () => {
    expect(result.diagnostics).toEqual([]);
    expect(result.lualib).toBeUndefined();
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
  const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
  const result = transpileProject({
    files: { "hsm/index.ts": read("./index.ts"), "hsm/defold.ts": read("./defold.ts") },
  });
  const lua = result.lua["hsm/defold.ts"] ?? "";

  test("transpiles with no diagnostics and no lualib", () => {
    expect(result.diagnostics).toEqual([]);
    expect(result.lualib).toBeUndefined();
    expect(lua).not.toContain('require("lualib_bundle")');
  });

  test("matches the reviewed Lua snapshot", () => {
    expect(lua).toMatchSnapshot();
  });
});

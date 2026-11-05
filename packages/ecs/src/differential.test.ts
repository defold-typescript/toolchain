import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import { lib } from "./parity/ecs-lib";
import { runScenario, scenarios } from "./parity/scenarios";

const LUA_OK = 0;

// tiny.lua at tiny-ecs commit 821914795db365d73dcb973b4a54741423650dc9. The
// oracle must not bend to fit ecs, so this digest is never re-baselined.
const TINY_SHA256 = "a766b6a35949546746d041e9f4806a4ea068605b9657e2c7dedbc636c2cdf805";

const INDEX_FILE = "ecs/index.ts";
const SCENARIOS_FILE = "ecs/parity/scenarios.ts";
const ECS_LIB_FILE = "ecs/parity/ecs-lib.ts";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

const result = transpileProject({
  files: {
    [INDEX_FILE]: read("./index.ts"),
    [SCENARIOS_FILE]: read("./parity/scenarios.ts"),
    [ECS_LIB_FILE]: read("./parity/ecs-lib.ts"),
  },
});

const moduleName = (rel: string) => rel.replace(/\.ts$/, "").split("/").join(".");

const modules: Record<string, string> = {};
for (const [rel, source] of Object.entries(result.lua)) {
  modules[moduleName(rel)] = source;
}
if (result.lualib !== undefined) {
  modules.lualib_bundle = result.lualib;
}
modules.tiny = read("./parity/tiny.lua");
modules["tiny-lib"] = read("./parity/tiny-lib.lua");

const SCENARIOS_MODULE = JSON.stringify(moduleName(SCENARIOS_FILE));
const ECS_LIB_MODULE = moduleName(ECS_LIB_FILE);
const TINY_LIB_MODULE = "tiny-lib";

function emittedRequires(): string[] {
  const names = new Set<string>();
  for (const source of Object.values(modules)) {
    for (const match of source.matchAll(/require\(\s*"([^"]+)"\s*\)/g)) {
      names.add(match[1] as string);
    }
  }
  return [...names].sort();
}

function runLuaEntry(chunk: string, label: string): string {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    lua.lua_getglobal(L, "package");
    lua.lua_getfield(L, -1, "preload");
    for (const [module, source] of Object.entries(modules)) {
      const status = lauxlib.luaL_loadbuffer(L, source, Buffer.byteLength(source), `=${module}`);
      if (status !== LUA_OK) {
        throw new Error(`Lua failed to load ${module}: ${lua.lua_tostring(L, -1)}`);
      }
      lua.lua_setfield(L, -2, module);
    }
    lua.lua_settop(L, 0);
    const status = lauxlib.luaL_dostring(L, chunk);
    if (status !== LUA_OK) {
      throw new Error(`Lua error in ${label}: ${lua.lua_tostring(L, -1)}`);
    }
    return lua.lua_tostring(L, -1);
  } finally {
    lua.lua_close(L);
  }
}

function luaTrace(libModule: string, name: string): string[] {
  return runLuaEntry(
    `return require(${SCENARIOS_MODULE}).runScenario(require(${JSON.stringify(libModule)}).lib, ${JSON.stringify(name)})`,
    `${libModule} scenario "${name}"`,
  ).split("\n");
}

describe("ecs against tiny.lua, as transpiled Lua and in Bun", () => {
  test("parity/tiny.lua is the pinned tiny-ecs source", () => {
    const bytes = readFileSync(new URL("./parity/tiny.lua", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(TINY_SHA256);
  });

  test("ecs and the parity modules transpile cleanly, and the core needs no lualib", () => {
    expect(result.diagnostics).toEqual([]);
    const missing = emittedRequires().filter((name) => modules[name] === undefined);
    expect(missing).toEqual([]);
    expect(modules[moduleName(INDEX_FILE)]).toBeDefined();
    expect(modules[moduleName(INDEX_FILE)]).not.toContain('require("lualib_bundle")');
  });

  test("loading and running ecs in Lua writes no global", () => {
    const added = runLuaEntry(
      `
      local scenarios = require(${SCENARIOS_MODULE})
      local before = {}
      for key in pairs(_G) do before[key] = true end
      local lib = require(${JSON.stringify(ECS_LIB_MODULE)}).lib
      for _, scenario in ipairs(scenarios.scenarios) do
        scenarios.runScenario(lib, scenario.name)
      end
      local added = {}
      for key in pairs(_G) do
        if not before[key] then added[#added + 1] = tostring(key) end
      end
      table.sort(added)
      return "added:" .. table.concat(added, ",")
      `,
      "the globals check",
    );
    expect(added).toBe("added:");
  });

  for (const scenario of scenarios) {
    test(scenario.name, () => {
      if (scenario.bunOracle === true) {
        const traced = luaTrace(ECS_LIB_MODULE, scenario.name);
        expect(traced.join("")).not.toBe("");
        expect(runScenario(lib, scenario.name).split("\n")).toEqual(traced);
        return;
      }
      const oracle = luaTrace(TINY_LIB_MODULE, scenario.name);
      expect(oracle.join("")).not.toBe("");
      expect(luaTrace(ECS_LIB_MODULE, scenario.name)).toEqual(oracle);
      expect(runScenario(lib, scenario.name).split("\n")).toEqual(oracle);
    });
  }
});

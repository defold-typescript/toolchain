import { expect } from "bun:test";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import { requirePathForRel } from "./output-paths";
import type { TranspileProjectResult } from "./project-output";

const LUA_OK = 0;
const LUA_TFUNCTION = 6;

export function scriptChunk(result: TranspileProjectResult, rel: string): string {
  const chunk = result.lua[rel];
  expect(chunk).toBeString();
  return chunk as string;
}

// Loads the script chunk the way the engine's `LoadScript` does: every module
// it requires is preloaded and the chunk runs with no environment of its own.
// Then, as the engine does, reads the callback with `lua_getglobal` and runs
// `call` against it; `record` logs what the callback reached.
export function runCallback(
  result: TranspileProjectResult,
  rel: string,
  callback: string,
  call: string,
): string[] {
  const modules: Record<string, string> = {};
  for (const [moduleRel, source] of Object.entries(result.lua)) {
    if (moduleRel !== rel) {
      modules[requirePathForRel(moduleRel)] = source;
    }
  }
  if (result.lualib !== undefined) {
    modules.lualib_bundle = result.lualib;
  }
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
    const harness = [
      "____log = {}",
      "function record(tag) ____log[#____log + 1] = tag end",
      "function hash(s) return s end",
    ].join("\n");
    if (lauxlib.luaL_dostring(L, harness) !== LUA_OK) {
      throw new Error(`Lua harness failed: ${lua.lua_tostring(L, -1)}`);
    }
    const script = scriptChunk(result, rel);
    const loaded = lauxlib.luaL_loadbuffer(L, script, Buffer.byteLength(script), "=script");
    if (loaded !== LUA_OK || lua.lua_pcall(L, 0, 0, 0) !== LUA_OK) {
      throw new Error(`Lua error in the script chunk: ${lua.lua_tostring(L, -1)}`);
    }
    lua.lua_getglobal(L, callback);
    if (lua.lua_type(L, -1) !== LUA_TFUNCTION) {
      throw new Error(`the engine finds no global \`${callback}\` function`);
    }
    lua.lua_settop(L, 0);
    // Reading an undefined global is fatal from here on, so a name the callback
    // body reads but the chunk never binds fails the run instead of reading nil.
    // Installed after the existence check, which runs outside a protected call.
    const strict =
      'setmetatable(_G, { __index = function(_, k) error("undefined global " .. tostring(k), 2) end })';
    if (lauxlib.luaL_dostring(L, strict) !== LUA_OK) {
      throw new Error(`Lua failed to make globals strict: ${lua.lua_tostring(L, -1)}`);
    }
    if (lauxlib.luaL_dostring(L, call) !== LUA_OK) {
      throw new Error(`Lua error calling ${callback}: ${lua.lua_tostring(L, -1)}`);
    }
    if (lauxlib.luaL_dostring(L, 'return table.concat(____log, ",")') !== LUA_OK) {
      throw new Error(`Lua failed to read the log: ${lua.lua_tostring(L, -1)}`);
    }
    const log = lua.lua_tostring(L, -1);
    return log === "" ? [] : log.split(",");
  } finally {
    lua.lua_close(L);
  }
}

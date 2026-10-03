import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import { runScenario, scenarios } from "./parity/scenarios";

const LUA_OK = 0;
const SCENARIOS_FILE = "hsm/parity/scenarios.ts";

const EXPECTED: Record<string, string[]> = {
  start: [
    "enter a",
    "enter a.b",
    "enter a.b.c",
    "path=/a/b/c",
    "matches(/a)=true",
    "matches(/a/b)=true",
    "exit a.b.c",
    "exit a.b",
    "exit a",
    "enter ab",
    "path=/ab",
    "matches(/ab)=true",
    "matches(/a)=false",
  ],
  "numeric names": [
    "enter 0",
    "path=/0",
    "exit 0",
    "enter 1",
    "enter 1.0",
    "path=/1/0",
    "matches(/1)=true",
    "matches(/0)=false",
  ],
  "guards and bubbling": [
    "enter p",
    "enter p.c",
    "guard 1",
    "guard 2",
    "exit p.c",
    "enter p.d",
    "path=/p/d",
    "second instance",
    "enter p",
    "enter p.c",
    "guard 1",
    "guard 2",
    "guard 3",
    "exit p.c",
    "exit p",
    "enter z",
    "path=/z",
    "path=/z",
  ],
  "targetless and reentry": [
    "enter s",
    "ping",
    "path=/s",
    "exit s",
    "enter s",
    "path=/s",
    "enter p",
    "enter p.c1",
    "exit p.c1",
    "enter p.c2",
    "path=/p/c2",
    "enter p",
    "enter p.c1",
    "exit p.c1",
    "exit p",
    "enter p",
    "enter p.c2",
    "path=/p/c2",
  ],
  "queued sends": [
    "enter a",
    "exit a",
    "enter b",
    "enter b.b1",
    "step 1",
    "step 2",
    "step 3",
    "step 4",
    "path=/b/b1",
  ],
  "update and after": [
    "enter p.c",
    "update p.c 0.25",
    "update p 0.25",
    "update p.c 0.5",
    "exit p.c",
    "enter p.c2",
    "path=/p/c2",
    "enter a",
    "path=/a",
    "exit a",
    "enter b",
    "exit b",
    "enter a",
    "path=/a",
    "exit a",
    "enter y",
    "path=/y",
    "second instance",
    "enter a",
    "exit a",
    "enter y",
    "path=/y",
  ],
  "hook tick timers": [
    "enter airborne",
    "enter airborne.rising",
    "path=/airborne/rising",
    "exit airborne.rising",
    "enter airborne.falling",
    "path=/airborne/falling",
    "exit airborne.falling",
    "exit airborne",
    "enter timeout",
    "path=/timeout",
  ],
  stop: [
    "enter a",
    "exit a",
    "enter b",
    "enter b.b1",
    "exit b.b1",
    "exit b",
    "path=(stopped)",
    "path=(stopped)",
    "matches(/a)=false",
  ],
  invoke: [
    "invoke loading",
    "invoke loading",
    "path=/loading",
    "ping",
    "path=/loading",
    "path=/idle",
    "invoke loading",
    "path=/idle",
    "invoke loading",
    "path=(stopped)",
  ],
  "names and update targets": [
    "enter v1.2",
    "path=/v1.2",
    "matches(/v1.2)=true",
    "exit v1.2",
    "enter #x",
    "path=/#x",
    'error: hsm: state "/#x" targets "patrol", which is not a full path starting with "/"',
  ],
  "definition errors": [
    'error: hsm: state "/attack/recover" targets unknown state "/nope"',
    'error: hsm: compound state "/outer/inner" has no initial',
    'error: hsm: state "/outer" has initial "/outer/ghost", which is not one of its children',
    'error: hsm: state "/outer" has initial "leaf", which is not one of its children',
    'error: hsm: state "/outer" has initial "/leaf", which is not one of its children',
    'error: hsm: state "/idle" targets "patrol", which is not a full path starting with "/"',
    'error: hsm: state "/idle" targets "./patrol", which is not a full path starting with "/"',
    'error: hsm: state "/idle" targets "../patrol", which is not a full path starting with "/"',
    'error: hsm: state "/idle" targets unknown state "/"',
    'error: hsm: state "/idle" targets "patrol", which is not a full path starting with "/"',
    'error: hsm: state "(root)" has a child named ""; state names must be non-empty and contain no "/"',
    'error: hsm: state "/p" has a child named "a/b"; state names must be non-empty and contain no "/"',
    'error: hsm: state "/a" has an after delay "abc" that is not a non-negative number',
    'error: hsm: state "/a" has an after delay "" that is not a non-negative number',
    'error: hsm: state "/a" has an after delay "-1" that is not a non-negative number',
  ],
  "onTransition reports every cause": [
    "/idle -> /move/walk event GO",
    "/move/walk -> /move/run after -",
    "/move/run -> /rest update -",
    "/rest -> (stopped) stop -",
  ],
  "hot reload": [
    "enter idle",
    "same=true",
    "exit idle",
    "enter move",
    "enter move.walk",
    "/idle -> /move/walk event GO",
    "path=/move/walk",
    "path=/move/walk",
    "enter move.run",
    "/move/walk -> /move/run reload -",
    "path=/move/run",
  ],
};

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

const result = transpileProject({
  files: { "hsm/index.ts": read("./index.ts"), [SCENARIOS_FILE]: read("./parity/scenarios.ts") },
});

const moduleName = (rel: string) => rel.replace(/\.ts$/, "").split("/").join(".");

const modules: Record<string, string> = {};
for (const [rel, source] of Object.entries(result.lua)) {
  modules[moduleName(rel)] = source;
}
if (result.lualib !== undefined) {
  modules.lualib_bundle = result.lualib;
}

function emittedRequires(): string[] {
  const names = new Set<string>();
  for (const source of Object.values(modules)) {
    for (const match of source.matchAll(/require\("([^"]+)"\)/g)) {
      names.add(match[1] as string);
    }
  }
  return [...names].sort();
}

function runInBun(name: string): string[] {
  return runScenario(name).split("\n");
}

function runInLua(name: string): string[] {
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
    const entry = JSON.stringify(moduleName(SCENARIOS_FILE));
    const status = lauxlib.luaL_dostring(
      L,
      `return require(${entry}).runScenario(${JSON.stringify(name)})`,
    );
    if (status !== LUA_OK) {
      throw new Error(`Lua error in scenario "${name}": ${lua.lua_tostring(L, -1)}`);
    }
    return lua.lua_tostring(L, -1).split("\n");
  } finally {
    lua.lua_close(L);
  }
}

describe("hsm behavior in Bun and in Lua 5.1", () => {
  test("the core and scenarios transpile cleanly and every require resolves", () => {
    expect(result.diagnostics).toEqual([]);
    const missing = emittedRequires().filter((name) => modules[name] === undefined);
    expect(missing).toEqual([]);
  });

  test("every scenario has an expected trace and every trace a scenario", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(scenarios.map((s) => s.name).sort());
  });

  for (const scenario of scenarios) {
    test(scenario.name, () => {
      const expected = EXPECTED[scenario.name];
      if (expected === undefined) {
        throw new Error(`no EXPECTED trace for scenario "${scenario.name}"`);
      }
      expect(runInBun(scenario.name)).toEqual(expected);
      expect(runInLua(scenario.name)).toEqual(expected);
    });
  }
});

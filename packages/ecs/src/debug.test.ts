import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import { inspect } from "./debug";
import {
  addEntity,
  changed,
  processingSystem,
  refresh,
  removeEntity,
  removeSystem,
  requireAll,
  system,
  update,
  world,
} from "./index";
import { type Lib, runScenario, scenarios } from "./parity/debug-scenarios";

const LUA_OK = 0;
const SCENARIOS_FILE = "ecs/parity/debug-scenarios.ts";
const ENTRY_FILE = "ecs/parity/debug-entry.ts";

const EXPECTED: Record<string, string[]> = {
  membership: [
    "ecs membership frame 0: inspecting [0, 0]",
    "ecs membership frame 0: system 1 adds entity 1, holds 1",
    "ecs membership frame 0: system 2 adds entity 1, holds 1",
    "ecs membership frame 0: system 1 adds entity 2, holds 2",
    "ecs membership frame 0: system 2 adds entity 2, holds 2",
    "ecs membership frame 0: system 1 onModify, holds 2",
    "draw_debug_text membership [2, 2] 60",
    "ecs membership frame 1: system 2 removes entity 1, holds 1",
    "ecs membership frame 1: system 1 removes entity 2, holds 1",
    "ecs membership frame 1: system 2 removes entity 2, holds 0",
    "ecs membership frame 1: system 1 onModify, holds 1",
    "draw_debug_text membership [1, 0] 60",
  ],
  "system-leaves": [
    "ecs system-leaves frame 0: inspecting [-, 2]",
    "ecs system-leaves frame 0: system 2 removes entity 1, holds 1",
    "ecs system-leaves frame 0: system 2 removes entity 2, holds 0",
    "draw_debug_text system-leaves [-] 60",
  ],
  reload: [
    "ecs reload frame 0: inspecting [0]",
    "ecs reload frame 0: system 1 adds entity 1, holds 1",
    "ecs reload frame 0: system 1 adds entity 2, holds 2",
    "ecs reload frame 0: system 1 removes entity 2, holds 1",
    "ecs reload frame 0: system 1 onModify, holds 1",
  ],
  "re-entry": [
    "ecs re-entry frame 0: inspecting [0, 0]",
    "ecs re-entry frame 0: system 1 adds entity 1, holds 1",
    "ecs re-entry frame 0: system 1 removes entity 1, holds 0",
    "ecs re-entry frame 0: system 2 adds entity 2, holds 1",
    "ecs re-entry frame 0: system 2 removes entity 2, holds 0",
    "ecs re-entry frame 0: system 1 adds entity 3, holds 1",
    "ecs re-entry frame 0: system 1 removes entity 3, holds 0",
    "ecs re-entry frame 0: system 1 adds entity 4, holds 1",
    "ecs re-entry frame 0: system 2 adds entity 4, holds 1",
    "ecs re-entry frame 0: system 2 removes entity 4, holds 0",
  ],
  reinspect: [
    "ecs again frame 0: inspecting [0]",
    "ecs again#2 frame 0: inspecting [0]",
    "ecs again#2 frame 0: system 1 adds entity 1, holds 1",
  ],
};

// The same engine stubs as the Lua prelude below: `print` and `msg.post` append to the trace.
const NAMES = ["sys", "msg", "go", "vmath", "print"] as const;
const globals = globalThis as unknown as Record<(typeof NAMES)[number], unknown>;
const saved: Partial<Record<(typeof NAMES)[number], unknown>> = {};

interface Posted {
  text: string;
  position: { y: number };
}

let isDebug = true;
let trace: string[] = [];

beforeEach(() => {
  for (const name of NAMES) {
    saved[name] = globals[name];
  }
  isDebug = true;
  trace = [];
  globals.sys = {
    get_engine_info: () => ({ version: "1.13.2", version_sha1: "", is_debug: isDebug }),
  };
  globals.msg = {
    post: (_url: unknown, id: string, message: Posted) => {
      trace.push(`${id} ${message.text} ${message.position.y}`);
    },
  };
  globals.go = {
    get_world_position: () => ({ x: 10, y: 20, z: 0 }),
  };
  globals.vmath = {
    vector3: (x: number, y: number, z: number) => ({ x, y, z }),
    vector4: (x: number, y: number, z: number, w: number) => ({ x, y, z, w }),
  };
  globals.print = (line: string) => {
    trace.push(line);
  };
});

afterEach(() => {
  for (const name of NAMES) {
    globals[name] = saved[name];
  }
});

const LUA_PRELUDE = `
TRACE = {}
local function append(line) TRACE[#TRACE + 1] = line end
print = append
sys = { get_engine_info = function() return { is_debug = true } end }
msg = {
  post = function(url, id, message)
    append(id .. " " .. message.text .. " " .. message.position.y)
  end,
}
go = { get_world_position = function() return { x = 10, y = 20, z = 0 } end }
vmath = {
  vector3 = function(x, y, z) return { x = x, y = y, z = z } end,
  vector4 = function(x, y, z, w) return { x = x, y = y, z = z, w = w } end,
}
`;

// The workspace sources and the generated declarations `Lib` reads are separate
// copies to the compiler, with brands of their own, so the sources do not type
// as `Lib`; `satisfies` still holds the key set to it.
const lib = {
  world,
  system,
  processingSystem,
  requireAll,
  addEntity,
  removeEntity,
  removeSystem,
  changed,
  refresh,
  update,
  inspect,
} satisfies Record<keyof Lib, unknown> as unknown as Lib;

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

const result = transpileProject({
  files: {
    [SCENARIOS_FILE]: read("./parity/debug-scenarios.ts"),
    [ENTRY_FILE]: read("./parity/debug-entry.ts"),
  },
});

const moduleName = (rel: string) => rel.replace(/\.ts$/, "").split("/").join(".");

const modules: Record<string, string> = { ...result.libraryModules };
for (const [rel, source] of Object.entries(result.lua)) {
  modules[moduleName(rel)] = source;
}
if (result.lualib !== undefined) {
  modules.lualib_bundle = result.lualib;
}

function emittedRequires(): string[] {
  const names = new Set<string>();
  for (const source of Object.values(modules)) {
    for (const match of source.matchAll(/require\(\s*"([^"]+)"\s*\)/g)) {
      names.add(match[1] as string);
    }
  }
  return [...names].sort();
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
    if (lauxlib.luaL_dostring(L, LUA_PRELUDE) !== LUA_OK) {
      throw new Error(`Lua prelude failed: ${lua.lua_tostring(L, -1)}`);
    }
    const chunk = `require(${JSON.stringify(moduleName(ENTRY_FILE))}).runScenario(${JSON.stringify(name)}) return table.concat(TRACE, "\\n")`;
    const status = lauxlib.luaL_dostring(L, chunk);
    if (status !== LUA_OK) {
      throw new Error(`Lua error in scenario "${name}": ${lua.lua_tostring(L, -1)}`);
    }
    return lua.lua_tostring(L, -1).split("\n");
  } finally {
    lua.lua_close(L);
  }
}

describe("the ecs world inspector in Bun and in Lua 5.1", () => {
  test("the scenarios compile cleanly against the shipped ecs modules", () => {
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.libraryModules ?? {}).sort()).toEqual([
      "defold_typescript_ecs.debug",
      "defold_typescript_ecs.index",
    ]);
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
      runScenario(lib, scenario.name);
      expect(trace).toEqual(expected);
      expect(runInLua(scenario.name)).toEqual(expected);
    });
  }
});

interface Ent {
  pos?: { x: number };
}

describe("inspect in a release build", () => {
  test("prints and posts nothing for joins, onModify, leaves or draws", () => {
    isDebug = false;
    const movers = processingSystem<Ent>()(requireAll("pos"), {
      process() {},
      onModify() {},
    });
    const w = world<Ent>(movers);
    const inspector = inspect(w, "shipped");
    const e = addEntity(w, { pos: { x: 0 } });
    update(w, 1);
    inspector.draw("/hero");
    removeEntity(w, e);
    removeSystem(w, movers);
    update(w, 1);
    inspector.draw("/hero");
    expect(trace).toEqual([]);
  });
});

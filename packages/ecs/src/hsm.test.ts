import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { defineMachine } from "@defold-typescript/hsm";
import { transpileProject } from "@defold-typescript/transpiler";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import { join, leave, member, tickMachines } from "./hsm";
import {
  addEntity,
  getEntityCount,
  hasEntity,
  processingSystem,
  refresh,
  removeEntity,
  requireAll,
  update,
  world,
} from "./index";
import { type Lib, runScenario, scenarios } from "./parity/bridge-scenarios";

const LUA_OK = 0;
const SCENARIOS_FILE = "ecs/parity/bridge-scenarios.ts";
const ENTRY_FILE = "ecs/parity/bridge-entry.ts";

const EXPECTED: Record<string, string[]> = {
  member: [
    "update 1",
    "after GO moving=true",
    "update 2",
    "moving a",
    "after BACK moving=-",
    "update 3",
    "update 4",
  ],
  "member value": ["start target=-", "after GO same=true", "after BACK target=-"],
  "join and leave": ["start count=0", "refresh count=1", "after GO count=1", "refresh count=0"],
  "no re-add": [
    "moving a",
    "joined count=1 moving=true",
    "left count=0",
    "stopped moving=-",
    "after update count=0",
    "loner moving=true",
    "loner count=0",
  ],
  tick: [
    "frame 1",
    "a wait 0.25",
    "b wait 0.25",
    "frame 2",
    "a wait 0.25",
    "b wait 0.25",
    "frame 3",
    "moving a",
    "moving b",
  ],
  hasEntity: ["pending add false", "added true", "pending remove true", "removed false"],
};

// The workspace sources and the generated declarations `Lib` reads are separate
// copies to the compiler, with brands of their own, so the sources do not type
// as `Lib`; `satisfies` still holds the key set to it.
const lib = {
  world,
  processingSystem,
  requireAll,
  addEntity,
  removeEntity,
  refresh,
  update,
  getEntityCount,
  hasEntity,
  member,
  join,
  leave,
  tickMachines,
  defineMachine,
} satisfies Record<keyof Lib, unknown> as unknown as Lib;

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

const result = transpileProject({
  files: {
    [SCENARIOS_FILE]: read("./parity/bridge-scenarios.ts"),
    [ENTRY_FILE]: read("./parity/bridge-entry.ts"),
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
    const chunk = `return require(${JSON.stringify(moduleName(ENTRY_FILE))}).runScenario(${JSON.stringify(name)})`;
    const status = lauxlib.luaL_dostring(L, chunk);
    if (status !== LUA_OK) {
      throw new Error(`Lua error in scenario "${name}": ${lua.lua_tostring(L, -1)}`);
    }
    return lua.lua_tostring(L, -1).split("\n");
  } finally {
    lua.lua_close(L);
  }
}

describe("the ecs/hsm bridge in Bun and in Lua 5.1", () => {
  test("the scenarios compile cleanly against the shipped ecs and hsm modules", () => {
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.libraryModules ?? {}).sort()).toEqual([
      "defold_typescript_ecs.hsm",
      "defold_typescript_ecs.index",
      "defold_typescript_hsm.index",
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
      expect(runScenario(lib, scenario.name).split("\n")).toEqual(expected);
      expect(runInLua(scenario.name)).toEqual(expected);
    });
  }
});

// The assertions below are the compiler's: `bun run typecheck` checks this file under
// both package tsconfigs, and each `@ts-expect-error` must meet the error it names.

type Ev = { type: "GO" } | { type: "BACK" };

interface Marker {
  id: string;
}

interface Ent {
  name: string;
  moving?: true;
  armed?: boolean;
  target?: Marker;
  fsm?: { readonly update: (dt: number) => void };
}

describe("bridge types", () => {
  test("a state spreads member and the root joins", () => {
    const w = world<Ent>();
    const machine = defineMachine<Ent, Ev>()({
      initial: "/idle",
      enter: join(w),
      states: {
        idle: { on: { GO: "/run" } },
        run: { ...member(w, "moving"), on: { BACK: "/idle" } },
        away: { enter: leave(w) },
      },
    });
    expect(machine.start).toBeTypeOf("function");
  });

  test("member takes only an optional component", () => {
    const w = world<Ent>();
    // @ts-expect-error `name` is required, so the exit hook could not clear it
    member(w, "name");
    // @ts-expect-error a required component takes no value either
    member(w, "name", "b");
    expect(member(w, "armed").enter).toBeTypeOf("function");
  });

  test("member without a value needs a component that takes `true`", () => {
    const w = world<Ent>();
    // @ts-expect-error `target` holds a Marker, so it needs the value form
    member(w, "target");
    expect(member(w, "target", { id: "t" }).exit).toBeTypeOf("function");
  });

  test("tickMachines takes only a component that holds a machine", () => {
    // @ts-expect-error `moving` holds no machine
    tickMachines<Ent>("moving");
    expect(tickMachines<Ent>("fsm")).toBeTypeOf("object");
  });
});

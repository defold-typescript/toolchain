import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import { runScenario, scenarios } from "./parity/scenarios";

const LUA_OK = 0;
const SCENARIOS_FILE = "hsm/parity/scenarios.ts";
const ASYNC_SCENARIO_FILE = "hsm/parity/async-scenario.ts";

// Lua only: TSTL's promises run callbacks as soon as they resolve, while Bun's
// wait for a microtask, so one synchronous Bun run cannot produce this trace.
const ASYNC_EXPECTED = [
  "enter run",
  "wait",
  "timer.delay 1 -> 1",
  "resumed",
  "exit run",
  "enter done",
  "path=/done",
  "exit done",
  "enter run",
  "wait",
  "timer.delay 1 -> 2",
  "exit run",
  "timer.cancel 2",
  "enter away",
  "aborted=true",
  "path=/away",
  "timer.delay 1 -> 3",
  "timer.delay 0 -> 4",
  "path=/fail",
  "error: boom",
];

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
    "when 1",
    "when 2",
    "exit p.c",
    "enter p.d",
    "path=/p/d",
    "second instance",
    "enter p",
    "enter p.c",
    "when 1",
    "when 2",
    "when 3",
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
    "enter p.c1",
    "path=/p/c1",
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
  task: [
    "task loading",
    "task loading",
    "path=/loading",
    "ping",
    "path=/loading",
    "path=/idle",
    "task loading",
    "path=/idle",
    "task loading",
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
  "onMove reports every cause": [
    "/idle -> /move/walk event GO",
    "second /idle -> /move/walk",
    "/move/walk -> /move/run after -",
    "second /move/walk -> /move/run",
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
  "restore depth": [
    "enter playing",
    "enter ground",
    "path=/playing/ground",
    "exit ground",
    "enter air",
    "enter rise",
    "exit rise",
    "enter fall",
    "exit fall",
    "exit air",
    "exit playing",
    "enter paused",
    "path=/paused",
    "enter playing",
    "enter ground",
    "fresh=/playing/ground",
    "exit paused",
    "enter playing",
    "enter air",
    "enter rise",
    "path=/playing/air/rise",
    "exit rise",
    "exit air",
    "exit playing",
    "enter paused",
    "exit paused",
    "enter playing",
    "enter ground",
    "path=/playing/ground",
    "enter playing",
    "enter ground",
    "exit ground",
    "enter air",
    "enter rise",
    "exit rise",
    "enter fall",
    "exit fall",
    "exit air",
    "exit playing",
    "enter paused",
    "exit paused",
    "enter playing",
    "enter air",
    "enter fall",
    "deep=/playing/air/fall",
    "leaves 2=/game/alive/move/run,/game/alive/weapon/fire",
    "leaves 1=/game/alive/move/walk,/game/alive/weapon/idle",
  ],
  "always transitions": [
    "enter boot",
    "exit boot",
    "enter idle",
    "path=/idle",
    "exit idle",
    "enter route",
    "/idle -> /route event GO",
    "exit route",
    "enter y",
    "/route -> /y always -",
    "path=/y",
    "exit y",
    "enter idle",
    "/y -> /idle event BACK",
    "exit idle",
    "enter route",
    "/idle -> /route event GO",
    "exit route",
    "enter x",
    "/route -> /x always -",
    "path=/x",
    "exit x",
    "enter idle",
    "/x -> /idle event BACK",
    "exit idle",
    "enter r1",
    "/idle -> /r1 event HIT",
    "/r1 -> /r2 always -",
    "/r2 -> /r3 always -",
    "enter x",
    "/r3 -> /x event PING",
    "path=/x",
    "exit x",
    "enter idle",
    "/x -> /idle event BACK",
    "exit idle",
    "/idle -> /a event UP",
    "/a -> /b always -",
    "/b -> /a always -",
    "/a -> /b always -",
    "/b -> /a always -",
    "/a -> /b always -",
    "/b -> /a always -",
    "/a -> /b always -",
    "/b -> /a always -",
    "/a -> /b always -",
    "/b -> /a always -",
    'error: hsm: state "/a" took 10 always transitions in a row; check for an always loop',
    "path=/a",
    "enter idle",
    "/a -> /idle event BACK",
    "path=/idle",
  ],
  "parallel regions": [
    "enter alive",
    "enter move",
    "enter idle",
    "enter weapon",
    "enter ready",
    "leaves=/alive/move/idle, /alive/weapon/ready",
    "exit idle",
    "enter run",
    "/alive/move/idle -> /alive/move/run event GO",
    "exit ready",
    "enter cooldown",
    "/alive/weapon/ready -> /alive/weapon/cooldown event GO",
    "path=/alive/move/run leaves=/alive/move/run, /alive/weapon/cooldown",
    "matches(/alive/weapon)=true",
    "exit run",
    "enter idle",
    "/alive/move/run -> /alive/move/idle update -",
    "exit cooldown",
    "enter ready",
    "/alive/weapon/cooldown -> /alive/weapon/ready after -",
    "leaves=/alive/move/idle, /alive/weapon/ready",
    "exit ready",
    "exit weapon",
    "exit idle",
    "exit move",
    "exit alive",
    "enter dead",
    "/alive/move/idle -> /dead event HIT",
    "leaves=/dead",
    "exit dead",
    "enter alive",
    "enter move",
    "enter idle",
    "enter weapon",
    "enter ready",
    "/dead -> /alive/move/idle event BACK",
    "exit ready",
    "exit weapon",
    "exit idle",
    "exit move",
    "exit alive",
    "/alive/move/idle -> (stopped) stop -",
    "path=(stopped) leaves=",
  ],
  "unicode region order": [
    "enter r",
    "enter U+E000",
    "enter U+E000.idle",
    "enter U+10000",
    "enter U+10000.idle",
    "path=/r/U+E000/idle leaves=/r/U+E000/idle, /r/U+10000/idle",
    "exit U+E000.idle",
    "enter U+E000.done",
    "/r/U+E000/idle -> /r/U+E000/done event GO",
    "exit U+10000.idle",
    "enter U+10000.done",
    "/r/U+10000/idle -> /r/U+10000/done event GO",
    "path=/r/U+E000/done leaves=/r/U+E000/done, /r/U+10000/done",
    "exit U+10000.done",
    "exit U+10000",
    "exit U+E000.done",
    "exit U+E000",
    "exit r",
    "/r/U+E000/done -> (stopped) stop -",
  ],
  "private ctx": [
    "enter root count=10",
    "enter root count=0",
    "first hits=2 count=12",
    "second hits=0 count=0",
    "enter root count=10",
    "restarted hits=0 flag=true",
    "reloaded armor=7 hits=1 count=11",
  ],
};

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

const result = transpileProject({
  files: {
    "hsm/index.ts": read("./index.ts"),
    "hsm/async.ts": read("./async.ts"),
    [SCENARIOS_FILE]: read("./parity/scenarios.ts"),
    [ASYNC_SCENARIO_FILE]: read("./parity/async-scenario.ts"),
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
  return runLuaEntry(
    `return require(${JSON.stringify(moduleName(SCENARIOS_FILE))}).runScenario(${JSON.stringify(name)})`,
    `scenario "${name}"`,
  );
}

function runLuaEntry(chunk: string, label: string): string[] {
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
    return lua.lua_tostring(L, -1).split("\n");
  } finally {
    lua.lua_close(L);
  }
}

describe("hsm behavior in Bun and in Lua 5.1", () => {
  test("the core, async module and scenarios transpile cleanly and every require resolves", () => {
    expect(result.diagnostics).toEqual([]);
    const missing = emittedRequires().filter((name) => modules[name] === undefined);
    expect(missing).toEqual([]);
  });

  test("every scenario has an expected trace and every trace a scenario", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(scenarios.map((s) => s.name).sort());
  });

  test("a sequence resumes, finishes, and never resumes into a state it left", () => {
    const entry = JSON.stringify(moduleName(ASYNC_SCENARIO_FILE));
    expect(
      runLuaEntry(`return require(${entry}).runAsyncScenario()`, "the async scenario"),
    ).toEqual(ASYNC_EXPECTED);
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

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import { ENGINE_STUBS } from "./ecs-lesson-run.test-support";
import { viewBuiltins } from "./view-engine";
import { createProjectRunner, type EngineEntry, type EngineSink } from "./view-run";

const LUA_OK = 0;

let dir: string;
let projects = 0;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "view-engine-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Runs `source` the way `loadProject` does: a runner holding a fresh `viewBuiltins`.
function project(source: string, emit: EngineSink = () => {}): Record<string, unknown> {
  const entry = path.join(dir, `main-${++projects}.ts`);
  writeFileSync(entry, source);
  const runner = createProjectRunner(entry, {
    libraries: [],
    builtins: viewBuiltins(emit),
    tagLiterals: false,
  });
  runner.engine.setSink(emit);
  const exports = runner.run().modules.get(entry);
  if (exports === undefined) {
    throw new Error(`${entry} did not run`);
  }
  return exports;
}

// The numbers `chunk` returns, from Lua 5.1 with the stubs the tutorial's lesson run installs.
function luaNumbers(chunk: string): number[] {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const source = [
      ENGINE_STUBS,
      "local values = (function()",
      chunk,
      "end)()",
      "local shown = {}",
      'for i, value in ipairs(values) do shown[i] = string.format("%.17g", value) end',
      'return table.concat(shown, ",")',
    ].join("\n");
    if (lauxlib.luaL_dostring(L, source) !== LUA_OK) {
      throw new Error(lua.lua_tostring(L, -1));
    }
    return lua.lua_tostring(L, -1).split(",").map(Number);
  } finally {
    lua.lua_close(L);
  }
}

const DRAWS = `const draws: number[] = [];
for (let i = 0; i < 10; i++) draws.push(math.random());
for (let i = 0; i < 10; i++) draws.push(math.random(6));
for (let i = 0; i < 10; i++) draws.push(math.random(3, 5));
export { draws };
`;

describe("viewBuiltins", () => {
  test("draws the lesson run's random numbers in all three forms", () => {
    const draws = project(DRAWS).draws as number[];

    expect(draws).toEqual(
      luaNumbers(`local t = {}
for i = 1, 10 do t[#t + 1] = math.random() end
for i = 1, 10 do t[#t + 1] = math.random(6) end
for i = 1, 10 do t[#t + 1] = math.random(3, 5) end
return t`),
    );
    for (const value of draws.slice(0, 10)) {
      expect(value >= 0 && value < 1).toBe(true);
    }
    for (const value of draws.slice(10, 20)) {
      expect(Number.isInteger(value) && value >= 1 && value <= 6).toBe(true);
    }
    for (const value of draws.slice(20)) {
      expect(Number.isInteger(value) && value >= 3 && value <= 5).toBe(true);
    }
  });

  test("starts every set at the same seed, and reseeds on randomseed", () => {
    const seeded = `math.randomseed(7);
export const draws = [math.random(), math.random(), math.random()];
`;

    expect(project(DRAWS).draws).toEqual(project(DRAWS).draws);
    expect(project(seeded).draws).toEqual(project(seeded).draws);
    expect(project(seeded).draws).not.toEqual((project(DRAWS).draws as number[]).slice(0, 3));
  });

  test("gives Lua 5.1's math results", () => {
    const values = project(`export const values = [
  math.floor(-1.5), math.ceil(-1.5), math.abs(-2), math.min(3, 1, 2), math.max(3, 1, 2),
  math.sqrt(2), math.fmod(-5, 3), math.fmod(5.5, 2), math.pi,
];
export const huge = math.huge;
`);

    expect(values.values).toEqual(
      luaNumbers(`return {
  math.floor(-1.5), math.ceil(-1.5), math.abs(-2), math.min(3, 1, 2), math.max(3, 1, 2),
  math.sqrt(2), math.fmod(-5, 3), math.fmod(5.5, 2), math.pi,
}`),
    );
    expect((values.values as number[])[6]).toBe(-2);
    expect(values.huge).toBe(Number.POSITIVE_INFINITY);
  });

  test("builds vectors as plain objects", () => {
    const vectors = project(`const v = vmath.vector3(1, 2, 3);
export const partial = vmath.vector3(1, 2);
export const filled = vmath.vector3(5);
export const original = v;
export const copy = vmath.vector3(v);
export const zero = vmath.vector4();
`);

    expect(vectors.partial).toStrictEqual({ x: 1, y: 2, z: 0 });
    expect(vectors.filled).toStrictEqual({ x: 5, y: 5, z: 5 });
    expect(vectors.copy).toStrictEqual(vectors.original);
    expect(vectors.copy).not.toBe(vectors.original);
    expect(vectors.zero).toStrictEqual({ x: 0, y: 0, z: 0, w: 0 });
  });

  test("numbers each set's factory instances from 1 and logs every create", () => {
    const entries: EngineEntry[] = [];
    const created = project(
      `export const first = factory.create("#f");
export const second = factory.create("#f");
`,
      (entry) => entries.push(entry),
    );

    expect(created.first).toBe("hash: [instance 1]");
    expect(created.second).toBe("hash: [instance 2]");
    expect(entries).toEqual([
      { kind: "engine", api: "factory.create", args: ["#f"] },
      { kind: "engine", api: "factory.create", args: ["#f"] },
    ]);
    expect(project(`export const first = factory.create("#f");\n`).first).toBe(
      "hash: [instance 1]",
    );
  });

  test("answers the engine queries a world makes without logging them", () => {
    const entries: EngineEntry[] = [];
    const answers = project(
      `export const debug = sys.get_engine_info().is_debug;
export const config = sys.get_config_string("k", "d");
export const position = go.get_position();
export const world = go.get_world_position(".");
export const url = msg.url("#x");
const first = os.clock();
const second = os.clock();
export const clocks = [first, second];
`,
      (entry) => entries.push(entry),
    );

    expect(answers.debug).toBe(true);
    expect(answers.config).toBe("d");
    expect(answers.position).toStrictEqual({ x: 0, y: 0, z: 0 });
    expect(answers.world).toStrictEqual({ x: 0, y: 0, z: 0 });
    expect(typeof answers.url).toBe("object");
    expect(answers.url).not.toBeNull();
    const [first, second] = answers.clocks as number[];
    expect(typeof first).toBe("number");
    expect(second).toBeGreaterThanOrEqual(first as number);
    expect(entries).toEqual([]);
  });
});

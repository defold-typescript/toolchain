/**
 * The tutorial's jar actions, run in Lua 5.1: each lesson project with the `empty` action is
 * transpiled from the page's `ts step` fences and its `fireflies` script is driven through `init`,
 * `update` and `on_input` against the bundled `ecs` and `hsm` Lua, with the engine calls the
 * lessons make stubbed. A catch, `release` or `empty`, alone or in the same frame as another, must
 * never throw and must leave the jar holding the shine exactly while it holds a firefly.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import type { TranspileProjectResult } from "@defold-typescript/transpiler";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import {
  type FenceProject,
  GUIDE_DIR,
  lessonFences,
  transpileFenceProject,
  writeFenceProject,
} from "./guide-fence-gate";
import { lessonProjects } from "./guide-steps";

const LESSON_PAGE = "entity-systems-tutorial.md";
const SCRIPT = "fireflies.ts";
const EMPTY_ACTION = 'hash("empty")';
const LUA_OK = 0;
const SLOW = 120_000;

const page = readFileSync(path.join(GUIDE_DIR, LESSON_PAGE), "utf8");

interface Lesson {
  readonly heading: string;
  /** The lesson's project directory, as `lessonFences` writes it. */
  readonly dir: string;
}

const lessons: Lesson[] = lessonFences(page).flatMap((fence) => {
  const suffix = ` > ${SCRIPT}`;
  if (!fence.label.endsWith(suffix) || !fence.body.includes(EMPTY_ACTION)) return [];
  const dir = fence.rel.slice(0, fence.rel.length - SCRIPT.length - 1);
  return [{ heading: fence.label.slice(0, -suffix.length), dir }];
});

const lastHeading = lessonProjects(page).at(-1)?.heading;
if (lastHeading === undefined || !lessons.some((lesson) => lesson.heading === lastHeading)) {
  throw new Error(`the last lesson of ${LESSON_PAGE} has no \`empty\` action in ${SCRIPT}`);
}

let project: FenceProject | undefined;
let built: TranspileProjectResult | undefined;

function build(): TranspileProjectResult {
  if (built === undefined) {
    project = writeFenceProject(lessonFences(page), {
      tmpPrefix: "defold-typescript-ecs-tutorial-run-",
    });
    built = transpileFenceProject(project);
  }
  return built;
}

afterAll(() => {
  if (project !== undefined) rmSync(project.root, { recursive: true, force: true });
});

const moduleName = (rel: string) => rel.replace(/\.ts$/, "").split("/").join(".");

function lessonModules(lesson: Lesson): Record<string, string> {
  const result = build();
  const modules: Record<string, string> = { ...result.libraryModules };
  for (const [rel, source] of Object.entries(result.lua)) {
    if (rel.startsWith(`${lesson.dir}/`)) modules[moduleName(rel)] = source;
  }
  if (result.lualib !== undefined) modules.lualib_bundle = result.lualib;
  if (modules[moduleName(`${lesson.dir}/${SCRIPT}`)] === undefined) {
    throw new Error(`${lesson.heading}: the build emitted no ${SCRIPT}`);
  }
  return modules;
}

const ENGINE_STUBS = `
print = function() end
function hash(s) return "hash:" .. s end
local function vector(x, y, z, w) return { x = x or 0, y = y or 0, z = z or 0, w = w or 0 } end
vmath = {
  vector3 = function(x, y, z) return vector(x, y, z) end,
  vector4 = vector,
}
local instances = 0
factory = {
  create = function()
    instances = instances + 1
    return hash("instance " .. instances)
  end,
}
msg = {
  url = function() return {} end,
  post = function() end,
}
sys = {
  get_config_string = function(_, default) return default end,
  get_engine_info = function() return { is_debug = true } end,
}
go = {
  get_world_position = function() return vector() end,
  set_position = function() end,
  set_scale = function() end,
  set = function() end,
  delete = function() end,
}
label = { set_text = function() end }
`;

const DRIVER = `
local self = {}
local reports = {}
local function frame() update(self, 1 / 60) end
local function press(name, x, y) on_input(self, hash(name), { pressed = true, x = x, y = y }) end
local function catchOne()
  local garden, inGarden = {}, {}
  for i, f in ipairs(self.garden.entities) do
    garden[i] = f
    inGarden[f] = true
  end
  for _, f in ipairs(garden) do
    press("touch", f.position.x, f.position.y)
    for _, held in ipairs(self.jar.entities) do
      if inGarden[held] then return end
    end
  end
  error("no firefly in the garden could be caught", 0)
end
local function report()
  local shine = self.shine.world == self.jar and "in jar" or "out"
  reports[#reports + 1] = "jar " .. #self.jar.entities .. " fireflies, "
    .. #self.jar.systems .. " systems, shine " .. shine
end
`;

function runInLua(lesson: Lesson, scenario: string): string[] {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    lua.lua_getglobal(L, "package");
    lua.lua_getfield(L, -1, "preload");
    for (const [module, source] of Object.entries(lessonModules(lesson))) {
      const status = lauxlib.luaL_loadbuffer(L, source, Buffer.byteLength(source), `=${module}`);
      if (status !== LUA_OK) {
        throw new Error(`Lua failed to load ${module}: ${lua.lua_tostring(L, -1)}`);
      }
      lua.lua_setfield(L, -2, module);
    }
    lua.lua_settop(L, 0);
    const chunk = [
      ENGINE_STUBS,
      `require(${JSON.stringify(moduleName(`${lesson.dir}/${SCRIPT}`))})`,
      DRIVER,
      "local ok, err = pcall(function()",
      "init(self)",
      "frame()",
      scenario,
      "end)",
      "if not ok then reports[#reports + 1] = tostring(err) end",
      'return table.concat(reports, "\\n")',
    ].join("\n");
    const status = lauxlib.luaL_dostring(L, chunk);
    if (status !== LUA_OK) {
      throw new Error(`${lesson.heading}: ${lua.lua_tostring(L, -1)}`);
    }
    return lua.lua_tostring(L, -1).split("\n");
  } finally {
    lua.lua_close(L);
  }
}

const EMPTY_JAR = "jar 0 fireflies, 1 systems, shine out";

const SCENARIOS: readonly { name: string; lua: string; expected: string[] }[] = [
  {
    name: "empty before any catch",
    lua: 'press("empty") frame() report()',
    expected: [EMPTY_JAR],
  },
  {
    name: "empty after release took the shine",
    lua: 'catchOne() press("release") frame() press("empty") frame() report()',
    expected: [EMPTY_JAR],
  },
  {
    name: "empty twice",
    lua: 'catchOne() press("empty") frame() press("empty") frame() report()',
    expected: [EMPTY_JAR],
  },
  {
    name: "empty while the shine glows",
    lua: 'catchOne() report() press("empty") frame() report()',
    expected: ["jar 1 fireflies, 2 systems, shine in jar", EMPTY_JAR],
  },
  {
    name: "catch right after the last release",
    lua: 'catchOne() frame() press("release") catchOne() frame() report() press("release") frame() report()',
    expected: ["jar 1 fireflies, 2 systems, shine in jar", EMPTY_JAR],
  },
  {
    name: "catch right after empty",
    lua: 'catchOne() frame() press("empty") catchOne() frame() report() press("release") frame() report()',
    expected: ["jar 1 fireflies, 2 systems, shine in jar", EMPTY_JAR],
  },
  {
    name: "release right after empty",
    lua: 'catchOne() frame() press("empty") press("release") frame() report()',
    expected: [EMPTY_JAR],
  },
  {
    name: "empty right after the last release",
    lua: 'catchOne() frame() press("release") press("empty") frame() report()',
    expected: [EMPTY_JAR],
  },
];

for (const scenario of SCENARIOS) {
  describe(scenario.name, () => {
    test.each(lessons.map((lesson) => [lesson.heading, lesson] as const))(
      "%s",
      (_heading, lesson) => {
        expect(runInLua(lesson, scenario.lua)).toEqual(scenario.expected);
      },
      SLOW,
    );
  });
}

/**
 * Runs the lesson projects of "Entity systems, one system at a time" in Lua 5.1. The page's
 * `ts step` fences are built once into one project per lesson, and a lesson runs with its own
 * modules, the bundled library Lua, and stubs for the engine calls the lessons make. `print`
 * collects its lines for the caller, and `math.random` is a fixed-seed generator, so every host
 * prints the same night.
 */
import { rmSync } from "node:fs";
import type { TranspileProjectResult } from "@defold-typescript/transpiler";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51";
import {
  lessonDir,
  lessonFences,
  transpileFenceProject,
  writeFenceProject,
} from "./guide-fence-gate";
import { lessonProjects } from "./guide-steps";
import { matchTrace, type TraceFence, type TraceStep } from "./guide-traces";

export const TUTORIAL_PAGE = "entity-systems-tutorial.md";
export const SCRIPT = "fireflies.ts";
const GARDEN = "garden.ts";
const DEBUG_IMPORT = '"@defold-typescript/types/ecs/debug"';
const DEBUG_MODULE = "defold_typescript_ecs.debug";
const LUA_OK = 0;
const LUA_TNIL = 0;

export interface Lesson {
  readonly heading: string;
  /** The lesson's project directory, as `lessonFences` writes it. */
  readonly dir: string;
  /** Fence title to the file's text as it stands when the lesson ends. */
  readonly files: ReadonlyMap<string, string>;
}

export function tutorialLessons(page: string): Lesson[] {
  return lessonProjects(page).map((project, i) => ({
    heading: project.heading,
    dir: lessonDir(i),
    files: project.files,
  }));
}

// A build depends on the lesson fences alone, so a page that differs only outside them reuses it.
const builds = new Map<string, TranspileProjectResult>();

function build(page: string): TranspileProjectResult {
  const fences = lessonFences(page);
  const key = JSON.stringify(fences.map((fence) => [fence.rel, fence.body]));
  let built = builds.get(key);
  if (built === undefined) {
    const project = writeFenceProject(fences, { tmpPrefix: "defold-typescript-ecs-lesson-run-" });
    try {
      built = transpileFenceProject(project);
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
    builds.set(key, built);
  }
  return built;
}

export const moduleName = (rel: string) => rel.replace(/\.ts$/, "").split("/").join(".");

/** The modules a lesson's run loads: its own, every library module the build wrote, and lualib. */
export function lessonModules(page: string, lesson: Lesson): Record<string, string> {
  const result = build(page);
  const modules: Record<string, string> = { ...result.libraryModules };
  for (const [rel, source] of Object.entries(result.lua)) {
    if (rel.startsWith(`${lesson.dir}/`)) modules[moduleName(rel)] = source;
  }
  if (result.lualib !== undefined) modules.lualib_bundle = result.lualib;
  for (const title of lesson.files.keys()) {
    if (modules[moduleName(`${lesson.dir}/${title}`)] === undefined) {
      throw new Error(`${lesson.heading}: the build emitted no ${title}`);
    }
  }
  return modules;
}

export const ENGINE_STUBS = `
local printed = {}
print = function(...)
  local parts = {}
  for i = 1, select("#", ...) do
    parts[i] = tostring((select(i, ...)))
  end
  printed[#printed + 1] = table.concat(parts, " ")
end
local seed = 12345
math.random = function(m, n)
  seed = (seed * 16807) % 2147483647
  local r = (seed - 1) / 2147483646
  if m == nil then return r end
  if n == nil then m, n = 1, m end
  return m + math.floor(r * (n - m + 1))
end
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

export interface LessonRun {
  /** Each line `print` wrote, in order. */
  readonly printed: string[];
  /** What the chunk returned, or `undefined` for `nil`. */
  readonly result: string | undefined;
}

/**
 * Runs `chunk` in a fresh Lua 5.1 state that has the lesson's modules in `package.preload` and the
 * engine stubs as globals. Throws an `Error` naming the lesson when the chunk fails to load or
 * raises an error.
 */
export function runLesson(page: string, lesson: Lesson, chunk: string): LessonRun {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    lua.lua_getglobal(L, "package");
    lua.lua_getfield(L, -1, "preload");
    for (const [module, source] of Object.entries(lessonModules(page, lesson))) {
      const status = lauxlib.luaL_loadbuffer(L, source, Buffer.byteLength(source), `=${module}`);
      if (status !== LUA_OK) {
        throw new Error(`Lua failed to load ${module}: ${lua.lua_tostring(L, -1)}`);
      }
      lua.lua_setfield(L, -2, module);
    }
    lua.lua_settop(L, 0);
    const source = [
      ENGINE_STUBS,
      "local result = (function()",
      chunk,
      "end)()",
      'local text = table.concat(printed, "\\n") .. (#printed > 0 and "\\n" or "")',
      "return text, result",
    ].join("\n");
    const status = lauxlib.luaL_dostring(L, source);
    if (status !== LUA_OK) {
      throw new Error(`${lesson.heading}: ${lua.lua_tostring(L, -1)}`);
    }
    const result = lua.lua_type(L, -1) === LUA_TNIL ? undefined : lua.lua_tostring(L, -1);
    return { printed: lua.lua_tostring(L, -2).split("\n").slice(0, -1), result };
  } finally {
    lua.lua_close(L);
  }
}

function stepCall(step: TraceStep): string {
  switch (step.kind) {
    case "frames":
      return `frames(${step.count})`;
    case "press":
      return `press(${JSON.stringify(step.action)})`;
    case "touch":
    case "move":
      return `${step.kind}(${JSON.stringify(step.name)})`;
  }
}

/**
 * Runs a lesson the way a trace fence asks, and returns what it printed, with the error it raised
 * as `result`. A lesson with a script runs `init`, then the steps: until the script attaches an
 * inspector of its own, the run attaches `inspect(self.garden, "garden")` after `init` and draws it
 * after each frame. A lesson with no script requires its garden module and takes no steps.
 */
export function runTrace(page: string, lesson: Lesson, steps: readonly TraceStep[]): LessonRun {
  const script = lesson.files.get(SCRIPT);
  if (script === undefined) {
    if (steps.length > 0) {
      throw new Error(`${lesson.heading}: a lesson with no ${SCRIPT} runs no steps`);
    }
    if (!lesson.files.has(GARDEN)) {
      throw new Error(`${lesson.heading}: the lesson has neither ${SCRIPT} nor ${GARDEN}`);
    }
    const garden = JSON.stringify(moduleName(`${lesson.dir}/${GARDEN}`));
    return runLesson(
      page,
      lesson,
      `local ok, err = pcall(require, ${garden})\nif not ok then return tostring(err) end`,
    );
  }
  const attach = script.includes(DEBUG_IMPORT)
    ? ""
    : `inspector = require(${JSON.stringify(DEBUG_MODULE)}).inspect(self.garden, "garden")`;
  const chunk = `
local ok, err = pcall(function()
  require(${JSON.stringify(moduleName(`${lesson.dir}/${SCRIPT}`))})
  local self = {}
  init(self)
  local inspector = nil
  ${attach}
  local function frames(n)
    for _ = 1, n do
      update(self, 1 / 60)
      if inspector ~= nil then inspector.draw(".") end
    end
  end
  local function press(action)
    on_input(self, hash(action), { pressed = true, x = 0, y = 0 })
  end
  local function firefly(name)
    for _, f in ipairs(self.garden.entities) do
      if f.name == name then return f end
    end
    error("no firefly named \\"" .. name .. "\\" is in the garden", 0)
  end
  local function touch(name)
    local f = firefly(name)
    on_input(self, hash("touch"), { pressed = true, x = f.position.x, y = f.position.y })
  end
  local function move(name)
    local f = firefly(name)
    on_input(self, nil, { x = f.position.x, y = f.position.y })
  end
  ${steps.map(stepCall).join("\n  ")}
end)
if not ok then return tostring(err) end
`;
  return runLesson(page, lesson, chunk);
}

/**
 * Runs the lesson `trace` belongs to with its steps, and returns `undefined` when the printed lines
 * read as the trace shows them. Otherwise it returns a message naming the lesson, the trace's page
 * line and the mismatch, followed by the whole printed output.
 */
export function checkTrace(page: string, trace: TraceFence): string | undefined {
  const where = `${trace.heading === "" ? "(above the first heading)" : trace.heading}, trace at line ${trace.line}`;
  const lesson = tutorialLessons(page).find((candidate) => candidate.heading === trace.heading);
  if (lesson === undefined) return `${where}: the section changes no file, so nothing runs`;
  if (!lesson.files.has(SCRIPT) && trace.steps.length > 0) {
    return `${where}: the lesson has no ${SCRIPT}, so the trace takes no steps`;
  }
  const run = runTrace(page, lesson, trace.steps);
  const mismatch =
    run.result === undefined
      ? matchTrace(trace.shown, run.printed)
      : `the run threw: ${run.result}`;
  if (mismatch === undefined) return undefined;
  return [`${where}: ${mismatch}`, "printed:", ...run.printed].join("\n");
}

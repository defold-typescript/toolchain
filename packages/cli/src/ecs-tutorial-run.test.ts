/**
 * The tutorial's jar actions, run in Lua 5.1: each lesson project with the `empty` action is
 * transpiled from the page's `ts step` fences and its `fireflies` script is driven through `init`,
 * `update` and `on_input` against the bundled `ecs` and `hsm` Lua, with the engine calls the
 * lessons make stubbed. A catch, `release` or `empty`, alone or in the same frame as another, must
 * never throw and must leave the jar holding the shine exactly while it holds a firefly.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  type Lesson,
  moduleName,
  runLesson,
  SCRIPT,
  TUTORIAL_PAGE,
  tutorialLessons,
} from "./ecs-lesson-run.test-support";
import { GUIDE_DIR } from "./guide-fence-gate";

const EMPTY_ACTION = 'hash("empty")';
const SLOW = 120_000;

const page = readFileSync(path.join(GUIDE_DIR, TUTORIAL_PAGE), "utf8");

const allLessons = tutorialLessons(page);
const lessons = allLessons.filter((lesson) => lesson.files.get(SCRIPT)?.includes(EMPTY_ACTION));

const lastHeading = allLessons.at(-1)?.heading;
if (lastHeading === undefined || !lessons.some((lesson) => lesson.heading === lastHeading)) {
  throw new Error(`the last lesson of ${TUTORIAL_PAGE} has no \`empty\` action in ${SCRIPT}`);
}

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
  const chunk = [
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
  return (runLesson(page, lesson, chunk).result ?? "").split("\n");
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

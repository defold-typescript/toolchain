/**
 * The console traces of "Entity systems, one system at a time": every lesson that changes the
 * project shows a `text trace` fence below its last step fence, and each trace must read as the
 * lesson's own project prints when it is transpiled and run in Lua 5.1 against the bundled `ecs`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { checkTrace, TUTORIAL_PAGE } from "./ecs-lesson-run.test-support";
import { GUIDE_DIR } from "./guide-fence-gate";
import { isStepFence, lessonProjects, sectionHeadings, tsFences } from "./guide-steps";
import { headingAt, traceFences } from "./guide-traces";

const SLOW = 120_000;
const FIRST_LESSON = "3. Your first world";

const page = readFileSync(path.join(GUIDE_DIR, TUTORIAL_PAGE), "utf8");
const traces = traceFences(page);

test("every lesson that changes the project shows a trace", () => {
  const traced = new Set(traces.map((trace) => trace.heading));
  const untraced = lessonProjects(page)
    .map((project) => project.heading)
    .filter((heading) => !traced.has(heading));
  expect(untraced).toEqual([]);
});

test("no trace sits above a step fence of its own section", () => {
  const headings = sectionHeadings(page);
  const steps = tsFences(page)
    .filter((fence) => isStepFence(fence.info))
    .map((fence) => ({ heading: headingAt(headings, fence.line), line: fence.line }));
  const early = traces
    .filter((trace) =>
      steps.some((step) => step.heading === trace.heading && step.line > trace.line),
    )
    .map((trace) => `${trace.heading}: trace at line ${trace.line}`);
  expect(early).toEqual([]);
});

describe("each trace reads as its lesson prints", () => {
  test.each(traces.map((trace) => [`${trace.heading}, line ${trace.line}`, trace] as const))(
    "%s",
    (_name, trace) => {
      const failure = checkTrace(page, trace);
      if (failure !== undefined) throw new Error(failure);
    },
    SLOW,
  );
});

test(
  "one stale line in a trace reds the gate",
  () => {
    const first = traces.find((trace) => trace.heading === FIRST_LESSON);
    if (first === undefined) throw new Error(`"${FIRST_LESSON}" shows no trace`);
    expect(first.shown.at(-1)).toBe("500 100");
    const lines = page.split("\n");
    lines[first.line + first.shown.length - 1] = "500 101";
    const altered = lines.join("\n");
    const stale = traceFences(altered).find((trace) => trace.line === first.line);
    if (stale === undefined) throw new Error("the altered page lost the trace");
    expect(checkTrace(altered, stale)).toContain("500 101");
  },
  SLOW,
);

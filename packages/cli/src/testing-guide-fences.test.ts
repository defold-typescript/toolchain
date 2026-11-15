/**
 * The testing guide shows the test a project keeps next to its module, so every `ts` fence on the
 * page must compile at the strictness `init` scaffolds against the declarations
 * `@defold-typescript/types` ships, with a test fence's `bun-types/test` reference line resolved,
 * and the page's game modules must transpile through the build while its tests stay out of it.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import {
  badFenceTitles,
  type FenceProject,
  failingFences,
  GUIDE_DIR,
  guideFences,
  isBunTestFence,
  transpileErrors,
  writeFenceProject,
} from "./guide-fence-gate";
import { COLOCATED_TEST_REFERENCE } from "./test-folder";

const PAGE = "testing.md";
const SLOW = 120_000;

const guide = readFileSync(path.join(GUIDE_DIR, PAGE), "utf8");

let written: FenceProject | undefined;
const pageProject = (): FenceProject => {
  written ??= writeFenceProject(guideFences(guide), { tmpPrefix: "defold-typescript-testing-" });
  return written;
};

afterAll(() => {
  if (written !== undefined) rmSync(written.root, { recursive: true, force: true });
});

describe(`${PAGE} fences`, () => {
  test("the page shows a test next to its module, and no two fences share a title", () => {
    const rels = guideFences(guide).map((fence) => fence.rel);
    expect(badFenceTitles(guide), "fence titles that name no file under src/").toEqual([]);
    expect(
      rels.filter((rel, i) => rels.indexOf(rel) !== i),
      "fence titles used twice",
    ).toEqual([]);
    const tests = rels.filter(isBunTestFence);
    expect(tests.length).toBeGreaterThan(0);
    for (const rel of tests) {
      expect(rels).toContain(rel.replace(/\.test\.ts$/, ".ts"));
    }
  });

  test("every test fence starts with the reference line the scaffold tells a test to carry", () => {
    const firstLines = guideFences(guide)
      .filter((fence) => isBunTestFence(fence.rel))
      .map((fence) => fence.body.split("\n")[0]);
    expect(firstLines.length).toBeGreaterThan(0);
    for (const line of firstLines) expect(line).toBe(COLOCATED_TEST_REFERENCE);
  });

  test(
    "every ts fence type-checks at the scaffold strictness",
    () => {
      expect(failingFences(guideFences(guide), pageProject())).toEqual({});
    },
    SLOW,
  );

  test(
    "every game module fence transpiles to Lua",
    () => {
      expect(transpileErrors(pageProject())).toEqual([]);
    },
    SLOW,
  );
});

import { afterAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import {
  badFenceTitles,
  type Fence,
  type FenceProject,
  failingFences,
  transpileErrors,
  writeFenceProject,
} from "./guide-fence-gate";

const SLOW = 120_000;

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(fences: readonly Fence[]): FenceProject {
  const written = writeFenceProject(fences, { tmpPrefix: "defold-typescript-fence-gate-" });
  tempRoots.push(written.root);
  return written;
}

const TEST_FENCE: Fence = {
  label: "test/count.test.ts",
  rel: "test/count.test.ts",
  body: [
    'import { expect, test } from "bun:test";',
    "",
    'test("counts", () => {',
    "  expect([1, 2].length).toBe(2);",
    "});",
  ].join("\n"),
};

describe("a Bun test fence", () => {
  test("is a valid fence title", () => {
    const guide = '```ts title="test/count.test.ts"\nconst n = 1;\n```\n';
    expect(badFenceTitles(guide)).toEqual([]);
  });

  test(
    "type-checks against the bun:test declarations",
    () => {
      const misuse: Fence = {
        label: "test/misuse.test.ts",
        rel: "test/misuse.test.ts",
        body: ['import { expect } from "bun:test";', "", "expect(1).toBe();"].join("\n"),
      };
      const failing = failingFences([TEST_FENCE, misuse], project([TEST_FENCE, misuse]));
      expect(Object.keys(failing)).toEqual(["test/misuse.test.ts"]);
    },
    SLOW,
  );

  test(
    "is left out of the Lua build",
    () => {
      expect(transpileErrors(project([TEST_FENCE]))).toEqual([]);
    },
    SLOW,
  );
});

describe("a Bun test fence next to its module", () => {
  const MODULE_FENCE: Fence = {
    label: "count.ts",
    rel: "count.ts",
    body: "export function count(items: readonly number[]): number {\n  return items.length;\n}",
  };
  const COLOCATED_FENCE: Fence = {
    label: "count.test.ts",
    rel: "count.test.ts",
    body: [
      '/// <reference types="bun-types/test" />',
      'import { expect, test } from "bun:test";',
      'import { count } from "./count";',
      "",
      'test("counts", () => {',
      "  expect(count([1, 2])).toBe(2);",
      "});",
    ].join("\n"),
  };

  test("is a valid fence title", () => {
    const guide = '```ts title="count.test.ts"\nconst n = 1;\n```\n';
    expect(badFenceTitles(guide)).toEqual([]);
  });

  test(
    "type-checks with its bun-types/test reference line",
    () => {
      const fences = [MODULE_FENCE, COLOCATED_FENCE];
      expect(failingFences(fences, project(fences))).toEqual({});
    },
    SLOW,
  );

  test(
    "is left out of the Lua build while its module compiles",
    () => {
      expect(transpileErrors(project([MODULE_FENCE, COLOCATED_FENCE]))).toEqual([]);
    },
    SLOW,
  );
});

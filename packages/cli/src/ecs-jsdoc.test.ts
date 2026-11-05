/**
 * A hover over an `ecs` export shows its JSDoc, so every declaration `@defold-typescript/types/ecs`
 * ships carries a summary, a `@param` per parameter, a `@returns` on a non-`void` return and, on
 * an exported function, an `@example` that compiles at the scaffold strictness and builds. The
 * probe fixture holds one of each defect, so the checks are shown to fail.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { bundledModules, ECS_LIBRARY } from "@defold-typescript/transpiler";
import {
  type Fence,
  type FenceProject,
  failingFences,
  REPO_ROOT,
  transpileErrors,
  typeCheck,
  writeFenceProject as writeProject,
} from "./guide-fence-gate";
import { jsdocExamples, jsdocGaps } from "./jsdoc-gate";

const PROBE = path.join(REPO_ROOT, "packages/cli/test/fixtures/jsdoc-gate-probe.d.ts");

const SLOW = 120_000;

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFenceProject(fences: readonly Fence[]): FenceProject {
  const project = writeProject(fences, { tmpPrefix: "defold-typescript-ecs-jsdoc-" });
  tempRoots.push(project.root);
  return project;
}

describe("jsdoc gate probe", () => {
  const probe = readFileSync(PROBE, "utf8");

  test("jsdocGaps reports each defect the probe holds and nothing else", () => {
    expect(jsdocGaps("probe", probe)).toEqual([
      "probe:uncommented: no summary",
      "probe:uncommented: no @example",
      "probe:missingParam: no @param b",
      "probe:missingReturns: no @returns",
      "probe:strayParam: @param m names no parameter",
      "probe:overloaded#2: no summary",
      "probe:overloaded#2: no @example",
      "probe:Probe.undocumented: no summary",
      "probe:Probe.scale: no @param factor",
      "probe:noExample: no @example",
      "probe:emptyExample: no ts code in @example",
      "probe:unclosedOverload#2: no ts code in @example",
    ]);
  });

  test(
    "jsdocExamples returns every example fence, and the one importing a missing export fails",
    () => {
      const examples = jsdocExamples("probe", probe);
      expect(examples.map((fence) => fence.label)).toEqual([
        "probe:missingParam @example 1",
        "probe:missingReturns @example 1",
        "probe:strayParam @example 1",
        "probe:overloaded#1 @example 1",
        "probe:unclosedOverload#1 @example 1",
        "probe:missingExport @example 1",
        "probe:clean @example 1",
      ]);
      const clean = examples.find((fence) => fence.label === "probe:clean @example 1");
      expect(clean?.body).toBe(
        [
          'import { requireAll } from "@defold-typescript/types/ecs";',
          "",
          'export const moving = requireAll("position", "velocity");',
          "",
        ].join("\n"),
      );
      const project = writeFenceProject(examples);
      const found = typeCheck(project);
      const missing = examples.find((fence) => fence.label === "probe:missingExport @example 1");
      expect(found.get(missing?.rel ?? "")?.length ?? 0).toBeGreaterThan(0);
      expect(found.get(clean?.rel ?? "")).toBeUndefined();
      expect(Object.keys(failingFences(examples, project))).toEqual([
        "probe:missingExport @example 1",
      ]);
    },
    SLOW,
  );
});

describe("ecs declarations", () => {
  // The shipped files, which emit-library-declarations.test.ts holds equal to a fresh emit.
  const declarations = bundledModules(ECS_LIBRARY).map((module) => ({
    module: `${ECS_LIBRARY.id}/${module.name}`,
    text: readFileSync(
      path.join(REPO_ROOT, "packages", "types", ECS_LIBRARY.id, `${module.name}.d.ts`),
      "utf8",
    ),
  }));
  const examples = declarations.flatMap(({ module, text }) => jsdocExamples(module, text));

  let project: FenceProject | undefined;
  const exampleProject = (): FenceProject => {
    project ??= writeFenceProject(examples);
    return project;
  };

  test("the registry names the index and the bridge", () => {
    expect(declarations.map(({ module }) => module)).toEqual(
      expect.arrayContaining(["ecs/index", "ecs/hsm"]),
    );
  });

  for (const { module, text } of declarations) {
    test(`${module} documents every export, member, parameter and return`, () => {
      expect(jsdocGaps(module, text)).toEqual([]);
    });
  }

  test(
    "every @example type-checks against the shipped declarations at the scaffold strictness",
    () => {
      expect(examples.length).toBeGreaterThan(0);
      expect(failingFences(examples, exampleProject())).toEqual({});
    },
    SLOW,
  );

  test(
    "every @example transpiles to Lua",
    () => {
      expect(transpileErrors(exampleProject())).toEqual([]);
    },
    SLOW,
  );
});

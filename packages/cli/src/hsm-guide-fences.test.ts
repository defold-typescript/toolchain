/**
 * The State machines guide is the `hsm` manual and the state machines tutorial
 * teaches it, so every `ts` fence on either page must compile against the
 * declarations `@defold-typescript/types/hsm` ships, at the strictness `init`
 * scaffolds, and transpile through the build. A fence that has to show a
 * compile error does so with `// @ts-expect-error`, which this gate then proves.
 * A fence that cannot compile alone, a config key or a method shown by itself,
 * is a `ts excerpt` fence: it must quote the excerpt source, whose fences
 * compile under the same checks. A `ts builder` fence, the Builder tab of the
 * config fence before it, quotes the excerpt source the same way.
 * A `ts step` fence on the tutorial is a diff of a file the reader builds: the
 * files each lesson leaves must compile and transpile as one project, and the
 * last lesson's project must use every member and call every function the hsm
 * entry points ship, so a member `hsm` gains needs a lesson that uses it.
 * The manual's reference tables are held to the `StateConfig`, `Machine`,
 * `MachineInstance` and `WaitGroup` interfaces of the hsm source, and to the
 * `MachineBuilder` and `StateBuilder` interfaces of its builder module.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import {
  badFenceTitles,
  collapseWhitespace,
  exportedTypeMembers,
  type Fence,
  type FenceProject,
  failingFences,
  GUIDE_DIR,
  guideFences,
  lessonFences,
  REPO_ROOT,
  referenceRows,
  type SurfaceCoverage,
  type TaughtSurface,
  transpileErrors,
  typeCheck,
  unquotedExcerpts,
  unusedSurface,
  writeFenceProject as writeProject,
} from "./guide-fence-gate";
import { type LessonProject, lessonProjects } from "./guide-steps";
import { LIBRARY_DATA_DIR } from "./library/package-root";
import { printCorpus } from "./library/print-corpus";

const REFERENCE_PAGE = "state-machines.md";
const LESSON_PAGE = "state-machines-tutorial.md";
const FENCED_PAGES = [REFERENCE_PAGE, LESSON_PAGE];
const EXCERPT_SOURCE = path.join(REPO_ROOT, "packages/cli/test/fixtures/hsm-guide-excerpts.md");
const FENCED_FILES = [...FENCED_PAGES.map((page) => path.join(GUIDE_DIR, page)), EXCERPT_SOURCE];
const HSM_INDEX_SOURCE = path.join(REPO_ROOT, "packages", "hsm", "src", "index.ts");
const HSM_BUILDER_SOURCE = path.join(REPO_ROOT, "packages", "hsm", "src", "builder.ts");

// The library modules a fence imports, printed as `resolve` writes them into a
// project's `.defold-types/`; each becomes a project file next to the fences.
const LIBRARY_MODULES = ["monarch.monarch"];
const LIBRARY_CORPUS = await printCorpus(LIBRARY_DATA_DIR);

const SLOW = 120_000;

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFenceProject(fences: readonly Fence[]): FenceProject {
  const project = writeProject(fences, {
    libraryModules: LIBRARY_MODULES,
    corpus: LIBRARY_CORPUS,
    tmpPrefix: "defold-typescript-hsm-guide-",
  });
  tempRoots.push(project.root);
  return project;
}

for (const file of FENCED_FILES) {
  const page = path.basename(file);
  const guide = readFileSync(file, "utf8");

  let pageProject: FenceProject | undefined;
  const pageFenceProject = (): FenceProject => {
    pageProject ??= writeFenceProject(guideFences(guide));
    return pageProject;
  };

  describe(`${page} fences`, () => {
    test("the page has ts fences and no two share a title", () => {
      const fences = guideFences(guide);
      expect(fences.length).toBeGreaterThan(0);
      expect(badFenceTitles(guide), "fence titles that name no file under src/").toEqual([]);
      const titled = fences.map((f) => f.rel).filter((rel) => !rel.startsWith("guide-fence-"));
      const repeated = titled.filter((rel, i) => titled.indexOf(rel) !== i);
      expect(repeated, "fence titles used twice").toEqual([]);
    });

    test(
      "every ts fence type-checks against the shipped hsm declarations at the scaffold strictness",
      () => {
        expect(failingFences(guideFences(guide), pageFenceProject())).toEqual({});
      },
      SLOW,
    );

    test(
      "every ts fence transpiles to Lua",
      () => {
        expect(transpileErrors(pageFenceProject())).toEqual([]);
      },
      SLOW,
    );
  });
}

// The tutorial's events are its own union, so nothing names `type` through `EventObject`.
const HSM_SURFACE: TaughtSurface = {
  entryPoints: [
    "@defold-typescript/types/hsm",
    "@defold-typescript/types/hsm/async",
    "@defold-typescript/types/hsm/debug",
    "@defold-typescript/types/hsm/defold",
  ],
  untaughtInterfaces: new Set(["EventObject"]),
  memberAliases: new Set(["StateConfig"]),
};

/** What `files`, one project, leaves unused of the surface the four hsm entry points ship. */
function unusedHsmSurface(files: ReadonlyMap<string, string>): SurfaceCoverage {
  const project = writeFenceProject(
    [...files].map(([title, body]): Fence => ({ label: title, rel: title, body })),
  );
  return unusedSurface(project, HSM_SURFACE);
}

describe(`${LESSON_PAGE} lessons`, () => {
  const page = readFileSync(path.join(GUIDE_DIR, LESSON_PAGE), "utf8");

  let lessonProject: FenceProject | undefined;
  const lessonFenceProject = (): FenceProject => {
    lessonProject ??= writeFenceProject(lessonFences(page));
    return lessonProject;
  };

  test(
    "the last lesson's project uses every hsm member",
    () => {
      const last = lessonProjects(page).at(-1);
      expect(last, "the page has a lesson project").toBeDefined();
      expect(unusedHsmSurface((last as LessonProject).files)).toEqual({
        members: [],
        functions: [],
      });
    },
    SLOW,
  );

  test(
    "every lesson's project type-checks at the scaffold strictness",
    () => {
      const fences = lessonFences(page);
      expect(fences.length).toBeGreaterThan(0);
      expect(failingFences(fences, lessonFenceProject())).toEqual({});
    },
    SLOW,
  );

  test(
    "every lesson's project transpiles to Lua",
    () => {
      expect(lessonFenceProject().sources.size).toBeGreaterThan(0);
      expect(transpileErrors(lessonFenceProject())).toEqual([]);
    },
    SLOW,
  );
});

describe("hsm guide lesson gate", () => {
  test(
    "the lesson gate can fail",
    () => {
      const page = [
        "## 1. Two states",
        "",
        '```ts step title="lamp.ts"',
        'import { defineMachine } from "@defold-typescript/types/hsm";',
        "",
        'export const lamp = defineMachine<{}, { type: "TOGGLE" }>()({',
        '  initial: "/off",',
        "  states: {",
        '    off: { on: { TOGGLE: "/on" } },',
        '    on: { on: { TOGGLE: "/off" } },',
        "  },",
        "});",
        "```",
        "",
        "## 2. A renamed state",
        "",
        '```ts step title="lamp.ts"',
        '    off: { on: { TOGGLE: "/on" } },',
        '    on: { on: { TOGGLE: "/off" } }, // [!code --]',
        '    lit: { on: { TOGGLE: "/off" } }, // [!code ++]',
        "  },",
        "```",
        "",
      ].join("\n");
      const fences = lessonFences(page);
      expect(fences.map((fence) => fence.rel)).toEqual(["lesson-01/lamp.ts", "lesson-02/lamp.ts"]);
      const found = typeCheck(writeFenceProject(fences));
      expect(found.get("lesson-01/lamp.ts")).toBeUndefined();
      expect(found.get("lesson-02/lamp.ts")?.length ?? 0).toBeGreaterThan(0);
    },
    SLOW,
  );
});

/**
 * `files` with every call of a function in `names` unmade: the callee, a name or a member of a
 * namespace import, stays as a value and in a type query, cast to `never`. Every import stays.
 */
function withoutCallsTo(
  files: ReadonlyMap<string, string>,
  names: readonly string[],
): Map<string, string> {
  const mutant = new Map<string, string>();
  for (const [title, body] of files) {
    const source = ts.createSourceFile(title, body, ts.ScriptTarget.Latest, true);
    const callees: ts.Expression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee)
          ? callee
          : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
            ? callee.name
            : undefined;
        if (name !== undefined && names.includes(name.text)) callees.push(callee);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    let text = body;
    for (const callee of callees.sort((a, b) => b.getStart(source) - a.getStart(source))) {
      const written = callee.getText(source);
      const uncalled = `(${written} as typeof ${written} as never)`;
      text = `${text.slice(0, callee.getStart(source))}${uncalled}${text.slice(callee.getEnd())}`;
    }
    mutant.set(title, text);
  }
  return mutant;
}

describe("hsm guide coverage gate", () => {
  test(
    "a function the last project imports and never calls is unused",
    () => {
      const page = readFileSync(path.join(GUIDE_DIR, LESSON_PAGE), "utf8");
      const last = lessonProjects(page).at(-1);
      expect(last, "the page has a lesson project").toBeDefined();
      const exported = unusedHsmSurface(new Map([["empty.ts", ""]])).functions;
      expect(exported.length).toBeGreaterThan(0);
      const mutant = withoutCallsTo((last as LessonProject).files, exported);
      expect(unusedHsmSurface(mutant).functions).toEqual(exported);
    },
    SLOW,
  );

  test(
    "the coverage gate can fail",
    () => {
      const page = [
        "## 1. Two states",
        "",
        '```ts step title="lamp.ts"',
        'import { defineMachine } from "@defold-typescript/types/hsm";',
        "",
        'export const lamp = defineMachine<{}, { type: "TOGGLE" }>()({',
        '  initial: "/off",',
        "  states: {",
        '    off: { on: { TOGGLE: "/on" } },',
        '    on: { on: { TOGGLE: "/off" } },',
        "  },",
        "});",
        "```",
        "",
      ].join("\n");
      const [only] = lessonProjects(page);
      const unused = unusedHsmSurface((only as LessonProject).files);
      expect(unused.members).toContain("StateBase.after");
      expect(unused.members).toContain("StateBase.every");
      expect(unused.members).not.toContain("StateBase.on");
      expect(unused.members).not.toContain("StateBase.states");
      expect(unused.members).not.toContain("CompoundState.initial");
      expect(unused.functions).toContain("waitGroup");
      expect(unused.functions).not.toContain("defineMachine");
    },
    SLOW,
  );

  test(
    "a call of one overload covers the function",
    () => {
      const overloaded = (last: string): string =>
        [
          'import { waitGroup, type WaitGroup } from "@defold-typescript/types/hsm";',
          "",
          'declare module "@defold-typescript/types/hsm" {',
          '  function waitGroup(label: "added"): WaitGroup;',
          "}",
          "",
          last,
        ].join("\n");
      const unusedFunctions = (last: string): string[] =>
        unusedHsmSurface(new Map([["overload.ts", overloaded(last)]])).functions;

      const both: Fence = {
        label: "overload.ts",
        rel: "overload.ts",
        body: overloaded('export const groups = [waitGroup(), waitGroup("added")];'),
      };
      expect(failingFences([both], writeFenceProject([both]))).toEqual({});
      expect(
        unusedFunctions("export const held = waitGroup;").filter((name) => name === "waitGroup"),
      ).toEqual(["waitGroup"]);
      expect(unusedFunctions("export const group = waitGroup();")).not.toContain("waitGroup");
      expect(unusedFunctions('export const group = waitGroup("added");')).not.toContain(
        "waitGroup",
      );
    },
    SLOW,
  );
});

describe("hsm guide fence gate", () => {
  test(
    "the gate can fail: a machine targeting an unknown state does not compile",
    () => {
      const probe: Fence = {
        label: "probe",
        rel: "probe.ts",
        body: [
          'import { defineMachine } from "@defold-typescript/types/hsm";',
          "",
          'const machine = defineMachine<{}, { type: "GO" }>()({',
          '  initial: "idle",',
          '  states: { idle: { on: { GO: "nowhere" } } },',
          "});",
          "machine.start({});",
        ].join("\n"),
      };
      const found = typeCheck(writeFenceProject([probe]));
      expect(found.get("probe.ts")?.length ?? 0).toBeGreaterThan(0);
    },
    SLOW,
  );
});

describe("hsm guide fences in a callout", () => {
  test("a fence inside a callout is read without its blockquote prefix", () => {
    const guide = [
      "> [!WARNING] A callout with a fence.",
      ">",
      '> ```ts title="probe.ts"',
      "> type Later = Promise<",
      ">   number",
      "> >;",
      ">",
      "> export type { Later };",
      "> ```",
      "",
    ].join("\n");
    expect(guideFences(guide)).toEqual([
      {
        label: "probe.ts",
        rel: "probe.ts",
        body: "type Later = Promise<\n  number\n>;\n\nexport type { Later };\n",
      },
    ]);
  });
});

describe("hsm guide excerpts", () => {
  const source = collapseWhitespace(
    guideFences(readFileSync(EXCERPT_SOURCE, "utf8"))
      .map((fence) => fence.body)
      .join("\n"),
  );

  for (const page of FENCED_PAGES) {
    test(`every ts excerpt fence on ${page} quotes the excerpt source`, () => {
      const guide = readFileSync(path.join(GUIDE_DIR, page), "utf8");
      expect(unquotedExcerpts(guide, source)).toEqual([]);
    });
  }

  test("the gate can fail: an excerpt the source does not hold is reported", () => {
    const guide = '```ts excerpt\nafter: { 5: "/nowhere" }\n```\n';
    expect(unquotedExcerpts(guide, source)).toEqual(['after: { 5: "/nowhere" }']);
  });

  test("a ts builder fence is an excerpt: the source must hold it", () => {
    const guide = '```ts builder\nm.state("/nowhere").after(5).to("/idle");\n```\n';
    expect(unquotedExcerpts(guide, source)).toEqual(['m.state("/nowhere").after(5).to("/idle");']);
  });

  test("a ts builder fence is not compiled alone", () => {
    const guide = [
      "```ts excerpt",
      'after: { 5: "/idle" }',
      "```",
      "",
      "```ts builder",
      'm.state("/patrol").after(5).to("/idle");',
      "```",
      "",
    ].join("\n");
    expect(guideFences(guide)).toEqual([]);
  });
});

const reference = readFileSync(path.join(GUIDE_DIR, REFERENCE_PAGE), "utf8");

describe("state machines guide reference", () => {
  const program = ts.createProgram([HSM_INDEX_SOURCE], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });
  for (const name of ["StateConfig", "Machine", "MachineInstance", "WaitGroup"]) {
    test(`the ${name} table lists every member and nothing else`, () => {
      const members = exportedTypeMembers(program, HSM_INDEX_SOURCE, name);
      expect(members.length).toBeGreaterThan(0);
      const rows = referenceRows(reference, name);
      expect(rows, `## Reference has a ### ${name} table`).toBeDefined();
      expect((rows as string[]).sort()).toEqual([...members].sort());
    });
  }

  const builderProgram = ts.createProgram([HSM_BUILDER_SOURCE], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });
  for (const name of ["MachineBuilder", "StateBuilder"]) {
    test(`the ${name} table lists every member of the builder and nothing else`, () => {
      const members = exportedTypeMembers(builderProgram, HSM_BUILDER_SOURCE, name);
      expect(members.length).toBeGreaterThan(0);
      const rows = referenceRows(reference, name);
      expect(rows, `## Reference has a ### ${name} table`).toBeDefined();
      expect((rows as string[]).sort()).toEqual([...members].sort());
    });
  }
});

/**
 * The Entity systems guide is the `ecs` manual and "ecs and hsm together" teaches the bridge, so
 * every `ts` fence on either page must compile against the declarations
 * `@defold-typescript/types/ecs` and `@defold-typescript/types/ecs/hsm` ship, at the strictness
 * `init` scaffolds, and transpile through the build. A fence that cannot compile alone is a
 * `ts excerpt` fence: it must quote the excerpt source, whose fences compile under the same
 * checks. `ecs` compiles without `lualib_bundle`, and so do the Entity systems samples; the bridge
 * page spreads `member` hooks into state configs, which lowers to a lualib helper, as its text
 * says. The reference tables are held to the exports of the ecs source, and each row's description
 * to the summary a hover shows for the declaration it names.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import {
  badFenceTitles,
  collapseWhitespace,
  exportedFunctions,
  exportedTypeMembers,
  type Fence,
  type FenceProject,
  failingFences,
  GUIDE_DIR,
  guideFences,
  REPO_ROOT,
  referenceDescriptions,
  referenceRows,
  transpileErrors,
  transpileFenceProject,
  typeCheck,
  unquotedExcerpts,
  writeFenceProject as writeProject,
} from "./guide-fence-gate";
import { jsdocSummary } from "./jsdoc-gate";

const REFERENCE_PAGE = "entity-systems.md";
const BRIDGE_PAGE = "ecs-and-hsm.md";
const FENCED_PAGES = [REFERENCE_PAGE, BRIDGE_PAGE];
const EXCERPT_SOURCE = path.join(REPO_ROOT, "packages/cli/test/fixtures/ecs-guide-excerpts.md");
const FENCED_FILES = [...FENCED_PAGES.map((page) => path.join(GUIDE_DIR, page)), EXCERPT_SOURCE];
const ECS_INDEX_SOURCE = path.join(REPO_ROOT, "packages", "ecs", "src", "index.ts");
const ECS_HSM_SOURCE = path.join(REPO_ROOT, "packages", "ecs", "src", "hsm.ts");

const SLOW = 120_000;

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFenceProject(fences: readonly Fence[]): FenceProject {
  const project = writeProject(fences, { tmpPrefix: "defold-typescript-ecs-guide-" });
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
      "every ts fence type-checks against the shipped ecs declarations at the scaffold strictness",
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

    if (page !== BRIDGE_PAGE) {
      test(
        "no ts fence pulls in lualib_bundle",
        () => {
          expect(transpileFenceProject(pageFenceProject()).lualib).toBeUndefined();
        },
        SLOW,
      );
    }
  });
}

describe("ecs guide lualib gate", () => {
  test(
    "the gate can fail: clearing an array with length = 0 pulls in lualib_bundle",
    () => {
      const probe: Fence = {
        label: "probe",
        rel: "probe.ts",
        body: "export const seen: number[] = [1];\nseen.length = 0;",
      };
      expect(transpileFenceProject(writeFenceProject([probe])).lualib).toBeDefined();
    },
    SLOW,
  );
});

describe("ecs guide fence gate", () => {
  const probe = (filter: string): Fence => ({
    label: "probe",
    rel: "probe.ts",
    body: [
      'import { processingSystem, requireAll } from "@defold-typescript/types/ecs";',
      "",
      "interface Vec {",
      "  x: number;",
      "  y: number;",
      "}",
      "",
      "interface E {",
      "  position?: Vec;",
      "  velocity?: Vec;",
      "}",
      "",
      `export const move = processingSystem<E>()(${filter}, {`,
      "  process(e) {",
      "    e.position.x += e.velocity.x;",
      "  },",
      "});",
    ].join("\n"),
  });

  test(
    "the gate can fail: a component the filter does not require is not narrowed",
    () => {
      const narrowed = typeCheck(writeFenceProject([probe('requireAll("position", "velocity")')]));
      expect(narrowed.get("probe.ts")).toBeUndefined();
      const found = typeCheck(writeFenceProject([probe('requireAll("position")')]));
      expect(found.get("probe.ts")?.length ?? 0).toBeGreaterThan(0);
    },
    SLOW,
  );
});

describe("ecs guide excerpts", () => {
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
    const guide = '```ts excerpt\nrequireAll("position", "nowhere")\n```\n';
    expect(unquotedExcerpts(guide, source)).toEqual(['requireAll("position", "nowhere")']);
  });
});

function tableRows(page: string, heading: string): string[] {
  const rows = referenceRows(page, heading);
  expect(rows, `## Reference has a ### ${heading} table`).toBeDefined();
  return [...(rows as string[])].sort();
}

// The hover text and the table say the same thing: each description cell is the summary of the
// declaration its row names, and a mismatch prints the cell the row should hold.
function cellsUnlikeSummaries(
  page: string,
  heading: string,
  summaryOf: (name: string) => string,
): string[] {
  const cells = referenceDescriptions(page, heading);
  expect(cells, `## Reference has a ### ${heading} table`).toBeDefined();
  expect(cells?.size ?? 0).toBeGreaterThan(0);
  const unlike: string[] = [];
  for (const [name, cell] of cells ?? []) {
    const summary = summaryOf(name);
    if (collapseWhitespace(cell) !== summary) {
      unlike.push(`${heading} row \`${name}\` should read: ${summary}`);
    }
  }
  return unlike;
}

const CALLBACK_INTERFACES = [
  "PlainSystemCallbacks",
  "ProcessingSystemCallbacks",
  "SortedSystemCallbacks",
  "SortedProcessingSystemCallbacks",
];

describe("entity systems guide reference", () => {
  const reference = readFileSync(path.join(GUIDE_DIR, REFERENCE_PAGE), "utf8");
  const program = ts.createProgram([ECS_INDEX_SOURCE], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });

  test("the Functions table lists every function ecs exports and nothing else", () => {
    const functions = exportedFunctions(program, ECS_INDEX_SOURCE);
    expect(functions.length).toBeGreaterThan(0);
    expect(tableRows(reference, "Functions")).toEqual([...functions].sort());
  });

  for (const name of ["World", "SystemFields"]) {
    test(`the ${name} table lists every member and nothing else`, () => {
      const members = exportedTypeMembers(program, ECS_INDEX_SOURCE, name);
      expect(members.length).toBeGreaterThan(0);
      expect(tableRows(reference, name)).toEqual([...members].sort());
    });
  }

  test("the Callbacks table lists every system callback SystemFields does not declare", () => {
    const fields = new Set(exportedTypeMembers(program, ECS_INDEX_SOURCE, "SystemFields"));
    const callbacks = new Set(
      CALLBACK_INTERFACES.flatMap((name) =>
        exportedTypeMembers(program, ECS_INDEX_SOURCE, name),
      ).filter((member) => !fields.has(member)),
    );
    expect(callbacks.size).toBeGreaterThan(0);
    expect(tableRows(reference, "Callbacks")).toEqual([...callbacks].sort());
  });

  test("each Functions row reads as its function's summary", () => {
    expect(
      cellsUnlikeSummaries(reference, "Functions", (name) =>
        jsdocSummary(program, ECS_INDEX_SOURCE, name),
      ),
    ).toEqual([]);
  });

  for (const name of ["World", "SystemFields"]) {
    test(`each ${name} row reads as its member's summary`, () => {
      expect(
        cellsUnlikeSummaries(reference, name, (member) =>
          jsdocSummary(program, ECS_INDEX_SOURCE, name, member),
        ),
      ).toEqual([]);
    });
  }

  test("each Callbacks row reads as its callback's summary", () => {
    const declaring = (member: string): string => {
      const owner = CALLBACK_INTERFACES.find((name) =>
        exportedTypeMembers(program, ECS_INDEX_SOURCE, name).includes(member),
      );
      expect(owner, `a callback interface declares ${member}`).toBeDefined();
      return owner as string;
    };
    expect(
      cellsUnlikeSummaries(reference, "Callbacks", (member) =>
        jsdocSummary(program, ECS_INDEX_SOURCE, declaring(member), member),
      ),
    ).toEqual([]);
  });
});

describe("ecs and hsm guide reference", () => {
  const reference = readFileSync(path.join(GUIDE_DIR, BRIDGE_PAGE), "utf8");
  const program = ts.createProgram([ECS_HSM_SOURCE], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });

  test("the Functions table lists every function the bridge exports and nothing else", () => {
    const functions = exportedFunctions(program, ECS_HSM_SOURCE);
    expect(functions.length).toBeGreaterThan(0);
    expect(tableRows(reference, "Functions")).toEqual([...functions].sort());
  });

  test("each Functions row reads as its function's summary", () => {
    expect(
      cellsUnlikeSummaries(reference, "Functions", (name) =>
        jsdocSummary(program, ECS_HSM_SOURCE, name),
      ),
    ).toEqual([]);
  });
});

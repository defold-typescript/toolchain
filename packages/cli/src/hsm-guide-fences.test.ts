/**
 * The State machines guide is the `hsm` manual and the state machines tutorial
 * teaches it, so every `ts` fence on either page must compile against the
 * declarations `@defold-typescript/types/hsm` ships, at the strictness `init`
 * scaffolds, and transpile through the build. A fence that has to show a
 * compile error does so with `// @ts-expect-error`, which this gate then proves.
 * A fence that cannot compile alone, a config key or a method shown by itself,
 * is a `ts excerpt` fence: it must quote the excerpt source, whose fences
 * compile under the same checks.
 * A `ts step` fence on the tutorial is a diff of a file the reader builds: the
 * files each lesson leaves must compile and transpile as one project, and the
 * last lesson's project must use every member and call every function the hsm
 * entry points ship, so a member `hsm` gains needs a lesson that uses it.
 * The manual's reference tables are held to the `StateConfig`, `Machine`,
 * `MachineInstance` and `WaitGroup` interfaces of the hsm source.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import * as ts from "typescript";
import {
  fenceTitle,
  isStepFence,
  type LessonProject,
  lessonProjects,
  tsFences,
} from "./hsm-guide-steps";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const GUIDE_DIR = path.join(REPO_ROOT, "packages", "docs", "guide");
const REFERENCE_PAGE = "state-machines.md";
const LESSON_PAGE = "state-machines-tutorial.md";
const FENCED_PAGES = [REFERENCE_PAGE, LESSON_PAGE];
const EXCERPT_SOURCE = path.join(REPO_ROOT, "packages/cli/test/fixtures/hsm-guide-excerpts.md");
const FENCED_FILES = [...FENCED_PAGES.map((page) => path.join(GUIDE_DIR, page)), EXCERPT_SOURCE];
const SCAFFOLD_TSCONFIG = path.join(import.meta.dir, "scaffold-tsconfig.json");
const HSM_INDEX_SOURCE = path.join(REPO_ROOT, "packages", "hsm", "src", "index.ts");

// The entries the platformer example's tsconfig maps, so the fences see the
// same `@defold-typescript/types` surface a project in this repo does.
const TYPE_PATHS: Record<string, string[]> = {
  "@defold-typescript/types": [path.join(REPO_ROOT, "packages/types/src/index.ts")],
  "@defold-typescript/types/script": [
    path.join(REPO_ROOT, "packages/types/generated/kinds/script.d.ts"),
  ],
  "@defold-typescript/types/timers": [path.join(REPO_ROOT, "packages/types/src/timers.d.ts")],
  "@defold-typescript/types/hsm": [path.join(REPO_ROOT, "packages/types/hsm/index.d.ts")],
  "@defold-typescript/types/hsm/async": [path.join(REPO_ROOT, "packages/types/hsm/async.d.ts")],
  "@defold-typescript/types/hsm/debug": [path.join(REPO_ROOT, "packages/types/hsm/debug.d.ts")],
  "@defold-typescript/types/hsm/defold": [path.join(REPO_ROOT, "packages/types/hsm/defold.d.ts")],
};

const ENV_DTS = 'import "@defold-typescript/types/script";\n';

// The library declarations a fence imports, as `resolve` writes them into a
// project's `.defold-types/`; each becomes a project file next to the fences.
const LIBRARY_DECLARATIONS = [
  path.join(REPO_ROOT, "packages/library-types/generated/monarch.monarch.d.ts"),
];

const SLOW = 120_000;

interface Fence {
  /** How a failure names the fence: its title, or its position on the page. */
  readonly label: string;
  /** Where the fence is written, relative to the project's `src/`. */
  readonly rel: string;
  readonly body: string;
}

// A fence title names a file relative to `src/`: a `src/` title claims to quote
// a docs/examples file (guide-source-parity.test.ts), and these fences quote none.
const FENCE_TITLE = /^(?!src\/)[\w-]+(?:\/[\w-]+)*\.ts$/;

// The info string's second token, as the docs site reads `original`: Shiki and
// the language badge take only the first, so the fence still renders as `ts`.
function isExcerptFence(info: string): boolean {
  return info.trim().split(/\s+/)[0] === "excerpt";
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The `ts excerpt` fences of `guide` that `source` does not hold, whitespace aside. */
function unquotedExcerpts(guide: string, source: string): string[] {
  return tsFences(guide)
    .filter((fence) => isExcerptFence(fence.info))
    .map((fence) => collapseWhitespace(fence.body))
    .filter((excerpt) => excerpt.length === 0 || !source.includes(excerpt));
}

function guideFences(guide: string): Fence[] {
  const fences: Fence[] = [];
  let index = 0;
  for (const { info, body } of tsFences(guide)) {
    if (isExcerptFence(info) || isStepFence(info)) continue;
    const title = fenceTitle(info);
    if (title === undefined) {
      fences.push({ label: `ts fence #${index}`, rel: `guide-fence-${index}.ts`, body });
    } else {
      expect(title, `ts fence #${index} title names a file under src/`).toMatch(FENCE_TITLE);
      fences.push({ label: title, rel: title, body });
    }
    index++;
  }
  return fences;
}

/** Every file of every lesson's project, each project under its own `lesson-<nn>/`. */
function lessonFences(page: string): Fence[] {
  return lessonProjects(page).flatMap((project, i) => {
    const dir = `lesson-${String(i + 1).padStart(2, "0")}`;
    return [...project.files].map(([title, body]): Fence => {
      expect(title, `step fence title under "${project.heading}"`).toMatch(FENCE_TITLE);
      return { label: `${project.heading} > ${title}`, rel: `${dir}/${title}`, body };
    });
  });
}

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

interface FenceProject {
  readonly src: string;
  /** Fence rel to its source text, as written. */
  readonly sources: ReadonlyMap<string, string>;
  /** Library declaration rel to its text. */
  readonly declarations: ReadonlyMap<string, string>;
}

function writeFenceProject(fences: readonly Fence[]): FenceProject {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-hsm-guide-"));
  tempRoots.push(cwd);
  const src = path.join(cwd, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, "env.d.ts"), ENV_DTS);
  const declarations = new Map<string, string>();
  for (const file of LIBRARY_DECLARATIONS) {
    const rel = path.basename(file);
    const text = readFileSync(file, "utf8");
    writeFileSync(path.join(src, rel), text);
    declarations.set(rel, text);
  }
  const sources = new Map<string, string>();
  for (const fence of fences) {
    const text = `${fence.body}\nexport {};\n`;
    const file = path.join(src, fence.rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    sources.set(fence.rel, text);
  }
  return { src, sources, declarations };
}

function compilerOptions(src: string): ts.CompilerOptions {
  const scaffold = JSON.parse(readFileSync(SCAFFOLD_TSCONFIG, "utf8"));
  const converted = ts.convertCompilerOptionsFromJson(scaffold, src);
  expect(converted.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual(
    [],
  );
  return { ...converted.options, noEmit: true, paths: TYPE_PATHS };
}

function describeDiagnostic(d: ts.Diagnostic): string {
  const text = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file === undefined || d.start === undefined) {
    return `TS${d.code}: ${text}`;
  }
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${line + 1}:${character + 1} TS${d.code}: ${text}`;
}

/** Diagnostics per project file (`src/`-relative), plus global ones under `""`. */
function typeCheck(project: FenceProject): Map<string, string[]> {
  const roots = [
    path.join(project.src, "env.d.ts"),
    ...[...project.declarations.keys()].map((rel) => path.join(project.src, rel)),
    ...[...project.sources.keys()].map((rel) => path.join(project.src, rel)),
  ];
  const program = ts.createProgram(roots, compilerOptions(project.src));
  const byFile = new Map<string, string[]>();
  for (const d of ts.getPreEmitDiagnostics(program)) {
    const key =
      d.file === undefined
        ? ""
        : path.relative(project.src, d.file.fileName).split(path.sep).join("/");
    byFile.set(key, [...(byFile.get(key) ?? []), describeDiagnostic(d)]);
  }
  return byFile;
}

/** The diagnostics of `project`, keyed by the label of the fence or declaration that has them. */
function failingFences(fences: readonly Fence[], project: FenceProject): Record<string, string[]> {
  const found = typeCheck(project);
  const failing: Record<string, string[]> = {};
  const labelled: [string, string][] = [
    ["", "(global)"],
    ...[...project.declarations.keys()].map((rel): [string, string] => [rel, rel]),
    ...fences.map((fence): [string, string] => [fence.rel, fence.label]),
  ];
  for (const [rel, label] of labelled) {
    const diagnostics = found.get(rel);
    if (diagnostics !== undefined) failing[label] = diagnostics;
  }
  return failing;
}

function transpileErrors(project: FenceProject): string[] {
  const files: Record<string, string> = {};
  for (const [rel, text] of project.declarations) files[rel] = text;
  for (const [rel, text] of project.sources) files[rel] = text;
  return transpileProject({ files })
    .diagnostics.filter((d) => d.category === undefined)
    .map((d) => `${d.file ?? "(project)"}:${d.line ?? 0}: ${d.message}`);
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

const HSM_ENTRY_POINTS = [
  "@defold-typescript/types/hsm",
  "@defold-typescript/types/hsm/async",
  "@defold-typescript/types/hsm/debug",
  "@defold-typescript/types/hsm/defold",
];

// The tutorial's events are its own union, so nothing names `type` through `EventObject`.
const UNTAUGHT_INTERFACES = new Set(["EventObject"]);

interface HsmCoverage {
  /** Each member the project never names, as `<declaring type>.<member>`. */
  readonly members: string[];
  /** Each exported function the project never calls. */
  readonly functions: string[];
}

/**
 * What `files`, one project, leaves unused of the surface the four hsm entry points ship: the
 * members of every exported interface and of `StateConfig`, and every exported function. A member
 * typed `never` only reports a renamed key, so it is no part of the surface. A function is used
 * where it is called: importing it, or naming it without a call, is no use.
 */
function unusedHsmSurface(files: ReadonlyMap<string, string>): HsmCoverage {
  const project = writeFenceProject(
    [...files].map(([title, body]): Fence => ({ label: title, rel: title, body })),
  );
  const declarationFiles = HSM_ENTRY_POINTS.map((entry) => (TYPE_PATHS[entry] as string[])[0]);
  const program = ts.createProgram(
    [
      path.join(project.src, "env.d.ts"),
      ...(declarationFiles as string[]),
      ...[...project.sources.keys()].map((rel) => path.join(project.src, rel)),
    ],
    compilerOptions(project.src),
  );
  const checker = program.getTypeChecker();

  const members = new Map<ts.Declaration, string>();
  const functions = new Map<ts.Declaration, string>();
  const listMembers = (type: ts.Type): void => {
    for (const member of checker.getPropertiesOfType(type)) {
      for (const declaration of member.declarations ?? []) {
        if (!ts.isPropertySignature(declaration) && !ts.isMethodSignature(declaration)) continue;
        if (declaration.type?.kind === ts.SyntaxKind.NeverKeyword) continue;
        const owner = declaration.parent;
        if (ts.isInterfaceDeclaration(owner)) {
          members.set(declaration, `${owner.name.text}.${member.name}`);
        }
      }
    }
  };
  for (const file of declarationFiles as string[]) {
    const source = program.getSourceFile(file);
    const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    if (moduleSymbol === undefined) {
      throw new Error(`${file} is not a module of the program`);
    }
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      for (const declaration of exported.declarations ?? []) {
        if (ts.isFunctionDeclaration(declaration)) {
          functions.set(declaration, exported.name);
        } else if (ts.isInterfaceDeclaration(declaration)) {
          if (!UNTAUGHT_INTERFACES.has(exported.name)) {
            listMembers(checker.getDeclaredTypeOfSymbol(exported));
          }
        } else if (ts.isTypeAliasDeclaration(declaration) && exported.name === "StateConfig") {
          const declared = checker.getDeclaredTypeOfSymbol(exported);
          for (const variant of declared.isUnion() ? declared.types : [declared]) {
            listMembers(variant);
          }
        }
      }
    }
  }

  const used = new Set<ts.Declaration>();
  const called = new Set<ts.Declaration>();
  const use = (symbol: ts.Symbol | undefined): void => {
    if (symbol === undefined) return;
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    for (const declaration of target.declarations ?? []) used.add(declaration);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      use(checker.getSymbolAtLocation(node));
    } else if (ts.isCallExpression(node)) {
      const declaration = checker.getResolvedSignature(node)?.declaration;
      if (declaration !== undefined) called.add(declaration);
    } else if (ts.isObjectLiteralExpression(node)) {
      const contextual = checker.getContextualType(node);
      // A key one variant of a union lacks is no property of the union, so each variant is asked.
      const variants =
        contextual === undefined ? [] : contextual.isUnion() ? contextual.types : [contextual];
      for (const property of node.properties) {
        const name = property.name;
        if (name === undefined || !(ts.isIdentifier(name) || ts.isStringLiteral(name))) continue;
        for (const variant of variants) use(checker.getPropertyOfType(variant, name.text));
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const rel of project.sources.keys()) {
    const source = program.getSourceFile(path.join(project.src, rel));
    if (source === undefined) throw new Error(`${rel} is not a file of the program`);
    visit(source);
  }

  const unused = (
    listed: ReadonlyMap<ts.Declaration, string>,
    covered: ReadonlySet<ts.Declaration>,
  ): string[] =>
    [...listed]
      .filter(([declaration]) => !covered.has(declaration))
      .map(([, label]) => label)
      .sort();
  return { members: unused(members, used), functions: unused(functions, called) };
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
});

/**
 * Member names of a type the hsm `index.ts` exports. A union lists the members of every
 * variant, so `StateConfig` covers the compound and the parallel state.
 */
function exportedTypeMembers(program: ts.Program, name: string): string[] {
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(HSM_INDEX_SOURCE);
  const moduleSymbol = file === undefined ? undefined : checker.getSymbolAtLocation(file);
  const symbol =
    moduleSymbol === undefined
      ? undefined
      : checker.getExportsOfModule(moduleSymbol).find((entry) => entry.name === name);
  if (symbol === undefined) {
    throw new Error(`packages/hsm/src/index.ts exports no type ${name}`);
  }
  const declared = checker.getDeclaredTypeOfSymbol(symbol);
  const variants = declared.isUnion() ? declared.types : [declared];
  const names = new Set<string>();
  for (const variant of variants) {
    for (const member of checker.getPropertiesOfType(variant)) {
      names.add(member.name);
    }
  }
  return [...names];
}

/** The first-cell inline-code names of the table rows under `### <heading>` inside `## Reference`. */
function referenceRows(page: string, heading: string): string[] {
  const reference = page.split(/^## /m).find((section) => section.startsWith("Reference\n"));
  expect(reference, "the page has a ## Reference section").toBeDefined();
  const sub = (reference as string)
    .split(/^### /m)
    .find((section) => section.split("\n")[0]?.includes(heading));
  expect(sub, `## Reference has a ### ${heading} table`).toBeDefined();
  const names: string[] = [];
  for (const line of (sub as string).split("\n")) {
    const cell = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (cell) names.push(cell[1] as string);
  }
  return names;
}

const reference = readFileSync(path.join(GUIDE_DIR, REFERENCE_PAGE), "utf8");

describe("state machines guide reference", () => {
  const program = ts.createProgram([HSM_INDEX_SOURCE], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });
  for (const name of ["StateConfig", "Machine", "MachineInstance", "WaitGroup"]) {
    test(`the ${name} table lists every member and nothing else`, () => {
      const members = exportedTypeMembers(program, name);
      expect(members.length).toBeGreaterThan(0);
      expect(referenceRows(reference, name).sort()).toEqual([...members].sort());
    });
  }
});

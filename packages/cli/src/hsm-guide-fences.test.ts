/**
 * The State machines guide is the `hsm` manual, so every `ts` fence on it must
 * compile against the source `vendor hsm` writes into a project, at the
 * strictness `init` scaffolds. A fence that has to show a compile error does so
 * with `// @ts-expect-error`, which this gate then proves. Its reference tables
 * are held to the `StateConfig` and `MachineInstance` interfaces of that same
 * vendored source.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import * as ts from "typescript";
import { HSM_VENDOR_DIR, resolveHsmSourceDir, runVendorHsm } from "./vendor-hsm";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const GUIDE_PATH = path.join(REPO_ROOT, "packages", "docs", "guide", "state-machines.md");
const SCAFFOLD_TSCONFIG = path.join(import.meta.dir, "scaffold-tsconfig.json");

// The entries the platformer example's tsconfig maps, so the fences see the
// same `@defold-typescript/types` surface a project in this repo does.
const TYPE_PATHS: Record<string, string[]> = {
  "@defold-typescript/types": [path.join(REPO_ROOT, "packages/types/src/index.ts")],
  "@defold-typescript/types/script": [
    path.join(REPO_ROOT, "packages/types/generated/kinds/script.d.ts"),
  ],
  "@defold-typescript/types/timers": [path.join(REPO_ROOT, "packages/types/src/timers.d.ts")],
};

const ENV_DTS = 'import "@defold-typescript/types/script";\n';

const SLOW = 120_000;

interface Fence {
  /** How a failure names the fence: its title, or its position on the page. */
  readonly label: string;
  /** Where the fence is written, relative to the project's `src/`. */
  readonly rel: string;
  readonly body: string;
}

// The same `title="..."` info-string shape the docs site renders as a file name.
function fenceTitle(info: string): string | undefined {
  const match = info.match(/\btitle=(?:"([^"]*)"|'([^']*)')/);
  const title = match?.[1] ?? match?.[2] ?? "";
  return title.length > 0 ? title : undefined;
}

function guideFences(guide: string): Fence[] {
  const fences: Fence[] = [];
  let index = 0;
  for (const m of guide.matchAll(/^```ts(?=[\s{]|$)([^\n]*)\n([\s\S]*?)^```/gm)) {
    const title = fenceTitle(m[1] as string);
    const body = m[2] as string;
    if (title === undefined) {
      fences.push({ label: `ts fence #${index}`, rel: `guide-fence-${index}.ts`, body });
    } else {
      // Relative to `src/`: a `src/` title claims to quote a docs/examples file
      // (guide-source-parity.test.ts), and these fences quote none.
      expect(title, `ts fence #${index} title names a file under src/`).toMatch(
        /^(?!src\/)[\w-]+(?:\/[\w-]+)*\.ts$/,
      );
      fences.push({ label: title, rel: title, body });
    }
    index++;
  }
  return fences;
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
  /** Vendored rel (`vendor/hsm/<name>.ts`) to its source text. */
  readonly vendored: ReadonlyMap<string, string>;
}

function writeFenceProject(fences: readonly Fence[]): FenceProject {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-hsm-guide-"));
  tempRoots.push(cwd);
  runVendorHsm({ cwd, sourceDir: resolveHsmSourceDir(), version: "test" });
  const src = path.join(cwd, "src");
  writeFileSync(path.join(src, "env.d.ts"), ENV_DTS);
  const sources = new Map<string, string>();
  for (const fence of fences) {
    const text = `${fence.body}\nexport {};\n`;
    const file = path.join(src, fence.rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    sources.set(fence.rel, text);
  }
  const vendorDir = path.join(cwd, HSM_VENDOR_DIR);
  const vendored = new Map<string, string>();
  for (const name of readdirSync(vendorDir).filter((n) => n.endsWith(".ts"))) {
    vendored.set(`vendor/hsm/${name}`, readFileSync(path.join(vendorDir, name), "utf8"));
  }
  return { src, sources, vendored };
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
    ...[...project.vendored.keys(), ...project.sources.keys()].map((rel) =>
      path.join(project.src, rel),
    ),
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

const guide = readFileSync(GUIDE_PATH, "utf8");

let pageProject: FenceProject | undefined;
function pageFenceProject(): FenceProject {
  pageProject ??= writeFenceProject(guideFences(guide));
  return pageProject;
}

describe("state machines guide fences", () => {
  test("the page has ts fences and no two share a title", () => {
    const fences = guideFences(guide);
    expect(fences.length).toBeGreaterThan(0);
    const titled = fences.map((f) => f.rel).filter((rel) => !rel.startsWith("guide-fence-"));
    const repeated = titled.filter((rel, i) => titled.indexOf(rel) !== i);
    expect(repeated, "fence titles used twice").toEqual([]);
  });

  test(
    "every ts fence type-checks against the vendored hsm at the scaffold strictness",
    () => {
      const found = typeCheck(pageFenceProject());
      const failing: Record<string, string[]> = {};
      const labelled: [string, string][] = [
        ["", "(global)"],
        ...[...pageFenceProject().vendored.keys()].map((rel): [string, string] => [rel, rel]),
        ...guideFences(guide).map((fence): [string, string] => [fence.rel, fence.label]),
      ];
      for (const [rel, label] of labelled) {
        const diagnostics = found.get(rel);
        if (diagnostics !== undefined) failing[label] = diagnostics;
      }
      expect(failing).toEqual({});
    },
    SLOW,
  );

  test(
    "every ts fence transpiles to Lua",
    () => {
      const project = pageFenceProject();
      const files: Record<string, string> = {};
      for (const [rel, text] of project.vendored) files[rel] = text;
      for (const [rel, text] of project.sources) files[rel] = text;
      const errors = transpileProject({ files })
        .diagnostics.filter((d) => d.category === undefined)
        .map((d) => `${d.file ?? "(project)"}:${d.line ?? 0}: ${d.message}`);
      expect(errors).toEqual([]);
    },
    SLOW,
  );

  test(
    "the gate can fail: a machine targeting an unknown state does not compile",
    () => {
      const probe: Fence = {
        label: "probe",
        rel: "probe.ts",
        body: [
          'import { defineMachine } from "./vendor/hsm/index";',
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

/** Member names of an interface the vendored `index.ts` declares. */
function interfaceMembers(source: string, name: string): string[] {
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.ES2022);
  for (const statement of file.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) {
      return statement.members.map((member) => {
        expect(member.name, `${name} member name`).toBeDefined();
        return (member.name as ts.PropertyName).getText(file);
      });
    }
  }
  throw new Error(`vendored index.ts declares no interface ${name}`);
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

describe("state machines guide reference", () => {
  for (const name of ["StateConfig", "MachineInstance"]) {
    test(`the ${name} table lists every member and nothing else`, () => {
      const indexSource = pageFenceProject().vendored.get("vendor/hsm/index.ts");
      expect(indexSource, "vendor hsm writes index.ts").toBeDefined();
      const members = interfaceMembers(indexSource as string, name);
      expect(members.length).toBeGreaterThan(0);
      expect(referenceRows(guide, name).sort()).toEqual([...members].sort());
    });
  }
});

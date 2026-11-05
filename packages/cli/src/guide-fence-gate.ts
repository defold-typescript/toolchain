/**
 * The checks a library guide's fence gate runs on its pages: every `ts` fence is written into a
 * temp project next to the library declarations, type-checked at the strictness `init` scaffolds
 * against the declarations `@defold-typescript/types` ships, and transpiled through the build. A
 * `ts excerpt` fence must quote an excerpt source whose own fences pass the same checks. A page's
 * `## Reference` tables are read back as the first-cell names of their rows, for a gate to hold
 * them to the exports of the library source.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type TranspileProjectResult, transpileProject } from "@defold-typescript/transpiler";
import * as ts from "typescript";
import { fenceTitle, isStepFence, tsFences } from "./hsm-guide-steps";

export const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
export const GUIDE_DIR = path.join(REPO_ROOT, "packages", "docs", "guide");
const SCAFFOLD_TSCONFIG = path.join(import.meta.dir, "scaffold-tsconfig.json");

// The entries the platformer example's tsconfig maps, so the fences see the
// same `@defold-typescript/types` surface a project in this repo does.
export const GUIDE_TYPE_PATHS: Record<string, string[]> = {
  "@defold-typescript/types": [path.join(REPO_ROOT, "packages/types/src/index.ts")],
  "@defold-typescript/types/script": [
    path.join(REPO_ROOT, "packages/types/generated/kinds/script.d.ts"),
  ],
  "@defold-typescript/types/timers": [path.join(REPO_ROOT, "packages/types/src/timers.d.ts")],
  "@defold-typescript/types/hsm": [path.join(REPO_ROOT, "packages/types/hsm/index.d.ts")],
  "@defold-typescript/types/hsm/async": [path.join(REPO_ROOT, "packages/types/hsm/async.d.ts")],
  "@defold-typescript/types/hsm/debug": [path.join(REPO_ROOT, "packages/types/hsm/debug.d.ts")],
  "@defold-typescript/types/hsm/defold": [path.join(REPO_ROOT, "packages/types/hsm/defold.d.ts")],
  "@defold-typescript/types/ecs": [path.join(REPO_ROOT, "packages/types/ecs/index.d.ts")],
  "@defold-typescript/types/ecs/hsm": [path.join(REPO_ROOT, "packages/types/ecs/hsm.d.ts")],
};

const ENV_DTS = 'import "@defold-typescript/types/script";\n';

export interface Fence {
  /** How a failure names the fence: its title, or its position on the page. */
  readonly label: string;
  /** Where the fence is written, relative to the project's `src/`. */
  readonly rel: string;
  readonly body: string;
}

// A fence title names a file relative to `src/`: a `src/` title claims to quote
// a docs/examples file (guide-source-parity.test.ts), and these fences quote none.
export const FENCE_TITLE = /^(?!src\/)[\w-]+(?:\/[\w-]+)*\.ts$/;

// The info string's second token, as the docs site reads `original`: Shiki and
// the language badge take only the first, so the fence still renders as `ts`.
export function isExcerptFence(info: string): boolean {
  return info.trim().split(/\s+/)[0] === "excerpt";
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The `ts excerpt` fences of `guide` that `source` does not hold, whitespace aside. */
export function unquotedExcerpts(guide: string, source: string): string[] {
  return tsFences(guide)
    .filter((fence) => isExcerptFence(fence.info))
    .map((fence) => collapseWhitespace(fence.body))
    .filter((excerpt) => excerpt.length === 0 || !source.includes(excerpt));
}

/** The compiled `ts` fences of `guide`: every one but the excerpt and step fences. */
export function guideFences(guide: string): Fence[] {
  const fences: Fence[] = [];
  let index = 0;
  for (const { info, body } of tsFences(guide)) {
    if (isExcerptFence(info) || isStepFence(info)) continue;
    const title = fenceTitle(info);
    if (title === undefined) {
      fences.push({ label: `ts fence #${index}`, rel: `guide-fence-${index}.ts`, body });
    } else {
      fences.push({ label: title, rel: title, body });
    }
    index++;
  }
  return fences;
}

/** The titles of the compiled `ts` fences of `guide` that name no file under `src/`. */
export function badFenceTitles(guide: string): string[] {
  return guideFences(guide)
    .filter((fence) => !fence.rel.startsWith("guide-fence-") && !FENCE_TITLE.test(fence.rel))
    .map((fence) => fence.label);
}

export interface FenceProject {
  /** The temp directory holding the project, for the caller to remove. */
  readonly root: string;
  readonly src: string;
  /** Fence rel to its source text, as written. */
  readonly sources: ReadonlyMap<string, string>;
  /** Library declaration rel to its text. */
  readonly declarations: ReadonlyMap<string, string>;
}

export interface FenceProjectOptions {
  /** The library modules a fence imports, each written from `corpus` as `<module>.d.ts`. */
  readonly libraryModules?: readonly string[];
  /** Library declarations by module id, printed as `resolve` writes them into `.defold-types/`. */
  readonly corpus?: ReadonlyMap<string, string>;
  /** The temp directory's name prefix. */
  readonly tmpPrefix: string;
}

export function writeFenceProject(
  fences: readonly Fence[],
  options: FenceProjectOptions,
): FenceProject {
  const root = mkdtempSync(path.join(os.tmpdir(), options.tmpPrefix));
  const src = path.join(root, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, "env.d.ts"), ENV_DTS);
  const declarations = new Map<string, string>();
  for (const moduleId of options.libraryModules ?? []) {
    const rel = `${moduleId}.d.ts`;
    const text = options.corpus?.get(moduleId);
    if (text === undefined) throw new Error(`library data prints no module ${moduleId}`);
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
  return { root, src, sources, declarations };
}

export function compilerOptions(src: string): ts.CompilerOptions {
  const scaffold = JSON.parse(readFileSync(SCAFFOLD_TSCONFIG, "utf8"));
  const converted = ts.convertCompilerOptionsFromJson(scaffold, src);
  if (converted.errors.length > 0) {
    const messages = converted.errors.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    );
    throw new Error(`the scaffold tsconfig does not convert: ${messages.join("; ")}`);
  }
  return { ...converted.options, noEmit: true, paths: GUIDE_TYPE_PATHS };
}

export function describeDiagnostic(d: ts.Diagnostic): string {
  const text = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file === undefined || d.start === undefined) {
    return `TS${d.code}: ${text}`;
  }
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${line + 1}:${character + 1} TS${d.code}: ${text}`;
}

/** Diagnostics per project file (`src/`-relative), plus global ones under `""`. */
export function typeCheck(project: FenceProject): Map<string, string[]> {
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
export function failingFences(
  fences: readonly Fence[],
  project: FenceProject,
): Record<string, string[]> {
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

/** The build of `project`'s declarations and fences, as `build` compiles a project. */
export function transpileFenceProject(project: FenceProject): TranspileProjectResult {
  const files: Record<string, string> = {};
  for (const [rel, text] of project.declarations) files[rel] = text;
  for (const [rel, text] of project.sources) files[rel] = text;
  return transpileProject({ files });
}

export function transpileErrors(project: FenceProject): string[] {
  return transpileFenceProject(project)
    .diagnostics.filter((d) => d.category === undefined)
    .map((d) => `${d.file ?? "(project)"}:${d.line ?? 0}: ${d.message}`);
}

export function moduleExports(program: ts.Program, sourcePath: string): ts.Symbol[] {
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(sourcePath);
  const moduleSymbol = file === undefined ? undefined : checker.getSymbolAtLocation(file);
  if (moduleSymbol === undefined) {
    throw new Error(`${path.relative(REPO_ROOT, sourcePath)} is not a module of the program`);
  }
  return checker.getExportsOfModule(moduleSymbol);
}

/**
 * Member names of a type the module at `sourcePath` exports. A union lists the members of every
 * variant, so `StateConfig` covers the compound and the parallel state.
 */
export function exportedTypeMembers(
  program: ts.Program,
  sourcePath: string,
  name: string,
): string[] {
  const checker = program.getTypeChecker();
  const symbol = moduleExports(program, sourcePath).find((entry) => entry.name === name);
  if (symbol === undefined) {
    throw new Error(`${path.relative(REPO_ROOT, sourcePath)} exports no type ${name}`);
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

/** The functions the module at `sourcePath` exports, each named once whatever its overloads. */
export function exportedFunctions(program: ts.Program, sourcePath: string): string[] {
  return moduleExports(program, sourcePath)
    .filter((symbol) => (symbol.declarations ?? []).some(ts.isFunctionDeclaration))
    .map((symbol) => symbol.name);
}

function referenceSection(page: string, heading: string): string | undefined {
  const reference = page.split(/^## /m).find((section) => section.startsWith("Reference\n"));
  if (reference === undefined) return undefined;
  return reference.split(/^### /m).find((section) => section.split("\n")[0]?.includes(heading));
}

/**
 * The first-cell inline-code names of the table rows under `### <heading>` inside `## Reference`,
 * or `undefined` when the page has no such section or table.
 */
export function referenceRows(page: string, heading: string): string[] | undefined {
  const sub = referenceSection(page, heading);
  if (sub === undefined) return undefined;
  const names: string[] = [];
  for (const line of sub.split("\n")) {
    const cell = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (cell) names.push(cell[1] as string);
  }
  return names;
}

/**
 * The rows under `### <heading>` inside `## Reference`, each first-cell inline-code name mapped to
 * the row's last cell, its description, or `undefined` when the page has no such section. A `\|`
 * inside a cell, as a union type spells it, does not end the cell.
 */
export function referenceDescriptions(
  page: string,
  heading: string,
): Map<string, string> | undefined {
  const sub = referenceSection(page, heading);
  if (sub === undefined) return undefined;
  const descriptions = new Map<string, string>();
  for (const line of sub.split("\n")) {
    const cells = line.split(/(?<!\\)\|/).slice(1, -1);
    const name = cells[0]?.match(/^\s*`([^`]+)`\s*$/);
    if (name && cells.length >= 2) {
      descriptions.set(name[1] as string, (cells[cells.length - 1] as string).trim());
    }
  }
  return descriptions;
}

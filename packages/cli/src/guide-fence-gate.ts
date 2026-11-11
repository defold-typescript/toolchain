/**
 * The checks a library guide's fence gate runs on its pages: every `ts` fence is written into a
 * temp project next to the library declarations, type-checked at the strictness `init` scaffolds
 * against the declarations `@defold-typescript/types` ships, and transpiled through the build. A
 * `ts excerpt` or `ts builder` fence must quote an excerpt source whose own fences pass the same
 * checks. A page's `## Reference` tables are read back as the first-cell names of their rows, for
 * a gate to hold them to the exports of the library source. A tutorial's `ts step` fences build
 * one project per lesson, and the last one is held to the surface the library's entry points ship.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { type TranspileProjectResult, transpileProject } from "@defold-typescript/transpiler";
import * as ts from "typescript";
import { fenceTitle, isStepFence, lessonProjects, tsFences } from "./guide-steps";

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
  "@defold-typescript/types/hsm/builder": [path.join(REPO_ROOT, "packages/types/hsm/builder.d.ts")],
  "@defold-typescript/types/hsm/debug": [path.join(REPO_ROOT, "packages/types/hsm/debug.d.ts")],
  "@defold-typescript/types/hsm/defold": [path.join(REPO_ROOT, "packages/types/hsm/defold.d.ts")],
  "@defold-typescript/types/ecs": [path.join(REPO_ROOT, "packages/types/ecs/index.d.ts")],
  "@defold-typescript/types/ecs/debug": [path.join(REPO_ROOT, "packages/types/ecs/debug.d.ts")],
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
// A `.test.ts` title names a Bun test file instead, relative to the project root.
export const FENCE_TITLE = /^(?!src\/)[\w-]+(?:\/[\w-]+)*(?:\.test)?\.ts$/;

/**
 * Whether the fence written at `rel` is a Bun test file. It type-checks with `bun:test` in scope
 * and is never compiled to Lua: `build` would compile it only from under `src/`, where a test
 * does not belong.
 */
export function isBunTestFence(rel: string): boolean {
  return rel.endsWith(".test.ts");
}

// `bun:test` is an ambient module of `bun-types`, which `@types/bun` depends on. Only that one
// file joins a fence program: the rest of `bun-types` declares Node globals no game has.
function bunTestDeclarations(): string {
  const typesBun = createRequire(path.join(REPO_ROOT, "package.json")).resolve(
    "@types/bun/package.json",
  );
  return createRequire(realpathSync(typesBun)).resolve("bun-types/test.d.ts");
}

// The info string's second token, as the docs site reads `original`: Shiki and
// the language badge take only the first, so the fence still renders as `ts`.
// A `builder` fence is the Builder tab of the config fence before it, quoted
// from the excerpt source as a `ts excerpt` fence is.
const EXCERPT_MARKERS: ReadonlySet<string> = new Set(["excerpt", "builder"]);

export function isExcerptFence(info: string): boolean {
  return EXCERPT_MARKERS.has(info.trim().split(/\s+/)[0] ?? "");
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The `ts excerpt` and `ts builder` fences of `guide` that `source` does not hold, whitespace aside. */
export function unquotedExcerpts(guide: string, source: string): string[] {
  return tsFences(guide)
    .filter((fence) => isExcerptFence(fence.info))
    .map((fence) => collapseWhitespace(fence.body))
    .filter((excerpt) => excerpt.length === 0 || !source.includes(excerpt));
}

/** The compiled `ts` fences of `guide`: every one but the excerpt, builder and step fences. */
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

const BUILDER_PREFIX = "builder/";

/** A `builder/<name>.ts` fence of an excerpt source and the `<name>.ts` config fence it spells. */
export interface BuilderTwin {
  readonly builder: Fence;
  readonly config: Fence | undefined;
}

/** Every `builder/` fence of the excerpt source `source`, with its config fence when it has one. */
export function builderTwins(source: string): BuilderTwin[] {
  const fences = guideFences(source);
  return fences
    .filter((fence) => fence.rel.startsWith(BUILDER_PREFIX))
    .map((builder) => {
      const rel = builder.rel.slice(BUILDER_PREFIX.length);
      return { builder, config: fences.find((fence) => fence.rel === rel) };
    });
}

/** The two panes of a rendered Config/Builder tab group, as text. */
export interface TabPanes {
  readonly config: string;
  readonly builder: string;
}

/**
 * The tab groups among `groups` that no one twin quotes on both sides, whitespace aside: the
 * config fence must hold the Config pane and its builder fence the Builder pane. An empty pane is
 * never quoted.
 */
export function unboundTabPanes(
  groups: readonly TabPanes[],
  twins: readonly BuilderTwin[],
): string[] {
  const pairs = twins.flatMap(({ builder, config }) =>
    config === undefined
      ? []
      : [{ config: collapseWhitespace(config.body), builder: collapseWhitespace(builder.body) }],
  );
  const quotes = (body: string, pane: string): boolean => pane.length > 0 && body.includes(pane);
  return groups.flatMap((group) => {
    const config = collapseWhitespace(group.config);
    const builder = collapseWhitespace(group.builder);
    const bound = pairs.some(
      (pair) => quotes(pair.config, config) && quotes(pair.builder, builder),
    );
    return bound
      ? []
      : [
          `config ${JSON.stringify(config)} with builder ${JSON.stringify(builder)}: no builder twin quotes both`,
        ];
  });
}

/** The titles of the compiled `ts` fences of `guide` that name no file under `src/`. */
export function badFenceTitles(guide: string): string[] {
  return guideFences(guide)
    .filter((fence) => !fence.rel.startsWith("guide-fence-") && !FENCE_TITLE.test(fence.rel))
    .map((fence) => fence.label);
}

/** The directory `lessonFences` writes the project of the lesson at 0-based `index` under. */
export function lessonDir(index: number): string {
  return `lesson-${String(index + 1).padStart(2, "0")}`;
}

/** Every file of every lesson's project, each project under its own `lesson-<nn>/`. */
export function lessonFences(page: string): Fence[] {
  return lessonProjects(page).flatMap((project, i) => {
    const dir = lessonDir(i);
    return [...project.files].map(([title, body]): Fence => {
      if (!FENCE_TITLE.test(title)) {
        throw new Error(`step fence title "${title}" under "${project.heading}" names no file`);
      }
      return { label: `${project.heading} > ${title}`, rel: `${dir}/${title}`, body };
    });
  });
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
    const file = path.join(src, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
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
  const sourceRels = [...project.sources.keys()];
  const roots = [
    path.join(project.src, "env.d.ts"),
    ...(sourceRels.some(isBunTestFence) ? [bunTestDeclarations()] : []),
    ...[...project.declarations.keys()].map((rel) => path.join(project.src, rel)),
    ...sourceRels.map((rel) => path.join(project.src, rel)),
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
  for (const [rel, text] of project.sources) {
    if (!isBunTestFence(rel)) files[rel] = text;
  }
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

/** The entry points a tutorial teaches, and how their exports count toward its surface. */
export interface TaughtSurface {
  /** Keys of `GUIDE_TYPE_PATHS`, each a declaration file whose exports make up the surface. */
  readonly entryPoints: readonly string[];
  /** Exported interfaces whose members no lesson needs to name. */
  readonly untaughtInterfaces?: ReadonlySet<string>;
  /** Exported type aliases whose union variants' interface members count, as an interface's do. */
  readonly memberAliases?: ReadonlySet<string>;
}

export interface SurfaceCoverage {
  /** Each member the project never names, as `<declaring type>.<member>`. */
  readonly members: string[];
  /** Each exported function the project never calls, once whatever its overloads. */
  readonly functions: string[];
}

/**
 * What `project` leaves unused of the surface `surface`'s entry points ship: the members of every
 * exported interface and of each `memberAliases` type, and every exported function. A member
 * typed `never` only reports a renamed key, so it is no part of the surface. A function is used
 * where it is called, and a call of any of its overloads uses it: importing it, or naming it
 * without a call, is no use.
 */
export function unusedSurface(project: FenceProject, surface: TaughtSurface): SurfaceCoverage {
  const declarationFiles = surface.entryPoints.map((entry) => {
    const file = GUIDE_TYPE_PATHS[entry]?.[0];
    if (file === undefined) throw new Error(`${entry} is no entry of GUIDE_TYPE_PATHS`);
    return file;
  });
  const program = ts.createProgram(
    [
      path.join(project.src, "env.d.ts"),
      ...declarationFiles,
      ...[...project.sources.keys()].map((rel) => path.join(project.src, rel)),
    ],
    compilerOptions(project.src),
  );
  const checker = program.getTypeChecker();

  const members = new Map<ts.Declaration, string>();
  const functions = new Map<ts.Symbol, string>();
  const overloads = new Map<ts.Declaration, ts.Symbol>();
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
  for (const file of declarationFiles) {
    const source = program.getSourceFile(file);
    const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    if (moduleSymbol === undefined) {
      throw new Error(`${file} is not a module of the program`);
    }
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      for (const declaration of exported.declarations ?? []) {
        if (ts.isFunctionDeclaration(declaration)) {
          functions.set(exported, exported.name);
          overloads.set(declaration, exported);
        } else if (ts.isInterfaceDeclaration(declaration)) {
          if (!surface.untaughtInterfaces?.has(exported.name)) {
            listMembers(checker.getDeclaredTypeOfSymbol(exported));
          }
        } else if (
          ts.isTypeAliasDeclaration(declaration) &&
          surface.memberAliases?.has(exported.name)
        ) {
          const declared = checker.getDeclaredTypeOfSymbol(exported);
          for (const variant of declared.isUnion() ? declared.types : [declared]) {
            listMembers(variant);
          }
        }
      }
    }
  }

  const used = new Set<ts.Declaration>();
  const called = new Set<ts.Symbol>();
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
      const callee = declaration === undefined ? undefined : overloads.get(declaration);
      if (callee !== undefined) called.add(callee);
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

  const unused = <K>(listed: ReadonlyMap<K, string>, covered: ReadonlySet<K>): string[] =>
    [...listed]
      .filter(([key]) => !covered.has(key))
      .map(([, label]) => label)
      .sort();
  return { members: unused(members, used), functions: unused(functions, called) };
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

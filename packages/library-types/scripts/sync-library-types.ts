import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { extractApiDoc } from "./extract-api-doc";

/**
 * ts-defold/library core-type references -> the @defold-typescript/types surface.
 * Dotted `vmath.*` names collapse to a single core-type name; bare handle tokens
 * become `Opaque<…>` brands, resolving against the globals in
 * `@defold-typescript/types` `engine-globals.d.ts`. `table` is intentionally
 * absent: ts-defold modules declare their own local `type table = {}` alias, so
 * renaming it would rewrite an unrelated local type.
 */
export const CORE_TYPE_RENAMES: Readonly<Record<string, string>> = {
  "vmath.vector": "Vector",
  "vmath.vector3": "Vector3",
  "vmath.vector4": "Vector4",
  "vmath.matrix4": "Matrix4",
  "vmath.quat": "Quaternion",
  "vmath.quaternion": "Quaternion",
  hash: "Hash",
  url: "Url",
  node: 'Opaque<"node">',
  texture: 'Opaque<"texture">',
  render_target: 'Opaque<"render_target">',
  constant: 'Opaque<"constant">',
  constant_buffer: 'Opaque<"constant_buffer">',
  buffer: 'Opaque<"buffer">',
  bufferstream: 'Opaque<"bufferstream">',
  resource: 'Opaque<"resource">',
  userdata: 'Opaque<"userdata">',
  b2World: 'Opaque<"b2World">',
  b2Body: 'Opaque<"b2Body">',
};

export interface CodemodResult {
  output: string;
  unmapped: string[];
}

function entityNameText(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : `${entityNameText(name.left)}.${name.right.text}`;
}

/**
 * Rename every Defold core-type reference in an ambient `.d.ts` to the
 * @defold-typescript/types surface. Matches type references only — property
 * names, JSDoc, `declare module`, and passthrough extensions (`LuaMultiReturn`,
 * `LuaMap`) stay byte-identical because `forEachChild` never descends into
 * identifiers-as-names or comments. Any `vmath.*` reference with no mapping is
 * collected into `unmapped` and left verbatim so a missing rename surfaces as a
 * red typecheck rather than a silent `any`.
 */
export function codemodDeclaration(source: string): CodemodResult {
  const sf = ts.createSourceFile(
    "module.d.ts",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const edits: { start: number; end: number; text: string }[] = [];
  const unmapped = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) {
      const name = entityNameText(node.typeName);
      const rename = CORE_TYPE_RENAMES[name];
      if (rename !== undefined) {
        edits.push({
          start: node.typeName.getStart(sf),
          end: node.typeName.getEnd(),
          text: rename,
        });
      } else if (name.startsWith("vmath.")) {
        unmapped.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { output, unmapped: [...unmapped] };
}

export interface LibrarySource {
  repo: string;
  commit: string;
  license: string;
}

export interface LibraryTarget {
  module: string;
  path: string;
  fixture: string;
  generated: string;
}

export interface LibraryTargets {
  source: LibrarySource;
  targets: LibraryTarget[];
}

function readTargets(packageRoot: string): LibraryTargets {
  return JSON.parse(
    readFileSync(join(packageRoot, "library-targets.json"), "utf8"),
  ) as LibraryTargets;
}

/**
 * Read every pinned fixture, codemod it, and write the renamed `declare module`
 * to its `generated/` path. Throws on the first unmapped reference so a stale
 * rename table never ships a silently-broken type.
 */
export function regenerate(packageRoot: string): void {
  const targets = readTargets(packageRoot);
  for (const target of targets.targets) {
    const source = readFileSync(join(packageRoot, target.fixture), "utf8");
    const { output, unmapped } = codemodDeclaration(source);
    if (unmapped.length > 0) {
      throw new Error(
        `${target.module}: unmapped core-type references ${unmapped.join(", ")} — extend CORE_TYPE_RENAMES.`,
      );
    }
    writeFileSync(join(packageRoot, target.generated), output);
  }
  writeApiDocs(packageRoot);
}

/** The pretty-printed ref-doc JSON a generated module extracts to. */
function apiDocJson(packageRoot: string, target: LibraryTarget): string {
  const generated = readFileSync(join(packageRoot, target.generated), "utf8");
  return `${JSON.stringify(extractApiDoc(generated, target.module), null, 2)}\n`;
}

/**
 * Extract every generated `declare module` into a committed
 * `api-doc/<module>.json` ref-doc fixture the docs-site loads via
 * `parseDefoldApiDoc`. Runs at the tail of `regenerate` so the fixtures never
 * drift from the `.d.ts` they describe.
 */
export function writeApiDocs(packageRoot: string): void {
  const { targets } = readTargets(packageRoot);
  mkdirSync(join(packageRoot, "api-doc"), { recursive: true });
  for (const target of targets) {
    writeFileSync(
      join(packageRoot, "api-doc", `${target.module}.json`),
      apiDocJson(packageRoot, target),
    );
  }
}

/**
 * Verify each committed `api-doc/<module>.json` still equals a fresh extraction
 * from its generated file, without rewriting — the `--check` counterpart to
 * `writeApiDocs`. A missing or stale fixture reports `false`.
 */
export function checkApiDocs(packageRoot: string): { module: string; ok: boolean }[] {
  const { targets } = readTargets(packageRoot);
  return targets.map((target) => {
    const expected = apiDocJson(packageRoot, target);
    let committed = "";
    try {
      committed = readFileSync(join(packageRoot, "api-doc", `${target.module}.json`), "utf8");
    } catch {
      committed = "";
    }
    return { module: target.module, ok: committed === expected };
  });
}

/**
 * A GitHub repo URL (`https://github.com/<owner>/<repo>[.git]`) reduced to the
 * bare `<owner>/<repo>` slug used to address raw content and the git-trees API.
 */
export function repoSlug(repo: string): string {
  return repo
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

/**
 * The raw.githubusercontent.com URL for a target's upstream `.d.ts` at the
 * pinned commit. `source.repo` is the human `https://github.com/<owner>/<repo>`
 * form; raw content is addressed by the bare `<owner>/<repo>` slug.
 */
export function rawUrl(source: LibrarySource, target: LibraryTarget): string {
  return `https://raw.githubusercontent.com/${repoSlug(source.repo)}/${source.commit}/${target.path}`;
}

export type DriftStatus = "ok" | "upstream-drift" | "transform-drift";

export interface DriftResult {
  module: string;
  status: DriftStatus;
}

export type FetchText = (url: string) => Promise<string>;

const defaultFetch: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
};

/**
 * Live-fetch each pinned upstream `.d.ts` and classify it against the committed
 * files: `upstream-drift` when the fetched bytes no longer match the committed
 * fixture (upstream moved off the pin), `transform-drift` when the fixture is
 * unchanged but the committed generated file differs from a fresh codemod (the
 * codemod or fixture changed without a `bun regen`). The `fetchText` seam keeps
 * the classifier offline-testable; only the CLI wires the real network.
 */
export async function checkDrift(
  packageRoot: string,
  fetchText: FetchText = defaultFetch,
): Promise<DriftResult[]> {
  const { source, targets } = readTargets(packageRoot);
  const results: DriftResult[] = [];
  for (const target of targets) {
    const fetched = await fetchText(rawUrl(source, target));
    const fixture = readFileSync(join(packageRoot, target.fixture), "utf8");
    let status: DriftStatus;
    if (fetched !== fixture) {
      status = "upstream-drift";
    } else {
      const generated = readFileSync(join(packageRoot, target.generated), "utf8");
      status = codemodDeclaration(fetched).output === generated ? "ok" : "transform-drift";
    }
    results.push({ module: target.module, status });
  }
  return results;
}

export type DirClassification = "pure-lua" | "native" | "already-vendored" | "covered-by-goal";

export interface ClassificationEntry {
  dir: string;
  classification: DirClassification;
  modules: string[];
}

// A ts-defold/library `<name>-<version>.d.ts` alias file (e.g. `monarch-5.1.0`,
// `taptic_engine-1.2`) — the "latest" pointer, not a distinct module name.
const VERSION_ALIAS = /-\d+\.\d+(\.\d+)?$/;

/**
 * Group the vendored module names in a ts-defold/library tree by library dir.
 * Every library lives at `packages/<dir>/<module>.d.ts`; each contributes
 * `<module>`, minus the versioned alias files (`<name>-<semver>.d.ts`). A dir
 * is registered from any path under it, so a dir carrying only a `library.json`
 * (or nothing but an alias) maps to `[]`. Root files, dot-prefixed dirs, and
 * non-`packages/` paths are ignored. Module lists are sorted for stable output.
 */
export function libraryModulesFromTree(paths: string[]): Map<string, string[]> {
  const byDir = new Map<string, string[]>();
  for (const p of paths) {
    const segments = p.split("/");
    if (segments[0] !== "packages" || segments.length < 3) continue;
    const dir = segments[1];
    if (dir === undefined || dir.startsWith(".")) continue;
    if (!byDir.has(dir)) byDir.set(dir, []);
    const file = segments[segments.length - 1];
    if (file === undefined || !file.endsWith(".d.ts")) continue;
    const moduleName = file.slice(0, -".d.ts".length);
    if (VERSION_ALIAS.test(moduleName)) continue;
    byDir.get(dir)?.push(moduleName);
  }
  for (const modules of byDir.values()) modules.sort();
  return byDir;
}

/**
 * Classify each library dir from its module-name shape. A Defold native
 * extension registers a bare global module (`daabbcc`, `astar`), while a
 * pure-Lua library is required by a dotted path (`monarch.monarch`,
 * `richtext.richtext`) — so a dir is `pure-lua` iff it has at least one module
 * and every module name is dotted; any bare module (or none at all) means
 * `native`. The exclusion sets win: a vendored or goal-covered dir keeps that
 * label regardless of shape. The module names are recorded as the classification
 * evidence. Sorted by `dir` for a stable committed manifest.
 */
export function classifyLibraryDirs(
  dirs: { dir: string; modules: string[] }[],
  opts: { vendoredDirs: ReadonlySet<string>; coveredByGoalDirs: ReadonlySet<string> },
): ClassificationEntry[] {
  return dirs
    .map(({ dir, modules }): ClassificationEntry => {
      let classification: DirClassification;
      if (opts.vendoredDirs.has(dir)) {
        classification = "already-vendored";
      } else if (opts.coveredByGoalDirs.has(dir)) {
        classification = "covered-by-goal";
      } else if (modules.length > 0 && modules.every((m) => m.includes("."))) {
        classification = "pure-lua";
      } else {
        classification = "native";
      }
      return { dir, classification, modules };
    })
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

interface GithubTreeResponse {
  tree?: { path: string }[];
}

const githubHeaders = (): Record<string, string> => {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function githubTreePaths(slug: string, ref: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${slug}/git/trees/${ref}?recursive=1`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    throw new Error(`git-trees fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as GithubTreeResponse;
  return (body.tree ?? []).map((e) => e.path);
}

/** Enumerate the ts-defold/library tree at the pinned commit. Network seam. */
export type ListTree = (source: LibrarySource) => Promise<string[]>;

const defaultListTree: ListTree = (source) => githubTreePaths(repoSlug(source.repo), source.commit);

/**
 * Enumerate every ts-defold/library dir at the pin, classify each by its
 * module-name shape, and write `library-classification.json`. The `listTree`
 * seam keeps the pass offline-testable; only the CLI wires the real call, and it
 * stays out of CI (mirrors `--check`). The manifest pins the same `source` as
 * `library-targets.json`.
 */
export async function writeClassification(
  packageRoot: string,
  seams: { listTree?: ListTree } = {},
): Promise<void> {
  const listTree = seams.listTree ?? defaultListTree;
  const { source, targets } = readTargets(packageRoot);
  const vendoredDirs = new Set(
    targets.map((t) => t.path.split("/")[1]).filter((d): d is string => d !== undefined),
  );
  const coveredByGoalDirs = new Set(["defold-lldebugger", "defold-xmath"]);

  const modulesByDir = libraryModulesFromTree(await listTree(source));
  const dirs = [...modulesByDir].map(([dir, modules]) => ({ dir, modules }));
  const entries = classifyLibraryDirs(dirs, { vendoredDirs, coveredByGoalDirs });
  writeFileSync(
    join(packageRoot, "library-classification.json"),
    `${JSON.stringify({ source, dirs: entries }, null, 2)}\n`,
  );
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const argv = process.argv.slice(2);
  if (argv.includes("--classify")) {
    await writeClassification(root);
    const { dirs } = JSON.parse(
      readFileSync(join(root, "library-classification.json"), "utf8"),
    ) as { dirs: ClassificationEntry[] };
    const counts = new Map<DirClassification, number>();
    for (const e of dirs) counts.set(e.classification, (counts.get(e.classification) ?? 0) + 1);
    console.log(`classified ${dirs.length} upstream dir(s) from ts-defold/library`);
    for (const [classification, n] of [...counts].sort()) {
      console.log(`  ${classification}: ${n}`);
    }
  } else if (argv.includes("--check")) {
    const results = await checkDrift(root);
    console.log(`checked ${results.length} vendored target(s) against ts-defold/library`);
    for (const { module, status } of results) {
      console.log(`  ${status}: ${module}`);
    }
    const apiDocs = checkApiDocs(root);
    console.log(`checked ${apiDocs.length} api-doc fixture(s)`);
    for (const { module, ok } of apiDocs) {
      if (!ok) console.log(`  api-doc-drift: ${module}`);
    }
    if (results.some((r) => r.status !== "ok") || apiDocs.some((r) => !r.ok)) {
      process.exitCode = 1;
    }
  } else {
    regenerate(root);
  }
}

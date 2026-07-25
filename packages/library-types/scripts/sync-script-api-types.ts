import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FidelityReport } from "./luals-fidelity";

/**
 * The script_api ingestion front-end: a third `library-types` corpus mode beside
 * the ts-defold codemod (`sync-library-types.ts`) and the LuaLS front-end
 * (`sync-luals-types.ts`). It ingests a library's own committed `.script_api`
 * snapshot and routes it through the *shared ref-doc emitter* — the exact path
 * the four built-in extensions and the resolve-time extension path use — rather
 * than the LuaLS `emitLibraryDeclarations` (which consumes a `LibraryModel`).
 *
 * Each target pins its exact output paths. Like the LuaLS libraries, a migrated
 * script_api library is the sole maintainer of its namespace, so its goldens are
 * named for the single-segment `namespace` (`generated/bridge.d.ts`,
 * `api-doc/bridge.json`, `fidelity/bridge.json`) at the canonical roots — not the
 * dotted `moduleId` — keeping the docs tree and file layout uniform with druid.
 */
export interface ScriptApiTarget {
  repo: string;
  ref: string;
  scriptApi: string;
  moduleId: string;
  namespace: string;
  generated: string;
  apiDoc: string;
  // Defaults to `fidelity/<namespace>.json` when omitted.
  fidelity: string;
  // SPDX-style license id, surfaced by the docs-site provenance block. Optional
  // in the config; defaults to "".
  license?: string;
}

export interface ScriptApiTargets {
  targets: ScriptApiTarget[];
}

const REQUIRED_FIELDS = [
  "repo",
  "ref",
  "scriptApi",
  "moduleId",
  "namespace",
  "generated",
  "apiDoc",
] as const;

/**
 * Read `script-api-targets.json`, validate every required field per entry, and
 * fill optional defaults (`fidelity` → `fidelity/<namespace>.json`,
 * `license` → ""). Throws on the first missing field naming both the field and
 * the offending entry (its `moduleId`, or its index when `moduleId` itself is
 * absent) — the loud-fail discipline `readLualsTargets` uses. No network.
 */
export function readScriptApiTargets(packageRoot: string): ScriptApiTarget[] {
  const parsed = JSON.parse(readFileSync(join(packageRoot, "script-api-targets.json"), "utf8")) as {
    targets: Partial<ScriptApiTarget>[];
  };
  return parsed.targets.map((entry, index) => {
    const label = typeof entry.moduleId === "string" ? entry.moduleId : `index ${index}`;
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] === undefined) {
        throw new Error(
          `script-api-targets.json: entry ${label} is missing required field "${field}".`,
        );
      }
    }
    const moduleId = entry.moduleId as string;
    return {
      repo: entry.repo as string,
      ref: entry.ref as string,
      scriptApi: entry.scriptApi as string,
      moduleId,
      namespace: entry.namespace as string,
      generated: entry.generated as string,
      apiDoc: entry.apiDoc as string,
      fidelity: entry.fidelity ?? `fidelity/${entry.namespace as string}.json`,
      license: entry.license ?? "",
    };
  });
}

/** Fetch the raw text at a URL. Network seam — mirrors `sync-luals-types.ts`. */
export type FetchText = (url: string) => Promise<string>;

/**
 * A GitHub repo URL reduced to the bare `<owner>/<repo>` slug used to address
 * raw content. Mirrors `repoSlug` in the LuaLS front-end.
 */
function repoSlug(repo: string): string {
  return repo
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

function rawUrl(target: ScriptApiTarget): string {
  return `https://raw.githubusercontent.com/${repoSlug(target.repo)}/${target.ref}/${target.scriptApi}`;
}

function fixturePath(packageRoot: string, target: ScriptApiTarget): string {
  return join(packageRoot, "fixtures/script-api", `${target.moduleId}.script_api`);
}

/**
 * Snapshot the pinned `.script_api` into `fixtures/script-api/<moduleId>.script_api`
 * via the raw-content URL. Snapshot only — no codemod. The `fetchText` seam keeps
 * the pass offline-testable; only the CLI `--fetch` arm wires the real network.
 */
export async function fetchScriptApiFixture(
  packageRoot: string,
  target: ScriptApiTarget,
  seams: { fetchText: FetchText },
): Promise<void> {
  const text = await seams.fetchText(rawUrl(target));
  const dest = fixturePath(packageRoot, target);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text);
}

/** A single ref-doc `doc` type slot — a parameter or a return value. */
export interface ScriptApiDocSlot {
  types: string[];
}

export interface ScriptApiDocElement {
  type: string;
  name: string;
  description: string;
  parameters: ScriptApiDocSlot[];
  returnvalues: ScriptApiDocSlot[];
}

/** The core ref-doc JSON shape `scriptApiToFixtureJson` produces. */
export interface ScriptApiDoc {
  info: { namespace: string };
  elements: ScriptApiDocElement[];
}

/** Reports whether a single ref-doc type token maps to a real TS type. */
export interface TypeResolver {
  resolves(token: string): boolean;
}

interface SyncApiDocsModule {
  scriptApiToFixtureJson: (text: string) => string;
}

interface RegenModule {
  generateModuleDeclaration: (entry: {
    namespace: string;
    doc: unknown;
    outFile: string;
    importsFrom?: string;
    moduleId?: string;
  }) => { contents: string; dropped: string[] };
}

interface EmitDtsModule {
  recoverCallbackSignature: (token: string) => string | null;
}

interface CoreTypesModule {
  DEFOLD_TYPE_MAP: Readonly<Record<string, string>>;
}

interface TypesModules {
  scriptApiToFixtureJson: (text: string) => string;
  generateModuleDeclaration: RegenModule["generateModuleDeclaration"];
  resolver: TypeResolver;
}

// bridge references no branded engine handle, so `generateModuleDeclaration`
// emits no core-types import and this value never reaches the golden; it mirrors
// the built-in extensions' import for the day a script_api target does reference
// one.
const SCRIPT_API_CORE_TYPES_IMPORT = "../src/core-types";

/**
 * Load the shared ref-doc emitter and the emitter's own type-mapping surface from
 * the sibling `@defold-typescript/types` package by resolved path, mirroring
 * `extension-emit.ts`'s `loadEmitter`: `scriptApiToFixtureJson` (YAML -> ref-doc
 * JSON) and `generateModuleDeclaration` live in the types package's `scripts/`,
 * `recoverCallbackSignature`/`DEFOLD_TYPE_MAP` in its `src/`. This is a repo-only
 * build script (never shipped), so the sibling `../types` path is sufficient.
 *
 * A token resolves iff it is in `DEFOLD_TYPE_MAP` or `recoverCallbackSignature`
 * recognizes it — the exact non-`unknown` predicate `defaultMapType` applies,
 * so fidelity mirrors the emitter's real output (a `string | nil` union, absent
 * from the map, renders `unknown` and counts as an unknown fallback).
 */
async function loadTypesModules(packageRoot: string): Promise<TypesModules> {
  const typesRoot = join(packageRoot, "..", "types");
  const sync = (await import(join(typesRoot, "scripts", "sync-api-docs.ts"))) as SyncApiDocsModule;
  const regen = (await import(join(typesRoot, "scripts", "regen.ts"))) as RegenModule;
  const emitDts = (await import(join(typesRoot, "src", "emit-dts.ts"))) as EmitDtsModule;
  const core = (await import(join(typesRoot, "src", "core-types.ts"))) as CoreTypesModule;
  const resolver: TypeResolver = {
    resolves: (token) =>
      Object.hasOwn(core.DEFOLD_TYPE_MAP, token) ||
      emitDts.recoverCallbackSignature(token) !== null,
  };
  return {
    scriptApiToFixtureJson: sync.scriptApiToFixtureJson,
    generateModuleDeclaration: regen.generateModuleDeclaration,
    resolver,
  };
}

/** The emitter's type-mapping predicate, isolated for direct assertion. */
export async function loadTypeResolver(packageRoot: string): Promise<TypeResolver> {
  return (await loadTypesModules(packageRoot)).resolver;
}

function parseFixtureDoc(
  packageRoot: string,
  target: ScriptApiTarget,
  scriptApiToFixtureJson: (text: string) => string,
): ScriptApiDoc {
  const text = readFileSync(fixturePath(packageRoot, target), "utf8");
  return JSON.parse(scriptApiToFixtureJson(text)) as ScriptApiDoc;
}

/**
 * `.script_api` -> `scriptApiToFixtureJson` -> `generateModuleDeclaration`. Returns
 * an importable module keyed by `moduleId` (`declare module '<moduleId>'`), with
 * one-level nested sub-namespaces intact per the nested-namespace parser slice.
 */
export async function emitScriptApiDeclaration(
  packageRoot: string,
  target: ScriptApiTarget,
): Promise<string> {
  const { scriptApiToFixtureJson, generateModuleDeclaration } = await loadTypesModules(packageRoot);
  const doc = parseFixtureDoc(packageRoot, target, scriptApiToFixtureJson);
  const { contents } = generateModuleDeclaration({
    namespace: target.namespace,
    doc,
    outFile: `${target.moduleId}.d.ts`,
    importsFrom: SCRIPT_API_CORE_TYPES_IMPORT,
    moduleId: target.moduleId,
  });
  return contents;
}

/**
 * The api-doc golden is the parsed ref-doc `doc` itself, pretty-printed — the same
 * `{ info, elements }` shape the built-in extensions' `<ns>_doc.json` fixtures
 * feed the docs-site through `parseDefoldApiDoc`, so the shape stays uniform.
 */
export async function lowerScriptApiApiDoc(
  packageRoot: string,
  target: ScriptApiTarget,
): Promise<string> {
  const { scriptApiToFixtureJson } = await loadTypesModules(packageRoot);
  const doc = parseFixtureDoc(packageRoot, target, scriptApiToFixtureJson);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Build the `FidelityReport` (same shape as the LuaLS `fidelity/<ns>.json`) over a
 * parsed ref-doc `doc`. Every function element's param/return type tokens are run
 * through `resolver`; a token the emitter cannot map (`resolver.resolves` false)
 * is counted in `unknownFallbacks` and surfaced in `unknownTokens` rather than
 * hidden behind the coverage number. `undocumentedMembers` counts function
 * elements with an empty description. Deterministic; no I/O.
 */
export function computeScriptApiFidelity(
  namespace: string,
  doc: ScriptApiDoc,
  resolver: TypeResolver,
): FidelityReport {
  let totalMembers = 0;
  let totalTypeTokens = 0;
  let unknownFallbacks = 0;
  let undocumentedMembers = 0;
  const unknownTokens = new Set<string>();

  for (const element of doc.elements) {
    if (element.type !== "FUNCTION") continue;
    totalMembers++;
    if ((element.description ?? "").trim() === "") undocumentedMembers++;
    for (const slot of [...element.parameters, ...element.returnvalues]) {
      for (const token of slot.types) {
        totalTypeTokens++;
        if (!resolver.resolves(token)) {
          unknownFallbacks++;
          unknownTokens.add(token);
        }
      }
    }
  }

  const coverage =
    totalTypeTokens === 0
      ? 1
      : round3(Math.max(0, Math.min(1, (totalTypeTokens - unknownFallbacks) / totalTypeTokens)));

  return {
    namespace,
    totalMembers,
    totalTypeTokens,
    unknownFallbacks,
    unknownTokens: [...unknownTokens].sort(),
    undocumentedMembers,
    coverage,
  };
}

export async function buildScriptApiFidelity(
  packageRoot: string,
  target: ScriptApiTarget,
): Promise<FidelityReport> {
  const { scriptApiToFixtureJson, resolver } = await loadTypesModules(packageRoot);
  const doc = parseFixtureDoc(packageRoot, target, scriptApiToFixtureJson);
  return computeScriptApiFidelity(target.namespace, doc, resolver);
}

const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
};

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const argv = process.argv.slice(2);
  if (argv.includes("--fetch")) {
    for (const target of readScriptApiTargets(root)) {
      await fetchScriptApiFixture(root, target, { fetchText: defaultFetchText });
      console.log(`snapshotted ${target.moduleId} from ${repoSlug(target.repo)}@${target.ref}`);
    }
  }
  if (argv.includes("--emit")) {
    for (const target of readScriptApiTargets(root)) {
      const contents = await emitScriptApiDeclaration(root, target);
      const dest = join(root, target.generated);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, contents);
      console.log(`emitted ${target.moduleId} -> ${target.generated}`);
    }
  }
  if (argv.includes("--api-doc")) {
    for (const target of readScriptApiTargets(root)) {
      const json = await lowerScriptApiApiDoc(root, target);
      const dest = join(root, target.apiDoc);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, json);
      console.log(`lowered ${target.moduleId} -> ${target.apiDoc}`);
    }
  }
  if (argv.includes("--fidelity")) {
    for (const target of readScriptApiTargets(root)) {
      const report = await buildScriptApiFidelity(root, target);
      const dest = join(root, target.fidelity);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${JSON.stringify(report, null, 2)}\n`);
      console.log(
        `${target.moduleId}: coverage ${(report.coverage * 100).toFixed(1)}% (${report.unknownFallbacks} unknown, ${report.undocumentedMembers} undocumented)`,
      );
    }
  }
}

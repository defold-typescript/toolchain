import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isKnownDefoldTypeToken } from "../src/emit-dts";
import { refDocCacheDir, resolveRefDoc } from "./doc-source";
import {
  apiElementIdentity,
  IGNORED_UPSTREAM,
  mergeApiDocs,
  readZip,
  SYNC_MANIFEST,
  type ZipAccessor,
} from "./sync-api-docs";

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const LUA_NAMESPACE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The set of namespaces promoted into the generated surface at Defold 1.13.0.
// Held here rather than derived from the root release model because the
// per-package `rootDir` boundary forbids importing outside this package tree;
// `scripts/release-model.test.ts` correspondence-guards this against the model.
export const DEFOLD_1_13_PROMOTED_NAMESPACES = [
  "b2d.chain",
  "b2d.fixture",
  "b2d.joint",
  "b2d.shape",
  "b2d.world",
  "compute",
  "material",
] as const;

interface RawElement extends Record<string, unknown> {
  type?: string;
  name?: string;
}

interface RawApiDoc extends Record<string, unknown> {
  info?: { namespace?: string };
  elements?: RawElement[];
}

export interface ReleaseBaselineModule {
  readonly namespace: string;
  readonly fixture: string;
  readonly doc: unknown;
  readonly sourceEntries?: readonly string[];
}

export interface ReleaseBaseline {
  readonly id: string;
  readonly modules: readonly ReleaseBaselineModule[];
  readonly luaStdlib: readonly ReleaseBaselineModule[];
}

export interface ReleaseImportSnapshot {
  readonly namespace: string;
  readonly fixture: string;
  readonly doc: unknown;
  readonly sourceEntries: readonly string[];
  readonly symbolSources: readonly SymbolSource[];
}

interface SymbolSource {
  readonly identity: string;
  readonly name: string;
  readonly kind: string;
  readonly sourceEntries: string[];
}

interface ReleaseSource {
  readonly namespace: string;
  readonly entries: string[];
  readonly functionCount: number;
}

interface NamespaceDelta {
  readonly added: string[];
  readonly removed: string[];
}

interface SymbolDelta {
  readonly namespace: string;
  readonly added: string[];
  readonly removed: string[];
}

interface MovedNamespace {
  readonly namespace: string;
  readonly from: string[];
  readonly to: string[];
}

interface UnknownTypeBlocker {
  readonly namespace: string;
  readonly symbol: string;
  readonly tokens: string[];
}

interface UnmappedNamespaceBlocker {
  readonly namespace: string;
  readonly entries: string[];
  readonly symbols: string[];
}

export interface ReleaseImportManifest {
  readonly version: string;
  readonly baseline: string;
  readonly ready: boolean;
  readonly sources: ReleaseSource[];
  readonly namespaces: NamespaceDelta;
  readonly moved: MovedNamespace[];
  readonly symbols: SymbolDelta[];
  readonly blockers: {
    readonly unknownTypes: UnknownTypeBlocker[];
    readonly unmappedFunctionNamespaces: UnmappedNamespaceBlocker[];
  };
  readonly snapshots: Array<{
    readonly namespace: string;
    readonly fixture: string;
    readonly sourceEntries: readonly string[];
    readonly symbols: readonly SymbolSource[];
  }>;
}

export type ReleaseImportPlan = Omit<ReleaseImportManifest, "snapshots"> & {
  readonly manifest: ReleaseImportManifest;
  readonly snapshots: ReleaseImportSnapshot[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsedDoc(raw: string): RawApiDoc | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? (value as RawApiDoc) : null;
  } catch {
    return null;
  }
}

function namespaceOf(doc: RawApiDoc): string | null {
  const namespace = isRecord(doc.info) ? doc.info.namespace : undefined;
  return typeof namespace === "string" && LUA_NAMESPACE.test(namespace) ? namespace : null;
}

function elementsOf(doc: unknown): RawElement[] {
  if (!isRecord(doc) || !Array.isArray(doc.elements)) return [];
  return doc.elements.filter(isRecord) as RawElement[];
}

function symbolNames(doc: unknown): string[] {
  return [
    ...new Set(elementsOf(doc).flatMap((element) => (element.name ? [element.name] : []))),
  ].sort();
}

function expectedSourceEntries(module: ReleaseBaselineModule): string[] {
  if (module.sourceEntries) return [...module.sourceEntries].sort();
  const mapped = SYNC_MANIFEST.find((entry) => entry.namespace === module.namespace);
  if (mapped) return [mapped.zipEntry, ...(mapped.mergeEntries ?? [])].sort();
  return [`doc/${module.namespace.replace(/\./g, "_")}.json`];
}

function typeTokens(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) typeTokens(item, out);
    return;
  }
  if (!isRecord(value)) return;
  if (Array.isArray(value.types)) {
    for (const token of value.types) {
      if (typeof token === "string" && !isKnownDefoldTypeToken(token)) out.add(token);
    }
  }
  for (const nested of Object.values(value)) typeTokens(nested, out);
}

function unknownTypeBlockers(
  namespace: string,
  doc: unknown,
  knownConstants: ReadonlySet<string>,
): UnknownTypeBlocker[] {
  const out: UnknownTypeBlocker[] = [];
  for (const element of elementsOf(doc)) {
    const tokens = new Set<string>();
    typeTokens(element, tokens);
    for (const token of knownConstants) tokens.delete(token);
    if (tokens.size === 0) continue;
    out.push({ namespace, symbol: element.name ?? "<unnamed>", tokens: [...tokens].sort() });
  }
  return out;
}

function reportWithoutSnapshots(plan: Omit<ReleaseImportPlan, "manifest">): ReleaseImportManifest {
  return {
    version: plan.version,
    baseline: plan.baseline,
    ready: plan.ready,
    sources: plan.sources,
    namespaces: plan.namespaces,
    moved: plan.moved,
    symbols: plan.symbols,
    blockers: plan.blockers,
    snapshots: plan.snapshots.map(({ namespace, fixture, sourceEntries, symbolSources }) => ({
      namespace,
      fixture,
      sourceEntries,
      symbols: symbolSources,
    })),
  };
}

export function buildReleaseImportPlan(input: {
  version: string;
  zip: ZipAccessor;
  baseline: ReleaseBaseline;
}): ReleaseImportPlan {
  if (!EXACT_VERSION.test(input.version)) {
    throw new Error(`expected an exact Defold release version, received '${input.version}'`);
  }

  const grouped = new Map<string, Array<{ entry: string; doc: RawApiDoc }>>();
  for (const zipEntry of [...input.zip.entries()].sort()) {
    const doc = parsedDoc(input.zip.read(zipEntry));
    if (!doc) continue;
    const namespace = namespaceOf(doc);
    if (!namespace) continue;
    const group = grouped.get(namespace) ?? [];
    group.push({ entry: zipEntry, doc });
    grouped.set(namespace, group);
  }

  const baselineModules = [...input.baseline.modules, ...input.baseline.luaStdlib];
  const generatedNamespaces = new Set(input.baseline.modules.map((module) => module.namespace));
  const baselineByNamespace = new Map(baselineModules.map((module) => [module.namespace, module]));
  const incomingNamespaces = [...grouped.keys()].sort();
  const baselineNamespaces = [...baselineByNamespace.keys()].sort();
  const namespaces = {
    added: incomingNamespaces.filter((namespace) => !baselineByNamespace.has(namespace)),
    removed: baselineNamespaces.filter((namespace) => !grouped.has(namespace)),
  };

  const sources: ReleaseSource[] = incomingNamespaces.map((namespace) => {
    const group = grouped.get(namespace) as Array<{ entry: string; doc: RawApiDoc }>;
    return {
      namespace,
      entries: group.map(({ entry }) => entry).sort(),
      functionCount: group.reduce(
        (count, { doc }) =>
          count + elementsOf(doc).filter((element) => element.type === "FUNCTION").length,
        0,
      ),
    };
  });

  const knownConstants = new Set<string>();
  for (const group of grouped.values()) {
    for (const { doc } of group) {
      for (const element of elementsOf(doc)) {
        if (element.type === "CONSTANT" && typeof element.name === "string") {
          knownConstants.add(element.name);
        }
      }
    }
  }

  const snapshots: ReleaseImportSnapshot[] = [];
  const moved: MovedNamespace[] = [];
  const symbols: SymbolDelta[] = [];
  const unknownTypes: UnknownTypeBlocker[] = [];
  for (const module of baselineModules) {
    const group = grouped.get(module.namespace);
    if (!group) continue;
    const sourceEntries = group.map(({ entry }) => entry).sort();
    const doc = mergeApiDocs(group.map((item) => item.doc));
    const symbolEntries = new Map<string, SymbolSource>();
    for (const item of group) {
      for (const element of elementsOf(item.doc)) {
        const identity = apiElementIdentity(module.namespace, element);
        if (!identity || typeof element.name !== "string" || typeof element.type !== "string")
          continue;
        const existing = symbolEntries.get(identity);
        if (existing) existing.sourceEntries.push(item.entry);
        else {
          symbolEntries.set(identity, {
            identity,
            name: element.name,
            kind: element.type,
            sourceEntries: [item.entry],
          });
        }
      }
    }
    const symbolSources = [...symbolEntries.values()]
      .map((symbol) => ({ ...symbol, sourceEntries: [...new Set(symbol.sourceEntries)].sort() }))
      .sort((a, b) => a.identity.localeCompare(b.identity));
    snapshots.push({
      namespace: module.namespace,
      fixture: module.fixture,
      doc,
      sourceEntries,
      symbolSources,
    });

    const expected = expectedSourceEntries(module);
    if (expected.some((entry) => !sourceEntries.includes(entry))) {
      moved.push({ namespace: module.namespace, from: expected, to: sourceEntries });
    }

    const before = new Set(symbolNames(module.doc));
    const after = new Set(symbolNames(doc));
    const added = [...after].filter((name) => !before.has(name)).sort();
    const removed = [...before].filter((name) => !after.has(name)).sort();
    if (added.length > 0 || removed.length > 0)
      symbols.push({ namespace: module.namespace, added, removed });
    if (generatedNamespaces.has(module.namespace)) {
      unknownTypes.push(...unknownTypeBlockers(module.namespace, doc, knownConstants));
    }
  }

  const unmappedFunctionNamespaces = sources
    .filter(
      (source) =>
        source.functionCount > 0 &&
        !baselineByNamespace.has(source.namespace) &&
        !IGNORED_UPSTREAM.has(source.namespace),
    )
    .map((source) => ({
      namespace: source.namespace,
      entries: source.entries,
      symbols: symbolNames(
        mergeApiDocs((grouped.get(source.namespace) ?? []).map((item) => item.doc)),
      ).filter((name) =>
        elementsOf(
          mergeApiDocs((grouped.get(source.namespace) ?? []).map((item) => item.doc)),
        ).some((element) => element.type === "FUNCTION" && element.name === name),
      ),
    }));

  snapshots.sort((a, b) => a.namespace.localeCompare(b.namespace));
  moved.sort((a, b) => a.namespace.localeCompare(b.namespace));
  symbols.sort((a, b) => a.namespace.localeCompare(b.namespace));
  unknownTypes.sort(
    (a, b) => a.namespace.localeCompare(b.namespace) || a.symbol.localeCompare(b.symbol),
  );
  const ready = unknownTypes.length === 0 && unmappedFunctionNamespaces.length === 0;
  const planBase = {
    version: input.version,
    baseline: input.baseline.id,
    ready,
    sources,
    namespaces,
    moved,
    symbols,
    blockers: { unknownTypes, unmappedFunctionNamespaces },
    snapshots,
  };
  const manifest = reportWithoutSnapshots(planBase);
  return { ...planBase, manifest };
}

export function releaseImportReportJson(plan: ReleaseImportPlan): string {
  return `${JSON.stringify(plan.manifest, null, 2)}\n`;
}

export function applyReleaseImport(plan: ReleaseImportPlan, packageRoot = PACKAGE_ROOT): string[] {
  if (!plan.ready)
    throw new Error("release import is blocked; resolve every reported blocker first");
  const relativeRoot = `fixtures/defold-${plan.version}`;
  const written: string[] = [];
  for (const snapshot of plan.snapshots) {
    const relative = `${relativeRoot}/${snapshot.fixture}`;
    const path = resolve(packageRoot, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(snapshot.doc, null, 2)}\n`);
    written.push(relative);
  }
  const manifestPath = `${relativeRoot}/import-manifest.json`;
  writeFileSync(resolve(packageRoot, manifestPath), releaseImportReportJson(plan));
  written.push(manifestPath);
  return written.sort();
}

export interface ReleaseImportArgs {
  readonly version: string;
  readonly check: boolean;
  readonly json: boolean;
  readonly zipPath?: string;
}

export function parseReleaseImportArgs(args: readonly string[]): ReleaseImportArgs {
  const version = args[0];
  if (!version || !EXACT_VERSION.test(version)) {
    throw new Error(
      "import-defold-release requires an exact Defold release version (for example 1.13.0)",
    );
  }
  let check = false;
  let json = false;
  let zipPath: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") check = true;
    else if (arg === "--json") json = true;
    else if (arg === "--zip") {
      zipPath = args[index + 1];
      if (!zipPath || zipPath.startsWith("--")) throw new Error("--zip requires a path");
      index += 1;
    } else {
      throw new Error(`unknown argument '${arg}'`);
    }
  }
  return { version, check, json, ...(zipPath ? { zipPath } : {}) };
}

function loadBaseline(packageRoot = PACKAGE_ROOT): ReleaseBaseline {
  const registry = JSON.parse(readFileSync(resolve(packageRoot, "api-targets.json"), "utf8")) as {
    targets: Array<{
      id: string;
      default?: boolean;
      fixturesDir: string;
      modules: Array<{ namespace: string; fixture: string }>;
      luaStdlib?: Array<{ namespace: string; fixture: string }>;
    }>;
  };
  const target = registry.targets.find((candidate) => candidate.default === true);
  if (!target) throw new Error("api-targets.json has no default baseline target");
  const load = (module: { namespace: string; fixture: string }): ReleaseBaselineModule => ({
    ...module,
    doc: JSON.parse(readFileSync(resolve(packageRoot, target.fixturesDir, module.fixture), "utf8")),
  });
  const modules = target.modules
    .filter((module) => SYNC_MANIFEST.some((source) => source.namespace === module.namespace))
    .map(load);
  for (const namespace of DEFOLD_1_13_PROMOTED_NAMESPACES) {
    if (modules.some((module) => module.namespace === namespace)) continue;
    modules.push({
      namespace,
      fixture: `${namespace.replace(/\./g, "_")}_doc.json`,
      doc: { info: { namespace }, elements: [] },
    });
  }
  return {
    id: target.id,
    modules,
    luaStdlib: (target.luaStdlib ?? []).map(load),
  };
}

if (import.meta.main) {
  try {
    const args = parseReleaseImportArgs(process.argv.slice(2));
    const resolved = args.zipPath
      ? { zip: readZip(args.zipPath), provenance: "local" as const }
      : await resolveRefDoc({ version: args.version, cacheDir: refDocCacheDir() });
    const plan = buildReleaseImportPlan({
      version: args.version,
      zip: resolved.zip,
      baseline: loadBaseline(),
    });
    if (args.json) process.stdout.write(releaseImportReportJson(plan));
    else {
      console.log(`Defold ${args.version} release import: ${plan.ready ? "ready" : "blocked"}`);
      console.log(`  source: ${resolved.provenance}`);
      console.log(
        `  namespaces: +${plan.namespaces.added.length} -${plan.namespaces.removed.length}`,
      );
      console.log(`  moved: ${plan.moved.length}; symbol deltas: ${plan.symbols.length}`);
      console.log(
        `  blockers: ${plan.blockers.unknownTypes.length} unknown type symbol(s), ${plan.blockers.unmappedFunctionNamespaces.length} unmapped namespace(s)`,
      );
    }
    if (!args.check && plan.ready) {
      const written = applyReleaseImport(plan);
      if (!args.json) console.log(`  wrote: ${written.join(", ")}`);
    }
    if (!plan.ready) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

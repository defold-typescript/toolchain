// The materialization slice of the `[dependencies]`-driven extension typing
// pipeline: it takes the `resolveExtensionDeclarations` output (one
// `ExtensionDeclarations` bundle per declared dependency) and writes each emitted
// declaration into the gitignored sibling surface `.defold-types/extensions/` —
// one file per namespace, or one per declaration when several share a namespace —
// verbatim apart from the core-type retarget, because the emitter spells that
// import relative to `packages/types/generated/` rather than to the materialized
// surface, where it would dangle. A dependency's own shipped `types/*.d.ts`
// install untouched under `shipped/<folder>/` with their archive names, so they
// keep reaching each other by relative path. It then
// additively points `tsconfig` at it. The extensions package is a sibling of the
// engine `<surfaceId>/` surface so an engine re-materialization (which prunes
// non-wanted `.d.ts` in its own dir) never clobbers it, and the two coexist under
// one `typeRoots: [".defold-types"]`. The CLI `resolve` verb that orchestrates
// resolve -> write -> reference stays the next slice.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { ExtensionDeclarations } from "./extension-declarations";
import { formatJsonLikeBiome } from "./format-json";
import { normalizeSourceId } from "./library-match";
import { ensureGitignoreLine, MATERIALIZED_ROOT, retargetCoreTypes } from "./materialize";

const EXTENSIONS_DIR = "extensions";

const SHIPPED_DIR = "shipped";

export interface MaterializeExtensionDeclarationsOptions {
  readonly cwd: string;
  readonly bundles: readonly ExtensionDeclarations[];
}

export interface SharedExtensionNamespace {
  readonly namespace: string;
  readonly urls: string[];
}

export interface MaterializeExtensionDeclarationsResult {
  readonly materializedDir: string | null;
  readonly namespaces: string[];
  readonly sharedNamespaces: SharedExtensionNamespace[];
}

interface NamespaceSource {
  readonly url: string;
  readonly contents: string;
}

function dependencySlug(url: string): string {
  return normalizeSourceId(url).replace(/[^a-z0-9._-]/g, "-") || "dep";
}

// A namespace one declaration owns keeps `<ns>.d.ts`, and those names are
// reserved first. A shared one writes a `<ns>.<slug>.d.ts` per declaration,
// named after its dependency rather than its position so a reordered
// `[dependencies]` renames nothing; a name any file already holds (`foo.bar`
// is both namespace `foo.bar` and dependency `bar`'s share of `foo`) gets a
// number instead. Names are compared without letter case, because macOS and
// Windows disks treat `Foo.d.ts` and `foo.d.ts` as one file; the written name
// keeps the namespace's spelling.
function allocateFileStems(
  namespaces: readonly string[],
  byNamespace: ReadonlyMap<string, readonly NamespaceSource[]>,
): Map<string, string> {
  const files = new Map<string, string>();
  const taken = new Set<string>();
  const claim = (base: string, contents: string): void => {
    let stem = base;
    for (let count = 2; taken.has(stem.toLowerCase()); count++) {
      stem = `${base}-${count}`;
    }
    taken.add(stem.toLowerCase());
    files.set(stem, contents);
  };
  for (const namespace of namespaces) {
    const sources = byNamespace.get(namespace) ?? [];
    if (sources.length === 1) {
      claim(namespace, sources[0]?.contents ?? "");
    }
  }
  for (const namespace of namespaces) {
    const sources = byNamespace.get(namespace) ?? [];
    if (sources.length === 1) {
      continue;
    }
    for (const { url, contents } of sources) {
      claim(`${namespace}.${dependencySlug(url)}`, contents);
    }
  }
  return files;
}

// Bundles that ship their own declarations, in URL order, each claiming a
// folder named after its dependency, numbered on a clash compared without
// letter case, as `allocateFileStems` does: two owners' `lib` repos share a slug.
function allocateShippedFolders(
  bundles: readonly ExtensionDeclarations[],
): { folder: string; bundle: ExtensionDeclarations }[] {
  const taken = new Set<string>();
  return bundles
    .filter((bundle) => bundle.shipped.length > 0)
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
    .map((bundle) => {
      const base = dependencySlug(bundle.url);
      let folder = base;
      for (let count = 2; taken.has(folder.toLowerCase()); count++) {
        folder = `${base}-${count}`;
      }
      taken.add(folder.toLowerCase());
      return { folder, bundle };
    });
}

export function materializeExtensionDeclarations(
  opts: MaterializeExtensionDeclarationsOptions,
): MaterializeExtensionDeclarationsResult {
  const { cwd, bundles } = opts;

  // Group every bundle's declarations by namespace, in bundle order, and keep
  // them all: each is its own `declare global` module file, so TypeScript merges
  // a namespace across files, while concatenating them would repeat each file's
  // core-type import. The retarget rides in here so the barrel and prune paths
  // stay untouched; `surfaceHasCoreTypes: false` is the published-subpath arm,
  // correct because the extensions dir mints no `core-types.d.ts` of its own.
  const byNamespace = new Map<string, NamespaceSource[]>();
  for (const bundle of bundles) {
    for (const { namespace, contents } of bundle.declarations) {
      const sources = byNamespace.get(namespace) ?? [];
      sources.push({ url: bundle.url, contents: retargetCoreTypes(contents, 0, false) });
      byNamespace.set(namespace, sources);
    }
  }

  const namespaces = [...byNamespace.keys()].sort();
  const relDir = path.posix.join(MATERIALIZED_ROOT, EXTENSIONS_DIR);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, EXTENSIONS_DIR);

  const shippedFolders = allocateShippedFolders(bundles);

  // reconcile-to-zero: no namespace or shipped set remains, so remove a
  // previously-materialized surface rather than leaving it to load beside what
  // superseded it. Mirrors `materializeVendoredLibraries`, whose empty case
  // already does this.
  if (namespaces.length === 0 && shippedFolders.length === 0) {
    rmSync(absDir, { recursive: true, force: true });
    return { materializedDir: null, namespaces: [], sharedNamespaces: [] };
  }

  const files = allocateFileStems(namespaces, byNamespace);
  const sharedNamespaces: SharedExtensionNamespace[] = [];
  for (const namespace of namespaces) {
    const sources = byNamespace.get(namespace) ?? [];
    if (sources.length > 1) {
      sharedNamespaces.push({ namespace, urls: [...new Set(sources.map(({ url }) => url))] });
    }
  }
  const stems = [...files.keys()].sort();

  mkdirSync(absDir, { recursive: true });

  const wanted = new Set(stems.map((stem) => `${stem}.d.ts`));
  for (const existing of readdirSync(absDir)) {
    if (existing.endsWith(".d.ts") && existing !== "index.d.ts" && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing));
    }
  }

  for (const stem of stems) {
    writeFileSync(path.join(absDir, `${stem}.d.ts`), files.get(stem) ?? "");
  }

  const shippedImports: string[] = [];
  rmSync(path.join(absDir, SHIPPED_DIR), { recursive: true, force: true });
  for (const { folder, bundle } of shippedFolders) {
    const folderDir = path.join(absDir, SHIPPED_DIR, folder);
    mkdirSync(folderDir, { recursive: true });
    for (const { entry, contents } of bundle.shipped) {
      const basename = path.posix.basename(entry);
      writeFileSync(path.join(folderDir, basename), contents);
      shippedImports.push(`./${SHIPPED_DIR}/${folder}/${path.posix.basename(basename, ".d.ts")}`);
    }
  }

  const imports = [...stems.map((stem) => `./${stem}`), ...shippedImports]
    .map((specifier) => `import "${specifier}";`)
    .join("\n");
  writeFileSync(path.join(absDir, "index.d.ts"), `${imports}\n\nexport {};\n`);

  writeFileSync(
    path.join(absDir, "package.json"),
    `${formatJsonLikeBiome({
      name: "@defold-typescript/materialized-extensions",
      types: "index.d.ts",
    })}\n`,
  );

  return { materializedDir: relDir, namespaces, sharedNamespaces };
}

export function ensureExtensionTypesReference(cwd: string, materializedDir: string | null): void {
  const tsconfigPath = path.join(cwd, "tsconfig.json");

  // `null` is "no extension surface", so drop the entry that names one. Only
  // the `types` entry goes: `typeRoots` and every sibling surface are shared.
  if (materializedDir === null) {
    if (!existsSync(tsconfigPath)) {
      return;
    }
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    const types = Array.isArray(current.types) ? (current.types as unknown[]).slice() : [];
    const kept = types.filter((entry) => entry !== EXTENSIONS_DIR);
    if (kept.length !== types.length) {
      tsconfig.compilerOptions = { ...current, types: kept };
      writeFileSync(tsconfigPath, `${formatJsonLikeBiome(tsconfig)}\n`);
    }
    return;
  }
  const entry = path.posix.basename(materializedDir);

  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    const types = Array.isArray(current.types) ? (current.types as unknown[]).slice() : [];
    const typeRoots = Array.isArray(current.typeRoots)
      ? (current.typeRoots as unknown[]).slice()
      : [];

    // Purely additive: keep an existing engine `surfaceId` entry and only append
    // `"extensions"` when absent, so this composes with `ensureMaterializedReference`.
    const needsEntry = !types.includes(entry);
    const needsRoot = !typeRoots.includes(MATERIALIZED_ROOT);
    if (needsEntry || needsRoot) {
      if (needsEntry) {
        types.push(entry);
      }
      if (needsRoot) {
        typeRoots.push(MATERIALIZED_ROOT);
      }
      tsconfig.compilerOptions = { ...current, typeRoots, types };
      writeFileSync(tsconfigPath, `${formatJsonLikeBiome(tsconfig)}\n`);
    }
  }

  ensureGitignoreLine(cwd, `${MATERIALIZED_ROOT}/`);
}

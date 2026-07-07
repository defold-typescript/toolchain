// The user-facing orchestration slice of the `[dependencies]`-driven extension
// typing pipeline. `runResolve` joins the five prior pure slices end to end:
// `readExtensionDependencies` (game.project -> URLs), `resolveExtensionDeclarations`
// (download/cache each archive -> one emitted bundle per dependency),
// `materializeExtensionDeclarations` (write the bundles into
// `.defold-types/extensions/`), and `ensureExtensionTypesReference` (point tsconfig
// at the sibling surface). The CLI `resolve` verb in dispatch.ts drives this; the
// download/readZip/cacheDir seams stay injectable so the orchestration is
// network-free under test.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type DownloadExtensionArchive,
  type ExtensionArchiveProvenance,
  extensionCacheDir,
  type ReadExtensionZip,
} from "./extension-archive";
import { resolveExtensionDeclarations } from "./extension-declarations";
import { readExtensionDependencies } from "./extension-deps";
import {
  ensureExtensionTypesReference,
  materializeExtensionDeclarations,
} from "./extension-materialize";
import { mergeResolvedVersionPins, readExtensionVersionPins } from "./extension-version";
import { formatJsonLikeBiome } from "./format-json";
import { matchVendoredLibrary, type VendoredLibrary } from "./library-match";
import { ensureLibraryTypesReference, materializeVendoredLibraries } from "./library-materialize";
import { loadVendoredLibraryRegistry } from "./library-registry";

export interface ResolvedExtensionReport {
  readonly url: string;
  readonly provenance: ExtensionArchiveProvenance;
  readonly namespaces: string[];
  readonly scriptApiCount: number;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  readonly pinnedVersion?: string;
  readonly pinStatus: "unpinned" | "match" | "drift";
}

export interface ResolvedLibraryReport {
  readonly url: string;
  readonly source: string;
  readonly modules: string[];
  readonly provenance: "vendored";
  // A repo-name match is verified only when at least one of its modules' require
  // paths is present in the downloaded archive; unverified matches are reported
  // but never materialized (collision or drifted fork).
  readonly verified: boolean;
}

export interface RunResolveOptions {
  readonly cwd: string;
  readonly cacheDir?: string;
  readonly download?: DownloadExtensionArchive;
  readonly readZip?: ReadExtensionZip;
  // When true, skip writing newly-resolved pins into `package.json`. Used by
  // `--frozen` to verify the committed pin set without mutating it.
  readonly freeze?: boolean;
  // The vendored pure-Lua library corpus to match `assetOnly` dependencies
  // against. Defaults to the installed `@defold-typescript/library-types`;
  // tests inject a synthetic registry + generatedDir to stay hermetic.
  readonly libraryRegistry?: readonly VendoredLibrary[];
  readonly libraryGeneratedDir?: string | null;
}

export interface RunResolveResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly materializedSurface: string | null;
  readonly extensions: ResolvedExtensionReport[];
  readonly libraries: ResolvedLibraryReport[];
}

function hasProjectSection(text: string): boolean {
  return text.split("\n").some((line) => line.trim() === "[project]");
}

function readExistingPackageJson(cwd: string): { value: unknown; writable: boolean } {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return { value: {}, writable: true };
  }
  try {
    return { value: JSON.parse(readFileSync(pkgPath, "utf8")) as unknown, writable: true };
  } catch {
    return { value: null, writable: false };
  }
}

function seedExtensionPins(cwd: string, existing: unknown, resolved: Record<string, string>): void {
  const merged = mergeResolvedVersionPins(existing, resolved);
  writeFileSync(join(cwd, "package.json"), `${formatJsonLikeBiome(merged)}\n`);
}

export async function runResolve(opts: RunResolveOptions): Promise<RunResolveResult> {
  const { cwd } = opts;
  const gameProjectPath = join(cwd, "game.project");
  if (!existsSync(gameProjectPath)) {
    return {
      ok: false,
      error: `no game.project found in ${cwd}`,
      materializedSurface: null,
      extensions: [],
      libraries: [],
    };
  }

  const text = readFileSync(gameProjectPath, "utf8");
  if (!hasProjectSection(text)) {
    return {
      ok: false,
      error: "game.project has no [project] section",
      materializedSurface: null,
      extensions: [],
      libraries: [],
    };
  }

  const deps = readExtensionDependencies(text);
  if (deps.length === 0) {
    // No declared dependencies means no matched libraries, so reconcile the
    // library surface to zero — prune a previously-materialized one and drop its
    // tsconfig entry.
    const { materializedDir: librariesDir } = materializeVendoredLibraries({
      cwd,
      matched: [],
      generatedDir: null,
    });
    ensureLibraryTypesReference(cwd, librariesDir);
    return { ok: true, materializedSurface: null, extensions: [], libraries: [] };
  }

  const bundles = await resolveExtensionDeclarations(deps, {
    cacheDir: opts.cacheDir ?? extensionCacheDir(),
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
  });

  const { materializedDir } = materializeExtensionDeclarations({ cwd, bundles });
  ensureExtensionTypesReference(cwd, materializedDir);

  // Match each asset-only dependency (no `.script_api`, so it contributes no
  // extension namespace) against the vendored pure-Lua corpus and materialize the
  // matched libraries into the sibling `.defold-types/libraries/` surface. The
  // registry is loaded at most once, only when a default is needed.
  const loaded =
    opts.libraryRegistry === undefined || opts.libraryGeneratedDir === undefined
      ? loadVendoredLibraryRegistry()
      : null;
  const libraryRegistry = opts.libraryRegistry ?? loaded?.registry ?? [];
  const libraryGeneratedDir =
    opts.libraryGeneratedDir !== undefined
      ? opts.libraryGeneratedDir
      : (loaded?.generatedDir ?? null);
  const matchedLibraries: { library: VendoredLibrary; url: string; confirmed: string[] }[] = [];
  for (const bundle of bundles) {
    if (!bundle.assetOnly) {
      continue;
    }
    const library = matchVendoredLibrary(bundle.url, libraryRegistry);
    if (library !== null) {
      const shipped = new Set(bundle.luaModules);
      const confirmed = library.modules.filter((module) => shipped.has(module));
      matchedLibraries.push({ library, url: bundle.url, confirmed });
    }
  }
  const { materializedDir: librariesDir, skipped: skippedLibraryModules } =
    materializeVendoredLibraries({
      cwd,
      matched: matchedLibraries
        .filter((m) => m.confirmed.length > 0)
        .map((m) => ({ sourceId: m.library.sourceId, modules: m.confirmed })),
      generatedDir: libraryGeneratedDir,
    });
  ensureLibraryTypesReference(cwd, librariesDir);
  for (const module of skippedLibraryModules) {
    console.warn(`skipping library module ${module}: no generated .d.ts in the vendored corpus`);
  }
  const libraries: ResolvedLibraryReport[] = matchedLibraries.map(
    ({ library, url, confirmed }) => ({
      url,
      source: library.sourceId,
      modules: confirmed,
      provenance: "vendored",
      verified: confirmed.length > 0,
    }),
  );

  const existingPkg = readExistingPackageJson(cwd);
  const pins = readExtensionVersionPins(existingPkg.value);
  const resolvedForSeed: Record<string, string> = {};
  for (const bundle of bundles) {
    if (!(bundle.url in pins)) {
      resolvedForSeed[bundle.url] = bundle.resolvedVersion;
    }
  }
  if (!opts.freeze && Object.keys(resolvedForSeed).length > 0 && existingPkg.writable) {
    seedExtensionPins(cwd, existingPkg.value, resolvedForSeed);
  }

  const extensions: ResolvedExtensionReport[] = bundles.map((bundle) => {
    const pin = pins[bundle.url];
    const pinStatus: "unpinned" | "match" | "drift" =
      pin === undefined ? "unpinned" : pin === bundle.resolvedVersion ? "match" : "drift";
    const report: {
      url: string;
      provenance: ExtensionArchiveProvenance;
      namespaces: string[];
      scriptApiCount: number;
      assetOnly: boolean;
      resolvedVersion: string;
      pinnedVersion?: string;
      pinStatus: "unpinned" | "match" | "drift";
    } = {
      url: bundle.url,
      provenance: bundle.provenance,
      namespaces: bundle.declarations.map((d) => d.namespace).sort(),
      scriptApiCount: bundle.declarations.length,
      assetOnly: bundle.assetOnly,
      resolvedVersion: bundle.resolvedVersion,
      pinStatus,
    };
    if (pin !== undefined) {
      report.pinnedVersion = pin;
    }
    return report;
  });

  return { ok: true, materializedSurface: materializedDir, extensions, libraries };
}

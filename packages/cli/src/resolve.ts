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
import { type ExtensionDeclarations, resolveExtensionDeclarations } from "./extension-declarations";
import { readExtensionDependencies } from "./extension-deps";
import {
  ensureExtensionTypesReference,
  materializeExtensionDeclarations,
} from "./extension-materialize";
import { mergeResolvedVersionPins, readExtensionVersionPins } from "./extension-version";
import { formatJsonLikeBiome } from "./format-json";
import { matchVendoredLibrary, normalizeSourceId, type VendoredLibrary } from "./library-match";
import { ensureLibraryTypesReference, materializeVendoredLibraries } from "./library-materialize";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  type VendoredNativeExtension,
} from "./library-registry";
import { materializeLibrarySceneSources } from "./library-scene-materialize";

// Which type surface a dependency actually contributed. `assetOnly` cannot
// express this on its own: a superseded bundle is `assetOnly: false` and still
// contributes no namespace, and an asset-only archive with no confirmed match
// contributes neither surface, so calling it an extension would claim
// declarations it does not have. `vendored-native` is a native extension whose
// curated declaration replaced whatever its archive would have emitted.
export type ResolvedTypeSurface = "none" | "extension" | "vendored-library" | "vendored-native";

export interface ResolvedExtensionReport {
  readonly url: string;
  readonly provenance: ExtensionArchiveProvenance;
  readonly namespaces: string[];
  readonly typeSurface: ResolvedTypeSurface;
  readonly scriptApiCount: number;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  readonly pinnedVersion?: string;
  readonly pinStatus: "unpinned" | "match" | "drift";
  // How many scene sources this dependency shares into the address universe.
  readonly sceneSources: number;
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
  // The curated native-extension targets. Defaults to the installed
  // `@defold-typescript/library-types` `native-targets.json`.
  readonly nativeRegistry?: readonly VendoredNativeExtension[];
}

export interface RunResolveResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly materializedSurface: string | null;
  readonly extensions: ResolvedExtensionReport[];
  readonly libraries: ResolvedLibraryReport[];
  readonly warnings: readonly string[];
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

// A native target is confirmed only when the archive both matches its source id
// and ships `<manifestDir>/ext.manifest`: a source-id collision alone is not a
// match. The confirmed bundle's declarations become the curated file, so the
// barrel, prune and dedup paths downstream stay untouched and any `.script_api`
// the archive ships is never written beside it.
function applyNativeTargets(
  bundles: readonly ExtensionDeclarations[],
  registry: readonly VendoredNativeExtension[],
  superseded: ReadonlySet<string>,
): { bundles: ExtensionDeclarations[]; confirmedUrls: Set<string> } {
  const confirmedUrls = new Set<string>();
  const applied = bundles.map((bundle) => {
    if (superseded.has(bundle.url)) {
      return bundle;
    }
    const sourceId = normalizeSourceId(bundle.url);
    const target = registry.find(
      (entry) => entry.sourceId === sourceId && bundle.manifestDirs.includes(entry.manifestDir),
    );
    if (target === undefined || !existsSync(target.declarationPath)) {
      return bundle;
    }
    confirmedUrls.add(bundle.url);
    return {
      ...bundle,
      declarations: [
        {
          namespace: target.namespace,
          contents: readFileSync(target.declarationPath, "utf8"),
          dropped: [],
        },
      ],
    };
  });
  return { bundles: applied, confirmedUrls };
}

function seedExtensionPins(
  cwd: string,
  existing: unknown,
  resolved: Record<string, string>,
  liveUrls: Iterable<string>,
): void {
  const merged = mergeResolvedVersionPins(existing, resolved, liveUrls);
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
      warnings: [],
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
      warnings: [],
    };
  }

  const deps = readExtensionDependencies(text);
  if (deps.length === 0) {
    // No declared dependencies means no library, extension or scene surface, so
    // reconcile all three to zero — prune a previously-materialized one and drop
    // its tsconfig entry.
    const { materializedDir: librariesDir } = materializeVendoredLibraries({
      cwd,
      matched: [],
      generatedDir: null,
    });
    ensureLibraryTypesReference(cwd, librariesDir);
    const { materializedDir: extensionsDir } = materializeExtensionDeclarations({
      cwd,
      bundles: [],
    });
    ensureExtensionTypesReference(cwd, extensionsDir);
    materializeLibrarySceneSources({ cwd, bundles: [] });
    return { ok: true, materializedSurface: null, extensions: [], libraries: [], warnings: [] };
  }

  const resolvedBundles = await resolveExtensionDeclarations(deps, {
    cacheDir: opts.cacheDir ?? extensionCacheDir(),
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
  });

  // Match every dependency against the vendored pure-Lua corpus *before* the
  // extension surface is materialized, so a confirmed match can decide which
  // type surface the dependency contributes. A confirmed match already proves
  // more than a `.script_api` does — it keys on a normalized source identity and
  // is then filtered to the modules the archive actually ships — so a library
  // that documents itself keeps its curated types. The registry is loaded at
  // most once, only when a default is needed.
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
  const confirmedLibraryUrls = new Set<string>();
  for (const bundle of resolvedBundles) {
    const library = matchVendoredLibrary(bundle.url, libraryRegistry);
    if (library === null) {
      continue;
    }
    const shipped = new Set(bundle.luaModules);
    const confirmed = library.modules.filter((module) => shipped.has(module));
    if (confirmed.length > 0) {
      confirmedLibraryUrls.add(bundle.url);
    } else if (!bundle.assetOnly) {
      // unconfirmed-needs-no-surface: the bundle already contributed its own
      // `.script_api` namespace, so a bare repo-name collision with the corpus is
      // not a library the user is missing. Reporting it would fire the
      // "not materialized" warning at someone whose types are fine.
      continue;
    }
    matchedLibraries.push({ library, url: bundle.url, confirmed });
  }

  // A confirmed library already superseded its bundle, so it is not a native
  // candidate.
  const { bundles, confirmedUrls: confirmedNativeUrls } = applyNativeTargets(
    resolvedBundles,
    opts.nativeRegistry ?? loadVendoredNativeRegistry(),
    confirmedLibraryUrls,
  );
  // `scriptApiCount` reports the archive's own docs, which the curated
  // replacement does not change.
  const scriptApiCounts = new Map(resolvedBundles.map((b) => [b.url, b.declarations.length]));

  // Only the *type* surface is filtered: a superseded bundle stays a declared
  // dependency below, so its scene sources still unpack and its version and pin
  // status still report.
  const { materializedDir } = materializeExtensionDeclarations({
    cwd,
    bundles: bundles.filter((bundle) => !confirmedLibraryUrls.has(bundle.url)),
  });
  ensureExtensionTypesReference(cwd, materializedDir);

  // The dependency scene surface the editor plugin, `scene-types` and `build`
  // all read: unpacked here because the archive seam cannot run inside tsserver.
  const { counts: sceneSourceCounts } = materializeLibrarySceneSources({ cwd, bundles });
  const warnings: string[] = [];
  for (const bundle of bundles) {
    for (const reason of bundle.sceneReasons) {
      warnings.push(`no scene source from ${bundle.url}: ${reason}`);
    }
    for (const entry of bundle.sceneRefused) {
      warnings.push(`refusing unsafe scene path from ${bundle.url}: ${entry}`);
    }
  }

  const { materializedDir: librariesDir, skipped: skippedLibraryModules } =
    materializeVendoredLibraries({
      cwd,
      matched: matchedLibraries
        .filter((m) => m.confirmed.length > 0)
        .map((m) => ({
          sourceId: m.library.sourceId,
          modules: m.confirmed,
          ...(m.library.generatedStems ? { generatedStems: m.library.generatedStems } : {}),
        })),
      generatedDir: libraryGeneratedDir,
    });
  ensureLibraryTypesReference(cwd, librariesDir);
  for (const module of skippedLibraryModules) {
    warnings.push(`skipping library module ${module}: no generated .d.ts in the vendored corpus`);
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
  const liveUrls = bundles.map((b) => b.url);
  const resolvedForSeed: Record<string, string> = {};
  for (const bundle of bundles) {
    if (!(bundle.url in pins)) {
      resolvedForSeed[bundle.url] = bundle.resolvedVersion;
    }
  }
  const orphaned = Object.keys(pins).some((u) => !liveUrls.includes(u));
  if (
    !opts.freeze &&
    existingPkg.writable &&
    (Object.keys(resolvedForSeed).length > 0 || orphaned)
  ) {
    seedExtensionPins(cwd, existingPkg.value, resolvedForSeed, liveUrls);
  }

  const extensions: ResolvedExtensionReport[] = bundles.map((bundle) => {
    const supersededByLibrary = confirmedLibraryUrls.has(bundle.url);
    const pin = pins[bundle.url];
    const pinStatus: "unpinned" | "match" | "drift" =
      pin === undefined ? "unpinned" : pin === bundle.resolvedVersion ? "match" : "drift";
    // A superseded bundle contributed no namespace, so reporting the ones its
    // `.script_api` would have produced would double-count its modules against
    // `libraries[]`. `scriptApiCount` stays the real archive count.
    const namespaces = supersededByLibrary
      ? []
      : bundle.declarations.map((d) => d.namespace).sort();
    const report: {
      url: string;
      provenance: ExtensionArchiveProvenance;
      namespaces: string[];
      typeSurface: ResolvedTypeSurface;
      scriptApiCount: number;
      assetOnly: boolean;
      resolvedVersion: string;
      pinnedVersion?: string;
      pinStatus: "unpinned" | "match" | "drift";
      sceneSources: number;
    } = {
      url: bundle.url,
      provenance: bundle.provenance,
      namespaces,
      typeSurface: supersededByLibrary
        ? "vendored-library"
        : confirmedNativeUrls.has(bundle.url)
          ? "vendored-native"
          : namespaces.length > 0
            ? "extension"
            : "none",
      scriptApiCount: scriptApiCounts.get(bundle.url) ?? 0,
      assetOnly: bundle.assetOnly,
      resolvedVersion: bundle.resolvedVersion,
      pinStatus,
      sceneSources: sceneSourceCounts.get(bundle.url) ?? 0,
    };
    if (pin !== undefined) {
      report.pinnedVersion = pin;
    }
    return report;
  });

  return { ok: true, materializedSurface: materializedDir, extensions, libraries, warnings };
}

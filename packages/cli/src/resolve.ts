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
import { join, posix } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import {
  type DownloadExtensionArchive,
  defaultReadZip,
  type ExtensionArchiveProvenance,
  extensionCacheDir,
  type ReadExtensionZip,
} from "./extension-archive";
import { type ExtensionDeclarations, resolveExtensionDeclarations } from "./extension-declarations";
import { readExtensionDependencies } from "./extension-deps";
import {
  ensureExtensionTypesReference,
  materializeExtensionDeclarations,
  type SharedExtensionNamespace,
} from "./extension-materialize";
import {
  isRetiredPin,
  mergeResolvedVersionPins,
  readExtensionVersionPins,
} from "./extension-version";
import { formatJsonLikeBiome } from "./format-json";
import { printLibraryModules } from "./library/print-library";
import { archiveSourceTree } from "./library/source-tree";
import { matchVendoredLibrary, normalizeSourceId, type VendoredLibrary } from "./library-match";
import {
  ensureLibraryTypesReference,
  materializeVendoredLibraries,
  type PrintedLibrary,
} from "./library-materialize";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  resolveLibraryTypesPackageRoot,
  type VendoredNativeExtension,
} from "./library-registry";
import { materializeLibrarySceneSources } from "./library-scene-materialize";
import { checkShippedDeclarations } from "./shipped-declarations";

// Which type surface a dependency actually contributed. `assetOnly` cannot
// express this on its own: a superseded bundle is `assetOnly: false` and still
// contributes no namespace, and an asset-only archive with no confirmed match
// contributes neither surface, so calling it an extension would claim
// declarations it does not have. `vendored-native` is a native extension whose
// curated declaration replaced whatever its archive would have emitted, and
// `shipped` is a dependency whose own `types/*.d.ts` replaced every other
// surface, curated ones included.
export type ResolvedTypeSurface =
  | "none"
  | "extension"
  | "vendored-library"
  | "vendored-native"
  | "shipped";

// `retired` is a pin in the zip-byte form, which a plain run replaces and
// `--frozen` refuses, whatever the archive now holds.
export type PinStatus = "unpinned" | "match" | "drift" | "retired";

export interface ResolvedExtensionReport {
  readonly url: string;
  readonly provenance: ExtensionArchiveProvenance;
  readonly namespaces: string[];
  readonly typeSurface: ResolvedTypeSurface;
  readonly scriptApiCount: number;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  readonly pinnedVersion?: string;
  readonly pinStatus: PinStatus;
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
  // The library data dependencies are matched against and printed from. Both
  // default to the installed `@defold-typescript/library-types`; tests inject a
  // synthetic registry and root to stay hermetic, and a `null` root prints
  // nothing and keeps a surface already there.
  readonly libraryRegistry?: readonly VendoredLibrary[];
  readonly libraryTypesRoot?: string | null;
  // The curated native-extension targets. Defaults to the installed
  // `@defold-typescript/library-types` `native-targets.json`.
  readonly nativeRegistry?: readonly VendoredNativeExtension[];
  // The `@defold-typescript/types` root shipped declarations are checked
  // against. Defaults to the installed package; `null` installs them unchecked.
  readonly typesRoot?: string | null;
}

export interface RunResolveResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly materializedSurface: string | null;
  readonly extensions: ResolvedExtensionReport[];
  readonly libraries: ResolvedLibraryReport[];
  // Namespaces several declarations share, each written to its own file so
  // TypeScript merges them; empty when every namespace has one source.
  readonly sharedNamespaces: SharedExtensionNamespace[];
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

// A dependency's own `types/*.d.ts` replace whatever else it would contribute,
// once they compile against the engine surface: an accepted bundle keeps its
// `shipped` files and drops its other declarations. A rejected bundle drops its
// `shipped` files instead, so it contributes exactly what it would with no
// `types/` folder. Each dependency checks in its own program, so its verdict
// depends on its own files and the engine surface alone.
function applyShippedDeclarations(
  bundles: readonly ExtensionDeclarations[],
  typesRoot: string | null,
): { bundles: ExtensionDeclarations[]; shippedUrls: Set<string>; warnings: string[] } {
  const shippedUrls = new Set<string>();
  const warnings: string[] = [];
  const applied = bundles.map((bundle) => {
    if (bundle.shipped.length === 0) {
      return bundle;
    }
    if (typesRoot === null) {
      warnings.push(
        `shipped types from ${bundle.url} installed but not checked: @defold-typescript/types could not be found`,
      );
    } else {
      const checked = checkShippedDeclarations(bundle.shipped, typesRoot);
      const messages = bundle.shipped.flatMap(({ entry }) => checked.get(entry) ?? []);
      if (messages.length > 0) {
        const more = messages.length > 1 ? ` (+${messages.length - 1} more)` : "";
        warnings.push(
          `shipped types from ${bundle.url} do not compile against @defold-typescript/types; using what the archive declares otherwise: ${messages[0]}${more}`,
        );
        return { ...bundle, shipped: [] };
      }
    }
    shippedUrls.add(bundle.url);
    return { ...bundle, declarations: [] };
  });
  return { bundles: applied, shippedUrls, warnings };
}

function seedExtensionPins(
  cwd: string,
  existing: unknown,
  resolved: Record<string, string>,
  liveUrls: Iterable<string>,
  retiredUrls: Iterable<string>,
): void {
  const merged = mergeResolvedVersionPins(existing, resolved, liveUrls, retiredUrls);
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
      sharedNamespaces: [],
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
      sharedNamespaces: [],
      warnings: [],
    };
  }

  const deps = readExtensionDependencies(text);
  if (deps.length === 0) {
    // No declared dependencies means no library, extension or scene surface, so
    // reconcile all three to zero — prune a previously-materialized one and drop
    // its tsconfig entry.
    const { materializedDir: librariesDir } = materializeVendoredLibraries({ cwd, printed: [] });
    ensureLibraryTypesReference(cwd, librariesDir);
    const { materializedDir: extensionsDir } = materializeExtensionDeclarations({
      cwd,
      bundles: [],
    });
    ensureExtensionTypesReference(cwd, extensionsDir);
    materializeLibrarySceneSources({ cwd, bundles: [] });
    return {
      ok: true,
      materializedSurface: null,
      extensions: [],
      libraries: [],
      sharedNamespaces: [],
      warnings: [],
    };
  }

  const resolvedBundles = await resolveExtensionDeclarations(deps, {
    cacheDir: opts.cacheDir ?? extensionCacheDir(),
    projectDir: cwd,
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
  });

  // Shipped declarations outrank every curated surface: the library's author
  // keeps them in step with the library, where a curated copy is pinned here.
  const {
    bundles: shippedBundles,
    shippedUrls,
    warnings: shippedWarnings,
  } = applyShippedDeclarations(
    resolvedBundles,
    opts.typesRoot !== undefined ? opts.typesRoot : resolveTypesPackageRoot(),
  );

  // Match every dependency against the vendored pure-Lua corpus *before* the
  // extension surface is materialized, so a confirmed match can decide which
  // type surface the dependency contributes. A confirmed match already proves
  // more than a `.script_api` does — it keys on a normalized source identity and
  // is then filtered to the modules the archive actually ships — so a library
  // that documents itself keeps its curated types. The registry is loaded at
  // most once, only when a default is needed.
  const libraryTypesRoot =
    opts.libraryTypesRoot !== undefined ? opts.libraryTypesRoot : resolveLibraryTypesPackageRoot();
  const libraryRegistry =
    opts.libraryRegistry ?? loadVendoredLibraryRegistry(libraryTypesRoot).registry;
  const matchedLibraries: { library: VendoredLibrary; url: string; confirmed: string[] }[] = [];
  const confirmedLibraryUrls = new Set<string>();
  for (const bundle of resolvedBundles) {
    if (shippedUrls.has(bundle.url)) {
      continue;
    }
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

  // A confirmed library or a shipped surface already superseded its bundle, so
  // it is not a native candidate.
  const { bundles, confirmedUrls: confirmedNativeUrls } = applyNativeTargets(
    shippedBundles,
    opts.nativeRegistry ?? loadVendoredNativeRegistry(),
    new Set([...confirmedLibraryUrls, ...shippedUrls]),
  );
  // `scriptApiCount` reports the archive's own docs, which a curated or shipped
  // replacement does not change.
  const scriptApiCounts = new Map(resolvedBundles.map((b) => [b.url, b.declarations.length]));

  // Only the *type* surface is filtered: a superseded bundle stays a declared
  // dependency below, so its scene sources still unpack and its version and pin
  // status still report.
  const { materializedDir, sharedNamespaces } = materializeExtensionDeclarations({
    cwd,
    bundles: bundles.filter((bundle) => !confirmedLibraryUrls.has(bundle.url)),
  });
  ensureExtensionTypesReference(cwd, materializedDir);

  // The dependency scene surface the editor plugin, `scene-types` and `build`
  // all read: unpacked here because the archive seam cannot run inside tsserver.
  const { counts: sceneSourceCounts } = materializeLibrarySceneSources({ cwd, bundles });
  const warnings: string[] = [...shippedWarnings];
  for (const bundle of bundles) {
    if (bundle.warning !== undefined) {
      warnings.push(bundle.warning);
    }
    for (const reason of bundle.sceneReasons) {
      warnings.push(`no scene source from ${bundle.url}: ${reason}`);
    }
    for (const entry of bundle.sceneRefused) {
      warnings.push(`refusing unsafe scene path from ${bundle.url}: ${entry}`);
    }
  }

  // Each confirmed library prints from the archive the project depends on, so its
  // types follow the version the game ships rather than the one library data pins.
  let printedLibraries: PrintedLibrary[] | null = null;
  if (libraryTypesRoot !== null) {
    printedLibraries = [];
    const archivePaths = new Map(resolvedBundles.map((b) => [b.url, b.archivePath]));
    const open = opts.readZip ?? defaultReadZip;
    const seen = new Set<string>();
    for (const { url, confirmed } of matchedLibraries) {
      const modules = confirmed.filter((module) => !seen.has(module));
      const archivePath = archivePaths.get(url);
      if (modules.length === 0 || archivePath === undefined) {
        continue;
      }
      const archive = archiveSourceTree(await open(archivePath));
      const { printed, unprintable } = await printLibraryModules(
        libraryTypesRoot,
        modules,
        archive,
      );
      for (const { module, contents, ref, reason } of printed) {
        seen.add(module);
        printedLibraries.push({ module, contents });
        if (reason !== undefined) {
          warnings.push(
            `printed ${module} from the ${ref} sources pinned in library data, not from ${url}: ${reason}`,
          );
        }
      }
      for (const module of unprintable) {
        warnings.push(`skipping library module ${module}: no library data prints it`);
      }
    }
  }
  const { materializedDir: librariesDir } = materializeVendoredLibraries({
    cwd,
    printed: printedLibraries,
  });
  ensureLibraryTypesReference(cwd, librariesDir);
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
  const retiredUrls = bundles
    .filter((bundle) => {
      const pin = pins[bundle.url];
      return pin !== undefined && isRetiredPin(pin);
    })
    .map((bundle) => bundle.url);
  const resolvedForSeed: Record<string, string> = {};
  for (const bundle of bundles) {
    if (!(bundle.url in pins) || retiredUrls.includes(bundle.url)) {
      resolvedForSeed[bundle.url] = bundle.resolvedVersion;
    }
  }
  const orphaned = Object.keys(pins).some((u) => !liveUrls.includes(u));
  if (
    !opts.freeze &&
    existingPkg.writable &&
    (Object.keys(resolvedForSeed).length > 0 || orphaned)
  ) {
    seedExtensionPins(cwd, existingPkg.value, resolvedForSeed, liveUrls, retiredUrls);
  }

  const extensions: ResolvedExtensionReport[] = bundles.map((bundle) => {
    const supersededByLibrary = confirmedLibraryUrls.has(bundle.url);
    const pin = pins[bundle.url];
    const pinStatus: PinStatus =
      pin === undefined
        ? "unpinned"
        : isRetiredPin(pin)
          ? "retired"
          : pin === bundle.resolvedVersion
            ? "match"
            : "drift";
    // A superseded bundle contributed no namespace, so reporting the ones its
    // `.script_api` would have produced would double-count its modules against
    // `libraries[]`. `scriptApiCount` stays the real archive count.
    const namespaces = supersededByLibrary
      ? []
      : shippedUrls.has(bundle.url)
        ? bundle.shipped.map(({ entry }) => posix.basename(entry, ".d.ts")).sort()
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
      pinStatus: PinStatus;
      sceneSources: number;
    } = {
      url: bundle.url,
      provenance: bundle.provenance,
      namespaces,
      typeSurface: shippedUrls.has(bundle.url)
        ? "shipped"
        : supersededByLibrary
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

  return {
    ok: true,
    materializedSurface: materializedDir,
    extensions,
    libraries,
    sharedNamespaces,
    warnings,
  };
}

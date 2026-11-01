// The user-facing orchestration slice of the `[dependencies]`-driven extension
// typing pipeline. `runResolve` joins the five prior pure slices end to end:
// `readExtensionDependencies` (game.project -> URLs), `resolveExtensionDeclarations`
// (download/cache each archive -> one emitted bundle per dependency),
// `materializeExtensionDeclarations` (write the bundles into
// `.defold-types/extensions/`), and `ensureExtensionTypesReference` (point tsconfig
// at the sibling surface). The CLI `resolve` verb in dispatch.ts drives this; the
// download/readZip/cacheDir seams stay injectable so the orchestration is
// network-free under test.

import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import { readCliVersion } from "./cli-version";
import { DEFOLD_DEPENDENCIES_MANIFEST, DEFOLD_LIBRARY_DIR } from "./defold-library-cache";
import {
  DefoldCopyRefused,
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
import { archiveVersion, mergeResolvedVersionPins, sameArchive } from "./extension-version";
import { printLibraryModules } from "./library/print-library";
import { archiveSourceTree } from "./library/source-tree";
import { LIBRARY_DATA_MAIN_URL, libraryDataCacheDir } from "./library-data-archive";
import {
  frozenLibraryData,
  type LibraryDataUpdate,
  selectLibraryPins,
  wantsUpdate,
} from "./library-data-pins";
import { matchVendoredLibrary, normalizeSourceId, type VendoredLibrary } from "./library-match";
import {
  ensureLibraryTypesReference,
  materializeVendoredLibraries,
  type PrintedLibrary,
} from "./library-materialize";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  type VendoredNativeExtension,
} from "./library-registry";
import { materializeLibrarySceneSources } from "./library-scene-materialize";
import {
  type LibraryDataPins,
  PROJECT_LOCK_FILE,
  type ProjectLock,
  readProjectLock,
  writeProjectLock,
} from "./project-lock";
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

export type PinStatus = "unpinned" | "match" | "drift";

export interface ResolvedExtensionReport {
  readonly url: string;
  readonly provenance: ExtensionArchiveProvenance;
  readonly namespaces: string[];
  readonly typeSurface: ResolvedTypeSurface;
  readonly scriptApiCount: number;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  readonly resolvedFiles: string;
  readonly pinnedVersion?: string;
  readonly pinnedFiles?: string;
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
  // When true, skip writing the lockfile, and fail when it cannot answer for a
  // declared dependency, or when Defold has fetched libraries and its folder does
  // not hold what the build reads. Used by `--frozen` to verify the committed records.
  readonly freeze?: boolean;
  // Moves library data pins to newer data and accepts extension drift, which a plain
  // run holds back from: everything for `true`, those dependencies alone for names.
  readonly update?: LibraryDataUpdate;
  // The library data dependencies are matched against and printed from. Both
  // default to the data repo's archive; tests inject a synthetic registry and
  // data folder to stay hermetic, and a `null` folder prints nothing and keeps a
  // surface already there.
  readonly libraryRegistry?: readonly VendoredLibrary[];
  readonly libraryDataDir?: string | null;
  // The data repo's `main.zip`, fetched for the library data when `libraryDataDir`
  // is unset, with the commits it resolves to pinned in the lockfile. Defaults to
  // `LIBRARY_DATA_MAIN_URL`.
  readonly libraryDataUrl?: string;
  // The curated native-extension targets. Defaults to the native extensions the
  // library data folder holds.
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
  // Advice about the library data pins, which needs no action to stay correct.
  readonly notices?: readonly string[];
}

function hasProjectSection(text: string): boolean {
  return text.split("\n").some((line) => line.trim() === "[project]");
}

function failedResolve(error: string): RunResolveResult {
  return {
    ok: false,
    error,
    materializedSurface: null,
    extensions: [],
    libraries: [],
    sharedNamespaces: [],
    warnings: [],
  };
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

interface SelectedLibraryData {
  readonly dir: string | null;
  // Absent when nothing is recorded, so a lockfile with no pins stays that way.
  readonly pins?: LibraryDataPins;
  readonly notices: readonly string[];
  readonly warning?: string;
  readonly error?: string;
}

async function selectLibraryData(
  opts: RunResolveOptions,
  urls: readonly string[],
  lock: ProjectLock | undefined,
): Promise<SelectedLibraryData> {
  const recorded = lock?.libraryData ?? null;
  const held = recorded === null ? {} : { pins: recorded };
  if (opts.libraryDataDir !== undefined) {
    return { dir: opts.libraryDataDir, notices: [], ...held };
  }
  const source = {
    mainUrl: opts.libraryDataUrl ?? LIBRARY_DATA_MAIN_URL,
    cacheDir:
      opts.cacheDir === undefined ? libraryDataCacheDir() : join(opts.cacheDir, "library-data"),
    cliVersion: readCliVersion(),
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
  };
  if (opts.freeze === true) {
    const frozen = await frozenLibraryData(source, recorded, urls);
    return { ...frozen, notices: [], ...held };
  }
  const { dir, pins, notices, warning } = await selectLibraryPins({
    ...source,
    urls,
    knownUrls: Object.keys(lock?.extensions ?? {}),
    pins: recorded,
    ...(opts.update === undefined ? {} : { update: opts.update }),
  });
  return {
    dir,
    notices,
    ...(pins === null ? {} : { pins }),
    ...(warning === undefined ? {} : { warning }),
  };
}

// Why `--update=<names>` cannot run, or null when it can. A project this cannot read
// is `runResolve`'s to report.
export function unknownUpdateNames(
  cwd: string,
  update: LibraryDataUpdate | undefined,
): string | null {
  const gameProjectPath = join(cwd, "game.project");
  if (update === undefined || update === true || !existsSync(gameProjectPath)) {
    return null;
  }
  const declared = readExtensionDependencies(readFileSync(gameProjectPath, "utf8")).map(({ url }) =>
    normalizeSourceId(url),
  );
  const unknown = update.filter((name) => !declared.includes(name));
  if (unknown.length === 0) {
    return null;
  }
  const names = declared.length === 0 ? "none" : declared.join(", ");
  return `defold-typescript resolve: --update names no dependency called ${unknown.join(", ")}; declared: ${names}`;
}

// What a drifted pin differs by. The two version strings are equal only when both
// name one commit, so what moved is the files under it.
export function describePinDrift({
  pinnedVersion,
  resolvedVersion,
}: Pick<ResolvedExtensionReport, "pinnedVersion" | "resolvedVersion">): string {
  return pinnedVersion === resolvedVersion
    ? `files changed under ${pinnedVersion}`
    : `${pinnedVersion ?? "(none)"} -> ${resolvedVersion}`;
}

export async function runResolve(opts: RunResolveOptions): Promise<RunResolveResult> {
  const { cwd } = opts;
  const gameProjectPath = join(cwd, "game.project");
  if (!existsSync(gameProjectPath)) {
    return failedResolve(`no game.project found in ${cwd}`);
  }

  const text = readFileSync(gameProjectPath, "utf8");
  if (!hasProjectSection(text)) {
    return failedResolve("game.project has no [project] section");
  }

  // Read ahead of every write, so a lockfile a merge left broken stops the run
  // before anything it would have kept in step has moved.
  const lockRead = readProjectLock(cwd);
  if (lockRead.status === "invalid") {
    return failedResolve(lockRead.reason);
  }
  const lock = lockRead.status === "ok" ? lockRead.lock : undefined;
  const pins = lock?.extensions ?? {};

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

  if (opts.freeze === true) {
    const plainRun = "run a plain `defold-typescript resolve` and commit the file";
    if (lock === undefined) {
      return failedResolve(`--frozen needs ${PROJECT_LOCK_FILE}: ${plainRun}`);
    }
    const unpinned = deps.map(({ url }) => url).filter((url) => pins[url] === undefined);
    if (unpinned.length > 0) {
      return failedResolve(
        `${PROJECT_LOCK_FILE} has no pin for ${unpinned.join(", ")}: ${plainRun}`,
      );
    }
  }

  const libraryData = await selectLibraryData(
    opts,
    deps.map(({ url }) => url),
    lock,
  );
  if (libraryData.error !== undefined) {
    return failedResolve(libraryData.error);
  }
  const libraryDataDir = libraryData.dir;
  let resolvedBundles: ExtensionDeclarations[];
  try {
    resolvedBundles = await resolveExtensionDeclarations(deps, {
      cacheDir: opts.cacheDir ?? extensionCacheDir(),
      projectDir: cwd,
      requireDefoldCopy:
        opts.freeze === true && existsSync(join(cwd, DEFOLD_DEPENDENCIES_MANIFEST)),
      libraryDataDir,
      ...(opts.download ? { download: opts.download } : {}),
      ...(opts.readZip ? { readZip: opts.readZip } : {}),
    });
  } catch (err) {
    if (err instanceof DefoldCopyRefused) {
      return failedResolve(
        `--frozen reads the archives the build will: ${err.message}; delete ${DEFOLD_LIBRARY_DIR} and run \`defold-typescript bob resolve\``,
      );
    }
    throw err;
  }

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
  const libraryRegistry = opts.libraryRegistry ?? loadVendoredLibraryRegistry(libraryDataDir);
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
    opts.nativeRegistry ?? loadVendoredNativeRegistry(libraryDataDir),
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
  const warnings: string[] = [
    ...(libraryData.warning === undefined ? [] : [libraryData.warning]),
    ...shippedWarnings,
  ];
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

  // `--update` accepts what it fetched for a dependency it covers, so that pin stops
  // reporting drift.
  const acceptedPins = Object.fromEntries(
    bundles
      .filter(
        ({ url }) => pins[url] !== undefined && wantsUpdate(opts.update, normalizeSourceId(url)),
      )
      .map(({ url, identity }) => [url, identity]),
  );
  const heldPins = { ...pins, ...acceptedPins };

  // Each confirmed library prints from the archive the project depends on, so its
  // types follow the version the game ships rather than the one library data pins.
  let printedLibraries: PrintedLibrary[] | null = null;
  if (libraryDataDir !== null) {
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
      const { printed, unprintable } = await printLibraryModules(libraryDataDir, modules, archive);
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

  if (opts.freeze !== true) {
    writeProjectLock(cwd, {
      extensions: mergeResolvedVersionPins(
        heldPins,
        Object.fromEntries(bundles.map((bundle) => [bundle.url, bundle.identity])),
      ),
      ...(libraryData.pins === undefined ? {} : { libraryData: libraryData.pins }),
    });
  }

  const extensions: ResolvedExtensionReport[] = bundles.map((bundle) => {
    const supersededByLibrary = confirmedLibraryUrls.has(bundle.url);
    const pin = heldPins[bundle.url];
    const pinStatus: PinStatus =
      pin === undefined ? "unpinned" : sameArchive(pin, bundle.identity) ? "match" : "drift";
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
      resolvedFiles: string;
      pinnedVersion?: string;
      pinnedFiles?: string;
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
      resolvedVersion: archiveVersion(bundle.identity),
      resolvedFiles: bundle.identity.files,
      pinStatus,
      sceneSources: sceneSourceCounts.get(bundle.url) ?? 0,
    };
    if (pin !== undefined) {
      report.pinnedVersion = archiveVersion(pin);
      report.pinnedFiles = pin.files;
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
    ...(libraryData.notices.length > 0 ? { notices: libraryData.notices } : {}),
  };
}

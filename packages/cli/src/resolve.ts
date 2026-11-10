// The user-facing orchestration slice of the `[dependencies]`-driven extension
// typing pipeline. `runResolve` joins the five prior pure slices end to end:
// `readExtensionDependencies` (game.project -> URLs), `resolveExtensionDeclarations`
// (download/cache each archive -> one emitted bundle per dependency),
// `materializeExtensionDeclarations` (write the bundles into
// `.defold-types/extensions/`), and `ensureExtensionTypesReference` (point tsconfig
// at the sibling surface). The CLI `resolve` verb in dispatch.ts drives this; the
// download/readZip/cacheDir seams stay injectable so the orchestration is
// network-free under test.

import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, posix, resolve } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import { readCliVersion } from "./cli-version";
import { DEFOLD_DEPENDENCIES_MANIFEST, DEFOLD_LIBRARY_DIR } from "./defold-library-cache";
import {
  classifyDependencyUrl,
  commitUrlFor,
  type DependencyUrlKind,
  rewriteGameProjectDependency,
} from "./dependency-url";
import {
  cachedOrDownloaded,
  DefoldCopyRefused,
  type DownloadExtensionArchive,
  defaultReadZip,
  type ExtensionArchiveProvenance,
  extensionCacheDir,
  fetchExtensionArchive,
  type ReadExtensionZip,
} from "./extension-archive";
import { type ExtensionDeclarations, resolveExtensionDeclarations } from "./extension-declarations";
import { type ExtensionDependency, readExtensionDependencies } from "./extension-deps";
import {
  ensureExtensionTypesReference,
  materializeExtensionDeclarations,
  type SharedExtensionNamespace,
} from "./extension-materialize";
import {
  type ArchiveIdentity,
  archiveVersion,
  COMMIT_COMMENT,
  type ExtensionPin,
  mergeResolvedVersionPins,
  sameArchive,
} from "./extension-version";
import { readLibraryReviews } from "./library/library-data";
import { archiveFingerprint } from "./library/library-fingerprint";
import {
  classifyLibraryStatus,
  type LibraryStatus,
  libraryStatusMessages,
  newerFolderCovering,
} from "./library/library-status";
import { printLibraryModules } from "./library/print-library";
import { archiveSourceTree } from "./library/source-tree";
import { LIBRARY_DATA_MAIN_URL, libraryDataCacheDir } from "./library-data-archive";
import {
  frozenLibraryData,
  type LibraryDataFolders,
  type LibraryDataUpdate,
  selectLibraryPins,
  wantsUpdate,
} from "./library-data-pins";
import {
  libraryName,
  matchedLibraryName,
  matchLibraryName,
  matchVendoredLibrary,
  namesSelectedBy,
  type VendoredLibrary,
} from "./library-match";
import {
  ensureLibraryTypesReference,
  materializeVendoredLibraries,
  type PrintedLibrary,
} from "./library-materialize";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  readLibraryDataOrNone,
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

// The guide section a dependency sharing Lua that nothing types is pointed at.
export const UNTYPED_LIBRARY_GUIDE =
  "https://defold-typescript.github.io/toolchain/resolve#a-library-nobody-types";

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
  readonly ref: DependencyUrlKind;
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
  // Set for a `vendored-library` or `vendored-native` surface when the run read
  // library data.
  readonly libraryStatus?: LibraryStatus;
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
  // Rewrites each branch or tag URL in `game.project` to the commit its archive names.
  readonly pinUrls?: boolean;
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
  // The CLI version that picks the data folder and leaves out each library whose
  // `minCli` is above it. Defaults to this CLI's.
  readonly cliVersion?: string;
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
  // Advice about the library data pins, and what moved in `game.project`.
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

// A native target is confirmed only when the archive both matches its library
// name among `names`, every library's, and ships `<manifestDir>/ext.manifest`: a
// name match alone is not a match. The confirmed bundle's declarations become the
// curated file, so the barrel, prune and dedup paths downstream stay untouched and
// any `.script_api` the archive ships is never written beside it.
function applyNativeTargets(
  bundles: readonly ExtensionDeclarations[],
  registry: readonly VendoredNativeExtension[],
  names: readonly string[],
  superseded: ReadonlySet<string>,
): { bundles: ExtensionDeclarations[]; confirmedUrls: Set<string> } {
  const confirmedUrls = new Set<string>();
  const applied = bundles.map((bundle) => {
    if (superseded.has(bundle.url)) {
      return bundle;
    }
    const name = matchedLibraryName(bundle.url, names);
    const target = registry.find(
      (entry) => entry.sourceId === name && bundle.manifestDirs.includes(entry.manifestDir),
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

interface SelectedLibraryData extends LibraryDataFolders {
  readonly dir: string | null;
  // Absent when nothing is recorded, so a lockfile with no pins stays that way.
  readonly pins?: LibraryDataPins;
  // Every library name pin selection matched against; absent when the run reads a
  // data folder whole, whose registry already holds them all.
  readonly candidates?: readonly string[];
  readonly notices: readonly string[];
  readonly warning?: string;
  readonly error?: string;
}

async function selectLibraryData(
  opts: RunResolveOptions,
  cliVersion: string,
  urls: readonly string[],
  lock: ProjectLock | undefined,
): Promise<SelectedLibraryData> {
  const recorded = lock?.libraryData ?? null;
  const held = recorded === null ? {} : { pins: recorded };
  if (opts.libraryDataDir !== undefined) {
    const dir = opts.libraryDataDir;
    const folders =
      dir === null ? {} : { dataRoot: dirname(resolve(dir)), folder: basename(resolve(dir)) };
    return { dir, notices: [], ...held, ...folders };
  }
  const source = {
    mainUrl: opts.libraryDataUrl ?? LIBRARY_DATA_MAIN_URL,
    cacheDir:
      opts.cacheDir === undefined ? libraryDataCacheDir() : join(opts.cacheDir, "library-data"),
    cliVersion,
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
  };
  if (opts.freeze === true) {
    const frozen = await frozenLibraryData(source, recorded, urls);
    return { ...frozen, notices: [], ...held };
  }
  const { dir, pins, candidates, notices, warning, dataRoot, folder } = await selectLibraryPins({
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
    ...(candidates === undefined ? {} : { candidates }),
    ...(warning === undefined ? {} : { warning }),
    ...(dataRoot === undefined ? {} : { dataRoot }),
    ...(folder === undefined ? {} : { folder }),
  };
}

// How each dependency library data types stands against the reviews it records. A
// `.script_api`, shipped or unmatched dependency has no review to stand against.
// Matching against the `names` the matchers used finds the library that typed each
// dependency, including a fork on a host only a library outside the view is on.
async function classifyLibraries(
  bundles: readonly ExtensionDeclarations[],
  confirmedNativeUrls: ReadonlySet<string>,
  printedFrom: ReadonlyMap<string, readonly ("archive" | "pinned")[]>,
  libraryData: SelectedLibraryData,
  names: readonly string[],
  cliVersion: string,
  open: ReadExtensionZip,
): Promise<Map<string, LibraryStatus>> {
  const statuses = new Map<string, LibraryStatus>();
  const { dir, dataRoot, folder } = libraryData;
  if (dir === null) {
    return statuses;
  }
  const typed = bundles.filter(({ url }) => confirmedNativeUrls.has(url) || printedFrom.has(url));
  const libraries = readLibraryDataOrNone(dir, cliVersion);
  for (const { url, archivePath, identity } of typed) {
    const name = matchedLibraryName(url, names);
    const library = libraries.find(({ dir: folder }) => folder === name);
    if (library === undefined) {
      continue;
    }
    const fingerprint = archiveFingerprint(await open(archivePath));
    statuses.set(
      url,
      classifyLibraryStatus({
        reviews: readLibraryReviews(dir, library.dir),
        commit: identity.commit,
        fingerprint,
        printedFrom: confirmedNativeUrls.has(url) ? ["pinned"] : (printedFrom.get(url) ?? []),
        newerFolder:
          dataRoot === undefined || folder === undefined
            ? null
            : newerFolderCovering(dataRoot, folder, library.dir, identity.commit, fingerprint),
      }),
    );
  }
  return statuses;
}

// Once per dependency URL: a fork library data types by its upstream's name, and a
// repo name two libraries share, which types it with neither.
function libraryNameNotices(
  urls: readonly string[],
  names: readonly string[],
  typedUrls: ReadonlySet<string>,
): string[] {
  const notices: string[] = [];
  for (const url of new Set(urls)) {
    const match = matchLibraryName(url, names);
    if (match?.kind === "fork" && typedUrls.has(url)) {
      notices.push(
        `${url} uses the library data of ${match.name}, which shares its repo name; its types may not fit`,
      );
    } else if (match?.kind === "shared") {
      const listed = `${match.names.slice(0, -1).join(", ")} and ${match.names.at(-1)}`;
      notices.push(`${url} shares its repo name with ${listed}, so no library data types it`);
    }
  }
  return notices;
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
  const declared = [
    ...new Set(
      readExtensionDependencies(readFileSync(gameProjectPath, "utf8")).map(({ url }) =>
        libraryName(url),
      ),
    ),
  ];
  const unknown = update.filter((name) => namesSelectedBy(name, declared).length === 0);
  if (unknown.length > 0) {
    const names = declared.length === 0 ? "none" : declared.join(", ");
    return `defold-typescript resolve: --update names no dependency called ${unknown.join(", ")}; declared: ${names}`;
  }
  for (const name of update) {
    const selected = namesSelectedBy(name, declared);
    if (selected.length > 1) {
      return `defold-typescript resolve: --update=${name} names more than one dependency: ${selected.join(", ")}`;
    }
  }
  return null;
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

// A dependency line this run moves to a commit URL, and the ref that commit came from.
// `from` is the URL the run read at `index`.
interface MovedDependency {
  readonly index: number;
  readonly from: string;
  readonly url: string;
  readonly follows: string;
}

// The commit a followed ref names now, or null to hold its dependency: a cached copy
// served because the ref could not be reached says nothing about where the ref is.
async function commitOfFollowedRef(
  ref: string,
  opts: RunResolveOptions,
  warnings: string[],
): Promise<string | null> {
  try {
    const { archivePath, warning } = await cachedOrDownloaded(
      ref,
      opts.cacheDir ?? extensionCacheDir(),
      opts.download ?? fetchExtensionArchive,
    );
    if (warning !== undefined) {
      warnings.push(`${warning}; the dependency following it stays`);
      return null;
    }
    const comment = (await (opts.readZip ?? defaultReadZip)(archivePath)).comment();
    if (COMMIT_COMMENT.test(comment)) {
      return comment;
    }
    warnings.push(`the archive of ${ref} names no commit; the dependency following it stays`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`could not check ${ref}; the dependency following it stays: ${message}`);
  }
  return null;
}

// Ahead of resolving, so a dependency that moves resolves at its new commit.
async function followRefs(
  opts: RunResolveOptions,
  deps: readonly ExtensionDependency[],
  pins: Readonly<Record<string, ExtensionPin>>,
) {
  const followed: ExtensionDependency[] = [];
  const moved: MovedDependency[] = [];
  const notices: string[] = [];
  const warnings: string[] = [];
  for (const dep of deps) {
    let url = dep.url;
    if (classifyDependencyUrl(url) === "commit" && wantsUpdate(opts.update, libraryName(url))) {
      const follows = pins[url]?.follows;
      if (follows === undefined) {
        notices.push(`${url} has no ref to follow, so --update holds it`);
      } else {
        const commit = await commitOfFollowedRef(follows, opts, warnings);
        const next = commit === null ? null : commitUrlFor(follows, commit);
        if (next !== null && next !== url) {
          notices.push(`${follows} moved ${url} to ${next}`);
          moved.push({ index: dep.index, from: url, url: next, follows });
          url = next;
        }
      }
    }
    followed.push({ index: dep.index, url });
  }
  return { deps: followed, moved, notices, warnings };
}

// `follows` is the URL each dependency was resolved under here. A drifted pin stays
// put: moving it would accept the drift, which only `--update` does.
function planUrlPins(
  deps: readonly ExtensionDependency[],
  identities: ReadonlyMap<string, ArchiveIdentity>,
  pins: Readonly<Record<string, ExtensionPin>>,
  update: LibraryDataUpdate | undefined,
) {
  const moved: MovedDependency[] = [];
  const notices: string[] = [];
  const warnings: string[] = [];
  for (const { index, url } of deps) {
    const identity = identities.get(url);
    const kind = classifyDependencyUrl(url);
    if (identity === undefined || kind === "commit") {
      continue;
    }
    if (kind === "release" || kind === "unknown") {
      warnings.push(`--pin-urls left ${url}: only a GitHub branch or tag URL has a commit URL`);
      continue;
    }
    const next = identity.commit === undefined ? null : commitUrlFor(url, identity.commit);
    if (next === null) {
      warnings.push(`--pin-urls left ${url}: its archive names no commit`);
      continue;
    }
    const pin = pins[url];
    if (
      pin !== undefined &&
      !sameArchive(pin, identity) &&
      !wantsUpdate(update, libraryName(url))
    ) {
      warnings.push(`--pin-urls left ${url}: its pin drifted, which --update accepts`);
      continue;
    }
    notices.push(`pinned ${url} to ${next}`);
    moved.push({ index, from: url, url: next, follows: url });
  }
  return { moved, notices, warnings };
}

// Whether every moved index still holds the URL the run read there, and only that.
// Other lines may change freely: a rewrite replaces just these.
function savedDependenciesMatch(text: string, moved: readonly MovedDependency[]): boolean {
  const saved = readExtensionDependencies(text);
  return moved.every(({ index, from }) => {
    const lines = saved.filter((dep) => dep.index === index);
    return lines.length > 0 && lines.every(({ url }) => url === from);
  });
}

// Read again rather than reusing the text the run started from, which a save during
// the run would have outdated. False, with nothing written, when that save deleted the
// file or changed a dependency this run would move.
function moveGameProjectDependencies(path: string, moved: readonly MovedDependency[]): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const saved = readFileSync(path, "utf8");
  if (!savedDependenciesMatch(saved, moved)) {
    return false;
  }
  const text = moved.reduce(
    (current, { index, url }) => rewriteGameProjectDependency(current, index, url),
    saved,
  );
  const stage = `${path}.${process.pid}.partial`;
  writeFileSync(stage, text, { mode: statSync(path).mode });
  try {
    renameSync(stage, path);
  } catch (err) {
    rmSync(stage, { force: true });
    throw err;
  }
  return true;
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

  const followed = await followRefs(opts, deps, pins);
  const cliVersion = opts.cliVersion ?? readCliVersion();
  const libraryData = await selectLibraryData(
    opts,
    cliVersion,
    followed.deps.map(({ url }) => url),
    lock,
  );
  if (libraryData.error !== undefined) {
    return failedResolve(libraryData.error);
  }
  const libraryDataDir = libraryData.dir;
  let fetchedBundles: ExtensionDeclarations[];
  try {
    fetchedBundles = await resolveExtensionDeclarations(followed.deps, {
      cacheDir: opts.cacheDir ?? extensionCacheDir(),
      projectDir: cwd,
      requireDefoldCopy:
        opts.freeze === true && existsSync(join(cwd, DEFOLD_DEPENDENCIES_MANIFEST)),
      libraryDataDir,
      cliVersion,
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

  // Everything below reads a bundle's URL, and the scene surface is keyed by it, so a
  // URL that moves does so here, ahead of the first surface written from it.
  const urlPins =
    opts.pinUrls === true
      ? planUrlPins(
          followed.deps,
          new Map(fetchedBundles.map(({ url, identity }) => [url, identity])),
          pins,
          opts.update,
        )
      : { moved: [], notices: [], warnings: [] };
  const pinnedUrl = new Map(urlPins.moved.map(({ url, follows }) => [follows, url]));
  const resolvedBundles = fetchedBundles.map((bundle) => ({
    ...bundle,
    url: pinnedUrl.get(bundle.url) ?? bundle.url,
  }));
  const moved = [...followed.moved, ...urlPins.moved];
  const followsOf = new Map(moved.map(({ url, follows }) => [url, follows]));

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
  // more than a `.script_api` does — it keys on the library's name and
  // is then filtered to the modules the archive actually ships — so a library
  // that documents itself keeps its curated types. The registry is loaded at
  // most once, only when a default is needed.
  const libraryRegistry =
    opts.libraryRegistry ?? loadVendoredLibraryRegistry(libraryDataDir, cliVersion);
  const nativeRegistry =
    opts.nativeRegistry ?? loadVendoredNativeRegistry(libraryDataDir, cliVersion);
  // Every library's name, so a repo name a Lua library and a native one share
  // matches neither, nor one the used library shares with another the view leaves
  // out.
  const libraryNames = [
    ...new Set([
      ...libraryRegistry.map(({ sourceId }) => sourceId),
      ...nativeRegistry.map(({ sourceId }) => sourceId),
      ...(libraryData.candidates ?? []),
    ]),
  ];
  const matchedLibraries: { library: VendoredLibrary; url: string; confirmed: string[] }[] = [];
  // Keyed by the URL of each bundle a library confirmed, holding the namespaces
  // its confirmed modules are published under: the archive's own docs for those
  // namespaces are the surface the curated types replace.
  const publishedByConfirmedUrl = new Map<string, ReadonlySet<string>>();
  for (const bundle of resolvedBundles) {
    if (shippedUrls.has(bundle.url)) {
      continue;
    }
    const match = matchVendoredLibrary(bundle.url, libraryRegistry, libraryNames);
    if (match === null) {
      continue;
    }
    const { library } = match;
    const shipped = new Set(bundle.luaModules);
    const confirmed = library.modules.filter((module) => shipped.has(module));
    if (confirmed.length > 0) {
      publishedByConfirmedUrl.set(
        bundle.url,
        new Set(confirmed.map((module) => library.namespaces?.[module] ?? module)),
      );
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
    nativeRegistry,
    libraryNames,
    new Set([...publishedByConfirmedUrl.keys(), ...shippedUrls]),
  );
  const nameNotices = libraryNameNotices(
    resolvedBundles.filter(({ url }) => !shippedUrls.has(url)).map(({ url }) => url),
    libraryNames,
    new Set([...publishedByConfirmedUrl.keys(), ...confirmedNativeUrls]),
  );
  // `scriptApiCount` reports the archive's own docs, which a curated or shipped
  // replacement does not change.
  const scriptApiCounts = new Map(resolvedBundles.map((b) => [b.url, b.declarations.length]));

  // Only the *type* surface is filtered, and only by namespace: a native
  // extension documented beside a confirmed Lua module keeps its declaration, and
  // a superseded bundle stays a declared dependency below, so its scene sources
  // still unpack and its version and pin status still report.
  const extensionBundles = bundles.map((bundle) => {
    const published = publishedByConfirmedUrl.get(bundle.url);
    return published === undefined
      ? bundle
      : {
          ...bundle,
          declarations: bundle.declarations.filter(({ namespace }) => !published.has(namespace)),
        };
  });
  const { materializedDir, sharedNamespaces } = materializeExtensionDeclarations({
    cwd,
    bundles: extensionBundles,
  });
  ensureExtensionTypesReference(cwd, materializedDir);

  // The dependency scene surface the editor plugin, `scene-types` and `build`
  // all read: unpacked here because the archive seam cannot run inside tsserver.
  const { counts: sceneSourceCounts } = materializeLibrarySceneSources({ cwd, bundles });
  const warnings: string[] = [
    ...(libraryData.warning === undefined ? [] : [libraryData.warning]),
    ...followed.warnings,
    ...urlPins.warnings,
    ...shippedWarnings,
  ];
  // A `--pin-urls` run already moved each branch URL or said why it left it, so advice
  // to run it again would only contradict that. Tags draw nothing: they rarely move, and
  // the lockfile reports one that does.
  if (opts.pinUrls !== true) {
    for (const url of new Set(bundles.map((bundle) => bundle.url))) {
      if (classifyDependencyUrl(url) === "branch") {
        warnings.push(
          `${url} follows a branch, so it can change without notice: run \`defold-typescript resolve --pin-urls\` to pin it to a commit`,
        );
      }
    }
  }
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
  // reporting drift, and a URL that moved here is recorded at what it moved to. Either
  // way the pin keeps the ref it follows.
  const acceptedPins: Record<string, ExtensionPin> = Object.fromEntries(
    bundles
      .filter(
        ({ url }) =>
          followsOf.has(url) ||
          (pins[url] !== undefined && wantsUpdate(opts.update, libraryName(url))),
      )
      .map(({ url, identity }) => {
        const follows = followsOf.get(url) ?? pins[url]?.follows;
        return [url, follows === undefined ? identity : { ...identity, follows }];
      }),
  );
  const heldPins = { ...pins, ...acceptedPins };

  // Each confirmed library prints from the archive the project depends on, so its
  // types follow the version the game ships rather than the one library data pins.
  let printedLibraries: PrintedLibrary[] | null = null;
  // Every confirmed library has an entry, empty when another dependency printed its
  // modules first.
  const printedFrom = new Map<string, ("archive" | "pinned")[]>(
    [...publishedByConfirmedUrl.keys()].map((url) => [url, []]),
  );
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
      const { printed, unprintable } = await printLibraryModules(libraryDataDir, modules, archive, {
        cliVersion,
      });
      for (const { module, contents, from, ref, reason } of printed) {
        seen.add(module);
        printedLibraries.push({ module, contents });
        printedFrom.get(url)?.push(from);
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
    if (moved.length > 0 && !moveGameProjectDependencies(gameProjectPath, moved)) {
      return failedResolve(
        "game.project changed its dependencies during this run, so nothing was rewritten: run `defold-typescript resolve` again",
      );
    }
    writeProjectLock(cwd, {
      extensions: mergeResolvedVersionPins(
        heldPins,
        Object.fromEntries(bundles.map((bundle) => [bundle.url, bundle.identity])),
      ),
      ...(libraryData.pins === undefined ? {} : { libraryData: libraryData.pins }),
    });
  }

  const libraryStatuses = await classifyLibraries(
    bundles,
    confirmedNativeUrls,
    printedFrom,
    libraryData,
    libraryNames,
    cliVersion,
    opts.readZip ?? defaultReadZip,
  );
  const statusMessages = libraryStatusMessages(
    [...libraryStatuses].map(([url, status]) => ({ url, status })),
    (url) => wantsUpdate(opts.update, libraryName(url)),
  );

  const extensions: ResolvedExtensionReport[] = extensionBundles.map((bundle) => {
    const confirmedLibrary = publishedByConfirmedUrl.has(bundle.url);
    const pin = heldPins[bundle.url];
    const pinStatus: PinStatus =
      pin === undefined ? "unpinned" : sameArchive(pin, bundle.identity) ? "match" : "drift";
    // A confirmed library's bundle reports only the namespaces its curated types
    // left on the extension surface, so its modules are not counted again against
    // `libraries[]`. `scriptApiCount` stays the real archive count.
    const namespaces = shippedUrls.has(bundle.url)
      ? bundle.shipped.map(({ entry }) => posix.basename(entry, ".d.ts")).sort()
      : bundle.declarations.map((d) => d.namespace).sort();
    const report: {
      url: string;
      ref: DependencyUrlKind;
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
      libraryStatus?: LibraryStatus;
    } = {
      url: bundle.url,
      ref: classifyDependencyUrl(bundle.url),
      provenance: bundle.provenance,
      namespaces,
      typeSurface: shippedUrls.has(bundle.url)
        ? "shipped"
        : confirmedLibrary
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
    const libraryStatus = libraryStatuses.get(bundle.url);
    if (libraryStatus !== undefined) {
      report.libraryStatus = libraryStatus;
    }
    return report;
  });

  // A run that read no library data cannot tell whether it would type the library,
  // so it gives no advice to type it by hand.
  const sharesLua = new Set(extensionBundles.filter((b) => b.sharesLua).map((b) => b.url));
  const untypedLuaUrls =
    libraryDataDir === null
      ? []
      : [
          ...new Set(
            extensions
              .filter(
                ({ url, assetOnly, typeSurface }) =>
                  assetOnly && typeSurface === "none" && sharesLua.has(url),
              )
              .map(({ url }) => url),
          ),
        ];

  const notices = [
    ...libraryData.notices,
    ...followed.notices,
    ...urlPins.notices,
    ...(moved.length > 0 && existsSync(join(cwd, DEFOLD_DEPENDENCIES_MANIFEST))
      ? [
          `${DEFOLD_LIBRARY_DIR} holds nothing for a URL that moved: run \`defold-typescript bob resolve\` or Fetch Libraries`,
        ]
      : []),
    ...statusMessages.notices,
    ...nameNotices,
    ...(untypedLuaUrls.length > 0
      ? [
          `no types cover the Lua modules from ${untypedLuaUrls.join(", ")}: declare the ones you require in src/types/, see ${UNTYPED_LIBRARY_GUIDE}`,
        ]
      : []),
  ];
  return {
    ok: true,
    materializedSurface: materializedDir,
    extensions,
    libraries,
    sharedNamespaces,
    warnings: [...warnings, ...statusMessages.warnings],
    ...(notices.length > 0 ? { notices } : {}),
  };
}

// Which data repo commit each library a project uses is read from. A library moves
// only when asked to, or when its pin cannot serve this CLI, so a data merge never
// changes a project's types on its own and moving one library leaves the others'
// bytes alone. A pin is keyed by library name, `owner/repo`, the folder the library
// sits in. A dependency uses the pin its URL matches among the pinned names and
// main's libraries (`matchLibraryName`), so a fork keeps the pin of the library it
// reads.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LIBRARY_FILE, readIndexSlots } from "./library/library-data";
import {
  fetchNewestLibraryData,
  type LibraryDataAtCommit,
  type LibraryDataSource,
  libraryDataAtCommit,
  libraryFolderChange,
} from "./library-data-archive";
import { assembleLibraryDataView, SHARED_DATA_FILES } from "./library-data-view";
import { matchedLibraryName } from "./library-match";
import { librariesMatching, readLibraryDataOrNone } from "./library-registry";
import type { LibraryDataPins } from "./project-lock";

// `true` moves everything; names move those dependencies alone.
export type LibraryDataUpdate = true | readonly string[];

export interface SelectLibraryPinsOptions extends LibraryDataSource {
  readonly urls: readonly string[];
  // The URLs the lockfile already holds, which tells a dependency just added from one
  // that newer data has only now come to cover.
  readonly knownUrls: readonly string[];
  readonly pins: LibraryDataPins | null;
  readonly update?: LibraryDataUpdate;
}

// Where the version folders sit beside the one this CLI reads, in a commit the run
// already holds, so looking at them costs no request. `dir` cannot say: it is a view
// assembled from each pin.
export interface LibraryDataFolders {
  readonly dataRoot?: string;
  readonly folder?: string;
}

export interface LibraryPinSelection extends LibraryDataFolders {
  readonly dir: string | null;
  readonly pins: LibraryDataPins | null;
  readonly notices: readonly string[];
  readonly warning?: string;
}

export interface FrozenLibraryData extends LibraryDataFolders {
  readonly dir: string | null;
  readonly error?: string;
}

export function wantsUpdate(update: LibraryDataUpdate | undefined, name: string): boolean {
  return update === true || (update?.includes(name) ?? false);
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function foldersOf(at: LibraryDataAtCommit | null): LibraryDataFolders {
  return at === null || at.dir === null ? {} : { dataRoot: dirname(at.dir), folder: at.folder };
}

// Why this commit cannot serve this library, or null when it can.
function pinTrouble(at: LibraryDataAtCommit, commit: string, name: string): string | null {
  if (at.dir === null) {
    return at.reason;
  }
  return existsSync(join(at.dir, name, LIBRARY_FILE))
    ? null
    : `library data commit ${commit} holds no ${name}`;
}

function readSharedFiles(dataDir: string): string {
  return JSON.stringify(
    SHARED_DATA_FILES.map((file) => {
      const path = join(dataDir, file);
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    }),
  );
}

// Each commit's read, once, in order, so a pin at main's commit costs no second one.
async function readCommits(
  source: LibraryDataSource,
  commits: readonly string[],
  seed: readonly (readonly [string, LibraryDataAtCommit])[] = [],
): Promise<Map<string, LibraryDataAtCommit>> {
  const reads = new Map(seed);
  for (const commit of commits) {
    if (!reads.has(commit)) {
      reads.set(commit, await libraryDataAtCommit(source, commit));
    }
  }
  return reads;
}

// The loaders check what no single commit could get wrong: a module named by two
// libraries from different commits, or an index slot classified twice.
function loadView(
  cacheDir: string,
  reads: ReadonlyMap<string, LibraryDataAtCommit>,
  libraries: Readonly<Record<string, string>>,
  shared: string,
): { dir: string } | { dir: null; failure: string } {
  const folderOf = (commit: string) => reads.get(commit)?.dir ?? "";
  const view = assembleLibraryDataView({
    cacheDir,
    libraries: Object.entries(libraries).map(([name, commit]) => ({
      name,
      folderDir: folderOf(commit),
    })),
    shared: folderOf(shared),
  });
  if (view.dir === null) {
    return { dir: null, failure: `no folder holds ${view.missing.join(", ")}` };
  }
  try {
    readIndexSlots(view.dir);
    return { dir: view.dir };
  } catch (err) {
    return { dir: null, failure: errorMessage(err) };
  }
}

export async function selectLibraryPins(
  opts: SelectLibraryPinsOptions,
): Promise<LibraryPinSelection> {
  const { cacheDir, urls, knownUrls, pins, update } = opts;
  const main = await fetchNewestLibraryData(opts);
  const newest = main.dir !== null && !main.stale ? main : null;
  const mainTrouble = main.dir === null ? main.reason : main.warning;
  const mainLibraries = readLibraryDataOrNone(main.dir);
  const pinnedNames = new Set(Object.keys(pins?.libraries ?? {}));
  const names = [...new Set([...pinnedNames, ...mainLibraries.map(({ dir }) => dir)])];
  const nameOf = (url: string) => matchedLibraryName(url, names);
  const used = new Set(urls.map(nameOf));
  const pinned = Object.entries(pins?.libraries ?? {}).filter(([name]) => used.has(name));
  const covered = new Set(librariesMatching(mainLibraries, urls).map(({ dir }) => dir));

  const reads = await readCommits(
    opts,
    [...pinned.map(([, commit]) => commit), ...(pins === null ? [] : [pins.shared])],
    main.dir === null ? [] : [[main.commit, main]],
  );
  const readOf = (commit: string) => reads.get(commit) as LibraryDataAtCommit;

  // Data this run could not check never moves a pin, so a pin it also cannot read
  // leaves it nothing to print from.
  if (newest === null) {
    const sharedRead = pins === null ? null : readOf(pins.shared);
    const unreadable = [
      ...pinned.map(([name, commit]) => pinTrouble(readOf(commit), commit, name)),
      sharedRead?.dir === null ? sharedRead.reason : null,
    ].find((trouble) => trouble !== null);
    if (unreadable !== undefined && unreadable !== null) {
      return { dir: null, pins, notices: [], warning: `${unreadable}; ${mainTrouble}` };
    }
  }

  const libraries: Record<string, string> = {};
  const notices: string[] = [];
  const movedByUpdate: string[] = [];
  const withNewerData: string[] = [];
  for (const [name, commit] of pinned) {
    const at = readOf(commit);
    if (newest === null) {
      libraries[name] = commit;
      continue;
    }
    const trouble =
      pinTrouble(at, commit, name) ??
      (at.dir !== null && at.folder !== newest.folder
        ? `this CLI now reads the ${newest.folder} data folder`
        : null);
    if (trouble !== null) {
      if (covered.has(name)) {
        libraries[name] = newest.commit;
        notices.push(`${trouble}, so ${name} moved to library data commit ${newest.commit}`);
      } else {
        notices.push(
          `${trouble}, and no newer library data covers ${name}, so its pin was dropped`,
        );
      }
      continue;
    }
    const wanted = wantsUpdate(update, name);
    if (!covered.has(name)) {
      libraries[name] = commit;
      if (wanted) {
        notices.push(`the newest library data no longer covers ${name}, so it stays at ${commit}`);
      } else {
        withNewerData.push(name);
      }
      continue;
    }
    const change =
      commit === newest.commit
        ? "same"
        : libraryFolderChange(join(at.dir as string, name), join(newest.dir, name));
    if (change === "same" || (change === "reviews" && !wanted)) {
      libraries[name] = commit;
    } else if (wanted) {
      libraries[name] = newest.commit;
      movedByUpdate.push(name);
    } else {
      libraries[name] = commit;
      withNewerData.push(name);
    }
  }
  if (movedByUpdate.length > 0 && newest !== null) {
    notices.push(`moved ${movedByUpdate.join(", ")} to library data commit ${newest.commit}`);
  }
  if (withNewerData.length > 0) {
    notices.push(
      `newer library data changes ${withNewerData.join(", ")}; run \`defold-typescript resolve --update\` to move to it`,
    );
  }

  const fromMain = [...covered].filter((name) => !pinnedNames.has(name));
  if (main.dir !== null) {
    for (const name of fromMain) {
      libraries[name] = main.commit;
    }
    const known = new Set(knownUrls.map(nameOf));
    const nowCovered = fromMain.filter((name) => known.has(name));
    if (nowCovered.length > 0) {
      notices.push(
        `library data commit ${main.commit} is the first to cover ${nowCovered.join(", ")}`,
      );
    }
  }

  const lockedUrls = new Set(knownUrls);
  const newUrlUncovered = urls.some((url) => {
    const name = nameOf(url);
    return (
      !lockedUrls.has(url) && (name === null || (!covered.has(name) && !pinnedNames.has(name)))
    );
  });
  const updateHeld = update === true || pinned.some(([name]) => wantsUpdate(update, name));
  const uncheckedMain =
    newest === null &&
    (fromMain.length > 0 ||
      newUrlUncovered ||
      (pins !== null && updateHeld) ||
      (pins === null && main.dir !== null));
  const warning = uncheckedMain && mainTrouble !== undefined ? { warning: mainTrouble } : {};

  let shared = pins?.shared ?? (main.dir === null ? null : main.commit);
  if (pins !== null && newest !== null) {
    const at = readOf(pins.shared);
    if (
      at.dir === null ||
      at.folder !== newest.folder ||
      (update === true && readSharedFiles(at.dir) !== readSharedFiles(newest.dir))
    ) {
      shared = newest.commit;
    }
  }
  if (shared === null) {
    return { dir: null, pins, notices: [], ...warning };
  }

  const folders = foldersOf(main.dir !== null ? main : pins === null ? null : readOf(pins.shared));
  const view = loadView(cacheDir, reads, libraries, shared);
  if (view.dir !== null) {
    return { dir: view.dir, pins: { shared, libraries }, notices, ...warning, ...folders };
  }
  const conflict = `library data pins do not load together: ${view.failure}`;
  if (newest === null) {
    return { dir: null, pins, notices: [], warning: `${conflict}; ${mainTrouble}` };
  }
  const atMain = Object.fromEntries([...covered].map((name) => [name, newest.commit]));
  const fallback = loadView(cacheDir, reads, atMain, newest.commit);
  if (fallback.dir === null) {
    return { dir: null, pins, notices: [], warning: conflict };
  }
  return {
    dir: fallback.dir,
    pins: { shared: newest.commit, libraries: atMain },
    notices: [`${conflict}, so every used library moved to commit ${newest.commit}`],
    ...folders,
  };
}

// A frozen run reads pins alone: it requests no main, and a pin it cannot serve fails
// the run rather than move.
export async function frozenLibraryData(
  source: LibraryDataSource,
  pins: LibraryDataPins | null,
  urls: readonly string[],
): Promise<FrozenLibraryData> {
  if (pins === null) {
    return {
      dir: null,
      error:
        "--frozen needs recorded library data: run a plain `defold-typescript resolve` and commit the file",
    };
  }
  const pinnedNames = Object.keys(pins.libraries);
  const used = new Set(urls.map((url) => matchedLibraryName(url, pinnedNames)));
  const libraries = Object.fromEntries(
    Object.entries(pins.libraries).filter(([name]) => used.has(name)),
  );
  const reads = await readCommits(source, [...Object.values(libraries), pins.shared]);
  for (const [name, commit] of Object.entries(libraries)) {
    const trouble = pinTrouble(reads.get(commit) as LibraryDataAtCommit, commit, name);
    if (trouble !== null) {
      return { dir: null, error: `the library data pin for ${name} cannot be read: ${trouble}` };
    }
  }
  const shared = reads.get(pins.shared) as LibraryDataAtCommit;
  if (shared.dir === null) {
    return { dir: null, error: `the shared library data pin cannot be read: ${shared.reason}` };
  }
  const view = loadView(source.cacheDir, reads, libraries, pins.shared);
  return view.dir === null
    ? { dir: null, error: `the library data pins do not load: ${view.failure}` }
    : { dir: view.dir, ...foldersOf(shared) };
}

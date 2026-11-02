// One folder holding each library from its own commit, since the loaders read one
// directory. A copy, because a symlink needs a privilege on Windows.

import { createHash } from "node:crypto";
import { cpSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  DEFOLD_EXTENSIONS_FILE,
  EXTENSION_INDEX_SLOTS_FILE,
  LIBRARY_FILE,
} from "./library/library-data";
import { landFolder } from "./library-data-archive";

// The files no library owns, read from the shared folder.
export const SHARED_DATA_FILES = [EXTENSION_INDEX_SLOTS_FILE, DEFOLD_EXTENSIONS_FILE] as const;

export interface AssembleLibraryDataViewOptions {
  readonly cacheDir: string;
  // `folderDir` is the data folder of the commit that library is read from.
  readonly libraries: readonly { readonly name: string; readonly folderDir: string }[];
  // The data folder the file no library owns is read from.
  readonly shared: string | null;
  readonly copy?: (from: string, to: string) => void;
}

// `dir` is null when any library is `missing`, since a partial view would read as a
// project that never used the absent one.
export interface LibraryDataView {
  readonly dir: string | null;
  readonly missing: readonly string[];
}

const copyTree = (from: string, to: string): void => {
  cpSync(from, to, { recursive: true });
};

// Relative to the cache, so a moved cache keeps its views. The pair is encoded whole,
// so a library named `shared` cannot read as the shared folder. The shared files
// present are named too: a view is never rebuilt once it exists, so one an earlier
// CLI built for the same commits without a file would otherwise serve forever.
function viewKey(
  { cacheDir, libraries, shared }: AssembleLibraryDataViewOptions,
  sharedFiles: readonly string[],
): string {
  const inCache = (dir: string) => relative(cacheDir, dir).split(sep).join("/");
  const lines = libraries.map(({ name, folderDir }) => `${name}=${inCache(folderDir)}`).sort();
  return createHash("sha256")
    .update(JSON.stringify([lines, shared === null ? null : inCache(shared), sharedFiles]))
    .digest("hex");
}

export function assembleLibraryDataView(opts: AssembleLibraryDataViewOptions): LibraryDataView {
  const { cacheDir, libraries, shared } = opts;
  const copy = opts.copy ?? copyTree;
  const missing = libraries
    .filter(({ name, folderDir }) => !existsSync(join(folderDir, name, LIBRARY_FILE)))
    .map(({ name }) => name);
  if (missing.length > 0) {
    return { dir: null, missing };
  }

  const sharedFiles =
    shared === null ? [] : SHARED_DATA_FILES.filter((file) => existsSync(join(shared, file)));
  const dir = join(cacheDir, "views", viewKey(opts, sharedFiles));
  landFolder(dir, (stage) => {
    for (const { name, folderDir } of libraries) {
      copy(join(folderDir, name), join(stage, name));
    }
    for (const file of sharedFiles) {
      copy(join(shared as string, file), join(stage, file));
    }
  });
  return { dir, missing };
}

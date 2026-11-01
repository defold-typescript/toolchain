// One folder holding each library from its own commit, since the loaders read one
// directory. A copy, because a symlink needs a privilege on Windows.

import { createHash } from "node:crypto";
import { cpSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { EXTENSION_INDEX_SLOTS_FILE, LIBRARY_FILE } from "./library/library-data";
import { landFolder } from "./library-data-archive";

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
// so a library named `shared` cannot read as the shared folder.
function viewKey({ cacheDir, libraries, shared }: AssembleLibraryDataViewOptions): string {
  const inCache = (dir: string) => relative(cacheDir, dir).split(sep).join("/");
  const lines = libraries.map(({ name, folderDir }) => `${name}=${inCache(folderDir)}`).sort();
  return createHash("sha256")
    .update(JSON.stringify([lines, shared === null ? null : inCache(shared)]))
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

  const dir = join(cacheDir, "views", viewKey(opts));
  landFolder(dir, (stage) => {
    for (const { name, folderDir } of libraries) {
      copy(join(folderDir, name), join(stage, name));
    }
    const sharedFile = shared === null ? null : join(shared, EXTENSION_INDEX_SLOTS_FILE);
    if (sharedFile !== null && existsSync(sharedFile)) {
      copy(sharedFile, join(stage, EXTENSION_INDEX_SLOTS_FILE));
    }
  });
  return { dir, missing };
}

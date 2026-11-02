import { archiveWrapperOf, type LibrarySharedEntry } from "@defold-typescript/transpiler";
import type { ExtensionZip } from "../extension-archive";

// The upstream sources a lane reads, at repo-relative forward-slash paths. Both the
// copy vendored in library data and a dependency's archive serve it, so one
// generator prints from either.
export interface LibrarySourceTree {
  list(): string[];
  read(path: string): string;
}

// Every file in an archive with GitHub's `<repo>-<ref>/` folder dropped, found the
// way the archive's Lua modules and scene sources find it.
export function archiveFiles(zip: ExtensionZip): LibrarySharedEntry[] {
  const entries = zip.entries();
  const wrapper = archiveWrapperOf(entries);
  const prefix = wrapper === undefined ? "" : `${wrapper}/`;
  return entries
    .map((entry) => ({ entry, path: entry.slice(prefix.length) }))
    .filter(({ path }) => path.length > 0 && !path.endsWith("/"));
}

// A dependency's archive as a source tree.
export function archiveSourceTree(zip: ExtensionZip): LibrarySourceTree {
  const paths = new Map(archiveFiles(zip).map(({ entry, path }) => [path, entry]));
  return {
    list: () => [...paths.keys()].sort(),
    read: (path) => {
      const entry = paths.get(path);
      if (entry === undefined) throw new Error(`the archive holds no ${path}`);
      return zip.read(entry);
    },
  };
}

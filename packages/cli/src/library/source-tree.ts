import { archiveWrapperOf } from "@defold-typescript/transpiler";
import type { ExtensionZip } from "../extension-archive";

// The upstream sources a lane reads, at repo-relative forward-slash paths. Both the
// copy vendored in library data and a dependency's archive serve it, so one
// generator prints from either.
export interface LibrarySourceTree {
  list(): string[];
  read(path: string): string;
}

// A dependency's archive with GitHub's `<repo>-<ref>/` folder dropped, found the
// way the archive's Lua modules and scene sources find it.
export function archiveSourceTree(zip: ExtensionZip): LibrarySourceTree {
  const entries = zip.entries();
  const wrapper = archiveWrapperOf(entries);
  const prefix = wrapper === undefined ? "" : `${wrapper}/`;
  const paths = new Map<string, string>();
  for (const entry of entries) {
    const path = entry.slice(prefix.length);
    if (path.length > 0 && !path.endsWith("/")) paths.set(path, entry);
  }
  return {
    list: () => [...paths.keys()].sort(),
    read: (path) => {
      const entry = paths.get(path);
      if (entry === undefined) throw new Error(`the archive holds no ${path}`);
      return zip.read(entry);
    },
  };
}

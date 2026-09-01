// What a Defold library dependency declares and what it actually shares. Both
// halves live here rather than beside the CLI resolver because the scene walk
// needs them too: it must read the declared set to tell an unresolved dependency
// from an absent one, and `packages/transpiler` cannot import `packages/cli`.
//
// `game.project` is read as the flat INI the editor writes, the same shape
// `buildConfigKeyIndex` walks — a key may carry a `#` (`dependencies#0`), which
// is part of its name and never a fragment.

import { ANIMATION_ASSET_EXTENSIONS, GUI_EXTENSIONS, SCENE_EXTENSIONS } from "./scene-documents";

export interface ExtensionDependency {
  readonly index: number;
  readonly url: string;
}

// The file kinds a library shares into the address universe. `.input_binding`
// and `.project` are deliberately absent: `game.project` names exactly one
// active binding file, and a vendored `*.project` declares keys this project's
// readers cannot resolve — the rule `PROJECT_EXTENSIONS` already states.
export const LIBRARY_SCENE_EXTENSIONS = [
  ...SCENE_EXTENSIONS,
  ...GUI_EXTENSIONS,
  ...ANIMATION_ASSET_EXTENSIONS,
];

function isProjectHeader(line: string): boolean {
  return line.trim() === "[project]";
}

function isSectionHeader(line: string): boolean {
  return /^\[.+\]\s*$/.test(line.trim());
}

export function readGameProjectDependencies(gameProjectText: string): ExtensionDependency[] {
  const lines = gameProjectText.split("\n");
  const deps: ExtensionDependency[] = [];
  let inProject = false;
  for (const line of lines) {
    if (isSectionHeader(line)) {
      inProject = isProjectHeader(line);
      continue;
    }
    if (!inProject) {
      continue;
    }
    const match = line.match(/^dependencies#(\d+)\s*=\s*(.+)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      deps.push({ index: Number(match[1]), url: match[2] });
    }
  }
  return deps;
}

// The leading directory every entry sits under — GitHub packs an archive under
// `<repo>-<ref>/`, but a hand-rolled zip may not, and stripping a segment that
// is not shared would rebase a real directory away.
export function archiveWrapperOf(entries: readonly string[]): string | undefined {
  let wrapper: string | undefined;
  for (const entry of entries) {
    const separator = entry.indexOf("/");
    if (separator <= 0) {
      return undefined;
    }
    const segment = entry.slice(0, separator);
    if (wrapper === undefined) {
      wrapper = segment;
    } else if (wrapper !== segment) {
      return undefined;
    }
  }
  return wrapper;
}

function readLibraryIncludeDirs(gameProjectText: string): string[] {
  let inLibrary = false;
  for (const line of gameProjectText.split("\n")) {
    if (isSectionHeader(line)) {
      inLibrary = line.trim() === "[library]";
      continue;
    }
    if (!inLibrary) {
      continue;
    }
    const match = line.match(/^include_dirs\s*=\s*(.*)$/);
    if (match?.[1] !== undefined) {
      return match[1]
        .split(",")
        .map((dir) => dir.trim())
        .filter((dir) => dir.length > 0);
    }
  }
  return [];
}

export interface LibrarySharedEntry {
  readonly entry: string;
  readonly path: string;
}

export interface LibraryIncludedEntries {
  readonly shared: LibrarySharedEntry[];
  readonly reasons: string[];
}

// The scene sources a library actually shares: the entries under the directories
// its own `game.project` names, at the resource path Defold itself would address
// them by (wrapper stripped, include dir kept — a library's `druid/druid.gui` is
// `/druid/druid.gui` in a project that depends on it).
export function libraryIncludedEntries(
  entries: readonly string[],
  gameProjectText: string | undefined,
): LibraryIncludedEntries {
  if (gameProjectText === undefined) {
    return {
      shared: [],
      reasons: ["ships no game.project, so it declares no [library] include_dirs"],
    };
  }

  const includeDirs = new Set(readLibraryIncludeDirs(gameProjectText));
  if (includeDirs.size === 0) {
    return { shared: [], reasons: ["its game.project declares no [library] include_dirs"] };
  }

  const wrapper = archiveWrapperOf(entries);
  const shared: LibrarySharedEntry[] = [];
  for (const entry of entries) {
    const path = wrapper === undefined ? entry : entry.slice(wrapper.length + 1);
    const [head] = path.split("/");
    if (head === undefined || !includeDirs.has(head)) {
      continue;
    }
    const dot = path.lastIndexOf(".");
    if (dot === -1 || !LIBRARY_SCENE_EXTENSIONS.includes(path.slice(dot).toLowerCase())) {
      continue;
    }
    shared.push({ entry, path });
  }
  shared.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { shared, reasons: [] };
}

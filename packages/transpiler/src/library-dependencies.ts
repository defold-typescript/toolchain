// What a Defold library dependency declares and what it actually shares. Both
// halves live here rather than beside the CLI resolver because the scene walk
// needs them too: it must read the declared set to tell an unresolved dependency
// from an absent one, and `packages/transpiler` cannot import `packages/cli`.
//
// `game.project` is read as the flat INI the editor writes, the same shape
// `buildConfigKeyIndex` walks — a key may carry a `#` (`dependencies#0`), which
// is part of its name and never a fragment.

import {
  displayPathOf,
  GAME_PROJECT_DOCUMENT,
  LIBRARY_SCENE_EXTENSIONS,
  type SceneReadHost,
} from "./scene-documents";

export interface ExtensionDependency {
  readonly index: number;
  readonly url: string;
}

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

// The gitignored surface `resolve` unpacks each dependency's shared scene
// sources into, project-relative. Exported because the editor's index cache has
// to recognize an event under it: a literal there would drift from the path the
// walk composes.
export const LIBRARY_DEPENDENCY_ROOT = ".defold-types/dependencies";
const LIBRARY_DEPENDENCY_MANIFEST = `${LIBRARY_DEPENDENCY_ROOT}/dependencies.json`;

export interface LibrarySceneDocument {
  // The merged Defold resource path this document is addressed by, which is the
  // key the whole universe shares — see the composition note below.
  readonly displayPath: string;
  // Where the host holds it, so a watcher can be registered on the real file.
  readonly hostPath: string;
  readonly url: string;
  readonly text: string;
}

export interface LibrarySceneDocuments {
  readonly documents: LibrarySceneDocument[];
  readonly unreadable: string[];
}

function joinProject(projectRoot: string, relative: string): string {
  return `${projectRoot.replace(/\\/g, "/").replace(/\/+$/, "")}/${relative}`;
}

// `undefined` for anything this cannot be read as: a manifest that is not JSON
// and one whose shape says nothing about dependencies are the same hole to a
// caller, and both are repaired the same way.
function readMaterializedKeys(manifestText: string): Map<string, string> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    return undefined;
  }
  const entries = (parsed as { dependencies?: unknown } | null)?.dependencies;
  if (!Array.isArray(entries)) return undefined;

  const keyByUrl = new Map<string, string>();
  for (const entry of entries) {
    const { key, url } = (entry ?? {}) as { key?: unknown; url?: unknown };
    if (typeof key === "string" && typeof url === "string") keyByUrl.set(url, key);
  }
  return keyByUrl;
}

/**
 * The scene sources the project's resolved library dependencies contribute,
 * read out of the surface `resolve` materialized.
 *
 * Each document is keyed by its **merged** Defold resource path, not by one
 * namespaced with its origin: Defold folds a library's `[library] include_dirs`
 * into the consuming project's root namespace, and `scene-object-path-index.ts`
 * resolves a `collection: "/druid/foo.collection"` reference by exactly that
 * key — so an origin-namespaced key would strand every cross-document
 * reference. The origin travels beside the document instead.
 *
 * Every refusal is one `unreadable` line naming the URL where one is known: an
 * absent or unusable manifest, a declared dependency the last `resolve` did not
 * materialize, a materialized directory `game.project` no longer declares, and
 * a file that would not read. A dependency that contributes nothing silently is
 * exactly the hole `readSceneDocuments` promises not to have.
 */
export function readLibrarySceneDocuments(
  host: SceneReadHost,
  projectRoot: string,
  extensions: readonly string[] = LIBRARY_SCENE_EXTENSIONS,
): LibrarySceneDocuments {
  const documents: LibrarySceneDocument[] = [];
  const unreadable: string[] = [];

  if (!host.readDirectory) return { documents, unreadable };

  const gameProjectText = host.readFile(joinProject(projectRoot, GAME_PROJECT_DOCUMENT));
  if (gameProjectText === undefined) return { documents, unreadable };

  const declared = [...readGameProjectDependencies(gameProjectText)].sort(
    (a, b) => a.index - b.index,
  );
  if (declared.length === 0) return { documents, unreadable };

  const manifestText = host.readFile(joinProject(projectRoot, LIBRARY_DEPENDENCY_MANIFEST));
  if (manifestText === undefined) {
    for (const { url } of declared) {
      unreadable.push(
        `${url}: is declared by game.project but ${LIBRARY_DEPENDENCY_MANIFEST} is absent`,
      );
    }
    return { documents, unreadable };
  }

  const keyByUrl = readMaterializedKeys(manifestText);
  if (keyByUrl === undefined) {
    for (const { url } of declared) {
      unreadable.push(
        `${url}: is declared by game.project but ${LIBRARY_DEPENDENCY_MANIFEST} is not a readable dependency manifest`,
      );
    }
    return { documents, unreadable };
  }

  // Declared order decides a collision between two libraries, the way the
  // `dependencies#N` order does in Defold itself — a host's directory order
  // must not.
  const resolved: { key: string; url: string }[] = [];
  const urlByKey = new Map<string, string>();
  for (const { url } of declared) {
    const key = keyByUrl.get(url);
    if (key === undefined) {
      unreadable.push(
        `${url}: is declared by game.project but was not materialized by the last resolve`,
      );
      continue;
    }
    resolved.push({ key, url });
    urlByKey.set(key, url);
  }

  const root = joinProject(projectRoot, LIBRARY_DEPENDENCY_ROOT);
  const filesByKey = new Map<string, string[]>();
  const stray = new Set<string>();
  for (const filePath of host.readDirectory(root, extensions)) {
    const relative = displayPathOf(root, filePath);
    // A host that answered for some directory other than the one it was handed
    // would otherwise have its files keyed as though they sat under a
    // dependency.
    if (relative === filePath.replace(/\\/g, "/")) continue;
    const separator = relative.indexOf("/");
    if (separator <= 0) continue;
    const key = relative.slice(0, separator);
    const url = urlByKey.get(key);
    if (url === undefined) {
      stray.add(key);
      continue;
    }
    const bucket = filesByKey.get(key);
    if (bucket === undefined) filesByKey.set(key, [filePath]);
    else bucket.push(filePath);
  }

  const claimed = new Map<string, string>();
  for (const { key, url } of resolved) {
    for (const hostPath of (filesByKey.get(key) ?? []).sort()) {
      const displayPath = displayPathOf(root, hostPath).slice(key.length + 1);
      if (displayPath === "") continue;
      const owner = claimed.get(displayPath);
      if (owner !== undefined) {
        unreadable.push(`${displayPath}: also declared by ${url}; ${owner}'s file is used`);
        continue;
      }
      const text = host.readFile(hostPath);
      if (text === undefined) {
        unreadable.push(`${displayPath}: could not be read from ${url}`);
        continue;
      }
      claimed.set(displayPath, url);
      documents.push({ displayPath, hostPath, url, text });
    }
  }

  for (const key of [...stray].sort()) {
    unreadable.push(
      `${LIBRARY_DEPENDENCY_ROOT}/${key}: is materialized but no longer declared by game.project, so its scenes are left out`,
    );
  }

  return { documents, unreadable };
}

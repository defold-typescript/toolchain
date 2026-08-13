import type * as ts from "typescript";
import {
  displayPathOf,
  isExcludedProjectPath,
  listProjectResourcePaths,
  readSceneDocuments,
  SCENE_EXTENSIONS,
  type SceneReadHost,
} from "./scene-documents";

// `SceneReadHost` plus the two watch facilities `ts.System` declares as
// optional, typed off the editor's own callback types so the real
// `ts.server.ServerHost` satisfies this structurally the way `SceneReadHost`
// already does.
export interface SceneWatchHost extends SceneReadHost {
  watchFile?(
    path: string,
    callback: ts.FileWatcherCallback,
    pollingInterval?: number,
  ): ts.FileWatcher;
  watchDirectory?(
    path: string,
    callback: ts.DirectoryWatcherCallback,
    recursive?: boolean,
  ): ts.FileWatcher;
}

export interface SceneIndexCache {
  readonly host: SceneWatchHost;
  readonly projectRoot: string;
  documents(extensions?: readonly string[]): ReturnType<typeof readSceneDocuments>;
  resourcePaths(extensions: readonly string[]): Set<string>;
  derived<T>(key: string, compute: () => T): T;
  dispose(): void;
}

// Sorted, so two call sites naming the same extensions in a different order
// share a cache entry rather than walking twice for one universe.
function cacheKey(extensions: readonly string[]): string {
  return [...extensions].sort().join("|");
}

// Holds the project walks the completion builders share, invalidated by the
// editor host's own watchers.
//
// Both facilities are required, and missing either disables caching entirely:
// `watchDirectory` reports structure changes, and whether a content edit reaches
// it is platform-dependent, so a directory watcher alone would leave the cache
// offering an id the author just renamed away. A stale id universe is worse than
// a slow one, so such a host falls back to the per-request walk it performs
// today.
export function createSceneIndexCache(host: SceneWatchHost, projectRoot: string): SceneIndexCache {
  const watchDirectory = host.watchDirectory;
  const watchFile = host.watchFile;
  const enabled = typeof watchDirectory === "function" && typeof watchFile === "function";

  const documentCache = new Map<string, ReturnType<typeof readSceneDocuments>>();
  const resourceCache = new Map<string, Set<string>>();
  const derivedCache = new Map<string, unknown>();
  const fileWatchers = new Map<string, ts.FileWatcher>();
  // The union of every extension set the cache has been asked for. Invalidating
  // on any event at all would let an ordinary `.ts` save drop the scene index.
  const servedExtensions = new Set<string>();

  let directoryWatcher: ts.FileWatcher | undefined;
  let disposed = false;

  function closeFileWatchers(): void {
    for (const watcher of fileWatchers.values()) watcher.close();
    fileWatchers.clear();
  }

  // One pass builds every derived index from the same documents, so per-index
  // dependency tracking would buy nothing: clear the lot.
  function invalidate(): void {
    documentCache.clear();
    resourceCache.clear();
    derivedCache.clear();
    closeFileWatchers();
  }

  function affectsCache(hostPath: string): boolean {
    const displayPath = displayPathOf(projectRoot, hostPath);
    if (isExcludedProjectPath(displayPath)) return false;
    for (const extension of servedExtensions) {
      if (displayPath.endsWith(extension)) return true;
    }
    return false;
  }

  function onEvent(hostPath: string): void {
    if (disposed) return;
    if (affectsCache(hostPath)) invalidate();
  }

  function active(): boolean {
    if (!enabled || disposed) return false;
    if (!directoryWatcher && watchDirectory) {
      directoryWatcher = watchDirectory(projectRoot, onEvent, true);
    }
    return true;
  }

  function serve(extensions: readonly string[]): void {
    for (const extension of extensions) servedExtensions.add(extension);
  }

  function watchReadFiles(paths: readonly string[]): void {
    if (!watchFile) return;
    for (const path of paths) {
      if (fileWatchers.has(path)) continue;
      fileWatchers.set(
        path,
        watchFile(path, (fileName) => onEvent(fileName)),
      );
    }
  }

  return {
    host,
    projectRoot,

    documents(extensions = SCENE_EXTENSIONS) {
      if (!active()) return readSceneDocuments(host, projectRoot, extensions);
      const key = cacheKey(extensions);
      const cached = documentCache.get(key);
      if (cached) return cached;
      const result = readSceneDocuments(host, projectRoot, extensions);
      documentCache.set(key, result);
      serve(extensions);
      watchReadFiles(result.paths);
      return result;
    },

    // Nothing is read here, so no per-file watcher is registered: a resource
    // path is the whole suggestion, and adding or removing one is a structure
    // change the directory watcher already reports.
    resourcePaths(extensions) {
      if (!active()) return listProjectResourcePaths(host, projectRoot, extensions);
      const key = cacheKey(extensions);
      const cached = resourceCache.get(key);
      if (cached) return cached;
      const result = listProjectResourcePaths(host, projectRoot, extensions);
      resourceCache.set(key, result);
      serve(extensions);
      return result;
    },

    derived<T>(key: string, compute: () => T): T {
      if (!active()) return compute();
      if (derivedCache.has(key)) return derivedCache.get(key) as T;
      const value = compute();
      derivedCache.set(key, value);
      return value;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      directoryWatcher?.close();
      directoryWatcher = undefined;
      closeFileWatchers();
      documentCache.clear();
      resourceCache.clear();
      derivedCache.clear();
    },
  };
}

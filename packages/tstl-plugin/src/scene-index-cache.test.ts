import { describe, expect, test } from "bun:test";
import type * as ts from "typescript";
import tsModule from "typescript";
import { createSceneIndexCache, type SceneWatchHost } from "./scene-index-cache";

const PROJECT_ROOT = "/project";

const DOCUMENTS: Record<string, string> = {
  "main/board.go": 'components {\n  id: "board"\n}\n',
  "main/main.collection": 'instances {\n  id: "hero"\n}\n',
  "main/hud.gui": 'nodes {\n  id: "score"\n}\n',
  "assets/hero.atlas": "",
};

interface WatcherStub extends ts.FileWatcher {
  closes: number;
}

// A host that counts the filesystem work the cache is supposed to avoid, and
// hands back watchers the test can fire and inspect — the same objects the
// production code receives, so a watcher it forgets to close is visible here.
interface FakeHost extends SceneWatchHost {
  documents: Record<string, string>;
  directoryReads: string[][];
  fileReads: string[];
  fireDirectory(hostPath: string): void;
  fireFile(hostPath: string): void;
  watchers: WatcherStub[];
  fileWatchedPaths(): string[];
}

function createFakeHost(
  documents: Record<string, string>,
  facilities: { watchFile?: boolean; watchDirectory?: boolean } = {},
): FakeHost {
  const watchers: WatcherStub[] = [];
  const fileCallbacks = new Map<string, ts.FileWatcherCallback>();
  let directoryCallback: ts.DirectoryWatcherCallback | undefined;

  const watcherStub = (onClose: () => void): WatcherStub => {
    const stub: WatcherStub = {
      closes: 0,
      close: () => {
        stub.closes += 1;
        onClose();
      },
    };
    watchers.push(stub);
    return stub;
  };

  const host: FakeHost = {
    documents,
    directoryReads: [],
    fileReads: [],
    watchers,
    // The real `readDirectory` filters by the extensions it is handed, so the
    // fake does too — otherwise a `.gui` walk could not be told from a `.go` one.
    readDirectory: (_path, extensions) => {
      host.directoryReads.push([...(extensions ?? [])]);
      return Object.keys(host.documents)
        .filter((path) => extensions === undefined || extensions.some((ext) => path.endsWith(ext)))
        .map((path) => `${PROJECT_ROOT}/${path}`);
    },
    readFile: (path) => {
      host.fileReads.push(path);
      return host.documents[path.replace(`${PROJECT_ROOT}/`, "")];
    },
    fireDirectory: (hostPath) => directoryCallback?.(hostPath),
    fireFile: (hostPath) =>
      fileCallbacks.get(hostPath)?.(hostPath, tsModule.FileWatcherEventKind.Changed),
    fileWatchedPaths: () => [...fileCallbacks.keys()],
  };

  if (facilities.watchDirectory !== false) {
    host.watchDirectory = (_path, callback) => {
      directoryCallback = callback;
      return watcherStub(() => {
        directoryCallback = undefined;
      });
    };
  }
  if (facilities.watchFile !== false) {
    host.watchFile = (path, callback) => {
      fileCallbacks.set(path, callback);
      return watcherStub(() => {
        fileCallbacks.delete(path);
      });
    };
  }
  return host;
}

describe("createSceneIndexCache walk reuse", () => {
  test("repeated document reads of one extension set walk the project once", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    const first = cache.documents();
    const second = cache.documents();

    expect(host.directoryReads).toEqual([[".go", ".collection"]]);
    expect(host.fileReads).toEqual([
      `${PROJECT_ROOT}/main/board.go`,
      `${PROJECT_ROOT}/main/main.collection`,
    ]);
    expect([...second.documents]).toEqual([...first.documents]);
    expect([...first.documents.keys()]).toEqual(["main/board.go", "main/main.collection"]);
  });

  test("a different extension set is keyed separately and walked once of its own", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    const gui = cache.documents([".gui"]);
    cache.documents([".gui"]);
    cache.documents();

    expect([...gui.documents.keys()]).toEqual(["main/hud.gui"]);
    expect(host.directoryReads).toEqual([[".go", ".collection"], [".gui"]]);
  });

  test("`derived` computes once per key and `resourcePaths` walks once per set", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    let computed = 0;
    const compute = () => {
      computed += 1;
      return cache.documents().documents.size;
    };
    expect(cache.derived("component-ids", compute)).toBe(2);
    expect(cache.derived("component-ids", compute)).toBe(2);
    expect(computed).toBe(1);

    expect([...cache.resourcePaths([".atlas"])]).toEqual(["/assets/hero.atlas"]);
    expect([...cache.resourcePaths([".atlas"])]).toEqual(["/assets/hero.atlas"]);
    expect(host.directoryReads).toEqual([[".go", ".collection"], [".atlas"]]);
    // A resource walk reads no contents, so it registers no per-file watcher.
    expect(host.fileWatchedPaths()).not.toContain(`${PROJECT_ROOT}/assets/hero.atlas`);
  });
});

describe("createSceneIndexCache invalidation reach", () => {
  test("a directory event for a served scene re-walks and reflects the new text", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    host.documents["main/board.go"] = 'components {\n  id: "renamed"\n}\n';
    host.fireDirectory(`${PROJECT_ROOT}/main/board.go`);

    expect(cache.documents().documents.get("main/board.go")).toContain("renamed");
    expect(host.directoryReads).toHaveLength(2);
  });

  test("a file event on a cached scene re-walks the same way", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    expect(host.fileWatchedPaths()).toEqual([
      `${PROJECT_ROOT}/main/board.go`,
      `${PROJECT_ROOT}/main/main.collection`,
    ]);

    host.documents["main/board.go"] = 'components {\n  id: "edited"\n}\n';
    host.fireFile(`${PROJECT_ROOT}/main/board.go`);

    expect(cache.documents().documents.get("main/board.go")).toContain("edited");
    expect(host.directoryReads).toHaveLength(2);
  });

  test("an invalidation drops the memoized derived values too", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    let computed = 0;
    const ids = () =>
      cache.derived("component-ids", () => {
        computed += 1;
        return [...cache.documents().documents.values()].join("");
      });

    expect(ids()).toContain("board");
    host.documents["main/board.go"] = 'components {\n  id: "renamed"\n}\n';
    host.fireDirectory(`${PROJECT_ROOT}/main/board.go`);

    expect(ids()).toContain("renamed");
    expect(computed).toBe(2);
  });

  test("an added scene the walk had never seen is picked up", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    host.documents["main/enemy.go"] = 'components {\n  id: "enemy"\n}\n';
    host.fireDirectory(`${PROJECT_ROOT}/main/enemy.go`);

    expect([...cache.documents().documents.keys()]).toContain("main/enemy.go");
  });
});

describe("createSceneIndexCache invalidation filtering", () => {
  const untouched = (hostPath: string) => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);
    cache.documents();
    host.fireDirectory(hostPath);
    cache.documents();
    return host.directoryReads;
  };

  test("build output leaves the cache intact", () => {
    expect(untouched(`${PROJECT_ROOT}/build/default/_generated_board.go`)).toHaveLength(1);
  });

  test("a `.defignore`d path leaves the cache intact", () => {
    expect(untouched(`${PROJECT_ROOT}/node_modules/some-pkg/fixture.go`)).toHaveLength(1);
  });

  test("an extension the cache was never asked to serve leaves it intact", () => {
    expect(untouched(`${PROJECT_ROOT}/main/hud.gui`)).toHaveLength(1);
    expect(untouched(`${PROJECT_ROOT}/main.ts`)).toHaveLength(1);
  });

  test("an extension becomes served once a walk has asked for it", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.resourcePaths([".atlas"]);
    host.fireDirectory(`${PROJECT_ROOT}/assets/tiles.atlas`);
    cache.resourcePaths([".atlas"]);

    expect(host.directoryReads).toHaveLength(2);
  });
});

describe("createSceneIndexCache facility fallback and disposal", () => {
  test("a host without `watchDirectory` walks on every call", () => {
    const host = createFakeHost({ ...DOCUMENTS }, { watchDirectory: false });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    cache.documents();
    let computed = 0;
    cache.derived("component-ids", () => (computed += 1));
    cache.derived("component-ids", () => (computed += 1));

    expect(host.directoryReads).toHaveLength(2);
    expect(computed).toBe(2);
    expect(host.watchers).toHaveLength(0);
  });

  test("a host without `watchFile` walks on every call", () => {
    const host = createFakeHost({ ...DOCUMENTS }, { watchFile: false });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    cache.documents();
    cache.resourcePaths([".atlas"]);
    cache.resourcePaths([".atlas"]);

    expect(host.directoryReads).toHaveLength(4);
    expect(host.watchers).toHaveLength(0);
  });

  test("`dispose` closes the directory watcher and every file watcher exactly once", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    expect(host.watchers.length).toBe(3);

    cache.dispose();
    cache.dispose();

    expect(host.watchers.map((watcher) => watcher.closes)).toEqual([1, 1, 1]);
  });

  test("a read after disposal still returns a correct, uncached result", () => {
    const host = createFakeHost({ ...DOCUMENTS });
    const cache = createSceneIndexCache(host, PROJECT_ROOT);

    cache.documents();
    cache.dispose();

    host.documents["main/board.go"] = 'components {\n  id: "renamed"\n}\n';
    expect(cache.documents().documents.get("main/board.go")).toContain("renamed");
    expect(cache.documents().documents.get("main/board.go")).toContain("renamed");
    expect(host.directoryReads).toHaveLength(3);
    expect(host.watchers).toHaveLength(3);
  });
});

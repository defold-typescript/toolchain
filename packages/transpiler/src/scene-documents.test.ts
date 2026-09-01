import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSceneComponentIndex } from "./scene-component-index";
import {
  listProjectResourcePaths,
  readSceneDocuments,
  type SceneReadHost,
} from "./scene-documents";
import { buildSceneObjectPathIndex } from "./scene-object-path-index";

const PROJECT_ROOT = "/project";

// The real `ts.server.ServerHost.readDirectory` filters by the extensions it is
// handed, so the fake does too — a fake that ignored them could not tell a walk
// that asks for `.gui` from one that asks for everything.
function hostReturning(paths: string[], text: (path: string) => string | undefined): SceneReadHost {
  return {
    readDirectory: (_path, extensions) =>
      extensions === undefined
        ? paths
        : paths.filter((candidate) => extensions.some((ext) => candidate.endsWith(ext))),
    readFile: text,
  };
}

// A host over a real directory tree, standing in for the editor's own file
// access so the walk is driven against the committed example project.
function fsHost(root: string): SceneReadHost {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.(go|collection)$/.test(entry.name) ? [path] : [];
    });
  return {
    readDirectory: () => walk(root),
    // `SceneReadHost.readFile` answers `undefined` for a file that is not there
    // — the editor's own host does, and the walk probes for optional files.
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
  };
}

describe("readSceneDocuments", () => {
  test("keeps the project's scene sources and drops build output", () => {
    const host = hostReturning(
      [
        `${PROJECT_ROOT}/main/board.go`,
        `${PROJECT_ROOT}/build/default_bundle/_generated_x.go`,
        `${PROJECT_ROOT}/main/main.collection`,
      ],
      () => "",
    );
    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);
    expect([...documents.keys()]).toEqual(["main/board.go", "main/main.collection"]);
    expect(unreadable).toEqual([]);
  });

  test("`build` is excluded only as a whole path segment", () => {
    const host = hostReturning(
      [`${PROJECT_ROOT}/mybuild/a.go`, `${PROJECT_ROOT}/game/rebuild.go`],
      () => "",
    );
    expect([...readSceneDocuments(host, PROJECT_ROOT).documents.keys()]).toEqual([
      "mybuild/a.go",
      "game/rebuild.go",
    ]);
  });

  test("an unreadable file is recorded, never silently skipped", () => {
    const host = hostReturning(
      [`${PROJECT_ROOT}/main/board.go`, `${PROJECT_ROOT}/main/hud.go`],
      (path) => (path.endsWith("hud.go") ? undefined : ""),
    );
    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);
    expect([...documents.keys()]).toEqual(["main/board.go"]);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]).toContain("main/hud.go");
  });

  test("reports the host paths it actually read, skipped and unreadable files aside", () => {
    const host = hostReturning(
      [
        `${PROJECT_ROOT}/main/board.go`,
        `${PROJECT_ROOT}/build/default/_generated_x.go`,
        `${PROJECT_ROOT}/node_modules/some-pkg/fixture.go`,
        `${PROJECT_ROOT}/main/hud.go`,
      ],
      (path) => (path.endsWith("hud.go") ? undefined : ""),
    );
    // Host paths, not display paths: a watcher is registered on what the host
    // named, which reconstruction from a display path would get wrong for a file
    // outside the project root.
    expect(readSceneDocuments(host, PROJECT_ROOT).paths).toEqual([`${PROJECT_ROOT}/main/board.go`]);
  });

  test("feeds a whole component-id universe from the committed example project", () => {
    const root = join(import.meta.dir, "../../../docs/examples/tetris-tutorial");
    const { documents, unreadable } = readSceneDocuments(fsHost(root), root);
    // The example declares a dependency and is never resolved in the tree, so
    // the one hole is that dependency — nothing about its own scenes.
    expect(unreadable).toEqual([
      "https://github.com/defold-typescript/toolchain/releases/download/lldebugger-v1/lldebugger.zip: is declared by game.project but .defold-types/dependencies/dependencies.json is absent",
    ]);
    expect([...buildSceneComponentIndex(documents).ids].sort()).toEqual(["board", "hud"]);
  });

  test("an explicit extension set walks only those files", () => {
    const paths = [
      `${PROJECT_ROOT}/main/board.go`,
      `${PROJECT_ROOT}/main/hud.gui`,
      `${PROJECT_ROOT}/main/main.collection`,
    ];
    const host = hostReturning(paths, () => "");
    expect([...readSceneDocuments(host, PROJECT_ROOT, [".gui"]).documents.keys()]).toEqual([
      "main/hud.gui",
    ]);
    // The default is unchanged, so a `.gui` never reaches the component walk.
    expect([...readSceneDocuments(host, PROJECT_ROOT).documents.keys()]).toEqual([
      "main/board.go",
      "main/main.collection",
    ]);
  });

  test("build output is dropped from a `.gui` walk too", () => {
    const host = hostReturning(
      [`${PROJECT_ROOT}/main/hud.gui`, `${PROJECT_ROOT}/build/default/_generated_x.gui`],
      () => "",
    );
    expect([...readSceneDocuments(host, PROJECT_ROOT, [".gui"]).documents.keys()]).toEqual([
      "main/hud.gui",
    ]);
  });

  test("the animation asset set is a third universe the default walk never touches", () => {
    const paths = [
      `${PROJECT_ROOT}/main/board.go`,
      `${PROJECT_ROOT}/main/main.collection`,
      `${PROJECT_ROOT}/assets/player.atlas`,
      `${PROJECT_ROOT}/assets/level.tilesource`,
      `${PROJECT_ROOT}/assets/hero.sprite`,
    ];
    const host = hostReturning(paths, () => "");
    expect([
      ...readSceneDocuments(host, PROJECT_ROOT, [
        ".atlas",
        ".tilesource",
        ".sprite",
      ]).documents.keys(),
    ]).toEqual(["assets/player.atlas", "assets/level.tilesource", "assets/hero.sprite"]);
    // Folding the asset extensions into the default set would feed atlas text
    // to `buildSceneComponentIndex`, whose universe is component ids alone.
    expect([...readSceneDocuments(host, PROJECT_ROOT).documents.keys()]).toEqual([
      "main/board.go",
      "main/main.collection",
    ]);
  });

  test("build output is dropped from an asset walk too", () => {
    const host = hostReturning(
      [
        `${PROJECT_ROOT}/assets/player.atlas`,
        `${PROJECT_ROOT}/build/default_bundle/_generated_x.sprite`,
      ],
      () => "",
    );
    expect([
      ...readSceneDocuments(host, PROJECT_ROOT, [
        ".atlas",
        ".tilesource",
        ".sprite",
      ]).documents.keys(),
    ]).toEqual(["assets/player.atlas"]);
  });

  test("an ignored directory is never read, not merely dropped from the result", () => {
    const read: string[] = [];
    const host: SceneReadHost = {
      readDirectory: () => [
        `${PROJECT_ROOT}/node_modules/some-pkg/fixture.go`,
        `${PROJECT_ROOT}/main/board.go`,
      ],
      readFile: (path) => {
        read.push(path);
        return "";
      },
    };
    const { documents } = readSceneDocuments(host, PROJECT_ROOT);
    expect([...documents.keys()]).toEqual(["main/board.go"]);
    expect(read).toEqual([`${PROJECT_ROOT}/main/board.go`, `${PROJECT_ROOT}/game.project`]);
  });

  test("a host that cannot enumerate files yields no documents and a reason", () => {
    const { documents, unreadable } = readSceneDocuments({ readFile: () => "" }, PROJECT_ROOT);
    expect(documents.size).toBe(0);
    expect(unreadable).toHaveLength(1);
  });
});

describe("listProjectResourcePaths", () => {
  test("returns the project's files of that kind as sorted, `/`-prefixed paths", () => {
    const host = hostReturning(
      [
        `${PROJECT_ROOT}/ui/icons.atlas`,
        `${PROJECT_ROOT}/main/hero.atlas`,
        `${PROJECT_ROOT}/ui/main.font`,
      ],
      () => "",
    );
    expect([...listProjectResourcePaths(host, PROJECT_ROOT, [".atlas"])]).toEqual([
      "/main/hero.atlas",
      "/ui/icons.atlas",
    ]);
  });

  test("re-filters by extension rather than trusting the host", () => {
    // A host that ignores its `extensions` argument would otherwise turn a
    // `.font` slot into a project-wide file dump.
    const ignoresExtensions: SceneReadHost = {
      readDirectory: () => [`${PROJECT_ROOT}/main/hero.atlas`, `${PROJECT_ROOT}/ui/main.font`],
      readFile: () => "",
    };
    expect([...listProjectResourcePaths(ignoresExtensions, PROJECT_ROOT, [".atlas"])]).toEqual([
      "/main/hero.atlas",
    ]);
  });

  test("build output is excluded the way the scene walk excludes it", () => {
    const host = hostReturning(
      [`${PROJECT_ROOT}/main/hero.atlas`, `${PROJECT_ROOT}/build/default/_generated_x.atlas`],
      () => "",
    );
    expect([...listProjectResourcePaths(host, PROJECT_ROOT, [".atlas"])]).toEqual([
      "/main/hero.atlas",
    ]);
  });

  test("reads no file contents — the path is the whole suggestion", () => {
    const read: string[] = [];
    const host: SceneReadHost = {
      readDirectory: () => [`${PROJECT_ROOT}/main/hero.atlas`],
      readFile: (path) => {
        read.push(path);
        return "";
      },
    };
    expect([...listProjectResourcePaths(host, PROJECT_ROOT, [".atlas"])]).toEqual([
      "/main/hero.atlas",
    ]);
    expect(read).toEqual([]);
  });

  test("the directories the scaffolded `.defignore` names are not offered", () => {
    const host = hostReturning(
      [
        `${PROJECT_ROOT}/main/hero.atlas`,
        `${PROJECT_ROOT}/node_modules/some-pkg/fixture.atlas`,
        `${PROJECT_ROOT}/.defold-types/sample.atlas`,
        `${PROJECT_ROOT}/.vscode/scratch.atlas`,
        `${PROJECT_ROOT}/build/default/_generated_x.atlas`,
      ],
      () => "",
    );
    expect([...listProjectResourcePaths(host, PROJECT_ROOT, [".atlas"])]).toEqual([
      "/main/hero.atlas",
    ]);
  });

  test("the `.defignore` exclusion is root-anchored, not any-segment", () => {
    // A root-relative `.defignore` line does not name a nested directory, so
    // Defold loads this atlas and the slot must still offer it.
    const host = hostReturning([`${PROJECT_ROOT}/assets/node_modules/tiles.atlas`], () => "");
    expect([...listProjectResourcePaths(host, PROJECT_ROOT, [".atlas"])]).toEqual([
      "/assets/node_modules/tiles.atlas",
    ]);
  });

  test("a host that cannot enumerate files yields nothing", () => {
    expect(listProjectResourcePaths({ readFile: () => "" }, PROJECT_ROOT, [".atlas"]).size).toBe(0);
  });
});

const DRUID_URL = "https://github.com/Insality/druid/archive/refs/tags/16.zip";
const OTHER_URL = "https://github.com/britzl/defold-input/archive/refs/tags/5.zip";

const GAME_PROJECT = `[project]
title = demo
dependencies#0 = ${DRUID_URL}
`;

const MAIN_COLLECTION = `name: "main"
collection_instances {
  id: "ui"
  collection: "/druid/druid.collection"
}
`;

const DRUID_COLLECTION = `name: "druid"
instances {
  id: "root"
}
`;

const MANIFEST = JSON.stringify({ dependencies: [{ key: "druid-16", url: DRUID_URL }] });

const DEPENDENCY_ROOT = `${PROJECT_ROOT}/.defold-types/dependencies`;
const MANIFEST_PATH = `${DEPENDENCY_ROOT}/dependencies.json`;
const DRUID_HOST_PATH = `${DEPENDENCY_ROOT}/druid-16/druid/druid.collection`;

// A host that honors the directory it is handed, the way the editor's own
// `readDirectory` does: the composed walk asks it twice — once for the project
// root and once for the dependency root — and a fake that ignored the argument
// could not tell the two universes apart.
function treeHost(files: Record<string, string | undefined>): SceneReadHost {
  return {
    readDirectory: (directory, extensions) =>
      Object.keys(files).filter(
        (candidate) =>
          candidate.startsWith(`${directory}/`) &&
          (extensions === undefined || extensions.some((ext) => candidate.endsWith(ext))),
      ),
    readFile: (path) => files[path],
  };
}

describe("readSceneDocuments over resolved library dependencies", () => {
  test("a resolved dependency's scenes join the universe at their merged path", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: GAME_PROJECT,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
      [MANIFEST_PATH]: MANIFEST,
      [DRUID_HOST_PATH]: DRUID_COLLECTION,
    });

    const { documents, origins, unreadable, paths } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()].sort()).toEqual([
      "druid/druid.collection",
      "main/main.collection",
    ]);
    expect(documents.get("druid/druid.collection")).toBe(DRUID_COLLECTION);
    expect([...origins]).toEqual([["druid/druid.collection", DRUID_URL]]);
    expect(unreadable).toEqual([]);
    // The watcher is registered on host paths, so the dependency file has to be
    // named as the host holds it, not as the universe keys it.
    expect(paths).toContain(DRUID_HOST_PATH);

    // The keying rule is the index's, not the walk's: an origin-namespaced key
    // would leave this instance unresolvable.
    const index = buildSceneObjectPathIndex(documents);
    expect(index.incomplete).toEqual([]);
    expect([...index.paths]).toContain("/ui/root");
  });

  test("the project's own file wins a merged-path collision", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: GAME_PROJECT,
      [`${PROJECT_ROOT}/druid/druid.collection`]: 'name: "project-owned"\n',
      [MANIFEST_PATH]: MANIFEST,
      [DRUID_HOST_PATH]: DRUID_COLLECTION,
    });

    const { documents, origins, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect(documents.get("druid/druid.collection")).toBe('name: "project-owned"\n');
    expect(origins.has("druid/druid.collection")).toBe(false);
    expect(unreadable).toEqual([
      `druid/druid.collection: also declared by ${DRUID_URL}; the project's own file is used`,
    ]);
  });

  test("a declared dependency the last resolve did not materialize is named", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: `${GAME_PROJECT}dependencies#1 = ${OTHER_URL}\n`,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
      [MANIFEST_PATH]: MANIFEST,
      [DRUID_HOST_PATH]: DRUID_COLLECTION,
    });

    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()].sort()).toEqual([
      "druid/druid.collection",
      "main/main.collection",
    ]);
    expect(unreadable).toEqual([
      `${OTHER_URL}: is declared by game.project but was not materialized by the last resolve`,
    ]);
  });

  test("an absent manifest names the declared dependency and leaves the project intact", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: GAME_PROJECT,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
    });

    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()]).toEqual(["main/main.collection"]);
    expect(unreadable).toEqual([
      `${DRUID_URL}: is declared by game.project but .defold-types/dependencies/dependencies.json is absent`,
    ]);
  });

  test("a manifest that is not JSON names the declared dependency", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: GAME_PROJECT,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
      [MANIFEST_PATH]: "not json at all",
      [DRUID_HOST_PATH]: DRUID_COLLECTION,
    });

    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()]).toEqual(["main/main.collection"]);
    expect(unreadable).toEqual([
      `${DRUID_URL}: is declared by game.project but .defold-types/dependencies/dependencies.json is not a readable dependency manifest`,
    ]);
  });

  test("a manifest whose shape says nothing about dependencies is named the same way", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: GAME_PROJECT,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
      [MANIFEST_PATH]: JSON.stringify({ dependencies: "druid-16" }),
      [DRUID_HOST_PATH]: DRUID_COLLECTION,
    });

    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()]).toEqual(["main/main.collection"]);
    expect(unreadable).toEqual([
      `${DRUID_URL}: is declared by game.project but .defold-types/dependencies/dependencies.json is not a readable dependency manifest`,
    ]);
  });

  test("a materialized directory game.project no longer declares is named", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: GAME_PROJECT,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
      [MANIFEST_PATH]: MANIFEST,
      [DRUID_HOST_PATH]: DRUID_COLLECTION,
      [`${DEPENDENCY_ROOT}/dropped-5/input/input.collection`]: 'name: "dropped"\n',
    });

    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()].sort()).toEqual([
      "druid/druid.collection",
      "main/main.collection",
    ]);
    expect(unreadable).toEqual([
      ".defold-types/dependencies/dropped-5: is materialized but no longer declared by game.project, so its scenes are left out",
    ]);
  });

  test("the earlier-declared dependency wins a collision between two libraries", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: `${GAME_PROJECT}dependencies#1 = ${OTHER_URL}\n`,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
      [MANIFEST_PATH]: JSON.stringify({
        dependencies: [
          { key: "input-5", url: OTHER_URL },
          { key: "druid-16", url: DRUID_URL },
        ],
      }),
      [DRUID_HOST_PATH]: DRUID_COLLECTION,
      [`${DEPENDENCY_ROOT}/input-5/druid/druid.collection`]: 'name: "input-owned"\n',
    });

    const { documents, origins, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect(documents.get("druid/druid.collection")).toBe(DRUID_COLLECTION);
    expect(origins.get("druid/druid.collection")).toBe(DRUID_URL);
    expect(unreadable).toEqual([
      `druid/druid.collection: also declared by ${OTHER_URL}; ${DRUID_URL}'s file is used`,
    ]);
  });

  test("a dependency file that will not read is named against its origin", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: GAME_PROJECT,
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
      [MANIFEST_PATH]: MANIFEST,
      [DRUID_HOST_PATH]: undefined,
    });

    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()]).toEqual(["main/main.collection"]);
    expect(unreadable).toEqual([`druid/druid.collection: could not be read from ${DRUID_URL}`]);
  });

  test("a project that declares no dependency reads exactly as before", () => {
    const host = treeHost({
      [`${PROJECT_ROOT}/game.project`]: "[project]\ntitle = demo\n",
      [`${PROJECT_ROOT}/main/main.collection`]: MAIN_COLLECTION,
    });

    const { documents, origins, unreadable } = readSceneDocuments(host, PROJECT_ROOT);

    expect([...documents.keys()]).toEqual(["main/main.collection"]);
    expect(origins.size).toBe(0);
    expect(unreadable).toEqual([]);
  });
});

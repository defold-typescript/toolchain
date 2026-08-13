import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSceneComponentIndex } from "@defold-typescript/transpiler";
import {
  listProjectResourcePaths,
  readSceneDocuments,
  type SceneReadHost,
} from "./scene-documents";

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
    readFile: (path) => readFileSync(path, "utf8"),
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

  test("feeds a whole component-id universe from the committed example project", () => {
    const root = join(import.meta.dir, "../../../docs/examples/tetris-tutorial");
    const { documents, unreadable } = readSceneDocuments(fsHost(root), root);
    expect(unreadable).toEqual([]);
    const index = buildSceneComponentIndex(documents);
    expect(index.incomplete).toEqual([]);
    expect([...index.ids].sort()).toEqual(["board", "hud"]);
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
    expect(read).toEqual([`${PROJECT_ROOT}/main/board.go`]);
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

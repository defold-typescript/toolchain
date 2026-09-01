import { describe, expect, test } from "bun:test";
import {
  archiveWrapperOf,
  LIBRARY_SCENE_EXTENSIONS,
  libraryIncludedEntries,
  readGameProjectDependencies,
} from "./library-dependencies";

describe("readGameProjectDependencies", () => {
  test("returns every dependencies#N under [project] in file order, URLs verbatim", () => {
    const gameProject = `[bootstrap]
main_collection = /main/main.collectionc

[project]
title = My Game
dependencies#2 = https://github.com/example/ext-b/archive/v2.zip?token=abc&ref=main
dependencies#0 = https://github.com/example/ext-a/archive/v1.zip

[display]
dependencies#1 = https://github.com/example/not-a-dep/archive/v1.zip
width = 960
`;
    expect(readGameProjectDependencies(gameProject)).toEqual([
      { index: 2, url: "https://github.com/example/ext-b/archive/v2.zip?token=abc&ref=main" },
      { index: 0, url: "https://github.com/example/ext-a/archive/v1.zip" },
    ]);
  });

  test("yields [] when [project] declares no dependencies", () => {
    expect(readGameProjectDependencies("[project]\ntitle = My Game\n")).toEqual([]);
  });
});

const LIBRARY_ENTRIES = [
  "lib-1.2.3/game.project",
  "lib-1.2.3/druid/druid.collection",
  "lib-1.2.3/druid/nested/deep.go",
  "lib-1.2.3/druid/druid.lua",
  "lib-1.2.3/extra/x.gui",
  "lib-1.2.3/example/demo.collection",
];

const LIBRARY_GAME_PROJECT = `[project]
title = Druid

[library]
include_dirs = druid, extra
`;

describe("archiveWrapperOf", () => {
  test("names the leading segment every entry shares", () => {
    expect(archiveWrapperOf(LIBRARY_ENTRIES)).toBe("lib-1.2.3");
  });

  test("names nothing when the entries do not share one leading segment", () => {
    expect(archiveWrapperOf(["a/one.go", "b/two.go"])).toBeUndefined();
    expect(archiveWrapperOf(["top.go", "a/one.go"])).toBeUndefined();
    expect(archiveWrapperOf([])).toBeUndefined();
  });
});

describe("LIBRARY_SCENE_EXTENSIONS", () => {
  test("carries the scene, gui and animation-asset kinds and no project kind", () => {
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".collection");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".go");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".gui");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".atlas");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".animationset");
    expect(LIBRARY_SCENE_EXTENSIONS).not.toContain(".project");
    expect(LIBRARY_SCENE_EXTENSIONS).not.toContain(".input_binding");
  });
});

describe("libraryIncludedEntries", () => {
  test("shares only the scene-kind files under the dirs its own game.project includes", () => {
    const { shared, reasons } = libraryIncludedEntries(LIBRARY_ENTRIES, LIBRARY_GAME_PROJECT);
    expect(shared).toEqual([
      { entry: "lib-1.2.3/druid/druid.collection", path: "druid/druid.collection" },
      { entry: "lib-1.2.3/druid/nested/deep.go", path: "druid/nested/deep.go" },
      { entry: "lib-1.2.3/extra/x.gui", path: "extra/x.gui" },
    ]);
    expect(reasons).toEqual([]);
  });

  test("names the archive that declares no [library] include_dirs", () => {
    const { shared, reasons } = libraryIncludedEntries(
      LIBRARY_ENTRIES,
      "[project]\ntitle = Druid\n",
    );
    expect(shared).toEqual([]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("include_dirs");
  });

  test("names the archive that ships no game.project, distinctly", () => {
    const { shared, reasons } = libraryIncludedEntries(LIBRARY_ENTRIES, undefined);
    expect(shared).toEqual([]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("game.project");
    expect(reasons[0]).not.toEqual(
      libraryIncludedEntries(LIBRARY_ENTRIES, "[project]\ntitle = Druid\n").reasons[0],
    );
  });
});

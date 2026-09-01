import { describe, expect, test } from "bun:test";
import {
  archiveWrapperOf,
  isContainedResourcePath,
  libraryIncludedEntries,
  readGameProjectDependencies,
} from "./library-dependencies";
import { LIBRARY_SCENE_EXTENSIONS } from "./scene-documents";

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
  "lib-1.2.3/druid/window.collectionproxy",
  "lib-1.2.3/druid/spawner.collectionfactory",
  "lib-1.2.3/druid/vendor.project",
  "lib-1.2.3/druid/druid.input_binding",
  "lib-1.2.3/extra/x.gui",
  "lib-1.2.3/example/demo.collection",
];

// Entries that clear the include-dir and extension tests but whose merged
// resource path would leave the include dir once joined onto a key directory.
const UNSAFE_LIBRARY_ENTRIES = [
  "lib-1.2.3/druid/../../../../main.collection",
  "lib-1.2.3/druid/..\\..\\..\\..\\win.collection",
  "lib-1.2.3/druid/./x.collection",
  "lib-1.2.3/druid//y.collection",
  "lib-1.2.3/druid/../../../../evil.collectionproxy",
  "lib-1.2.3/druid/../../../../evil.collectionfactory",
];

const LIBRARY_ENTRIES_WITH_UNSAFE = [...LIBRARY_ENTRIES, ...UNSAFE_LIBRARY_ENTRIES];

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
  test("carries the scene, gui, animation-asset and collection-reference kinds and no project kind", () => {
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".collection");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".go");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".gui");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".atlas");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".animationset");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".collectionproxy");
    expect(LIBRARY_SCENE_EXTENSIONS).toContain(".collectionfactory");
    expect(LIBRARY_SCENE_EXTENSIONS).not.toContain(".project");
    expect(LIBRARY_SCENE_EXTENSIONS).not.toContain(".input_binding");
  });
});

describe("libraryIncludedEntries", () => {
  test("shares every address-universe kind under the dirs its own game.project includes", () => {
    const { shared, reasons } = libraryIncludedEntries(LIBRARY_ENTRIES, LIBRARY_GAME_PROJECT);
    expect(shared).toEqual([
      { entry: "lib-1.2.3/druid/druid.collection", path: "druid/druid.collection" },
      { entry: "lib-1.2.3/druid/nested/deep.go", path: "druid/nested/deep.go" },
      {
        entry: "lib-1.2.3/druid/spawner.collectionfactory",
        path: "druid/spawner.collectionfactory",
      },
      { entry: "lib-1.2.3/druid/window.collectionproxy", path: "druid/window.collectionproxy" },
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

  test("an entry whose merged path escapes its include dir is refused, not shared", () => {
    const { shared } = libraryIncludedEntries(LIBRARY_ENTRIES_WITH_UNSAFE, LIBRARY_GAME_PROJECT);
    expect(shared).toEqual([
      { entry: "lib-1.2.3/druid/druid.collection", path: "druid/druid.collection" },
      { entry: "lib-1.2.3/druid/nested/deep.go", path: "druid/nested/deep.go" },
      {
        entry: "lib-1.2.3/druid/spawner.collectionfactory",
        path: "druid/spawner.collectionfactory",
      },
      { entry: "lib-1.2.3/druid/window.collectionproxy", path: "druid/window.collectionproxy" },
      { entry: "lib-1.2.3/extra/x.gui", path: "extra/x.gui" },
    ]);
  });

  test("each refused entry is named", () => {
    expect(
      libraryIncludedEntries(LIBRARY_ENTRIES_WITH_UNSAFE, LIBRARY_GAME_PROJECT).refused,
    ).toEqual(UNSAFE_LIBRARY_ENTRIES);
    expect(libraryIncludedEntries(LIBRARY_ENTRIES, LIBRARY_GAME_PROJECT).refused).toEqual([]);
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

describe("isContainedResourcePath", () => {
  test("accepts a plain nested path and rejects each unsafe shape", () => {
    expect(isContainedResourcePath("druid/nested/deep.go")).toBe(true);
    expect(isContainedResourcePath("..assets/main.collection")).toBe(true);
    expect(isContainedResourcePath("druid/../evil.collection")).toBe(false);
    expect(isContainedResourcePath("druid/./x.collection")).toBe(false);
    expect(isContainedResourcePath("druid\\..\\win.collection")).toBe(false);
    expect(isContainedResourcePath("/druid/x.collection")).toBe(false);
    expect(isContainedResourcePath("druid//y.collection")).toBe(false);
    expect(isContainedResourcePath("")).toBe(false);
  });
});

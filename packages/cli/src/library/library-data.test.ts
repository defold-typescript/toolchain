import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type BehaviorVerdict,
  LibraryDataError,
  libraryFolderName,
  readIndexSlots,
  readLibraryData,
  readLibraryReviews,
  writeReviewedJson,
} from "./library-data";
import { printLibraryModules } from "./print-library";

const FLOW_FORK = "declare module 'flow.ui' {\n  export function draw(): void;\n}\n";

function write(root: string, path: string, contents: unknown): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
}

// `flow` generates one module from LuaLS sources and forks another; `box2d` is a
// native extension with one index slot.
function writeDataFolder(): string {
  const root = mkdtempSync(join(tmpdir(), "library-data-"));
  write(root, "github.com/pause-games/flow/library.json", {
    repo: "https://github.com/Pause-Games/flow",
    license: "MIT",
    forks: [
      {
        authored: "fork/flow.ui.d.ts",
        moduleId: "flow.ui",
        namespace: "flow.ui",
        apiDoc: "api-doc/flow.ui.json",
        upstreamLua: ["source/upstream/flow/ui.lua"],
      },
    ],
  });
  write(root, "github.com/pause-games/flow/reviewed.json", { ref: "v1.2.0" });
  write(root, "github.com/pause-games/flow/recipe.json", {
    luals: [
      {
        sourceGlobs: ["flow/**/*.lua"],
        moduleId: "flow.layout",
        namespace: "flow.layout",
        typeRenames: { vector3: "Vector3" },
      },
    ],
  });
  write(root, "github.com/pause-games/flow/fork/flow.ui.d.ts", FLOW_FORK);
  write(
    root,
    "github.com/pause-games/flow/source/upstream/flow/ui.lua",
    "local M = {}\nreturn M\n",
  );
  write(
    root,
    "github.com/pause-games/flow/source/flow.layout/flow/layout.lua",
    "local M = {}\nreturn M\n",
  );
  write(root, "github.com/owner/box2d/library.json", {
    repo: "https://github.com/owner/box2d",
    license: "MIT",
    refKind: "tag",
    native: {
      namespace: "box2d",
      manifestDir: "box2d",
      declaration: "fork/box2d.d.ts",
      upstreamSource: "source/upstream/box2d/src/box2d.cpp",
    },
    indexSlots: {
      "box2d/GetAABB:param:childIndex": {
        class: "native-0",
        evidence: "fixture.cpp:229 passes it on unchanged",
      },
    },
  });
  write(root, "github.com/owner/box2d/reviewed.json", { ref: "v2.0" });
  write(root, "github.com/owner/box2d/fork/box2d.d.ts", "declare module 'box2d' {}\n");
  return root;
}

// The message `readLibraryData` refuses the folder with; the folder is removed either way.
function refusalMessage(root: string): string {
  try {
    readLibraryData(root);
  } catch (error) {
    if (error instanceof LibraryDataError) return error.message;
    throw error;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  throw new Error("readLibraryData accepted the folder");
}

describe("readLibraryData projects each library folder into lane targets", () => {
  test("a library's targets carry its repo, license and reviewed ref, with paths under its folder", () => {
    const root = writeDataFolder();
    try {
      const [box2d, flow] = readLibraryData(root);

      expect(flow).toEqual({
        dir: "github.com/pause-games/flow",
        repo: "https://github.com/Pause-Games/flow",
        ref: "v1.2.0",
        license: "MIT",
        follows: "tags",
        luals: [
          {
            repo: "https://github.com/Pause-Games/flow",
            ref: "v1.2.0",
            license: "MIT",
            sourceGlobs: ["flow/**/*.lua"],
            moduleId: "flow.layout",
            namespace: "flow.layout",
            typeRenames: { vector3: "Vector3" },
            ignore: [],
            sourceDir: "github.com/pause-games/flow/source/flow.layout",
          },
        ],
        scriptApi: [],
        authored: [
          {
            repo: "https://github.com/Pause-Games/flow",
            ref: "v1.2.0",
            license: "MIT",
            authored: "github.com/pause-games/flow/fork/flow.ui.d.ts",
            moduleId: "flow.ui",
            namespace: "flow.ui",
            apiDoc: "api-doc/flow.ui.json",
            fidelity: "fidelity/flow.ui.json",
            upstreamLua: ["github.com/pause-games/flow/source/upstream/flow/ui.lua"],
          },
        ],
        native: [],
        indexSlots: {},
        floors: {},
        parityExceptions: {},
        behaviorVerdicts: {},
        usage: [],
      });
      expect(box2d).toEqual({
        dir: "github.com/owner/box2d",
        repo: "https://github.com/owner/box2d",
        ref: "v2.0",
        license: "MIT",
        refKind: "tag",
        follows: "tags",
        luals: [],
        scriptApi: [],
        authored: [],
        native: [
          {
            repo: "https://github.com/owner/box2d",
            ref: "v2.0",
            refKind: "tag",
            license: "MIT",
            namespace: "box2d",
            manifestDir: "box2d",
            declaration: "github.com/owner/box2d/fork/box2d.d.ts",
            upstreamSource: "github.com/owner/box2d/source/upstream/box2d/src/box2d.cpp",
          },
        ],
        indexSlots: {
          "box2d/GetAABB:param:childIndex": {
            class: "native-0",
            evidence: "fixture.cpp:229 passes it on unchanged",
          },
        },
        floors: {},
        parityExceptions: {},
        behaviorVerdicts: {},
        usage: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library's usage examples are every .ts file under its usage folder, sorted", () => {
    const root = writeDataFolder();
    try {
      write(root, "github.com/pause-games/flow/usage/nested/b.test-d.ts", "export {};\n");
      write(root, "github.com/pause-games/flow/usage/a.test-d.ts", "export {};\n");
      write(root, "github.com/pause-games/flow/usage/notes.md", "# notes\n");

      const [box2d, flow] = readLibraryData(root);

      expect(flow?.usage).toEqual([
        "github.com/pause-games/flow/usage/a.test-d.ts",
        "github.com/pause-games/flow/usage/nested/b.test-d.ts",
      ]);
      expect(box2d?.usage).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("printing a forked module reads the fork the library folder holds", async () => {
    const root = writeDataFolder();
    try {
      const { printed } = await printLibraryModules(root, ["flow.ui"], null);

      expect(printed.map(({ module, contents, ref }) => ({ module, contents, ref }))).toEqual([
        { module: "flow.ui", contents: FLOW_FORK, ref: "v1.2.0" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("readLibraryData refuses a data folder that breaks its invariants", () => {
  test("a module two library folders name is refused, naming both folders", () => {
    const root = writeDataFolder();
    try {
      write(root, "github.com/someone/other-flow/library.json", {
        repo: "https://github.com/someone/other-flow",
        license: "MIT",
        forks: [
          {
            authored: "fork/flow.ui.d.ts",
            moduleId: "flow.ui",
            namespace: "flow.ui",
            apiDoc: "api-doc/flow.ui.json",
            parityVerdict: { reason: "no-module-file", note: "the repo ships no module file" },
          },
        ],
      });
      write(root, "github.com/someone/other-flow/reviewed.json", { ref: "1.0" });

      expect(() => readLibraryData(root)).toThrow(/flow\.ui.*\bflow\b.*\bother-flow\b/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library folder without reviewed.json is refused, naming the missing file", () => {
    const root = writeDataFolder();
    try {
      rmSync(join(root, "github.com/owner/box2d/reviewed.json"));

      expect(() => readLibraryData(root)).toThrow("github.com/owner/box2d/reviewed.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a folder named other than its repo is refused, naming both", () => {
    const root = writeDataFolder();
    try {
      write(root, "github.com/pause-games/flow/library.json", {
        repo: "https://github.com/Pause-Games/flow-ui",
        license: "MIT",
      });

      expect(() => readLibraryData(root)).toThrow(/\bflow\b.*flow-ui/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a recipe entry missing a required field is refused, naming the recipe", () => {
    const root = writeDataFolder();
    try {
      write(root, "github.com/pause-games/flow/recipe.json", {
        luals: [{ moduleId: "flow.layout", namespace: "flow.layout" }],
      });

      expect(() => readLibraryData(root)).toThrow(
        'flow/recipe.json: entry flow.layout is missing required field "sourceGlobs".',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("readLibraryData leaves out a library whose minCli is above the CLI", () => {
  function withGated(fields: Record<string, unknown> = {}): string {
    const root = writeDataFolder();
    write(root, "github.com/owner/gated/library.json", {
      repo: "https://github.com/owner/gated",
      license: "MIT",
      minCli: "0.62.0",
      ...fields,
    });
    write(root, "github.com/owner/gated/reviewed.json", { ref: "1.0" });
    return root;
  }

  function readDirs(root: string, cliVersion?: string): string[] {
    return readLibraryData(root, cliVersion === undefined ? {} : { cliVersion }).map(
      ({ dir }) => dir,
    );
  }

  function caught(read: () => unknown): unknown {
    try {
      read();
    } catch (error) {
      return error;
    }
    throw new Error("expected the read to throw");
  }

  test("a CLI below it reads every other library and not that one", () => {
    const root = withGated();
    try {
      expect(readDirs(root, "0.61.0")).toEqual([
        "github.com/owner/box2d",
        "github.com/pause-games/flow",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const cliVersion of ["0.62.0", "0.62.0-rc.1", "0.100.0", "1.0.0", "0.0.0"]) {
    test(`a ${cliVersion} CLI reads it`, () => {
      const root = withGated();
      try {
        expect(readDirs(root, cliVersion)).toEqual([
          "github.com/owner/box2d",
          "github.com/owner/gated",
          "github.com/pause-games/flow",
        ]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  test("a reader given no CLI version reads it", () => {
    const root = withGated();
    try {
      expect(readDirs(root)).toEqual([
        "github.com/owner/box2d",
        "github.com/owner/gated",
        "github.com/pause-games/flow",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a CLI below it skips the library before reading a field it would refuse", () => {
    const root = withGated({ forks: "x" });
    try {
      expect(readDirs(root, "0.61.0")).toEqual([
        "github.com/owner/box2d",
        "github.com/pause-games/flow",
      ]);
      const error = caught(() => readDirs(root, "0.62.0"));
      expect(error).toBeInstanceOf(LibraryDataError);
      expect((error as LibraryDataError).library).toBe("github.com/owner/gated");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const minCli of ["0.62", 62]) {
    for (const cliVersion of [undefined, "0.61.0", "0.62.0"]) {
      test(`a minCli of ${JSON.stringify(minCli)} is refused by a ${cliVersion ?? "versionless"} reader, naming minCli`, () => {
        const root = withGated({ minCli });
        try {
          const error = caught(() => readDirs(root, cliVersion));
          expect(error).toBeInstanceOf(LibraryDataError);
          expect((error as LibraryDataError).library).toBe("github.com/owner/gated");
          expect((error as LibraryDataError).message).toContain("minCli");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    }
  }

  test("a module it shares with a library the CLI reads is no conflict below it", () => {
    const root = withGated({
      forks: [
        {
          authored: "fork/flow.ui.d.ts",
          moduleId: "flow.ui",
          namespace: "flow.ui",
          apiDoc: "api-doc/flow.ui.json",
          parityVerdict: { reason: "no-module-file", note: "the repo ships no module file" },
        },
      ],
    });
    try {
      expect(readDirs(root, "0.61.0")).toEqual([
        "github.com/owner/box2d",
        "github.com/pause-games/flow",
      ]);
      expect(() => readDirs(root, "0.62.0")).toThrow(/flow\.ui.*\bowner\/gated\b/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an index slot it shares with a library the CLI reads is no conflict below it", () => {
    const slot = "box2d/GetAABB:param:childIndex";
    const root = withGated({
      indexSlots: { [slot]: { class: "native-0", evidence: "gated.cpp:1 passes it on unchanged" } },
    });
    try {
      expect(readIndexSlots(root, { cliVersion: "0.61.0" })[slot]?.evidence).toBe(
        "fixture.cpp:229 passes it on unchanged",
      );
      expect(() => readIndexSlots(root, { cliVersion: "0.62.0" })).toThrow(
        `index slot ${slot} is classified twice`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("readLibraryData refuses a name or path that leaves its library folder", () => {
  const BAD_IDS = ["../x", "a/b", ".hidden", ""];

  const FLOW_FORK_ENTRY = {
    authored: "fork/flow.ui.d.ts",
    moduleId: "flow.ui",
    namespace: "flow.ui",
    apiDoc: "api-doc/flow.ui.json",
    upstreamLua: ["source/upstream/flow/ui.lua"],
  };

  const FLOW_LUALS_ENTRY = {
    sourceGlobs: ["flow/**/*.lua"],
    moduleId: "flow.layout",
    namespace: "flow.layout",
  };

  const BOX2D_NATIVE = {
    namespace: "box2d",
    manifestDir: "box2d",
    declaration: "fork/box2d.d.ts",
    upstreamSource: "source/upstream/box2d/src/box2d.cpp",
  };

  function writeFlowFork(root: string, fork: Record<string, unknown>): void {
    write(root, "github.com/pause-games/flow/library.json", {
      repo: "https://github.com/Pause-Games/flow",
      license: "MIT",
      forks: [{ ...FLOW_FORK_ENTRY, ...fork }],
    });
  }

  function writeFlowRecipe(root: string, recipe: Record<string, unknown>): void {
    write(root, "github.com/pause-games/flow/recipe.json", recipe);
  }

  function writeBox2dNative(root: string, native: Record<string, unknown>): void {
    write(root, "github.com/owner/box2d/library.json", {
      repo: "https://github.com/owner/box2d",
      license: "MIT",
      native: { ...BOX2D_NATIVE, ...native },
    });
  }

  function refusal(edit: (root: string) => void): string {
    const root = writeDataFolder();
    try {
      edit(root);
      readLibraryData(root);
    } catch (error) {
      return (error as Error).message;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    throw new Error("readLibraryData accepted the data folder");
  }

  const ID_CASES: [string, (root: string, id: string) => void][] = [
    ["a fork moduleId", (root, id) => writeFlowFork(root, { moduleId: id })],
    [
      "a luals moduleId",
      (root, id) => writeFlowRecipe(root, { luals: [{ ...FLOW_LUALS_ENTRY, moduleId: id }] }),
    ],
    [
      "a scriptApi moduleId",
      (root, id) =>
        writeFlowRecipe(root, {
          scriptApi: [
            {
              scriptApi: "flow/flow.script_api",
              moduleId: id,
              namespace: "flow.api",
              apiDoc: "api-doc/flow.api.json",
            },
          ],
        }),
    ],
    ["a native namespace", (root, id) => writeBox2dNative(root, { namespace: id })],
  ];

  for (const [what, edit] of ID_CASES) {
    for (const id of BAD_IDS) {
      test(`${what} of ${JSON.stringify(id)} is refused, naming the folder and the value`, () => {
        const message = refusal((root) => edit(root, id));

        const folder =
          what === "a native namespace"
            ? "github.com/owner/box2d/"
            : "github.com/pause-games/flow/";
        expect(message).toContain(folder);
        expect(message).toContain(JSON.stringify(id));
      });
    }
  }

  const PATH_CASES: [string, string, (root: string, path: string) => void][] = [
    [
      "a fork authored path",
      "github.com/pause-games/flow/",
      (root, path) => writeFlowFork(root, { authored: path }),
    ],
    [
      "a fork upstreamLua path",
      "github.com/pause-games/flow/",
      (root, path) => writeFlowFork(root, { upstreamLua: [path] }),
    ],
    [
      "a native declaration path",
      "github.com/owner/box2d/",
      (root, path) => writeBox2dNative(root, { declaration: path }),
    ],
    [
      "a native upstreamSource path",
      "github.com/owner/box2d/",
      (root, path) => writeBox2dNative(root, { upstreamSource: path }),
    ],
    [
      "a recipe sourceGlobs entry",
      "github.com/pause-games/flow/",
      (root, path) =>
        writeFlowRecipe(root, { luals: [{ ...FLOW_LUALS_ENTRY, sourceGlobs: [path] }] }),
    ],
  ];

  for (const [what, folder, edit] of PATH_CASES) {
    for (const path of ["../other/fork.d.ts", "/tmp/elsewhere/fork.d.ts"]) {
      test(`${what} of ${path} is refused, naming the folder and the path`, () => {
        const message = refusal((root) => edit(root, path));

        expect(message).toContain(folder);
        expect(message).toContain(path);
      });
    }
  }

  test("a path that steps out and back into its library folder is read", () => {
    const root = writeDataFolder();
    try {
      writeFlowFork(root, { authored: "fork/../fork/flow.ui.d.ts" });

      const flow = readLibraryData(root).find(({ dir }) => dir === "github.com/pause-games/flow");

      expect(flow?.authored[0]?.authored).toBe(
        "github.com/pause-games/flow/fork/../fork/flow.ui.d.ts",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("libraryFolderName", () => {
  test("is the repo's host/owner/repo, lowercased, without .git", () => {
    expect(libraryFolderName("https://github.com/britzl/boom")).toBe("github.com/britzl/boom");
    expect(libraryFolderName("https://github.com/HGPoint/Defold_Live_Unbundler.git")).toBe(
      "github.com/hgpoint/defold_live_unbundler",
    );
    expect(libraryFolderName("https://codeberg.org/Klaleus/defold-shutter/")).toBe(
      "codeberg.org/klaleus/defold-shutter",
    );
  });

  test("throws, naming the port, for a repo on a host with one", () => {
    expect(() => libraryFolderName("http://git.acme.com:3000/games/monarch")).toThrow(
      "repo http://git.acme.com:3000/games/monarch is on git.acme.com:3000, and a library folder cannot hold a port",
    );
  });

  test.each([
    "https://host/../mylib",
    "https://host/./mylib",
    "https://host/owner/a\\..\\..\\mylib",
  ])("throws, naming the repo, for %s, whose owner or repo is not a plain name", (repo) => {
    expect(() => libraryFolderName(repo)).toThrow(
      `repo ${repo} is not a host/owner/repo of plain names`,
    );
  });
});

describe("readLibraryData reads each library at its host/owner/repo folder", () => {
  function writeBoom(root: string, folder: string, repo: string): void {
    write(root, `${folder}/library.json`, { repo, license: "MIT" });
    write(root, `${folder}/reviewed.json`, { ref: "v1.0" });
  }

  function refusalOf(root: string): LibraryDataError {
    try {
      readLibraryData(root);
    } catch (error) {
      if (error instanceof LibraryDataError) return error;
      throw error;
    }
    throw new Error("readLibraryData accepted the data folder");
  }

  test("a library at host/owner/repo is read with that folder as its dir", () => {
    const root = mkdtempSync(join(tmpdir(), "library-data-"));
    try {
      writeBoom(root, "github.com/britzl/boom", "https://github.com/Britzl/Boom");
      write(root, "asset-portal-script-api/api-doc/x.json", "{}");

      expect(readLibraryData(root).map(({ dir }) => dir)).toEqual(["github.com/britzl/boom"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library left at owner/repo is refused, naming its host/owner/repo folder", () => {
    const root = mkdtempSync(join(tmpdir(), "library-data-"));
    try {
      writeBoom(root, "owner/mylib", "https://github.com/owner/mylib");

      const refused = refusalOf(root);
      expect(refused.library).toBe("owner/mylib");
      expect(refused.message).toContain("belongs in folder github.com/owner/mylib");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library in a top-level folder is refused, naming its host/owner/repo folder", () => {
    const root = mkdtempSync(join(tmpdir(), "library-data-"));
    try {
      writeBoom(root, "boom", "https://github.com/Britzl/Boom");

      expect(refusalOf(root).message).toContain("github.com/britzl/boom");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a repo with no owner is refused, naming the missing owner", () => {
    const root = mkdtempSync(join(tmpdir(), "library-data-"));
    try {
      writeBoom(root, "boom", "https://example.com/boom");

      expect(refusalOf(root).message).toContain("names no owner");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("readLibraryData reads a library's coverage floors and parity exceptions", () => {
  // `flow` measures `flow.ui` and `flow.layout`, `box2d` measures its namespace.
  function writeFloors(
    floors: unknown,
    parityExceptions?: unknown,
    folder: "flow" | "box2d" = "flow",
  ): string {
    const root = writeDataFolder();
    const library =
      folder === "flow"
        ? {
            repo: "https://github.com/Pause-Games/flow",
            forks: [
              {
                authored: "fork/flow.ui.d.ts",
                moduleId: "flow.ui",
                namespace: "flow.ui",
                apiDoc: "api-doc/flow.ui.json",
                upstreamLua: ["source/upstream/flow/ui.lua"],
              },
            ],
          }
        : {
            repo: "https://github.com/owner/box2d",
            native: {
              namespace: "box2d",
              manifestDir: "box2d",
              declaration: "fork/box2d.d.ts",
              upstreamSource: "source/upstream/box2d/src/box2d.cpp",
            },
          };
    write(
      root,
      `${folder === "flow" ? "github.com/pause-games/flow" : "github.com/owner/box2d"}/library.json`,
      {
        ...library,
        floors,
        ...(parityExceptions === undefined ? {} : { parityExceptions }),
      },
    );
    return root;
  }

  function refusal(root: string): LibraryDataError {
    try {
      readLibraryData(root);
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      if (error instanceof LibraryDataError) return error;
      throw error;
    }
    rmSync(root, { recursive: true, force: true });
    throw new Error("readLibraryData accepted the folder");
  }

  test("floors and parity exceptions read back as fields of their library", () => {
    const exception = {
      name: "init",
      kind: "script-lifecycle" as const,
      reason: "ui.lua:1 says so",
    };
    const root = writeFloors(
      { "flow.layout": 0.75, "flow.ui": { callable: 1, field: 0.5 } },
      { "flow.ui": [exception] },
    );
    try {
      const [, flow] = readLibraryData(root);
      expect(flow?.floors).toEqual({ "flow.layout": 0.75, "flow.ui": { callable: 1, field: 0.5 } });
      expect(flow?.parityExceptions).toEqual({ "flow.ui": [exception] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library with neither field reads back empty", () => {
    const root = writeDataFolder();
    try {
      const [box2d, flow] = readLibraryData(root);
      expect(flow?.floors).toEqual({});
      expect(flow?.parityExceptions).toEqual({});
      expect(box2d?.floors).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a native library's floor is keyed by its namespace", () => {
    const root = writeFloors({ box2d: { callable: 1, field: 1 } }, undefined, "box2d");
    try {
      expect(readLibraryData(root)[0]?.floors).toEqual({ box2d: { callable: 1, field: 1 } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // One module named after an `Object.prototype` member. `JSON.parse` makes `__proto__` an
  // own key, where a `{ __proto__: 1 }` literal sets a prototype and writes no key.
  function writeProtoFloor(lane: "luals" | "fork", floor: unknown): string {
    const root = mkdtempSync(join(tmpdir(), "library-data-"));
    write(root, "github.com/owner/lib/library.json", {
      repo: "https://github.com/owner/lib",
      ...(lane === "fork"
        ? {
            forks: [
              {
                authored: "fork/lib.d.ts",
                moduleId: "__proto__",
                namespace: "lib.main",
                apiDoc: "api-doc/lib.json",
                upstreamLua: ["source/upstream/main.lua"],
              },
            ],
          }
        : {}),
      floors: JSON.parse(`{"__proto__": ${JSON.stringify(floor)}}`),
    });
    write(root, "github.com/owner/lib/reviewed.json", { ref: "v1.0.0" });
    if (lane === "luals") {
      write(root, "github.com/owner/lib/recipe.json", {
        luals: [{ sourceGlobs: ["**/*.lua"], moduleId: "__proto__", namespace: "lib" }],
      });
    }
    return root;
  }

  test("a LuaLS module named __proto__ keeps its floor as an own entry", () => {
    const root = writeProtoFloor("luals", 0.5);
    try {
      const floors = readLibraryData(root)[0]?.floors ?? {};
      expect(Object.entries(floors)).toEqual([["__proto__", 0.5]]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a fork module named __proto__ keeps its floor as an own entry, not as the prototype", () => {
    const floor = { callable: 1, field: 0.5 };
    const root = writeProtoFloor("fork", floor);
    try {
      const floors = readLibraryData(root)[0]?.floors ?? {};
      expect(Object.entries(floors)).toEqual([["__proto__", floor]]);
      expect(floors.callable).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library with no floors inherits none", () => {
    const root = writeDataFolder();
    try {
      const floors = readLibraryData(root)[1]?.floors ?? {};
      for (const name of ["constructor", "__proto__"]) expect(floors[name]).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a floor for a module the library does not serve is refused, naming the library and the key", () => {
    const error = refusal(writeFloors({ "flow.gone": 1 }));
    expect(error.library).toBe("github.com/pause-games/flow");
    expect(error.message).toContain('"flow.gone"');
  });

  test("a floor for a fork that records a parity verdict is refused, since nothing measures it", () => {
    const root = writeDataFolder();
    write(root, "github.com/pause-games/flow/library.json", {
      repo: "https://github.com/Pause-Games/flow",
      floors: { "flow.ui": { callable: 1, field: 1 } },
      forks: [
        {
          authored: "fork/flow.ui.d.ts",
          moduleId: "flow.ui",
          namespace: "flow.ui",
          apiDoc: "api-doc/flow.ui.json",
          parityVerdict: { reason: "no-module-file", note: "nothing to read" },
        },
      ],
    });
    const error = refusal(root);
    expect(error.library).toBe("github.com/pause-games/flow");
    expect(error.message).toContain('"flow.ui"');
  });

  test("a token module's floor must be a ratio", () => {
    for (const bad of [null, false, "0.9", -0.1, 1.1, { callable: 1, field: 1 }]) {
      const error = refusal(writeFloors({ "flow.layout": bad }));
      expect(error.message).toContain('floor "flow.layout" must be a finite number in [0, 1]');
    }
  });

  test("a measured fork's floor must carry both axes, each a ratio", () => {
    expect(refusal(writeFloors({ "flow.ui": 0.35 })).message).toMatch(
      /"flow\.ui".*"callable".*"field"/,
    );
    expect(refusal(writeFloors({ "flow.ui": { callable: 0.35 } })).message).toMatch(
      /"flow\.ui".*missing its "field" axis/,
    );
    expect(refusal(writeFloors({ "flow.ui": { field: 1 } })).message).toMatch(
      /"flow\.ui".*missing its "callable" axis/,
    );
    for (const bad of [-0.1, 1.1, null, "1"]) {
      expect(refusal(writeFloors({ "flow.ui": { callable: 0.35, field: bad } })).message).toMatch(
        /"flow\.ui" axis "field"/,
      );
    }
  });

  test("floors that are not an object of entries are refused", () => {
    for (const bad of [null, [], 1]) {
      expect(refusal(writeFloors(bad)).message).toContain("floors");
    }
  });

  test("parity exceptions for a fork the library does not measure are refused, naming the key", () => {
    const entry = { name: "init", kind: "script-lifecycle", reason: "ui.lua:1 says so" };
    const error = refusal(writeFloors({}, { "flow.gone": [entry] }));
    expect(error.library).toBe("github.com/pause-games/flow");
    expect(error.message).toContain('"flow.gone"');
  });

  test("a malformed parity exception is refused, naming the library", () => {
    const malformed: [unknown, RegExp][] = [
      [[], /expected a JSON object/],
      [{ "flow.ui": { name: "init" } }, /must be an array/],
      [{ "flow.ui": [{ kind: "script-lifecycle", reason: "x" }] }, /"name"/],
      [{ "flow.ui": [{ name: "init", kind: "script-lifecycle" }] }, /"reason"/],
      [{ "flow.ui": [{ name: "init", kind: "inconvenient", reason: "x" }] }, /inconvenient/],
    ];
    for (const [raw, message] of malformed) {
      const error = refusal(writeFloors({}, raw));
      expect(error.library).toBe("github.com/pause-games/flow");
      expect(error.message).toMatch(message);
    }
  });
});

describe("a library's recorded reviews", () => {
  const REVIEW = {
    version: 1,
    commits: ["0123456789abcdef0123456789abcdef01234567"],
    api: "a".repeat(64),
    doc: "b".repeat(64),
    source: "c".repeat(64),
    members: { "flow/ui.lua#draw": "d".repeat(16) },
  };

  test("a reviewed.json with no reviews stays valid and reads as null", () => {
    const root = writeDataFolder();
    try {
      expect(readLibraryData(root).map(({ dir }) => dir)).toEqual([
        "github.com/owner/box2d",
        "github.com/pause-games/flow",
      ]);
      expect(readLibraryReviews(root, "github.com/pause-games/flow")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a written review reads back through the reader", () => {
    const root = writeDataFolder();
    try {
      writeReviewedJson(root, "github.com/pause-games/flow", { ref: "v1.2.0", reviews: [REVIEW] });

      expect(
        readLibraryData(root).find(({ dir }) => dir === "github.com/pause-games/flow")?.ref,
      ).toBe("v1.2.0");
      expect(readLibraryReviews(root, "github.com/pause-games/flow")).toEqual([REVIEW]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const [what, reviews, field] of [
    ["reviews that are not an array", { api: "a" }, '"reviews"'],
    ["an entry that is not an object", ["a"], "reviews[0]"],
    ["no version", [{ ...REVIEW, version: "1" }], '"version"'],
    ["no commits", [{ ...REVIEW, commits: undefined }], '"commits"'],
    ["a commit that is not a string", [{ ...REVIEW, commits: [1] }], '"commits"'],
    ["a non-string api hash", [{ ...REVIEW, api: 1 }], '"api"'],
    ["a non-string doc hash", [{ ...REVIEW, doc: null }], '"doc"'],
    ["a non-string source hash", [{ ...REVIEW, source: {} }], '"source"'],
    ["members that are not an object", [{ ...REVIEW, members: ["a"] }], '"members"'],
    ["a member hash that is not a string", [{ ...REVIEW, members: { a: 1 } }], '"members"'],
  ] as const) {
    test(`${what} is refused, naming reviewed.json and the library`, () => {
      const root = writeDataFolder();
      try {
        write(root, "github.com/pause-games/flow/reviewed.json", { ref: "v1.2.0", reviews });

        let refused: unknown;
        try {
          readLibraryData(root);
        } catch (error) {
          refused = error;
        }

        expect(refused).toBeInstanceOf(LibraryDataError);
        expect((refused as LibraryDataError).library).toBe("github.com/pause-games/flow");
        expect((refused as LibraryDataError).message).toContain(
          "github.com/pause-games/flow/reviewed.json",
        );
        expect((refused as LibraryDataError).message).toContain(field);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

describe("readLibraryData reads a library's behavior verdicts", () => {
  // `flow` measures `flow.ui` only; `flow.layout` is generated, so no verdict can name it.
  function withVerdicts(behaviorVerdicts: unknown): string {
    const root = writeDataFolder();
    write(root, "github.com/pause-games/flow/library.json", {
      repo: "https://github.com/Pause-Games/flow",
      forks: [
        {
          authored: "fork/flow.ui.d.ts",
          moduleId: "flow.ui",
          namespace: "flow.ui",
          apiDoc: "api-doc/flow.ui.json",
          upstreamLua: ["source/upstream/flow/ui.lua"],
        },
      ],
      behaviorVerdicts,
    });
    return root;
  }

  test("verdicts read back as a field of their library, a slot only where the list names one", () => {
    const verdicts: BehaviorVerdict[] = [
      { list: "valueReturns", name: "draw", reason: "ui.lua:3 forwards a void call" },
      { list: "emptyObjectSlots", name: "draw", slot: "return", reason: "ui.lua:3 says so" },
    ];
    const root = withVerdicts({ "flow.ui": verdicts });
    try {
      const flow = readLibraryData(root).find((library) => library.dir.endsWith("flow"));
      expect(flow?.behaviorVerdicts).toEqual({ "flow.ui": verdicts });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    ["an unknown list", { list: "arity", name: "draw", reason: "r" }, "unknown list"],
    [
      "a valueReturns verdict naming a slot",
      { list: "valueReturns", name: "draw", slot: "x", reason: "r" },
      "whose entries name no slot",
    ],
    [
      "a slot-list verdict without a slot",
      { list: "nilTolerantRequired", name: "draw", reason: "r" },
      '"slot"',
    ],
    ["a verdict without a reason", { list: "valueReturns", name: "draw" }, '"reason"'],
  ])("%s is refused", (_case, verdict, expected) => {
    expect(refusalMessage(withVerdicts({ "flow.ui": [verdict] }))).toContain(expected);
  });

  test("a namespace the library does not measure is refused", () => {
    const message = refusalMessage(
      withVerdicts({ "flow.layout": [{ list: "valueReturns", name: "x", reason: "r" }] }),
    );
    expect(message).toContain('behaviorVerdicts "flow.layout" names no fork this library measures');
  });
});

describe("LuaLS annotation overrides name their evidence", () => {
  const LAYOUT = "github.com/pause-games/flow/source/flow.layout/flow/layout.lua";
  const LAYOUT_LUA = "local M = {}\n\nfunction M.f(x)\n\tx = x or\n\t\t1\nend\n\nreturn M\n";
  const evidence = { file: "flow/layout.lua", contains: "x = x or 1" };

  function withOverrides(annotationOverrides: unknown): string {
    const root = writeDataFolder();
    write(root, LAYOUT, LAYOUT_LUA);
    write(root, "github.com/pause-games/flow/recipe.json", {
      luals: [
        {
          sourceGlobs: ["flow/**/*.lua"],
          moduleId: "flow.layout",
          namespace: "flow.layout",
          annotationOverrides,
        },
      ],
    });
    return root;
  }

  function reads(root: string): void {
    try {
      readLibraryData(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function paramOverride(paramEvidence: unknown): unknown {
    return {
      moduleFunctions: { f: { params: { x: { optional: true, evidence: paramEvidence } } } },
    };
  }

  test("an override without evidence is refused, naming its path", () => {
    const message = refusalMessage(
      withOverrides({ moduleFunctions: { f: { params: { x: { optional: true } } } } }),
    );
    expect(message).toContain("recipe.json: entry flow.layout");
    expect(message).toContain("annotationOverrides.moduleFunctions.f.params.x");
  });

  test.each([
    [
      "a field retype",
      { interfaces: { I: { fields: { a: { type: "string" } } } } },
      "interfaces.I.fields.a",
    ],
    [
      "a field drop",
      { interfaces: { I: { fields: { a: { drop: true } } } } },
      "interfaces.I.fields.a",
    ],
    [
      "a method return",
      { interfaces: { I: { methods: { m: { return: "nil" } } } } },
      "interfaces.I.methods.m",
    ],
    [
      "an optional method",
      { interfaces: { I: { methods: { m: { optional: true } } } } },
      "interfaces.I.methods.m",
    ],
    [
      "a call signature",
      { interfaces: { I: { callSignature: { drop: true } } } },
      "interfaces.I.callSignature",
    ],
    ["a module object", { moduleObject: { interface: "I", fields: {} } }, "moduleObject"],
    [
      "a module object field",
      { moduleObject: { interface: "I", evidence, fields: { e: { type: "E" } } } },
      "moduleObject.fields.e",
    ],
    ["a module constant", { moduleConstants: { C: { type: "number" } } }, "moduleConstants.C"],
  ])("%s without evidence is refused, naming its path", (_case, overrides, path) => {
    expect(refusalMessage(withOverrides(overrides))).toContain(`annotationOverrides.${path} `);
  });

  test("evidence naming a file absent from the source folder is refused, naming the file", () => {
    const message = refusalMessage(
      withOverrides(paramOverride({ file: "flow/missing.lua", contains: "x = x or 1" })),
    );
    expect(message).toContain("flow/missing.lua");
  });

  test("evidence naming a file outside the source folder is refused, even where that file holds the snippet", () => {
    const root = withOverrides(paramOverride({ file: "../x.lua", contains: "x = x or 1" }));
    write(root, "github.com/pause-games/flow/source/x.lua", "x = x or 1\n");
    expect(refusalMessage(root)).toContain("../x.lua");
  });

  test("a snippet the file does not contain is refused, naming the snippet", () => {
    const message = refusalMessage(
      withOverrides(paramOverride({ file: "flow/layout.lua", contains: "x = x or 2" })),
    );
    expect(message).toContain('"x = x or 2"');
  });

  test("a snippet whose whitespace differs from the file's reads", () => {
    expect(() => reads(withOverrides(paramOverride(evidence)))).not.toThrow();
  });

  test("a method override carrying only params needs no evidence of its own, but each param does", () => {
    const method = (paramEvidence: unknown) => ({
      interfaces: {
        I: { methods: { m: { params: { p: { type: "string", evidence: paramEvidence } } } } },
      },
    });
    expect(() => reads(withOverrides(method(evidence)))).not.toThrow();
    expect(refusalMessage(withOverrides(method(undefined)))).toContain(
      "annotationOverrides.interfaces.I.methods.m.params.p ",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LibraryDataError, libraryFolderName, readLibraryData } from "./library-data";
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
  write(root, "flow/library.json", {
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
  write(root, "flow/reviewed.json", { ref: "v1.2.0" });
  write(root, "flow/recipe.json", {
    luals: [
      {
        sourceGlobs: ["flow/**/*.lua"],
        moduleId: "flow.layout",
        namespace: "flow.layout",
        typeRenames: { vector3: "Vector3" },
      },
    ],
  });
  write(root, "flow/fork/flow.ui.d.ts", FLOW_FORK);
  write(root, "flow/source/upstream/flow/ui.lua", "local M = {}\nreturn M\n");
  write(root, "flow/source/flow.layout/flow/layout.lua", "local M = {}\nreturn M\n");
  write(root, "box2d/library.json", {
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
  write(root, "box2d/reviewed.json", { ref: "v2.0" });
  write(root, "box2d/fork/box2d.d.ts", "declare module 'box2d' {}\n");
  return root;
}

describe("readLibraryData projects each library folder into lane targets", () => {
  test("a library's targets carry its repo, license and reviewed ref, with paths under its folder", () => {
    const root = writeDataFolder();
    try {
      const [box2d, flow] = readLibraryData(root);

      expect(flow).toEqual({
        dir: "flow",
        repo: "https://github.com/Pause-Games/flow",
        ref: "v1.2.0",
        license: "MIT",
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
            sourceDir: "flow/source/flow.layout",
          },
        ],
        scriptApi: [],
        authored: [
          {
            repo: "https://github.com/Pause-Games/flow",
            ref: "v1.2.0",
            license: "MIT",
            authored: "flow/fork/flow.ui.d.ts",
            moduleId: "flow.ui",
            namespace: "flow.ui",
            apiDoc: "api-doc/flow.ui.json",
            fidelity: "fidelity/flow.ui.json",
            upstreamLua: ["flow/source/upstream/flow/ui.lua"],
          },
        ],
        native: [],
        indexSlots: {},
        floors: {},
        parityExceptions: {},
        usage: [],
      });
      expect(box2d).toEqual({
        dir: "box2d",
        repo: "https://github.com/owner/box2d",
        ref: "v2.0",
        license: "MIT",
        refKind: "tag",
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
            declaration: "box2d/fork/box2d.d.ts",
            upstreamSource: "box2d/source/upstream/box2d/src/box2d.cpp",
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
        usage: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library's usage examples are every .ts file under its usage folder, sorted", () => {
    const root = writeDataFolder();
    try {
      write(root, "flow/usage/nested/b.test-d.ts", "export {};\n");
      write(root, "flow/usage/a.test-d.ts", "export {};\n");
      write(root, "flow/usage/notes.md", "# notes\n");

      const [box2d, flow] = readLibraryData(root);

      expect(flow?.usage).toEqual(["flow/usage/a.test-d.ts", "flow/usage/nested/b.test-d.ts"]);
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
      write(root, "other-flow/library.json", {
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
      write(root, "other-flow/reviewed.json", { ref: "1.0" });

      expect(() => readLibraryData(root)).toThrow(/flow\.ui.*\bflow\b.*\bother-flow\b/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a library folder without reviewed.json is refused, naming the missing file", () => {
    const root = writeDataFolder();
    try {
      rmSync(join(root, "box2d/reviewed.json"));

      expect(() => readLibraryData(root)).toThrow("box2d/reviewed.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a folder named other than its repo is refused, naming both", () => {
    const root = writeDataFolder();
    try {
      write(root, "flow/library.json", {
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
      write(root, "flow/recipe.json", {
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
    write(root, "flow/library.json", {
      repo: "https://github.com/Pause-Games/flow",
      license: "MIT",
      forks: [{ ...FLOW_FORK_ENTRY, ...fork }],
    });
  }

  function writeFlowRecipe(root: string, recipe: Record<string, unknown>): void {
    write(root, "flow/recipe.json", recipe);
  }

  function writeBox2dNative(root: string, native: Record<string, unknown>): void {
    write(root, "box2d/library.json", {
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

        const folder = what === "a native namespace" ? "box2d/" : "flow/";
        expect(message).toContain(folder);
        expect(message).toContain(JSON.stringify(id));
      });
    }
  }

  const PATH_CASES: [string, string, (root: string, path: string) => void][] = [
    ["a fork authored path", "flow/", (root, path) => writeFlowFork(root, { authored: path })],
    [
      "a fork upstreamLua path",
      "flow/",
      (root, path) => writeFlowFork(root, { upstreamLua: [path] }),
    ],
    [
      "a native declaration path",
      "box2d/",
      (root, path) => writeBox2dNative(root, { declaration: path }),
    ],
    [
      "a native upstreamSource path",
      "box2d/",
      (root, path) => writeBox2dNative(root, { upstreamSource: path }),
    ],
    [
      "a recipe sourceGlobs entry",
      "flow/",
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

      const flow = readLibraryData(root).find(({ dir }) => dir === "flow");

      expect(flow?.authored[0]?.authored).toBe("flow/fork/../fork/flow.ui.d.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("libraryFolderName", () => {
  test("is the repo's last path segment, lowercased, without .git", () => {
    expect(libraryFolderName("https://github.com/HGPoint/Defold_Live_Unbundler.git")).toBe(
      "defold_live_unbundler",
    );
    expect(libraryFolderName("https://codeberg.org/Klaleus/defold-shutter/")).toBe(
      "defold-shutter",
    );
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
    write(root, `${folder}/library.json`, {
      ...library,
      floors,
      ...(parityExceptions === undefined ? {} : { parityExceptions }),
    });
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
    write(root, "lib/library.json", {
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
    write(root, "lib/reviewed.json", { ref: "v1.0.0" });
    if (lane === "luals") {
      write(root, "lib/recipe.json", {
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
    expect(error.library).toBe("flow");
    expect(error.message).toContain('"flow.gone"');
  });

  test("a floor for a fork that records a parity verdict is refused, since nothing measures it", () => {
    const root = writeDataFolder();
    write(root, "flow/library.json", {
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
    expect(error.library).toBe("flow");
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
    expect(error.library).toBe("flow");
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
      expect(error.library).toBe("flow");
      expect(error.message).toMatch(message);
    }
  });
});

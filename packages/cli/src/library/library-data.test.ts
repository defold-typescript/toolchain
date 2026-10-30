import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { libraryFolderName, readLibraryData } from "./library-data";
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

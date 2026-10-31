import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeZipArchive } from "../../../types/test/zip-fixture";
import type { DownloadExtensionArchive } from "../extension-archive";
import { addLibrary } from "./library-add";
import { checkLibraryData } from "./library-check";
import { readLibraryData } from "./library-data";
import { fetchLualsFixtures } from "./sync-luals-types";
import { fetchScriptApiFixture } from "./sync-script-api-types";

const TAG_URL = "https://github.com/owner/MyLib/archive/refs/tags/1.2.3.zip";
const MASTER_URL = "https://github.com/owner/MyLib/archive/master.zip";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const ANNOTATED = [
  "---@class mylib.options",
  "---@field speed number",
  "",
  "local M = {}",
  "",
  "---Start it.",
  "---@param options mylib.options",
  "---@return boolean",
  "function M.start(options)",
  "  return true",
  "end",
  "",
  "return M",
  "",
].join("\n");

const UNANNOTATED = "local M = {}\nfunction M.start() end\nreturn M\n";

const SCRIPT_API = [
  "- name: mylib",
  "  type: table",
  "  desc: Functions of mylib",
  "  members:",
  "  - name: start",
  "    type: function",
  "    desc: Start it.",
  "",
].join("\n");

interface Archive {
  readonly files: Readonly<Record<string, string>>;
  readonly includeDirs?: string;
  readonly comment?: string;
}

// An archive as GitHub packs one: every file under `MyLib-1.2.3/`, with a
// `game.project` naming the directories it shares.
function archive({ files, includeDirs = "mylib", comment }: Archive): Uint8Array {
  const gameProject = includeDirs === "" ? {} : { "game.project": gameProjectText(includeDirs) };
  return writeZipArchive(
    Object.entries({ ...gameProject, ...files }).map(([name, text]) => ({
      name: `MyLib-1.2.3/${name}`,
      text,
    })),
    comment === undefined ? {} : { comment },
  );
}

function gameProjectText(includeDirs: string): string {
  return `[project]\ntitle = mylib\n\n[library]\ninclude_dirs = ${includeDirs}\n`;
}

function serving(bytes: Uint8Array): DownloadExtensionArchive {
  return async () => ({ status: "ok", bytes });
}

// Every file under `dir` with its contents, to show a run wrote nothing there.
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir, { recursive: true }) as string[]) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) out[name.replace(/\\/g, "/")] = readFileSync(path, "utf8");
  }
  return out;
}

describe("addLibrary", () => {
  let base: string;
  let dataDir: string;
  let cacheDir: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "library-add-"));
    dataDir = join(base, "data");
    cacheDir = join(base, "cache");
    mkdirSync(dataDir);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const add = (bytes: Uint8Array, url = TAG_URL) =>
    addLibrary(url, dataDir, { cacheDir, download: serving(bytes) });

  const json = (file: string): unknown =>
    JSON.parse(readFileSync(join(dataDir, "mylib", file), "utf8"));

  test("annotated Lua writes a folder the reader and the check accept", async () => {
    const { folder } = await add(archive({ files: { "mylib/mylib.lua": ANNOTATED } }));

    expect(folder).toBe("mylib");
    expect(json("library.json")).toEqual({ repo: "https://github.com/owner/MyLib" });
    expect(json("reviewed.json")).toEqual({ ref: "1.2.3" });
    expect(json("recipe.json")).toEqual({
      luals: [{ sourceGlobs: ["mylib/**/*.lua"], moduleId: "mylib.mylib", namespace: "mylib" }],
    });
    expect(readFileSync(join(dataDir, "mylib/source/mylib/mylib/mylib.lua"), "utf8")).toBe(
      ANNOTATED,
    );

    const [library] = readLibraryData(dataDir);
    expect(library?.luals.map(({ moduleId }) => moduleId)).toEqual(["mylib.mylib"]);
    // The floor check runs only once the print and the compile are clean, and a new
    // library has no floor yet.
    expect(await checkLibraryData(dataDir)).toEqual([
      { library: "mylib", check: "floor", message: expect.stringContaining("mylib.mylib") },
    ]);
  });

  test("a module file not named for its folder sets the module id and namespace", async () => {
    const { notes } = await add(
      archive({
        files: { "mylib/core.lua": ANNOTATED, "mylib/types.lua": "---@class mylib.other\n" },
      }),
    );

    expect(json("recipe.json")).toEqual({
      luals: [{ sourceGlobs: ["mylib/**/*.lua"], moduleId: "mylib.core", namespace: "core" }],
    });
    expect(notes.join("\n")).toContain("mylib.core");
    const problems = await checkLibraryData(dataDir);
    expect(problems.filter(({ check }) => check !== "floor")).toEqual([]);
  });

  test("an annotated example picks no module and its files stay out of the recipe", async () => {
    await add(
      archive({
        files: {
          "mylib/mylib.lua": UNANNOTATED,
          "mylib/api.lua": ANNOTATED,
          "mylib/example/demo.lua": ANNOTATED,
        },
      }),
    );

    expect(json("recipe.json")).toEqual({
      luals: [
        {
          sourceGlobs: ["mylib/**/*.lua"],
          moduleId: "mylib.api",
          namespace: "api",
          ignore: ["**/example/**"],
        },
      ],
    });
    expect(existsSync(join(dataDir, "mylib/source/api/mylib/example/demo.lua"))).toBe(false);
    expect(existsSync(join(dataDir, "mylib/source/api/mylib/mylib.lua"))).toBe(true);
    const problems = await checkLibraryData(dataDir);
    expect(problems.filter(({ check }) => check !== "floor")).toEqual([]);
  });

  test("an annotated file only an example holds is not an annotated library", async () => {
    const { notes } = await add(
      archive({
        files: { "mylib/mylib.lua": UNANNOTATED, "mylib/example/demo.lua": ANNOTATED },
      }),
    );

    expect(existsSync(join(dataDir, "mylib/recipe.json"))).toBe(false);
    expect(notes.join("\n")).toContain("authoring-forked-library-types");
  });

  test("a .script_api file with its Lua module writes a scriptApi entry and copies the file", async () => {
    await add(
      archive({
        files: { "mylib/mylib.lua": UNANNOTATED, "mylib/api/mylib.script_api": SCRIPT_API },
      }),
    );

    expect(json("recipe.json")).toEqual({
      scriptApi: [
        {
          scriptApi: "mylib/api/mylib.script_api",
          moduleId: "mylib.mylib",
          namespace: "mylib",
          apiDoc: "api-doc/mylib.json",
        },
      ],
    });
    expect(readFileSync(join(dataDir, "mylib/source/mylib.mylib.script_api"), "utf8")).toBe(
      SCRIPT_API,
    );
    expect(await checkLibraryData(dataDir)).toEqual([
      { library: "mylib", check: "floor", message: expect.stringContaining("mylib.mylib") },
    ]);
  });

  test("a .script_api file outranks annotated Lua and an ext.manifest", async () => {
    await add(
      archive({
        files: {
          "mylib/ext.manifest": "name: mylib\n",
          "mylib/mylib.lua": ANNOTATED,
          "mylib/api/mylib.script_api": SCRIPT_API,
        },
      }),
    );

    expect(Object.keys(json("recipe.json") as object)).toEqual(["scriptApi"]);
  });

  test("a native .script_api with no Lua module writes no recipe and names the page", async () => {
    const { notes } = await add(
      archive({
        files: { "mylib/ext.manifest": "name: mylib\n", "mylib/api/iap.script_api": SCRIPT_API },
      }),
    );

    expect(existsSync(join(dataDir, "mylib/recipe.json"))).toBe(false);
    expect(existsSync(join(dataDir, "mylib/source"))).toBe(false);
    expect(notes.join("\n")).toContain("mylib/api/iap.script_api");
    expect(notes.join("\n")).toContain("extensions.md");
    expect(readLibraryData(dataDir).map(({ dir }) => dir)).toEqual(["mylib"]);
  });

  test("only the .script_api files with a Lua module get an entry", async () => {
    const { notes } = await add(
      archive({
        files: {
          "mylib/mylib.lua": UNANNOTATED,
          "mylib/api/mylib.script_api": SCRIPT_API,
          "mylib/api/native.script_api": SCRIPT_API,
        },
      }),
    );

    expect(json("recipe.json")).toEqual({
      scriptApi: [expect.objectContaining({ moduleId: "mylib.mylib" })],
    });
    expect(existsSync(join(dataDir, "mylib/source/mylib.native.script_api"))).toBe(false);
    expect(notes.join("\n")).toContain("mylib/api/native.script_api");
  });

  test("two .script_api files with one stem keep the first and note the other", async () => {
    const { notes } = await add(
      archive({
        files: {
          "mylib/mylib.lua": UNANNOTATED,
          "mylib/a/mylib.script_api": SCRIPT_API,
          "mylib/b/mylib.script_api": SCRIPT_API,
        },
      }),
    );

    expect(json("recipe.json")).toEqual({
      scriptApi: [expect.objectContaining({ scriptApi: "mylib/a/mylib.script_api" })],
    });
    expect(notes.join("\n")).toContain("mylib/b/mylib.script_api");
  });

  test("an ext.manifest writes no recipe, even beside annotated Lua, and names the page", async () => {
    const { notes } = await add(
      archive({
        files: { "mylib/ext.manifest": "name: mylib\n", "mylib/mylib.lua": ANNOTATED },
      }),
    );

    expect(json("library.json")).toEqual({ repo: "https://github.com/owner/MyLib" });
    expect(json("reviewed.json")).toEqual({ ref: "1.2.3" });
    expect(existsSync(join(dataDir, "mylib/recipe.json"))).toBe(false);
    expect(existsSync(join(dataDir, "mylib/source"))).toBe(false);
    expect(notes.join("\n")).toContain("native extension");
    expect(notes.join("\n")).toContain("authoring-forked-library-types");
    expect(readLibraryData(dataDir).map(({ dir }) => dir)).toEqual(["mylib"]);
  });

  test("unannotated Lua writes no recipe and names the fork page", async () => {
    const { notes } = await add(archive({ files: { "mylib/mylib.lua": UNANNOTATED } }));

    expect(existsSync(join(dataDir, "mylib/recipe.json"))).toBe(false);
    expect(notes.join("\n")).toContain("authoring-forked-library-types");
    expect(readLibraryData(dataDir).map(({ dir }) => dir)).toEqual(["mylib"]);
  });

  test("an existing folder throws naming it and writes nothing", async () => {
    mkdirSync(join(dataDir, "mylib"));
    writeFileSync(join(dataDir, "mylib", "keep.txt"), "kept");
    const before = snapshot(dataDir);

    await expect(add(archive({ files: { "mylib/mylib.lua": ANNOTATED } }))).rejects.toThrow(
      "mylib",
    );

    expect(snapshot(dataDir)).toEqual(before);
  });

  test("a folder created during the download throws and stays as that run left it", async () => {
    const bytes = archive({ files: { "mylib/mylib.lua": ANNOTATED } });
    let during: Record<string, string> = {};
    const download: DownloadExtensionArchive = async () => {
      const root = join(dataDir, "mylib");
      mkdirSync(root);
      writeFileSync(join(root, "library.json"), "sentinel library");
      writeFileSync(join(root, "reviewed.json"), "sentinel reviewed");
      writeFileSync(join(root, "keep.txt"), "kept");
      during = snapshot(dataDir);
      return { status: "ok", bytes };
    };

    await expect(addLibrary(TAG_URL, dataDir, { cacheDir, download })).rejects.toThrow(
      "library folder mylib already exists",
    );

    expect(Object.keys(during).sort()).toEqual([
      "mylib/keep.txt",
      "mylib/library.json",
      "mylib/reviewed.json",
    ]);
    expect(snapshot(dataDir)).toEqual(during);
  });

  test("a master.zip URL takes its ref from the archive's commit pin", async () => {
    await add(archive({ files: { "mylib/mylib.lua": ANNOTATED }, comment: COMMIT }), MASTER_URL);

    expect(json("reviewed.json")).toEqual({ ref: COMMIT });
  });

  test("a refs/heads URL takes its ref from the archive's commit pin", async () => {
    await add(
      archive({ files: { "mylib/mylib.lua": ANNOTATED }, comment: COMMIT }),
      "https://github.com/owner/MyLib/archive/refs/heads/release.zip",
    );

    expect(json("reviewed.json")).toEqual({ ref: COMMIT });
  });

  test("a bare /archive/<name>.zip URL reads its name as the tag", async () => {
    await add(
      archive({ files: { "mylib/mylib.lua": ANNOTATED }, comment: COMMIT }),
      "https://github.com/owner/MyLib/archive/v2.zip",
    );

    expect(json("reviewed.json")).toEqual({ ref: "v2" });
  });

  test("a branch URL whose archive names no commit throws and writes nothing", async () => {
    await expect(
      add(archive({ files: { "mylib/mylib.lua": ANNOTATED } }), MASTER_URL),
    ).rejects.toThrow("names no commit");

    expect(readdirSync(dataDir)).toEqual([]);
  });

  test("a URL with no repository archive shape throws before any download", async () => {
    const download: DownloadExtensionArchive = async () => {
      throw new Error("download should not be called");
    };

    await expect(
      addLibrary("https://example.com/mylib.zip", dataDir, { cacheDir, download }),
    ).rejects.toThrow("/archive/<ref>.zip");
    expect(readdirSync(dataDir)).toEqual([]);
  });

  test("an archive that declares no include_dirs throws and writes nothing", async () => {
    await expect(
      add(archive({ files: { "mylib/mylib.lua": ANNOTATED }, includeDirs: "" })),
    ).rejects.toThrow("include_dirs");

    expect(readdirSync(dataDir)).toEqual([]);
  });

  test("an archive entry that steps out of its folder throws and writes nothing", async () => {
    await expect(
      add(archive({ files: { "mylib/mylib.lua": ANNOTATED, "mylib/../../../evil.lua": "--" } })),
    ).rejects.toThrow("evil.lua");

    expect(readdirSync(dataDir)).toEqual([]);
    expect(readdirSync(base).sort()).toEqual(["cache", "data"]);
  });

  test("a module another library names throws and removes the new folder", async () => {
    await addLibrary("https://github.com/other/first-copy/archive/1.0.zip", dataDir, {
      cacheDir,
      download: serving(archive({ files: { "mylib/mylib.lua": ANNOTATED } })),
    });

    await expect(add(archive({ files: { "mylib/mylib.lua": ANNOTATED } }))).rejects.toThrow(
      "mylib.mylib",
    );

    expect(readdirSync(dataDir)).toEqual(["first-copy"]);
  });

  for (const [what, text, license] of [
    ["MIT", "MIT License\n\nCopyright (c) 2024", "MIT"],
    ["a titled MIT", "The MIT License (MIT)\n", "MIT"],
    ["Apache-2.0", "Apache-2.0\n", "Apache-2.0"],
    ["the Apache text", "\n      Apache License\n      Version 2.0, January 2004\n", "Apache-2.0"],
    ["BSD 3-Clause", "BSD 3-Clause License\n", "BSD-3-Clause"],
    ["zlib", "zlib License\n", "Zlib"],
  ] as const) {
    test(`a LICENSE whose first line names ${what} sets the license`, async () => {
      await add(archive({ files: { "mylib/mylib.lua": ANNOTATED, LICENSE: text } }));

      expect(json("library.json")).toEqual({
        repo: "https://github.com/owner/MyLib",
        license,
      });
    });
  }

  for (const [what, text] of [
    ["a copyright line", "Copyright (c) 2024 Someone\n\nPermission is hereby granted"],
    ["another license", "GNU GENERAL PUBLIC LICENSE\n"],
    ["an unnumbered Apache", "Apache License\n\nVersion 1.1\n"],
    ["an unnumbered BSD", "BSD License\n"],
  ] as const) {
    test(`a LICENSE that opens with ${what} leaves the license out`, async () => {
      await add(archive({ files: { "mylib/mylib.lua": ANNOTATED, LICENSE: text } }));

      expect(json("library.json")).toEqual({ repo: "https://github.com/owner/MyLib" });
    });
  }

  test("a LuaLS re-pin finds the files add wrote and adds none", async () => {
    const files = { "mylib/mylib.lua": ANNOTATED, "mylib/nested/helper.lua": "---@class h\n" };
    await add(archive({ files }));
    const before = Object.keys(snapshot(dataDir)).sort();
    const [library] = readLibraryData(dataDir);

    await fetchLualsFixtures(dataDir, library?.luals[0] as never, {
      listTree: async () => ["game.project", ...Object.keys(files)],
      fetchText: async () => "-- re-pinned\n",
    });

    expect(Object.keys(snapshot(dataDir)).sort()).toEqual(before);
    expect(readFileSync(join(dataDir, "mylib/source/mylib/mylib/nested/helper.lua"), "utf8")).toBe(
      "-- re-pinned\n",
    );
  });

  test("a .script_api re-pin finds the file add wrote and adds none", async () => {
    await add(
      archive({
        files: { "mylib/mylib.lua": UNANNOTATED, "mylib/api/mylib.script_api": SCRIPT_API },
      }),
    );
    const before = Object.keys(snapshot(dataDir)).sort();
    const [library] = readLibraryData(dataDir);

    await fetchScriptApiFixture(dataDir, library?.scriptApi[0] as never, {
      fetchText: async () => "# re-pinned\n",
    });

    expect(Object.keys(snapshot(dataDir)).sort()).toEqual(before);
    expect(readFileSync(join(dataDir, "mylib/source/mylib.mylib.script_api"), "utf8")).toBe(
      "# re-pinned\n",
    );
  });
});

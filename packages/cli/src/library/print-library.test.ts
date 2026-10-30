import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionZip } from "../extension-archive";
import { writeLibraryTargets } from "../library-data-fixture";
import { LIBRARY_DATA_DIR } from "./package-root";
import { printLibraryModules } from "./print-library";
import { archiveSourceTree } from "./source-tree";
import { readAuthoredTargets } from "./sync-authored-types";
import { type LualsTarget, readLualsTargets } from "./sync-luals-types";
import { readScriptApiTargets } from "./sync-script-api-types";

const DATA_DIR = LIBRARY_DATA_DIR;

// A `.lua` file the target's globs must not select: were it parsed, its class
// would join the merged model and change the print.
const EXTRA_LUA = [
  "---@class ExtraProbe",
  "---@field extra_probe number",
  "local M = {}",
  "function M.extra_probe() end",
  "return M",
  "",
].join("\n");

function fakeZip(files: Record<string, string>): ExtensionZip {
  return {
    entries: () => Object.keys(files),
    read: (entry) => {
      const text = files[entry];
      if (text === undefined) throw new Error(`no ${entry} in the archive`);
      return text;
    },
    bytes: (entry) => new TextEncoder().encode(files[entry] ?? ""),
    comment: () => "",
  };
}

// A GitHub archive: every path under one `<repo>-<ref>/` folder, which GitHub
// also lists as an entry of its own.
function githubArchive(wrapper: string, files: Record<string, string>): ExtensionZip {
  const entries: Record<string, string> = { [`${wrapper}/`]: "" };
  for (const [path, text] of Object.entries(files)) entries[`${wrapper}/${path}`] = text;
  return fakeZip(entries);
}

function vendoredLuals(target: LualsTarget): Record<string, string> {
  const dir = join(DATA_DIR, target.sourceDir);
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true }).map(String)) {
    const path = entry.replace(/\\/g, "/");
    if (statSync(join(dir, entry)).isFile()) files[path] = readFileSync(join(dir, entry), "utf8");
  }
  return files;
}

function lualsTarget(moduleId: string): LualsTarget {
  const target = readLualsTargets(DATA_DIR).find((candidate) => candidate.moduleId === moduleId);
  if (target === undefined) throw new Error(`library data has no LuaLS target ${moduleId}`);
  return target;
}

describe("printLibraryModules prints every LuaLS target from its pinned-ref archive", () => {
  for (const target of readLualsTargets(DATA_DIR)) {
    test(`${target.moduleId} prints what its vendored sources print`, async () => {
      const archive = githubArchive(`${target.namespace}-${target.ref}`, {
        ...vendoredLuals(target),
        "example/extra.lua": EXTRA_LUA,
        "README.md": "# readme\n",
      });

      const fromArchive = await printLibraryModules(
        DATA_DIR,
        [target.moduleId],
        archiveSourceTree(archive),
      );
      const pinned = await printLibraryModules(DATA_DIR, [target.moduleId], null);

      expect(fromArchive.unprintable).toEqual([]);
      expect(
        fromArchive.printed.map(({ module, from, reason }) => ({ module, from, reason })),
      ).toEqual([{ module: target.moduleId, from: "archive", reason: undefined }]);
      expect(pinned.printed[0]?.from).toBe("pinned");
      expect(fromArchive.printed[0]?.contents).toBe(pinned.printed[0]?.contents as string);
    });
  }
});

describe("the archive, not the vendored copy, decides a LuaLS print", () => {
  const target = lualsTarget("immutable.immutable");
  const own = "immutable/immutable.lua";
  const wrapper = `lua-immutable-${target.ref}`;
  const PROBE = [
    "---Probes that the print reads the archive",
    "---@param\tvalue\tnumber\t\t@value to probe",
    "---@return\t\t\t\t\tboolean\t\t\t\t@true always",
    "function Immutable.print_probe(value)",
    "\treturn true",
    "end",
    "",
    "",
  ].join("\n");

  test("a function the archive's module file adds is declared, and the vendored print lacks it", async () => {
    const files = vendoredLuals(target);
    const original = files[own] as string;
    const probed = original.replace(
      "-- Metatable for the Immutable module",
      `${PROBE}-- Metatable for the Immutable module`,
    );
    if (probed === original) throw new Error(`insertion point missing from ${own}`);

    const fromArchive = await printLibraryModules(
      DATA_DIR,
      [target.moduleId],
      archiveSourceTree(githubArchive(wrapper, { ...files, [own]: probed })),
    );
    const pinned = await printLibraryModules(DATA_DIR, [target.moduleId], null);

    expect(fromArchive.printed[0]?.from).toBe("archive");
    expect(fromArchive.printed[0]?.contents).toContain(
      "export function print_probe(this: void, value: number): boolean;",
    );
    expect(pinned.printed[0]?.contents).not.toContain("print_probe");
  });

  test("an archive without the module's own file prints the pinned sources and names the file", async () => {
    const { [own]: _dropped, ...rest } = vendoredLuals(target);
    const fromArchive = await printLibraryModules(
      DATA_DIR,
      [target.moduleId],
      archiveSourceTree(githubArchive(wrapper, { ...rest, "immutable/other.lua": "return {}\n" })),
    );
    const pinned = await printLibraryModules(DATA_DIR, [target.moduleId], null);

    const [print] = fromArchive.printed;
    expect(print?.from).toBe("pinned");
    expect(print?.reason).toContain(own);
    expect(print?.contents).toBe(pinned.printed[0]?.contents as string);
  });
});

describe("printLibraryModules dispatches each module to its lane", () => {
  test("bridge prints a function its archive's .script_api adds", async () => {
    const target = readScriptApiTargets(DATA_DIR).find((t) => t.moduleId === "bridge.bridge");
    if (target === undefined)
      throw new Error("library data has no script_api target bridge.bridge");
    const doc = readFileSync(join(DATA_DIR, target.sourceFile), "utf8");
    const probed = doc.replace(
      "  members:\n",
      "  members:\n  - name: print_probe\n    type: function\n    desc: Probes that the print reads the archive.\n\n",
    );
    if (probed === doc) throw new Error("bridge.script_api has no members list");

    const fromArchive = await printLibraryModules(
      DATA_DIR,
      [target.moduleId],
      archiveSourceTree(
        githubArchive(`bridge-defold-${target.ref}`, { [target.scriptApi]: probed }),
      ),
    );
    const pinned = await printLibraryModules(DATA_DIR, [target.moduleId], null);

    expect(fromArchive.printed[0]?.from).toBe("archive");
    expect(fromArchive.printed[0]?.contents).toContain("print_probe");
    expect(pinned.printed[0]?.contents).not.toContain("print_probe");
  });

  test("an authored module prints its fork whatever the archive holds, and an unnamed module is unprintable", async () => {
    const [target] = readAuthoredTargets(DATA_DIR);
    if (target === undefined) throw new Error("library data holds no fork");
    const archive = archiveSourceTree(
      githubArchive("anything-1.0", {
        [`${target.moduleId.replace(/\./g, "/")}.lua`]: "return {}\n",
      }),
    );

    const print = await printLibraryModules(
      DATA_DIR,
      [target.moduleId, "nobody.prints.this"],
      archive,
    );

    expect(print.printed.map(({ module, contents }) => ({ module, contents }))).toEqual([
      { module: target.moduleId, contents: readFileSync(join(DATA_DIR, target.authored), "utf8") },
    ]);
    expect(print.unprintable).toEqual(["nobody.prints.this"]);
  });

  test("two targets naming one module is refused", async () => {
    const root = mkdtempSync(join(tmpdir(), "print-library-duplicate-"));
    const fork = (moduleId: string, file: string) => ({
      repo: "https://github.com/owner/mylib",
      ref: "1.0",
      authored: file,
      moduleId,
      namespace: "mylib",
      apiDoc: "api-doc/mylib.json",
      upstreamLua: ["source/upstream/core.lua"],
    });
    for (const file of ["fork/a.d.ts", "fork/b.d.ts"]) {
      mkdirSync(dirname(join(root, "mylib", file)), { recursive: true });
      writeFileSync(join(root, "mylib", file), "declare module 'mylib.core' {}\n");
    }
    writeLibraryTargets(root, {
      forks: [fork("mylib.core", "fork/a.d.ts"), fork("mylib.core", "fork/b.d.ts")],
    });

    await expect(printLibraryModules(root, ["mylib.core"], null)).rejects.toThrow(/mylib\.core/);
  });
});

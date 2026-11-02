import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { writeLibraryTargets } from "../library-data-fixture";
import { libraryApiDocs } from "./library-api-doc";
import { API_DOC_DIR, readLibraryData } from "./library-data";

// Every module a file statically loads, followed through relative imports. A type
// import is erased at runtime, so it is not followed.
function staticModuleGraph(entry: string): Set<string> {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { path, kind } of transpiler.scanImports(readFileSync(file, "utf8"))) {
      if (kind !== "import-statement" || !path.startsWith(".")) continue;
      visit(`${resolve(dirname(file), path)}.ts`);
    }
  };
  visit(entry);
  return seen;
}

describe("libraryApiDocs", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("reads a data folder outside the repo, naming each output by its lane", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "library-api-doc-"));
    roots.push(dataDir);
    writeLibraryTargets(dataDir, {
      luals: [
        {
          repo: "https://github.com/owner/lualib",
          ref: "1.0.0",
          sourceGlobs: ["lualib/**/*.lua"],
          moduleId: "lualib.core",
          namespace: "lualib.core",
          typeRenames: {},
          ignore: [],
        },
      ],
      forks: [
        {
          repo: "https://github.com/owner/forklib",
          ref: "1.0.0",
          authored: "fork/forklib.main.d.ts",
          moduleId: "forklib.main",
          namespace: "forklib.main",
          apiDoc: "api-doc/forklib.main.json",
          parityVerdict: { reason: "no-module-file", note: "a fixture with no upstream" },
        },
      ],
    });
    const lua = join(dataDir, "lualib", "source", "lualib.core", "lualib", "core.lua");
    mkdirSync(dirname(lua), { recursive: true });
    writeFileSync(lua, "local M = {}\n\n---@return number\nfunction M.tick() end\n\nreturn M\n");
    const fork = join(dataDir, "forklib", "fork", "forklib.main.d.ts");
    mkdirSync(dirname(fork), { recursive: true });
    writeFileSync(fork, "declare module 'forklib.main' {\n  export function start(): void;\n}\n");

    const docs = await libraryApiDocs(dataDir);

    expect([...docs.keys()].sort()).toEqual(["forklib.main.json", "lualib.core.json"]);
    expect(docs.get("lualib.core.json")).toContain("tick");
    expect(docs.get("forklib.main.json")).toContain("start");
  });

  function writeForks(apiDocs: string[]): string {
    const dataDir = mkdtempSync(join(tmpdir(), "library-api-doc-"));
    roots.push(dataDir);
    writeLibraryTargets(dataDir, {
      forks: apiDocs.map((apiDoc, index) => ({
        repo: `https://github.com/owner/lib${index}`,
        ref: "1.0.0",
        authored: "fork/main.d.ts",
        moduleId: `lib${index}.main`,
        namespace: `lib${index}.main`,
        apiDoc,
        parityVerdict: { reason: "no-module-file", note: "a fixture with no upstream" },
      })),
    });
    apiDocs.forEach((_, index) => {
      const fork = join(dataDir, `lib${index}`, "fork", "main.d.ts");
      mkdirSync(dirname(fork), { recursive: true });
      writeFileSync(fork, `declare module 'lib${index}.main' {\n  export const a: number;\n}\n`);
    });
    return dataDir;
  }

  test("two targets naming one api-doc path throw rather than lose a page", async () => {
    const dataDir = writeForks(["api-doc/same.json", "api-doc/same.json"]);

    await expect(libraryApiDocs(dataDir)).rejects.toThrow("api-doc path same.json twice");
  });

  for (const apiDoc of [
    "api-doc/../api-doc/page.json",
    "api-doc/nested/../page.json",
    "./api-doc/page.json",
    "api-doc//page.json",
    "api-doc\\page.json",
  ]) {
    test(`an apiDoc of ${apiDoc} reads back as api-doc/page.json`, async () => {
      const dataDir = writeForks([apiDoc]);

      expect(readLibraryData(dataDir)[0]?.authored[0]?.apiDoc).toBe("api-doc/page.json");
      expect([...(await libraryApiDocs(dataDir)).keys()]).toEqual(["page.json"]);
    });
  }

  test("an apiDoc with backslashes reads back with forward slashes", async () => {
    const dataDir = writeForks(["api-doc\\nested\\page.json"]);

    expect(readLibraryData(dataDir)[0]?.authored[0]?.apiDoc).toBe("api-doc/nested/page.json");
    expect([...(await libraryApiDocs(dataDir)).keys()]).toEqual(["nested/page.json"]);
  });

  test("a script_api apiDoc reads back in its canonical spelling", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "library-api-doc-"));
    roots.push(dataDir);
    writeLibraryTargets(dataDir, {
      scriptApi: [
        {
          repo: "https://github.com/owner/relay",
          ref: "1.0.0",
          scriptApi: "relay/relay.script_api",
          moduleId: "relay",
          namespace: "relay",
          apiDoc: "api-doc/../api-doc/relay.json",
        },
      ],
    });

    expect(readLibraryData(dataDir)[0]?.scriptApi[0]?.apiDoc).toBe("api-doc/relay.json");
  });

  for (const apiDoc of [
    "api-doc/../../escape.json",
    "api-doc/..\\..\\escape.json",
    "/tmp/escape.json",
    "elsewhere/escape.json",
    "api-doc/",
    "api-doc/nested/../",
    "api-doc/page.json/",
  ]) {
    test(`an apiDoc of ${apiDoc} is refused before anything is lowered`, () => {
      const dataDir = writeForks([apiDoc]);

      expect(() => readLibraryData(dataDir)).toThrow(`which is not a file under ${API_DOC_DIR}/`);
    });
  }

  test("two spellings of one api-doc path throw rather than lose a page", async () => {
    const dataDir = writeForks(["api-doc/nested/../page.json", "api-doc/page.json"]);

    await expect(libraryApiDocs(dataDir)).rejects.toThrow("api-doc path page.json twice");
  });

  for (const pair of [
    ["api-doc/Page.json", "api-doc/page.json"],
    ["api-doc/page.json", "api-doc/Page.json"],
  ]) {
    test(`${pair.join(" and ")} throw, since they differ only by case`, async () => {
      const message = await libraryApiDocs(writeForks(pair)).catch((err: Error) => err.message);

      expect(message).toContain("Page.json");
      expect(message).toContain("page.json");
    });
  }

  for (const [pair, file] of [
    [["api-doc/a.json", "api-doc/a.json/b.json"], "a.json"],
    [["api-doc/a.json/b.json", "api-doc/a.json"], "a.json"],
    [["api-doc/a.json", "api-doc/a.json/deep/b.json"], "a.json"],
    [["api-doc/A.json", "api-doc/a.json/b.json"], "A.json"],
    [["api-doc/a.json/b.json", "api-doc/A.json"], "A.json"],
  ] as const) {
    test(`${pair.join(" and ")} throw, since one uses the other as a folder`, async () => {
      await expect(libraryApiDocs(writeForks([...pair]))).rejects.toThrow(
        `api-doc path ${file} as both a file and a folder`,
      );
    });
  }

  test("a LuaLS namespace that would name a file outside the output is refused", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "library-api-doc-"));
    roots.push(dataDir);
    writeLibraryTargets(dataDir, {
      luals: [
        {
          repo: "https://github.com/owner/lualib",
          ref: "1.0.0",
          sourceGlobs: ["lualib/**/*.lua"],
          moduleId: "lualib.core",
          namespace: "../escape",
          typeRenames: {},
          ignore: [],
        },
      ],
    });

    expect(() => readLibraryData(dataDir)).toThrow("which is not a module id");
  });

  test("loads no module that needs the library-types package installed", () => {
    const graph = staticModuleGraph(resolve(import.meta.dir, "library-api-doc.ts"));

    expect(graph).toContain(resolve(import.meta.dir, "sync-native-types.ts"));
    expect(graph).not.toContain(resolve(import.meta.dir, "package-root.ts"));
  });
});

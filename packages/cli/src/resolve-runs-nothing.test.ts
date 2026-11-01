import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { execSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { evaluatePropertyDefaults, loadPropertyEvaluator } from "@defold-typescript/transpiler";
import { writeZipArchive } from "../../types/test/zip-fixture";
import { resolveTypesPackageRoot } from "./api-registry";
import { writeAuthoredLibraryData } from "./library-data-fixture";
import { runResolve } from "./resolve";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SPAWN_CALL = /\bBun\s*\.\s*(?:spawnSync|spawn|\$)/;
const SPAWN_MODULE = /^(?:node:)?child_process$/;

// Every module `resolve.ts` reaches through relative and `@defold-typescript/*`
// imports, static or dynamic, that can start a process. Third-party packages are
// not walked.
function modulesThatSpawn(): string[] {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const pending = [join(import.meta.dir, "resolve.ts")];
  const seen = new Set<string>();
  const spawning: string[] = [];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file) || !/\.tsx?$/.test(file)) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const imports = transpiler.scan(source).imports;
    if (
      imports.some(({ path }) => SPAWN_MODULE.test(path)) ||
      SPAWN_CALL.test(transpiler.transformSync(source))
    ) {
      spawning.push(relative(REPO_ROOT, file).replaceAll("\\", "/"));
    }
    for (const { path } of imports) {
      if (path.startsWith(".") || path.startsWith("@defold-typescript/")) {
        pending.push(Bun.resolveSync(path, dirname(file)));
      }
    }
  }
  return spawning.sort();
}

// Barrels bring these into the graph, each holding a spawn `resolve` never calls:
// building a script's property defaults, and formatting a fixture or binding
// manifest for the repo's generators. The run below holds that for what it reaches.
const SPAWNS_OFF_THE_RESOLVE_PATH = [
  "packages/transpiler/src/property-default-evaluator.ts",
  "packages/types/scripts/sync-api-docs.ts",
  "packages/types/scripts/sync-engine-bindings.ts",
];

describe("resolve starts no process", () => {
  test("no other module its imports reach can start one", () => {
    expect(modulesThatSpawn()).toEqual(SPAWNS_OFF_THE_RESOLVE_PATH);
  });

  const started: string[] = [];
  const restore: (() => void)[] = [];

  // `node:child_process` starts its processes through these two under Bun.
  function trapProcessStarts(): void {
    started.length = 0;
    for (const name of ["spawn", "spawnSync"] as const) {
      const spy = spyOn(Bun, name).mockImplementation((() => {
        started.push(name);
        throw new Error(`${name} started a process`);
      }) as never);
      restore.push(() => spy.mockRestore());
    }
  }

  afterEach(() => {
    for (const undo of restore.splice(0)) {
      undo();
    }
  });

  test("the trap catches what the evaluator and node:child_process start", async () => {
    await loadPropertyEvaluator();
    trapProcessStarts();

    const evaluated = evaluatePropertyDefaults({
      chunks: { main: "return {}" },
      entry: "main",
      names: [],
    });
    expect(evaluated).toMatchObject({ ok: false });
    expect(started).toEqual(["spawnSync"]);

    started.length = 0;
    expect(() => spawn("anything")).toThrow("started a process");
    expect(() => execSync("anything")).toThrow("started a process");
    expect(started).toEqual(["spawn", "spawnSync"]);
  });

  test("a run over every kind of dependency file starts none", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "resolve-runs-nothing-"));
    const urls = {
      docs: "https://github.com/owner/docs/archive/main.zip",
      library: "https://github.com/owner/mylib/archive/main.zip",
      shipped: "https://github.com/owner/shipped/archive/main.zip",
    };
    const archives: Record<string, Uint8Array> = {
      [urls.docs]: writeZipArchive([
        {
          name: "docs-main/api/alpha.script_api",
          text: "- name: alpha\n  type: table\n  desc: Alpha.\n  members:\n  - name: go\n    type: function\n    desc: Goes.\n",
        },
      ]),
      [urls.library]: writeZipArchive([
        { name: "mylib-main/game.project", text: "[library]\ninclude_dirs = mylib\n" },
        { name: "mylib-main/mylib/core.lua", text: "return {}\n" },
        { name: "mylib-main/mylib/scene.collection", text: 'name: "scene"\n' },
      ]),
      [urls.shipped]: writeZipArchive([
        { name: "shipped-main/types/shipped.d.ts", text: "export const value: number;\n" },
      ]),
    };
    writeFileSync(
      join(cwd, "game.project"),
      `[project]\n${Object.values(urls)
        .map((url, i) => `dependencies#${i} = ${url}`)
        .join("\n")}\n`,
    );
    writeFileSync(join(cwd, "tsconfig.json"), '{ "compilerOptions": { "types": [] } }\n');
    const libraryDataDir = writeAuthoredLibraryData({
      "mylib.core": "declare module 'mylib.core' { export const version: string; }\n",
    });
    trapProcessStarts();

    const result = await runResolve({
      cwd,
      cacheDir: mkdtempSync(join(tmpdir(), "resolve-runs-nothing-cache-")),
      libraryDataDir,
      libraryRegistry: [{ sourceId: "mylib", modules: ["mylib.core"] }],
      typesRoot: resolveTypesPackageRoot(),
      download: async (url) => ({ status: "ok", bytes: archives[url] as Uint8Array }),
    });

    expect(result.error).toBeUndefined();
    expect(started).toEqual([]);
    expect(
      Object.fromEntries(result.extensions.map(({ url, typeSurface }) => [url, typeSurface])),
    ).toEqual({
      [urls.docs]: "extension",
      [urls.library]: "vendored-library",
      [urls.shipped]: "shipped",
    });
    expect(result.extensions.find(({ url }) => url === urls.library)?.sceneSources).toBeGreaterThan(
      0,
    );
  }, 60_000);
});

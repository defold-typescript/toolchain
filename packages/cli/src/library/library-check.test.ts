import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { writeLibraryTargets } from "../library-data-fixture";
import { checkLibraryData } from "./library-check";
import { LIBRARY_DATA_DIR } from "./package-root";

const FORK = "declare module 'flow.ui' {\n  export function draw(): void;\n}\n";

// Line 6 calls into the fork; lines 7-8 need the engine types and the language
// extensions the two references load. The names the last lines expect to be
// missing are the ones the type packages beside the data folder declare.
const USAGE_LINES = [
  '/// <reference types="@typescript-to-lua/language-extensions" />',
  '/// <reference types="@defold-typescript/types" />',
  "",
  'import * as ui from "flow.ui";',
  "",
  "ui.draw();",
  "const _at: Vector3 = vmath.vector3(1, 2, 3);",
  "declare const _pair: LuaMultiReturn<[number, string]>;",
  "// @ts-expect-error the engine types beside the data folder are never read",
  "besideTypes;",
  "// @ts-expect-error the language extensions beside the data folder are never read",
  "besideExtensions;",
];

const BESIDE_DATA = {
  "@defold-typescript/types": "besideTypes",
  "@typescript-to-lua/language-extensions": "besideExtensions",
};

const NATIVE = "declare module 'box2d' {\n  export function step(dt: number): void;\n}\n";

function nativeSource(functions: string[]): string {
  return [
    "static const luaL_reg Module_methods[] = {",
    ...functions.map((name) => `  {"${name}", Fn},`),
    "  {0, 0}",
    "};",
    "static void LuaInit(lua_State* L) {",
    '  luaL_register(L, "box2d", Module_methods);',
    "  lua_pop(L, 1);",
    "}",
  ].join("\n");
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(dataDir: string, path: string, contents: string): void {
  const file = join(dataDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

// A data folder in a fresh temp dir: `flow` forks one module and holds one usage
// example, `box2d` is a native extension. Beside it sits a `node_modules` whose
// type packages each declare one global, so a check that resolved them from there
// would leave a usage `@ts-expect-error` unused.
function writeFixture(
  options: {
    fork?: string;
    usage?: string[];
    native?: string;
    forkModuleId?: string;
    nativeDeclaration?: string;
    nativeUpstream?: string[];
  } = {},
): string {
  const nativeDeclaration = options.nativeDeclaration ?? "fork/box2d.d.ts";
  const root = mkdtempSync(join(tmpdir(), "library-check-"));
  roots.push(root);
  for (const [name, global] of Object.entries(BESIDE_DATA)) {
    write(root, `node_modules/${name}/package.json`, JSON.stringify({ name, types: "index.d.ts" }));
    write(root, `node_modules/${name}/index.d.ts`, `declare const ${global}: number;\n`);
  }
  const dataDir = join(root, "data");
  writeLibraryTargets(dataDir, {
    forks: [
      {
        repo: "https://github.com/Pause-Games/flow",
        ref: "v1.0.0",
        authored: "fork/flow.ui.d.ts",
        moduleId: options.forkModuleId ?? "flow.ui",
        namespace: "flow.ui",
        apiDoc: "api-doc/flow.ui.json",
        parityVerdict: { reason: "no-module-file", note: "a fixture with no upstream" },
      },
    ],
    native: [
      {
        repo: "https://github.com/owner/box2d",
        ref: "v2.0",
        namespace: "box2d",
        manifestDir: "box2d",
        declaration: nativeDeclaration,
        upstreamSource: "source/upstream/box2d.cpp",
      },
    ],
    floors: { box2d: { box2d: { callable: 1, field: 1 } } },
  });
  write(dataDir, "flow/fork/flow.ui.d.ts", options.fork ?? FORK);
  write(
    dataDir,
    "flow/usage/flow-usage.test-d.ts",
    `${(options.usage ?? USAGE_LINES).join("\n")}\n`,
  );
  write(dataDir, `box2d/${nativeDeclaration}`, options.native ?? NATIVE);
  write(
    dataDir,
    "box2d/source/upstream/box2d.cpp",
    nativeSource(options.nativeUpstream ?? ["step"]),
  );
  return dataDir;
}

describe("checkLibraryData compiles a data folder against the CLI's engine types", () => {
  test("a clean data folder has no problems, with a node_modules beside it left unread", async () => {
    expect(await checkLibraryData(writeFixture())).toEqual([]);
  });

  test("a usage call to a member the fork lacks is one compile problem at its line", async () => {
    const usage = [...USAGE_LINES];
    usage[5] = "ui.erase();";

    expect(await checkLibraryData(writeFixture({ usage }))).toEqual([
      {
        library: "flow",
        check: "compile",
        message: expect.stringMatching(/^usage\/flow-usage\.test-d\.ts:6 .*'erase'/),
      },
    ]);
  });

  test("a fork holding a top-level statement is a compile problem in the fork file", async () => {
    const problems = await checkLibraryData(writeFixture({ fork: `${FORK}print("loaded");\n` }));

    expect(problems).toContainEqual({
      library: "flow",
      check: "compile",
      message: expect.stringMatching(/^fork\/flow\.ui\.d\.ts:4 /),
    });
    expect(problems.every(({ library, check }) => library === "flow" && check === "compile")).toBe(
      true,
    );
  });

  test("a native declaration that does not compile is a problem of its library", async () => {
    const native = "declare module 'box2d' {\n  export function step(dt: Seconds): void;\n}\n";

    expect(await checkLibraryData(writeFixture({ native }))).toEqual([
      {
        library: "box2d",
        check: "compile",
        message: expect.stringMatching(/^fork\/box2d\.d\.ts:2 .*'Seconds'/),
      },
    ]);
  });

  test("a missing native declaration no usage imports is a problem of its library", async () => {
    const dataDir = writeFixture();
    rmSync(join(dataDir, "box2d/fork/box2d.d.ts"));

    expect(await checkLibraryData(dataDir)).toEqual([
      {
        library: "box2d",
        check: "compile",
        message: expect.stringMatching(/^fork\/box2d\.d\.ts /),
      },
    ]);
  });

  test("a native declaration present on disk that TypeScript does not compile is a problem of its library", async () => {
    expect(await checkLibraryData(writeFixture({ nativeDeclaration: "fork/box2d.txt" }))).toEqual([
      {
        library: "box2d",
        check: "compile",
        message: expect.stringMatching(/^fork\/box2d\.txt /),
      },
    ]);
  });

  test("a declaration that cannot be loaded keeps the other compile problems, in library order", async () => {
    const usage = [...USAGE_LINES];
    usage[5] = "ui.erase();";
    const dataDir = writeFixture({ usage });
    rmSync(join(dataDir, "box2d/fork/box2d.d.ts"));

    expect(await checkLibraryData(dataDir)).toEqual([
      {
        library: "box2d",
        check: "compile",
        message: expect.stringMatching(/^fork\/box2d\.d\.ts /),
      },
      {
        library: "flow",
        check: "compile",
        message: expect.stringMatching(/^usage\/flow-usage\.test-d\.ts:6 .*'erase'/),
      },
    ]);
  });

  test("a library that fails reader validation is the one data problem, naming its folder", async () => {
    expect(await checkLibraryData(writeFixture({ forkModuleId: "../x" }))).toEqual([
      { library: "flow", check: "data", message: expect.stringContaining('"../x"') },
    ]);
  });

  test("a module that does not print is a print problem of its library, and nothing compiles", async () => {
    const dataDir = writeFixture();
    write(
      dataDir,
      "flow/recipe.json",
      JSON.stringify({
        luals: [
          { sourceGlobs: ["flow/**/*.lua"], moduleId: "flow.layout", namespace: "flow.layout" },
        ],
      }),
    );

    expect(await checkLibraryData(dataDir)).toEqual([
      { library: "flow", check: "print", message: expect.stringContaining("flow.layout") },
    ]);
  });
});

describe("checkLibraryData measures each module against the floor in its library", () => {
  const ANNOTATED = [
    "local M = {}",
    "",
    "---@param count number",
    "---@return number",
    "function M.twice(count)",
    "  return count * 2",
    "end",
    "",
  ];

  // A library with one LuaLS module and nothing outside the data folder to read.
  function writeLuals(lua: string[], floors?: Record<string, unknown>): string {
    const root = mkdtempSync(join(tmpdir(), "library-check-floor-"));
    roots.push(root);
    const dataDir = join(root, "data");
    write(
      dataDir,
      "lib/library.json",
      JSON.stringify({
        repo: "https://github.com/owner/lib",
        ...(floors === undefined ? {} : { floors }),
      }),
    );
    write(dataDir, "lib/reviewed.json", JSON.stringify({ ref: "v1.0.0" }));
    write(
      dataDir,
      "lib/recipe.json",
      JSON.stringify({
        luals: [{ sourceGlobs: ["lib/**/*.lua"], moduleId: "lib.main", namespace: "lib" }],
      }),
    );
    write(dataDir, "lib/source/lib/lib/main.lua", `${lua.join("\n")}\nreturn M\n`);
    return dataDir;
  }

  // A fork measured against two upstream functions. It sits in a temp dir with no
  // committed API model and no package root beside it.
  function writeFork(forkMembers: string[], extra: Record<string, unknown> = {}): string {
    const root = mkdtempSync(join(tmpdir(), "library-check-floor-"));
    roots.push(root);
    const dataDir = join(root, "data");
    write(
      dataDir,
      "lib/library.json",
      JSON.stringify({
        repo: "https://github.com/owner/lib",
        forks: [
          {
            authored: "fork/lib.main.d.ts",
            moduleId: "lib.main",
            namespace: "lib.main",
            apiDoc: "api-doc/lib.main.json",
            upstreamLua: ["source/upstream/main.lua"],
          },
        ],
        ...extra,
      }),
    );
    write(dataDir, "lib/reviewed.json", JSON.stringify({ ref: "v1.0.0" }));
    write(
      dataDir,
      "lib/fork/lib.main.d.ts",
      `declare module 'lib.main' {\n${forkMembers.map((name) => `  /** Does ${name}. */\n  export function ${name}(): void;`).join("\n")}\n}\n`,
    );
    write(
      dataDir,
      "lib/source/upstream/main.lua",
      "local M = {}\nfunction M.first() end\nfunction M.second() end\nreturn M\n",
    );
    return dataDir;
  }

  test("a LuaLS module below its floor is one floor problem, naming the module and both numbers", async () => {
    const dataDir = writeLuals(
      [...ANNOTATED, "---@param value mystery", "function M.other(value) end", ""],
      { "lib.main": 1 },
    );

    expect(await checkLibraryData(dataDir)).toEqual([
      {
        library: "lib",
        check: "floor",
        message: expect.stringMatching(/^lib\.main: coverage 0\.\d+ is below its floor 1 /),
      },
    ]);
  });

  test("a LuaLS module at its floor is clean", async () => {
    expect(await checkLibraryData(writeLuals(ANNOTATED, { "lib.main": 1 }))).toEqual([]);
  });

  test("a module with no floor is a floor problem saying so", async () => {
    expect(await checkLibraryData(writeLuals(ANNOTATED))).toEqual([
      {
        library: "lib",
        check: "floor",
        message: expect.stringMatching(/^lib\.main: no coverage floor/),
      },
    ]);
  });

  test("a fork missing an upstream member falls below its callable floor, measured from the fork alone", async () => {
    const dataDir = writeFork(["first"], { floors: { "lib.main": { callable: 1, field: 1 } } });

    expect(await checkLibraryData(dataDir)).toEqual([
      {
        library: "lib",
        check: "floor",
        message: expect.stringMatching(/^lib\.main: callable coverage 0\.5 is below its floor 1 /),
      },
    ]);
  });

  test("a fork declaring all of upstream meets its floor", async () => {
    const dataDir = writeFork(["first", "second"], {
      floors: { "lib.main": { callable: 1, field: 1 } },
    });

    expect(await checkLibraryData(dataDir)).toEqual([]);
  });

  test("a library's own parity exception counts toward its fork's coverage", async () => {
    const dataDir = writeFork(["first"], {
      floors: { "lib.main": { callable: 1, field: 1 } },
      parityExceptions: {
        "lib.main": [{ name: "second", kind: "script-lifecycle", reason: "main.lua:3 says so" }],
      },
    });

    expect(await checkLibraryData(dataDir)).toEqual([]);
  });

  test("a parity exception the fork no longer needs is a floor problem, not a crash", async () => {
    const dataDir = writeFork(["first", "second"], {
      floors: { "lib.main": { callable: 1, field: 1 } },
      parityExceptions: {
        "lib.main": [{ name: "second", kind: "script-lifecycle", reason: "main.lua:3 says so" }],
      },
    });

    expect(await checkLibraryData(dataDir)).toEqual([
      {
        library: "lib",
        check: "floor",
        message: expect.stringMatching(/^lib\.main: .*"lib\.main\.second" is unnecessary/),
      },
    ]);
  });

  test("a native extension below its floor is measured from its vendored C++", async () => {
    const dataDir = writeFixture({ nativeUpstream: ["step", "shape"] });

    expect(await checkLibraryData(dataDir)).toEqual([
      {
        library: "box2d",
        check: "floor",
        message: expect.stringMatching(/^box2d: callable coverage 0\.5 is below its floor 1 /),
      },
    ]);
  });

  test("a compile problem stops the floor check", async () => {
    const usage = [...USAGE_LINES];
    usage[5] = "ui.erase();";
    const dataDir = writeFixture({ usage, nativeUpstream: ["step", "shape"] });

    expect((await checkLibraryData(dataDir)).map(({ check }) => check)).toEqual(["compile"]);
  });

  test("the committed library data is clean", async () => {
    expect(await checkLibraryData(LIBRARY_DATA_DIR)).toEqual([]);
  }, 120_000);

  test("the check's static imports never reach the package root, so it reads only --data", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const { path, kind } of transpiler.scanImports(readFileSync(file, "utf8"))) {
        if (kind !== "import-statement" || !path.startsWith(".")) continue;
        walk(resolve(dirname(file), path.endsWith(".ts") ? path : `${path}.ts`));
      }
    };
    walk(join(import.meta.dir, "library-check.ts"));

    expect(seen.size).toBeGreaterThan(5);
    expect(seen.has(join(import.meta.dir, "library-floors.ts"))).toBe(true);
    expect(seen.has(join(import.meta.dir, "package-root.ts"))).toBe(false);
  });
});

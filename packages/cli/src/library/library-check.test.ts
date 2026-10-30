import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeLibraryTargets } from "../library-data-fixture";
import { checkLibraryData } from "./library-check";

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
  options: { fork?: string; usage?: string[]; native?: string; forkModuleId?: string } = {},
): string {
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
        declaration: "fork/box2d.d.ts",
        upstreamSource: "source/upstream/box2d.cpp",
      },
    ],
  });
  write(dataDir, "flow/fork/flow.ui.d.ts", options.fork ?? FORK);
  write(
    dataDir,
    "flow/usage/flow-usage.test-d.ts",
    `${(options.usage ?? USAGE_LINES).join("\n")}\n`,
  );
  write(dataDir, "box2d/fork/box2d.d.ts", options.native ?? NATIVE);
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

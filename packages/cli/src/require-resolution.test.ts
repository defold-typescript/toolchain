import { describe, expect, test } from "bun:test";
import {
  type BuildConfig,
  computeOutputRel,
  transpileProject,
} from "@defold-typescript/transpiler";
import { detectSourceOutputKind } from "./build-output";
import { findUnresolvedRequires } from "./require-resolution";

// The expected paths come from `computeOutputRel` and `detectSourceOutputKind`
// themselves, and the Lua from a real transpile, so this suite reds if either
// output naming or require codegen moves.
function check(
  files: Record<string, string>,
  config: BuildConfig = { outDir: undefined, include: ["src/**/*.ts"] },
) {
  const result = transpileProject({ files });
  expect(result.diagnostics.filter((d) => d.category !== "warning")).toEqual([]);
  const sources: Record<string, string> = {};
  for (const rel of Object.keys(files)) {
    if (rel.endsWith(".d.ts")) {
      continue;
    }
    sources[rel] = computeOutputRel(rel, config, detectSourceOutputKind(files[rel] ?? ""));
  }
  // Companion rels join `plannedOutputs` the way both build entry points join
  // them, so a require a companion satisfies reads as resolvable here too.
  const companions = Object.keys(result.companions ?? {}).map((rel) =>
    computeOutputRel(rel, config, "module"),
  );
  return findUnresolvedRequires({
    lua: result.lua,
    sources,
    plannedOutputs: [...Object.values(sources), ...companions],
  });
}

const script = (body: string): string =>
  [
    'import { defineScript } from "@defold-typescript/types";',
    body,
    "defineScript({ init() {} });",
  ].join("\n");

describe("findUnresolvedRequires", () => {
  test("two module-kind sources, one importing the other: no findings", () => {
    expect(
      check({
        "src/bar.ts": "export const v = 1;\n",
        "src/foo.ts": "import { v } from './bar';\nexport const w = v + 1;\n",
      }),
    ).toEqual([]);
  });

  test("a script value-importing another script resolves through the exporter's companion", () => {
    expect(
      check({
        "src/bar.ts": script("export const shared = 1;"),
        "src/foo.ts": script("import { shared } from './bar';\nprint(shared);"),
      }),
    ).toEqual([]);
  });

  test("a type-only import across two scripts emits no require and no finding", () => {
    expect(
      check({
        "src/bar.ts": script("export type Shared = { a: number };"),
        "src/foo.ts": script(
          "import type { Shared } from './bar';\nconst s: Shared = { a: 1 };\nprint(s.a);",
        ),
      }),
    ).toEqual([]);
  });

  test("a barrel re-exporting a script's value resolves through that script's companion", () => {
    expect(
      check({
        "src/bar.ts": script("export const shared = 1;"),
        "src/barrel.ts": "export { shared } from './bar';\n",
        "src/foo.ts": script("import { shared } from './barrel';\nprint(shared);"),
      }),
    ).toEqual([]);
  });

  test("a configured outDir breaks a cross-file module import", () => {
    const findings = check(
      {
        "src/bar.ts": "export const v = 1;\n",
        "src/foo.ts": "import { v } from './bar';\nexport const w = v + 1;\n",
      },
      { outDir: "build/lua", include: ["src/**/*.ts"] },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      importer: "src/foo.ts",
      requirePath: "src.bar",
      target: "src/bar.ts",
      expected: "build/lua/bar.lua",
    });
  });

  test("the same two sources with no outDir resolve", () => {
    expect(
      check({
        "src/bar.ts": "export const v = 1;\n",
        "src/foo.ts": "import { v } from './bar';\nexport const w = v + 1;\n",
      }),
    ).toEqual([]);
  });

  // A dotted name is the one shape a companion cannot rescue: it lands at
  // `src/foo.bar.lua` while every require of it says `src.foo_bar`, so the
  // exporting script cannot reach its own companion either.
  test("a dotted source rel is matched through the require path TSTL emits for it", () => {
    const findings = check({
      "src/foo.bar.ts": script("export const shared = 1;"),
      "src/main.ts": script("import { shared } from './foo.bar';\nprint(shared);"),
    });

    expect(findings.map((finding) => finding.importer).sort()).toEqual([
      "src/foo.bar.ts",
      "src/main.ts",
    ]);
    expect(findings.find((finding) => finding.importer === "src/main.ts")).toMatchObject({
      requirePath: "src.foo_bar",
      target: "src/foo.bar.ts",
      expected: "src/foo.bar.ts.script",
    });
  });

  test("a dotted plain module is written where the require cannot reach it", () => {
    const findings = check({
      "src/foo.bar.ts": "export const shared = 1;\n",
      "src/main.ts": script("import { shared } from './foo.bar';\nprint(shared);"),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      importer: "src/main.ts",
      requirePath: "src.foo_bar",
      target: "src/foo.bar.ts",
      expected: "src/foo.bar.lua",
      loadPath: "src/foo_bar.lua",
    });
  });

  test("a dotted directory segment is compared too, not just the basename", () => {
    const findings = check({
      "src/a.b/c.ts": "export const shared = 1;\n",
      "src/main.ts": script("import { shared } from './a.b/c';\nprint(shared);"),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      importer: "src/main.ts",
      requirePath: "src.a_b.c",
      target: "src/a.b/c.ts",
      expected: "src/a.b/c.lua",
      loadPath: "src/a_b/c.lua",
    });
  });

  test("the undotted sibling of a dotted name still resolves", () => {
    expect(
      check({
        "src/foo_bar.ts": "export const shared = 1;\n",
        "src/main.ts": script("import { shared } from './foo_bar';\nprint(shared);"),
      }),
    ).toEqual([]);
  });

  test("a @noResolution ambient module produces no finding", () => {
    expect(
      check({
        "src/lldebugger.debug.d.ts": [
          "/** @noResolution */",
          'declare module "lldebugger.debug" {',
          "  export function start(): void;",
          "}",
        ].join("\n"),
        "src/main.ts": script(
          'import * as lldebugger from "lldebugger.debug";\nlldebugger.start();',
        ),
      }),
    ).toEqual([]);
  });

  test("a Lua module shipped by a library dependency produces no finding", () => {
    expect(
      check({
        "src/tweener.d.ts": [
          "/** @noResolution */",
          'declare module "tweener.tweener" {',
          "  export function ease(t: number): number;",
          "}",
        ].join("\n"),
        "src/main.ts": script('import { ease } from "tweener.tweener";\nprint(ease(1));'),
      }),
    ).toEqual([]);
  });

  test("the timers runtime require and a hand-written raw require produce no findings", () => {
    const result = transpileProject({
      files: { "src/main.ts": script("print(1);") },
    });
    const lua = {
      "src/main.ts": `${result.lua["src/main.ts"] ?? ""}\nlocal ____raw = require("authored.helper")\n`,
    };

    expect(
      findUnresolvedRequires({
        lua,
        sources: { "src/main.ts": "src/main.ts.script" },
        plannedOutputs: ["src/main.ts.script"],
      }),
    ).toEqual([]);
  });
});

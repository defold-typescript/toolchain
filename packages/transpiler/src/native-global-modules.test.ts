import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { GLOBAL_TABLE_REQUIRE_MARKER } from "./native-global-modules";
import { collectOutputs, transpileProject } from "./transpile";

const PIXELS_DTS = [
  "/**",
  " * @noResolution",
  " * @globalTable",
  " */",
  'declare module "pixels" {',
  "  export type Color = number;",
  "  export function fill(color: Color): void;",
  "  export const version: string;",
  "}",
  "",
].join("\n");

const BODY_DTS = [
  "/** @globalTable b2d.body */",
  'declare module "body" {',
  "  export function mass(): number;",
  "}",
  "",
].join("\n");

const PLAIN_DTS = [
  "/** @noResolution */",
  'declare module "plain" {',
  "  export function go(): void;",
  "}",
  "",
].join("\n");

describe("@globalTable import lowering", () => {
  test("namespace import lowers to a global alias", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "main.ts": ['import * as pixels from "pixels";', "pixels.fill(7);", ""].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("named imports lower to a global alias", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "main.ts": [
          'import { fill, version } from "pixels";',
          "fill(7);",
          "print(version);",
          "",
        ].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("an explicit dotted tag argument names the global", () => {
    const result = transpileProject({
      files: {
        "body.d.ts": BODY_DTS,
        "main.ts": ['import * as body from "body";', "print(body.mass());", ""].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a type-only import emits no alias and no require", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "main.ts": [
          'import type { Color } from "pixels";',
          "const c: Color = 7;",
          "print(c);",
          "",
        ].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a side-effect import of a tagged module emits nothing", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "main.ts": ['import "pixels";', "print(1);", ""].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a re-export from a tagged module reads the global", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "main.ts": ['export { fill } from "pixels";', ""].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a dynamic import of a tagged module resolves to the global", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "main.ts": ['void import("pixels").then((m) => m.fill(7));', ""].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("an untagged ambient module keeps its require", () => {
    const result = transpileProject({
      files: {
        "plain.d.ts": PLAIN_DTS,
        "main.ts": ['import * as p from "plain";', "p.go();", ""].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a local shadowing the global name does not capture the alias", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "util.ts": "export function go(): void { print(1); }\n",
        "main.ts": [
          'import * as pixels from "./util";',
          'import { fill } from "pixels";',
          "pixels.go();",
          "fill(7);",
          "",
        ].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a local shadowing a dotted global's root does not capture the alias", () => {
    const result = transpileProject({
      files: {
        "body.d.ts": BODY_DTS,
        "b2d.ts": "export function hello(): void { print(2); }\n",
        "main.ts": [
          'import * as b2d from "./b2d";',
          'import { mass } from "body";',
          "b2d.hello();",
          "print(mass());",
          "",
        ].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a real source file wins over a tagged ambient module", () => {
    const result = transpileProject({
      files: {
        "pixels.d.ts": PIXELS_DTS,
        "pixels.ts": "export function fill(color: number): void { print(color); }\n",
        "main.ts": ['import { fill } from "./pixels";', "fill(7);", ""].join("\n"),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });
});

describe("@globalTable diagnostics", () => {
  test("a tag naming an invalid Lua global is an error with file and line", () => {
    const result = transpileProject({
      files: {
        "bad.d.ts": [
          "/**",
          " * @noResolution",
          " * @globalTable 3px",
          " */",
          'declare module "bad" {',
          "  export function go(): void;",
          "}",
          "",
        ].join("\n"),
        "main.ts": ['import * as bad from "bad";', "bad.go();", ""].join("\n"),
      },
    });
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.file).toBe("main.ts");
    expect(diagnostic?.line).toBeGreaterThan(0);
    expect(diagnostic?.message).toContain("3px");
    expect(diagnostic?.category).toBeUndefined();
  });

  test("marker text in a user string is not a leak", () => {
    const result = transpileProject({
      files: {
        "main.ts": [`const s = "${GLOBAL_TABLE_REQUIRE_MARKER}pixels";`, "print(s);", ""].join(
          "\n",
        ),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("a chunk still carrying the marker is an error naming the chunk", () => {
    const sourceFile = ts.createSourceFile("main.ts", "", ts.ScriptTarget.ES2022);
    const lua = `local p = require --[[hole]] ("${GLOBAL_TABLE_REQUIRE_MARKER}pixels")\n`;

    const result = collectOutputs(
      [{ outPath: "main.lua", sourceFiles: [sourceFile], lua }],
      [],
      new Set(["main.ts"]),
    );

    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.file).toBe("main.ts");
    expect(diagnostic?.message).toContain("pixels");
    expect(diagnostic?.category).toBeUndefined();
  });
});

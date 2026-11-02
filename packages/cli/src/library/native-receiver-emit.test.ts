import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { FIXTURE_DATA_DIR, writeLibraryTargets } from "../library-data-fixture";
import { readNativeTargets } from "./sync-native-types";

// A native declaration whose module returns objects: methods that read their
// object from stack slot 1, fields beside them, and callbacks the extension
// calls with only their own arguments.
const PEGBOARD_DECLARATION = `/** @noSelfInFile */
/** @globalTable */
declare module "pegboard" {
  type Cell = [x: number, y: number];

  interface Peg {
    label: string;
    readonly lit: boolean;
    light(): void;
    dim(): void;
  }

  interface Listener {
    on_place?: (this: void, peg: Peg) => void;
  }

  interface Board {
    place(cell: Cell): Peg;
    route(from: Cell, to: Cell): LuaMultiReturn<[Cell[], undefined] | [undefined, string]>;
    pegs(): LuaTable<number, Peg>;
    watch(listener: Listener | undefined): void;
    scan(callback: (this: void, peg: Peg, index: number) => boolean): void;
  }

  function open(width: number, height: number): Board;

  let spacing: number;

  const defaults: { width: number; height: number };
}
`;

let pegboardDataDir = "";

beforeAll(() => {
  pegboardDataDir = mkdtempSync(join(tmpdir(), "native-receiver-emit-"));
  const [folder] = writeLibraryTargets(pegboardDataDir, {
    native: [
      {
        repo: "https://github.com/example/fixture-pegboard",
        ref: "v1.0",
        namespace: "pegboard",
        manifestDir: "pegboard",
        declaration: "fork/pegboard.d.ts",
        upstreamSource: "source/upstream/pegboard/src/pegboard.cpp",
      },
    ],
  });
  mkdirSync(join(pegboardDataDir, folder as string, "fork"), { recursive: true });
  writeFileSync(
    join(pegboardDataDir, folder as string, "fork", "pegboard.d.ts"),
    PEGBOARD_DECLARATION,
  );
});

afterAll(() => {
  rmSync(pegboardDataDir, { recursive: true, force: true });
});

function transpileConsumer(dataDir: string, namespace: string, consumer: string[]): string {
  const target = readNativeTargets(dataDir).find((entry) => entry.namespace === namespace);
  expect(target).toBeDefined();
  const declaration = readFileSync(join(dataDir, target?.declaration ?? ""), "utf8");

  const project = transpileProject({
    files: { [`${namespace}.d.ts`]: declaration, "main.ts": consumer.join("\n") },
  });
  const errors = project.diagnostics.filter((d) => d.category !== "warning");
  expect(errors).toEqual([]);
  return project.lua["main.ts"] ?? "";
}

describe("a native declaration emits the receiver form upstream defines", () => {
  test("a module function is called with a dot on the global table", () => {
    const lua = transpileConsumer(FIXTURE_DATA_DIR, "stamp", [
      'import * as stamp from "stamp";',
      "export function latest(): string {",
      "  return stamp.at(1) + stamp.issue();",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a method of a returned object is called with a colon, through a chain of objects", () => {
    const lua = transpileConsumer(pegboardDataDir, "pegboard", [
      'import * as pegboard from "pegboard";',
      "export function lay(): number {",
      "  const board = pegboard.open(8, 8);",
      "  const peg = board.place([1, 1]);",
      "  peg.light();",
      "  const [route] = board.route([1, 1], [4, 4]);",
      "  board.pegs().get(1)?.dim();",
      "  return route === undefined ? 0 : route.length;",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a this-void callback receives only its own arguments, as a listener member and as a parameter", () => {
    const lua = transpileConsumer(pegboardDataDir, "pegboard", [
      'import * as pegboard from "pegboard";',
      "export function watch(): number {",
      "  const board = pegboard.open(8, 8);",
      "  let placed = 0;",
      "  board.watch({",
      "    on_place: (peg) => {",
      "      placed += 1;",
      "      peg.dim();",
      "    },",
      "  });",
      "  board.scan((peg, index) => peg.lit && index > 0);",
      "  return placed;",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a field is read and written with a dot beside its object's methods, and a module variable through an alias", () => {
    const lua = transpileConsumer(pegboardDataDir, "pegboard", [
      'import * as pegboard from "pegboard";',
      "export function relabel(): string {",
      "  const peg = pegboard.open(8, 8).place([2, 2]);",
      '  peg.label = "start";',
      "  peg.light();",
      "  pegboard.defaults.width = 16;",
      "  const board = pegboard;",
      "  board.spacing = 2;",
      "  return peg.label;",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });
});

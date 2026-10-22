import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { loadVendoredNativeRegistry } from "./library-registry";

// The native `FindPath` and `IsWalkable` read the grid from stack slot 1, so a
// dot call on a grid raises a bad-argument error; only TSTL's emit shows which
// call form the shipped declaration produces.
describe("the shipped def_windward_jps declaration emits grid methods as colon calls", () => {
  test("a consumer transpiles with the grid passed as self", () => {
    const entry = loadVendoredNativeRegistry().find((e) => e.namespace === "def_windward_jps");
    expect(entry).toBeDefined();
    const declaration = readFileSync(entry?.declarationPath ?? "", "utf8");

    const consumer = [
      "export function route(): def_windward_jps.Point[] | undefined {",
      "  const grid = def_windward_jps.create_grid(64, 64, [[10, 12], [11, 12]]);",
      "  if (!grid.is_walkable([8, 8])) {",
      "    return undefined;",
      "  }",
      '  const [path] = grid.find_path([8, 8], [40, 40], "octile");',
      "  return path;",
      "}",
    ].join("\n");

    const project = transpileProject({
      files: { "def_windward_jps.d.ts": declaration, "main.ts": consumer },
    });
    const errors = project.diagnostics.filter((d) => d.category !== "warning");
    expect(errors).toEqual([]);
    expect(project.lua["main.ts"]).toMatchSnapshot();
  });
});

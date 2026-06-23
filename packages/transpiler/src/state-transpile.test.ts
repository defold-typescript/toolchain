import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("script state transpile", () => {
  test("snapshots a module-level local mutated inside an exported function", () => {
    const source = [
      "let spawnCount = 0;",
      "export function spawn(): number {",
      "  spawnCount = spawnCount + 1;",
      "  return spawnCount;",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });

  test("snapshots a `declare global` declaration and a bare-global use site", () => {
    const source = [
      "declare global {",
      "  var FOO: number;",
      "}",
      "export function bump(): number {",
      "  FOO = FOO + 1;",
      "  return FOO;",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchSnapshot();
  });
});

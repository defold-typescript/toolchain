import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

const ONE_COMMAND = [
  'import { defineEditorScript } from "@defold-typescript/types";',
  "",
  "export default defineEditorScript({",
  "  get_commands: () => [",
  '    { label: "Say Hi", locations: ["Edit"], run: () => print("hi") },',
  "  ],",
  "});",
  "",
].join("\n");

describe("editor-script erasure", () => {
  test("lowers export default defineEditorScript to a chunk-level return of the hooks table", () => {
    const result = transpile(ONE_COMMAND);
    expect(result.diagnostics).toEqual([]);
    // The editor loads the chunk and uses its return value: the hooks table must
    // be returned directly, not wrapped as `{ default = hooks }`.
    expect(result.lua).toContain("return {");
    expect(result.lua).toContain("get_commands =");
    expect(result.lua).not.toContain("default");
    // The hooks table itself is returned, never the module `____exports` wrapper.
    expect(result.lua).not.toContain("return ____exports");
  });

  test("erases the defineEditorScript import (no require of the types package)", () => {
    const result = transpile(ONE_COMMAND);
    expect(result.lua).not.toContain("defineEditorScript");
    expect(result.lua).not.toContain("require(");
  });

  test("snapshots the full lowering of a trivial one-command editor script", () => {
    const result = transpile(ONE_COMMAND);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      return {get_commands = function() return {{
          label = "Say Hi",
          locations = {"Edit"},
          run = function() return print("hi") end
      }} end}
      "
    `);
  });
});

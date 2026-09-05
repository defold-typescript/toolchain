import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("message guard lowering", () => {
  test("lowers isMessage(message_id, message, id) to message_id == hash(id)", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  on_message(self, message_id, message) {",
      '    if (isMessage(message_id, message, "contact_point_response")) {',
      "      handle(message.distance);",
      "    }",
      "  },",
      "});",
      "",
      "declare function handle(n: number): void;",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function on_message(____self, message_id, message)
          if message_id == hash("contact_point_response") then
              handle(message.distance)
          end
      end
      return ____exports
      "
    `);
    expect(result.lua).toContain('if message_id == hash("contact_point_response") then');
    expect(result.lua).not.toContain("isMessage");
    expect(result.lua).not.toContain("require(");
  });

  test("lowers a CustomMessages id exactly like a built-in one", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "declare global {",
      "  interface CustomMessages {",
      "    spawn_wave: { count: number };",
      "  }",
      "}",
      "",
      "defineScript({",
      "  on_message(self, message_id, message) {",
      '    if (isMessage(message_id, message, "spawn_wave")) {',
      "      handle(message.count);",
      "    }",
      "  },",
      "});",
      "",
      "declare function handle(n: number): void;",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function on_message(____self, message_id, message)
          if message_id == hash("spawn_wave") then
              handle(message.count)
          end
      end
      return ____exports
      "
    `);
    expect(result.lua).toContain('if message_id == hash("spawn_wave") then');
    expect(result.lua).not.toContain("isMessage");
    expect(result.lua).not.toContain("CustomMessages");
    expect(result.lua).not.toContain("require(");
  });

  test("leaves a same-named local function untouched (not from the types module)", () => {
    const source = [
      "function isMessage(id: unknown, m: unknown, e: string): boolean {",
      "  return e.length > 0;",
      "}",
      "",
      "export function check(id: unknown, m: unknown): void {",
      '  if (isMessage(id, m, "x")) {',
      "    return;",
      "  }",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("isMessage");
    expect(result.lua).not.toContain('hash("x")');
  });
});

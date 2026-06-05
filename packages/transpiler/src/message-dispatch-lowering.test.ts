import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("message dispatch lowering", () => {
  test("lowers a single-handler onMessage to a flat on_message chunk", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  on_message: onMessage({",
      "    contact_point_response(self, message) {",
      "      handle(message.distance);",
      "    },",
      "  }),",
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
      function on_message(self, message_id, message, sender)
          if message_id == hash("contact_point_response") then
              handle(message.distance)
          end
      end
      return ____exports
      "
    `);
    expect(result.lua).toContain('if message_id == hash("contact_point_response") then');
    expect(result.lua).not.toContain("onMessage");
    expect(result.lua).not.toContain("require(");
  });

  test("lowers two handlers to an if/elseif chain in declaration order", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  on_message: onMessage({",
      "    contact_point_response(self, message) {",
      "      handle(message.distance);",
      "    },",
      "    set_parent(self, message) {",
      "      handle(0);",
      "    },",
      "  }),",
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
      function on_message(self, message_id, message, sender)
          if message_id == hash("contact_point_response") then
              handle(message.distance)
          elseif message_id == hash("set_parent") then
              handle(0)
          end
      end
      return ____exports
      "
    `);
    expect(result.lua).not.toContain("onMessage");
    expect(result.lua).not.toContain("require(");
  });

  test("aliases a handler param named other than `message`", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  on_message: onMessage({",
      "    contact_point_response(self, msg) {",
      "      handle(msg.distance);",
      "    },",
      "  }),",
      "});",
      "",
      "declare function handle(n: number): void;",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("local msg = message");
    expect(result.lua).toContain("handle(msg.distance)");
    expect(result.lua).not.toContain("onMessage");
  });

  test("leaves a same-named local onMessage untouched (not from the types module)", () => {
    const source = [
      "function onMessage(handlers: unknown): unknown {",
      "  return handlers;",
      "}",
      "",
      "export function build(): unknown {",
      "  return onMessage({ a: 1 });",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("onMessage");
    expect(result.lua).not.toContain('hash("');
  });
});

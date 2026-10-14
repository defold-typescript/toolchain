import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("physics event guard lowering", () => {
  test("lowers isPhysicsEvent(event, name) to event.type == hash(name)", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  init() {",
      "    physics.set_event_listener((_self, events) => {",
      "      for (const event of events) {",
      '        if (isPhysicsEvent(event, "collision_event")) {',
      "          handle(event.a.id);",
      "        }",
      "      }",
      "    });",
      "  },",
      "});",
      "",
      "declare function handle(id: unknown): void;",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function init()
          physics.set_event_listener(function(_self, events)
              for ____, event in ipairs(events) do
                  if event.type == hash("collision_event") then
                      handle(event.a.id)
                  end
              end
          end)
      end
      return ____exports
      "
    `);
  });

  test("leaves a same-named local function untouched (not from the types module)", () => {
    const source = [
      "function isPhysicsEvent(e: unknown, name: string): boolean {",
      "  return name.length > 0;",
      "}",
      "",
      "export function check(e: unknown): void {",
      '  if (isPhysicsEvent(e, "collision_event")) {',
      "    return;",
      "  }",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local function isPhysicsEvent(e, name)
          return #name > 0
      end
      function ____exports.check(e)
          if isPhysicsEvent(e, "collision_event") then
              return
          end
      end
      return ____exports
      "
    `);
  });
});

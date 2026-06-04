import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("lifecycle erasure", () => {
  test("erases a void defineScript to flat top-level chunk functions", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  init() {},",
      "  update(self, dt) {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function init()
      end
      function update(____self, dt)
      end
      return ____exports
      "
    `);
    expect(result.lua).not.toContain("defineScript");
    expect(result.lua).not.toContain("require(");
    // No value return -> flat init, no builder/merge.
    expect(result.lua).not.toContain("____init");
    expect(result.lua).not.toContain("pairs(");
  });

  test("preserves on_message body and four params, transpiling ambient calls", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  on_message(self, message_id, message, sender) {",
      "    msg.post('main:/hero', 'pong', {});",
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function on_message(____self, message_id, message, sender)
          msg.post("main:/hero", "pong", {})
      end
      return ____exports
      "
    `);
    expect(result.lua).toContain("function on_message(____self, message_id, message, sender)");
    expect(result.lua).not.toContain("defineScript");
  });

  test("erases a returning init to a builder plus a merge onto self", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  init: () => ({ x: 1 }),",
      "  update(self, dt) {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local function ____init()
          return {x = 1}
      end
      function init(self)
          local ____s = ____init()
          if ____s ~= nil then
              for ____k, ____v in pairs(____s) do
                  self[____k] = ____v
              end
          end
      end
      function update(____self, dt)
      end
      return ____exports
      "
    `);
    // Builder holds the original body; init merges its result onto engine self.
    expect(result.lua).toContain("____init");
    expect(result.lua).toContain("function init(self)");
    expect(result.lua).toContain("pairs(");
    expect(result.lua).toContain("self[");
    expect(result.lua).not.toContain("defineScript");
    expect(result.lua).not.toContain("require(");
  });

  test("a void init body stays flat (no builder, no merge)", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  init() { msg.post('.', 'acquire_input_focus'); },",
      "  update(self, dt) {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function init()
          msg.post(".", "acquire_input_focus")
      end
      function update(____self, dt)
      end
      return ____exports
      "
    `);
    expect(result.lua).not.toContain("____init");
    expect(result.lua).not.toContain("pairs(");
  });

  test("a returning init via a helper call still emits the builder+merge form", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "const createSelf = () => ({ x: 1 });",
      "",
      "defineScript({",
      "  init: () => createSelf(),",
      "  update(self, dt) {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local function createSelf()
          return {x = 1}
      end
      local function ____init()
          return createSelf(_G)
      end
      function init(self)
          local ____s = ____init()
          if ____s ~= nil then
              for ____k, ____v in pairs(____s) do
                  self[____k] = ____v
              end
          end
      end
      function update(____self, dt)
      end
      return ____exports
      "
    `);
    expect(result.lua).toContain("____init");
    expect(result.lua).toContain("createSelf");
    expect(result.lua).toContain("pairs(");
    expect(result.lua).toContain("self[");
  });

  test("renames the self param consistently in body and signature", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript<{ speed: number }>({",
      "  init: () => ({ speed: 120 }),",
      "  update(self, dt) { self.speed += dt; },",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local function ____init()
          return {speed = 120}
      end
      function init(self)
          local ____s = ____init()
          if ____s ~= nil then
              for ____k, ____v in pairs(____s) do
                  self[____k] = ____v
              end
          end
      end
      function update(____self, dt)
          ____self.speed = ____self.speed + dt
      end
      return ____exports
      "
    `);
    // TSTL escapes the reserved name `self` to `____self`; the signature param
    // must match the body references so the emitted Lua has no undefined symbol.
    expect(result.lua).toContain("function update(____self, dt)");
    expect(result.lua).toContain("____self.speed = ____self.speed + dt");
  });

  test("erases defineRenderScript identically", () => {
    const source = [
      'import { defineRenderScript } from "@defold-typescript/types";',
      "",
      "defineRenderScript({",
      "  init() {},",
      "  update(self, dt) {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function init()
      end
      function update(____self, dt)
      end
      return ____exports
      "
    `);
    expect(result.lua).not.toContain("defineRenderScript");
    expect(result.lua).not.toContain("require(");
  });

  test("erases defineGuiScript identically", () => {
    const source = [
      'import { defineGuiScript } from "@defold-typescript/types";',
      "",
      "defineGuiScript({",
      "  init() {},",
      "  update(self, dt) {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function init()
      end
      function update(____self, dt)
      end
      return ____exports
      "
    `);
    expect(result.lua).not.toContain("defineGuiScript");
    expect(result.lua).not.toContain("require(");
  });

  test("erases export default defineScript form", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "export default defineScript({",
      "  init() {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function init()
      end
      return ____exports
      "
    `);
    expect(result.lua).not.toContain("defineScript");
  });

  test("does not erase a non-factory local call of the same name", () => {
    const source = [
      "function defineScript(hooks: { init(): void }): void {",
      "  hooks.init();",
      "}",
      "",
      "defineScript({",
      "  init() {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("init = function");
    expect(result.lua).not.toContain("function init(self)");
  });
});

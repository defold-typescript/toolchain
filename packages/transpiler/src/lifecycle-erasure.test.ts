import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { isFactoryOnlyImport } from "./lifecycle-erasure";
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
          return createSelf()
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

  test("synthesizes top-level go.property registrations from the properties field", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  properties: { adj: vmath.vector3(0, 0, 0), name: hash('initial value') },",
      "  init: () => ({ velocity: vmath.vector3(0, 0, 0) }),",
      "  fixed_update(self, dt) {",
      "    go.set_position(go.get_position().add(self.adj));",
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    // TSTL wraps a call argument that is itself a call (vmath.vector3 / hash)
    // onto its own lines — the same shape any hand-written `go.property(...,
    // someCall())` emits.
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property(
          "adj",
          vmath.vector3(0, 0, 0)
      )
      go.property(
          "name",
          hash("initial value")
      )
      local function ____init()
          return {velocity = vmath.vector3(0, 0, 0)}
      end
      function init(self)
          local ____s = ____init()
          if ____s ~= nil then
              for ____k, ____v in pairs(____s) do
                  self[____k] = ____v
              end
          end
      end
      function fixed_update(____self, dt)
          go.set_position(go.get_position() + ____self.adj)
      end
      return ____exports
      "
    `);
    // The property name is the object key; the value is preserved verbatim.
    expect(result.lua).toContain("go.property(");
    expect(result.lua).toContain('"adj"');
    expect(result.lua).toContain("vmath.vector3(0, 0, 0)");
    expect(result.lua).toContain('"name"');
    expect(result.lua).toContain('hash("initial value")');
    // Registrations read before the hooks they back.
    expect(result.lua.indexOf("go.property(")).toBeLessThan(result.lua.indexOf("function init"));
    expect(result.lua).not.toContain("defineScript");
    expect(result.lua).not.toContain("properties");
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

  test("erases a defineGuiScript imported from the gui-script kind subpath", () => {
    const source = [
      'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
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

  test("erases a defineRenderScript imported from the render-script kind subpath", () => {
    const source = [
      'import { defineRenderScript } from "@defold-typescript/types/render-script";',
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

  test("erases a defineScript imported from the script kind subpath", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types/script";',
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
  });

  test("isFactoryOnlyImport accepts kind subpaths but gates on the imported names", () => {
    const firstImport = (source: string): ts.ImportDeclaration => {
      const file = ts.createSourceFile("t.ts", source, ts.ScriptTarget.Latest, true);
      const decl = file.statements.find(ts.isImportDeclaration);
      if (decl === undefined) {
        throw new Error("no import declaration in source");
      }
      return decl;
    };

    // Bare specifier (existing behavior) and the three kind subpaths all qualify.
    expect(
      isFactoryOnlyImport(firstImport('import { defineScript } from "@defold-typescript/types";')),
    ).toBe(true);
    expect(
      isFactoryOnlyImport(
        firstImport('import { defineGuiScript } from "@defold-typescript/types/gui-script";'),
      ),
    ).toBe(true);
    expect(
      isFactoryOnlyImport(
        firstImport('import { defineRenderScript } from "@defold-typescript/types/render-script";'),
      ),
    ).toBe(true);
    expect(
      isFactoryOnlyImport(
        firstImport('import { defineScript } from "@defold-typescript/types/script";'),
      ),
    ).toBe(true);

    // A non-factory name from a kind subpath is left to the normal pipeline.
    expect(
      isFactoryOnlyImport(
        firstImport('import { GuiScriptHooks } from "@defold-typescript/types/gui-script";'),
      ),
    ).toBe(false);
    // A non-kind subpath is never treated as factory-only.
    expect(
      isFactoryOnlyImport(
        firstImport('import { defineScript } from "@defold-typescript/types/core-types";'),
      ),
    ).toBe(false);
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

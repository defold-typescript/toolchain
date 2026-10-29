import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as ts from "typescript";
import { isFactoryOnlyImport, RESOURCE_PROPERTY_MARKERS } from "./lifecycle-erasure";
import { transpile, transpileProject } from "./transpile";

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
    // Symmetric positive for the negative pin below: a value import erases to a
    // top-level hook, never to an `____exports.default = defineScript(` call.
    expect(result.lua).toContain("function init(");
    expect(result.lua).not.toContain("____exports.default");
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

  test("registers a multi-line string default beside a number default", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      '  properties: { greeting: "Hello!\\nWelcome", speed: 1 },',
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property("greeting", "Hello!\\nWelcome")
      go.property("speed", 1)
      return ____exports
      "
    `);
  });

  test("parameterizes the init builder so the body reads properties from self", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  properties: { speed: 100 },",
      "  init(self) {",
      "    sprite.play_flipbook('#sprite', hash('idle'));",
      "    return { hp: self.speed };",
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property("speed", 100)
      local function ____init(____self)
          sprite.play_flipbook(
              "#sprite",
              hash("idle")
          )
          return {hp = ____self.speed}
      end
      function init(self)
          local ____s = ____init(self)
          if ____s ~= nil then
              for ____k, ____v in pairs(____s) do
                  self[____k] = ____v
              end
          end
      end
      return ____exports
      "
    `);
    // Builder takes the engine self (escaped from the reserved `self`); the
    // generated init passes it; the body reads the declared property off it.
    expect(result.lua).toContain("local function ____init(____self)");
    expect(result.lua).toContain("local ____s = ____init(self)");
    expect(result.lua).toContain("____self.speed");
    expect(result.lua).toContain('go.property("speed", 100)');
    expect(result.lua).toContain("pairs(");
    expect(result.lua).not.toContain("defineScript");
    expect(result.lua).not.toContain("require(");
  });

  test("binds the init builder param to the author's name, passing engine self", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  properties: { speed: 100 },",
      "  init(state) {",
      "    return { x: state.speed };",
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property("speed", 100)
      local function ____init(state)
          return {x = state.speed}
      end
      function init(self)
          local ____s = ____init(self)
          if ____s ~= nil then
              for ____k, ____v in pairs(____s) do
                  self[____k] = ____v
              end
          end
      end
      return ____exports
      "
    `);
    // The builder param keeps the author's identifier (`state`); the call still
    // passes the engine `self` as the argument.
    expect(result.lua).toContain("local function ____init(state)");
    expect(result.lua).toContain("local ____s = ____init(self)");
    expect(result.lua).toContain("state.speed");
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
    expect(result.lua).toContain("function init(");
    expect(result.lua).not.toContain("____exports.default");
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
    expect(result.lua).toContain("function init(");
    expect(result.lua).not.toContain("____exports.default");
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
    expect(result.lua).toContain("function init(");
    expect(result.lua).not.toContain("____exports.default");
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

    // A type-only specifier riding along binds nothing at runtime, so the import
    // is still factory-only and erases with the call it served.
    expect(
      isFactoryOnlyImport(
        firstImport('import { defineGuiScript, type Hash } from "@defold-typescript/types";'),
      ),
    ).toBe(true);
    // A whole-clause `import type { ... }` binds nothing either; the normal
    // transform elides it.
    expect(
      isFactoryOnlyImport(
        firstImport('import type { defineScript } from "@defold-typescript/types";'),
      ),
    ).toBe(false);
    // A runtime non-factory name still blocks erasure, type-only siblings or not.
    expect(
      isFactoryOnlyImport(
        firstImport('import { defineScript, hash, type Hash } from "@defold-typescript/types";'),
      ),
    ).toBe(false);
  });

  test("does not erase a factory name that does not resolve to the types package", () => {
    const source = [
      'import type { defineScript as defineScriptType } from "@defold-typescript/types";',
      "",
      "declare const defineScript: typeof defineScriptType;",
      "",
      "export default defineScript({",
      "  init() {},",
      "  update(self, dt) {},",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    // Erasure gates on the callee's declaration file, not its name: a local
    // ambient re-declaration keeps the name and loses the provenance. Pinned so
    // the runbook's tell cannot drift -- this is today's behavior, not a wish.
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      ____exports.default = defineScript({
          init = function(self)
          end,
          update = function(self, ____self, dt)
          end
      })
      return ____exports
      "
    `);
    expect(result.lua).toContain("____exports.default = defineScript(");
    expect(result.lua).not.toContain("function init(");
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

describe("properties on the gui and render factories", () => {
  for (const factory of ["defineGuiScript", "defineRenderScript"]) {
    test(`${factory} refuses a properties block instead of emitting go.property`, () => {
      const source = [
        `import { ${factory} } from "@defold-typescript/types";`,
        "",
        `${factory}({`,
        "  // @ts-expect-error",
        "  properties: { root: 1 },",
        "  init() {},",
        "});",
        "",
      ].join("\n");
      const propertiesLine = source.slice(0, source.indexOf("properties:")).split("\n").length;
      const result = transpileProject({ files: { "main.ts": source } });
      expect(result.diagnostics).toHaveLength(1);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic?.file).toBe("main.ts");
      expect(diagnostic?.line).toBe(propertiesLine);
      expect(diagnostic?.category).toBeUndefined();
      expect(diagnostic?.message).toContain(factory);
      expect(diagnostic?.message).toContain("go.property");
      for (const lua of Object.values(result.lua)) {
        expect(lua).not.toContain("go.property");
      }
    });

    test(`${factory} refuses a properties block holding only a spread`, () => {
      const source = [
        `import { ${factory} } from "@defold-typescript/types";`,
        "",
        "const D = { a: 1 };",
        "",
        `${factory}({`,
        "  // @ts-expect-error",
        "  properties: { ...D },",
        "  init() {},",
        "});",
        "",
      ].join("\n");
      const propertiesLine = source.slice(0, source.indexOf("properties:")).split("\n").length;
      const result = transpileProject({ files: { "main.ts": source } });
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.line).toBe(propertiesLine);
      expect(result.diagnostics[0]?.category).toBeUndefined();
      expect(result.diagnostics[0]?.message).toContain(factory);
    });
  }

  test("defineGuiScript with properties: undefined erases like the no-properties form", () => {
    const body = ["  init() {},", "  update(self, dt) {},", "});", ""];
    const header = [
      'import { defineGuiScript } from "@defold-typescript/types";',
      "",
      "defineGuiScript({",
    ];
    const baseline = transpile([...header, ...body].join("\n"));
    const result = transpile([...header, "  properties: undefined,", ...body].join("\n"));
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toBe(baseline.lua);
  });
});

describe("properties members", () => {
  const IMPORT = 'import { defineScript } from "@defold-typescript/types";';
  const lineOf = (source: string, needle: string): number =>
    source.slice(0, source.indexOf(needle)).split("\n").length;
  const scriptWith = (setup: string, ...members: readonly string[]): string =>
    [
      IMPORT,
      "",
      setup,
      "",
      "defineScript({",
      "  properties: {",
      ...members.map((member) => `    ${member},`),
      "  },",
      "});",
      "",
    ].join("\n");

  test("a spread registers the names it brings in", () => {
    const result = transpileProject({
      files: { "main.ts": scriptWith("const D = { a: 1 };", "speed: 1", "...D") },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local D = {a = 1}
      go.property("speed", 1)
      go.property("a", 1)
      return ____exports
      "
    `);
  });

  test("a shorthand member registers under its name", () => {
    const result = transpileProject({
      files: { "main.ts": scriptWith("const a = 1;", "speed: 1", "a") },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local a = 1
      go.property("speed", 1)
      go.property("a", 1)
      return ____exports
      "
    `);
  });

  test("a const-keyed computed member registers under the key's value", () => {
    const result = transpileProject({
      files: { "main.ts": scriptWith('const K = "k";', "speed: 1", "[K]: 1") },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local K = "k"
      go.property("speed", 1)
      go.property("k", 1)
      return ____exports
      "
    `);
  });

  test.each([
    ["a method", "", "m() { return 1; }", "m"],
    ["an accessor", "", "get g() { return 1; }", "g"],
  ])("%s fails the build on the member", (_label, setup, member, text) => {
    const source = scriptWith(setup, "speed: 1", member);
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic?.line).toBe(lineOf(source, `    ${member},`));
    expect(diagnostic?.category).toBeUndefined();
    expect(diagnostic?.message).toContain("properties");
    expect(diagnostic?.message).toContain(`\`${text}\``);
  });

  test("a literal key registers under the name JavaScript gives it", () => {
    const source = [
      IMPORT,
      "",
      "defineScript({",
      '  properties: { ["a-b"]: 1, [`c`]: 2, 0x10: 3, "q": 4, 1.5: 5 },',
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property("a-b", 1)
      go.property("c", 2)
      go.property("16", 3)
      go.property("q", 4)
      go.property("1.5", 5)
      return ____exports
      "
    `);
  });

  test.each([
    '({ speed: 1, a: resource.atlas("/a.atlas") } satisfies Record<string, unknown>)',
    '{ speed: 1, a: resource.atlas("/a.atlas") } as const',
  ])("a wrapped properties object %s registers every member", (value) => {
    const source = [IMPORT, "", "defineScript({", `  properties: ${value},`, "});", ""].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property("speed", 1)
      go.property(
          "a",
          resource.atlas("/a.atlas")
      )
      return ____exports
      "
    `);
  });

  test("a properties value of undefined registers nothing and reports nothing", () => {
    const header = [IMPORT, "", "defineScript({"];
    const body = ["  init() {},", "});", ""];
    const baseline = transpile([...header, ...body].join("\n"));
    const result = transpile([...header, "  properties: undefined,", ...body].join("\n"));
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toBe(baseline.lua);
  });

  test("defaults Defold's build cannot read as written register their computed values", () => {
    const source = scriptWith(
      'const BASE = 1;\nconst D = { width: 1 };\nconst NAME = "n";',
      "a: BASE",
      "b: BASE * 2",
      "c: D.width",
      "d: hash(NAME)",
      "e: vmath.vector3(BASE, 0, 0)",
    );
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local BASE = 1
      local D = {width = 1}
      local NAME = "n"
      go.property("a", 1)
      go.property("b", 2)
      go.property("c", 1)
      go.property(
          "d",
          hash("n")
      )
      go.property(
          "e",
          vmath.vector3(1, 0, 0)
      )
      return ____exports
      "
    `);
  });

  test.each([
    ["undefined", "undefined", "a has no value"],
    ["a string holding NUL", '"a\\0b"', "a contains a NUL character"],
  ])("a default that is not a property value (%s) fails the build on the default", (_label, value, cause) => {
    const source = scriptWith("", "speed: 1", `a: ${value}`);
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic?.line).toBe(lineOf(source, "    a: "));
    expect(diagnostic?.category).toBeUndefined();
    expect(diagnostic?.message).toContain("could not be computed at build time");
    expect(diagnostic?.message).toContain(cause);
  });

  test("every default form Defold's build reads registers, infinity as 1e999", () => {
    const source = scriptWith(
      "const enum Speed { Fast = 3 }",
      "n: -1",
      "h: 0x10",
      "i: 1e400",
      "j: -1e400",
      "b: true",
      's: "s"',
      "t: `t`",
      "e: Speed.Fast",
      'k: hash("k")',
      "u0: msg.url()",
      'u3: msg.url("a", "b", "c")',
      "v0: vmath.vector3()",
      "v1: vmath.vector3(1)",
      "v4: vmath.vector4(1, -2, 3, 4)",
      "q: vmath.quat(0, 0, 0, 1)",
    );
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property("n", -1)
      go.property("h", 16)
      go.property("i", 1e999)
      go.property("j", -1e999)
      go.property("b", true)
      go.property("s", "s")
      go.property("t", "t")
      go.property("e", 3)
      go.property(
          "k",
          hash("k")
      )
      go.property(
          "u0",
          msg.url()
      )
      go.property(
          "u3",
          msg.url("a", "b", "c")
      )
      go.property(
          "v0",
          vmath.vector3()
      )
      go.property(
          "v1",
          vmath.vector3(1)
      )
      go.property(
          "v4",
          vmath.vector4(1, -2, 3, 4)
      )
      go.property(
          "q",
          vmath.quat(0, 0, 0, 1)
      )
      return ____exports
      "
    `);
  });
});

describe("evaluated properties", () => {
  const IMPORT = 'import { defineScript } from "@defold-typescript/types";';
  const lineOf = (source: string, needle: string): number =>
    source.slice(0, source.indexOf(needle)).split("\n").length;
  const scriptWith = (head: string, properties: string): string =>
    [IMPORT, head, "", "defineScript({", `  properties: ${properties},`, "});", ""].join("\n");

  test("a spread of an imported const registers in JavaScript order, a later key overriding", () => {
    const result = transpileProject({
      files: {
        "ribbon_trail.ts":
          "export const DEFAULT_OPTIONS = { pointCount: 50, textureTiling: false, width: 30, z: -0.5 };\n",
        "main.ts": scriptWith(
          'import { DEFAULT_OPTIONS } from "./ribbon_trail";',
          "{ trail_tint: vmath.vector4(1, 1, 1, 1), ...DEFAULT_OPTIONS, width: 40 }",
        ),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local ____ribbon_trail = require("ribbon_trail")
      local DEFAULT_OPTIONS = ____ribbon_trail.DEFAULT_OPTIONS
      go.property(
          "trail_tint",
          vmath.vector4(1, 1, 1, 1)
      )
      go.property("pointCount", 50)
      go.property("textureTiling", false)
      go.property("width", 40)
      go.property("z", -0.5)
      return ____exports
      "
    `);
  });

  test("arithmetic, templates, hashes and vector operators register their values", () => {
    const result = transpileProject({
      files: {
        "main.ts": scriptWith(
          'const BASE = 10;\nconst PREFIX = "enemy_";',
          `{ width: BASE * 2, w2: BASE, id: hash(\`\${PREFIX}x\`), offset: vmath.vector3(1, 2, 3).add(vmath.vector3(BASE)), label: \`w=\${BASE / 2}\` }`,
        ),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local BASE = 10
      local PREFIX = "enemy_"
      go.property("width", 20)
      go.property("w2", 10)
      go.property(
          "id",
          hash("enemy_x")
      )
      go.property(
          "offset",
          vmath.vector3(11, 12, 13)
      )
      go.property("label", "w=5")
      return ____exports
      "
    `);
  });

  test("a name keeps its first position and takes its last value", () => {
    const result = transpileProject({
      files: {
        "main.ts": scriptWith(
          "const D: { b: number; a?: number } = { b: 1, a: 2 };",
          "{ a: 0, ...D, c: 3 }",
        ),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local D = {b = 1, a = 2}
      go.property("a", 2)
      go.property("b", 1)
      go.property("c", 3)
      return ____exports
      "
    `);
  });

  test("a properties value that is not an object literal registers its names in order", () => {
    const result = transpileProject({
      files: { "main.ts": scriptWith("const P = { speed: 1, on: true };", "P") },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local P = {speed = 1, on = true}
      go.property("speed", 1)
      go.property("on", true)
      return ____exports
      "
    `);
  });

  test("a spread source in a nested module evaluates through its require name", () => {
    const result = transpileProject({
      files: {
        "src/config/defaults.ts": "export const DEFAULTS = { pointCount: 50 };\n",
        "src/main.ts": scriptWith(
          'import { DEFAULTS } from "./config/defaults";',
          "{ ...DEFAULTS }",
        ),
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["src/main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local ____defaults = require("src.config.defaults")
      local DEFAULTS = ____defaults.DEFAULTS
      go.property("pointCount", 50)
      return ____exports
      "
    `);
  });

  test.each([
    [
      "an engine call",
      "",
      "{\n    x: go.get_position().x,\n  }",
      "properties:",
      "go is not available",
    ],
    [
      "a spread of an index-signature type",
      "const R: Record<string, number> = { a: 1 };",
      "{\n    ...R,\n  }",
      "properties:",
      "known at compile time",
    ],
    ["an array", "", "{\n    x: [1, 2],\n  }", "    x: ", "x is a table"],
  ])("%s fails the build with one diagnostic", (_label, head, properties, needle, cause) => {
    const source = scriptWith(head, properties);
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic?.file).toBe("main.ts");
    expect(diagnostic?.line).toBe(lineOf(source, needle));
    expect(diagnostic?.category).toBeUndefined();
    expect(diagnostic?.message).toContain(cause);
  });
});

describe("resource property markers", () => {
  const IMPORT = 'import { defineScript } from "@defold-typescript/types";';
  const lineOf = (source: string, needle: string): number =>
    source.slice(0, source.indexOf(needle)).split("\n").length;

  test("a properties default compiles and emits its go.property registration", () => {
    const source = [
      IMPORT,
      "",
      "defineScript({",
      '  properties: { a: resource.atlas("/a.atlas"), rt: resource.render_target("/r.render_target") },',
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property(
          "a",
          resource.atlas("/a.atlas")
      )
      go.property(
          "rt",
          resource.render_target("/r.render_target")
      )
      return ____exports
      "
    `);
  });

  test("a call inside a hook fails the build on the call's line", () => {
    const source = [
      IMPORT,
      "",
      "defineScript({",
      "  init() {",
      '    resource.font("/f.font");',
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic?.file).toBe("main.ts");
    expect(diagnostic?.line).toBe(lineOf(source, "resource.font("));
    expect(diagnostic?.category).toBeUndefined();
    expect(diagnostic?.message).toContain("resource.font");
    expect(diagnostic?.message).toContain("properties");
  });

  test("a module const used as a properties default fails on the const", () => {
    const source = [
      IMPORT,
      "",
      'const A = resource.texture("/t.png");',
      "",
      "defineScript({",
      "  properties: { a: A },",
      "});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic?.line).toBe(lineOf(source, "const A"));
    expect(diagnostic?.category).toBeUndefined();
    expect(diagnostic?.message).toContain("resource.texture");
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local A = resource.texture("/t.png")
      go.property(
          "a",
          resource.texture("/t.png")
      )
      return ____exports
      "
    `);
  });

  test("a reference to a marker fails the build", () => {
    const source = [IMPORT, "", "const f = resource.material;", "", "defineScript({});", ""].join(
      "\n",
    );
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.line).toBe(lineOf(source, "const f"));
    expect(result.diagnostics[0]?.category).toBeUndefined();
    expect(result.diagnostics[0]?.message).toContain("resource.material");
  });

  test.each([
    'resource["material"]',
    'resource[("material" as const)]',
  ])("a computed reference %s to a marker fails the build", (reference) => {
    const source = [IMPORT, "", `const f = ${reference};`, "", "defineScript({});", ""].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.line).toBe(lineOf(source, "const f"));
    expect(result.diagnostics[0]?.category).toBeUndefined();
    expect(result.diagnostics[0]?.message).toContain("resource.material");
  });

  test("a computed marker call inside a hook reports once", () => {
    const source = [
      IMPORT,
      "",
      "defineScript({",
      "  init() {",
      '    resource["font"]("/f.font");',
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain("resource.font");
  });

  test.each([
    ["an alias", "const r = resource;", 'r.atlas("/a.atlas")'],
    ["a destructured marker", "const { atlas } = resource;", 'atlas("/a.atlas")'],
    ["an optional receiver", "", 'resource?.atlas("/a.atlas")'],
    ["an optional call", "", 'resource.atlas?.("/a.atlas")'],
    ["a parenthesized optional callee", "", '(resource?.atlas)("/a.atlas")'],
    ["a key held in a variable", 'const K = "atlas";', 'resource[K]("/a.atlas")'],
    ["a path held in a variable", 'const P = "/a.atlas";', "resource.atlas(P)"],
  ])("a properties default through %s fails the build", (_label, setup, value) => {
    const source = [
      IMPORT,
      "",
      setup,
      "",
      "defineScript({",
      `  properties: { a: ${value} },`,
      "});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.line).toBe(lineOf(source, "properties:"));
    expect(result.diagnostics[0]?.category).toBeUndefined();
    expect(result.diagnostics[0]?.message).toContain("resource.atlas");
  });

  test("every default form bob reads compiles to its marker call", () => {
    const source = [
      IMPORT,
      "",
      "defineScript({",
      "  properties: {",
      '    a: (resource.atlas("/a.atlas") as Hash),',
      "    b: (resource).font(`/f.font`)!,",
      '    c: (resource.texture)("/t.png"),',
      '    m: resource["material"]("/m.material"),',
      '    k: resource[("material" as const)]("/k.material"),',
      "    d: resource.buffer(),",
      '    t: resource.tile_source(("/t.tilesource" as string)),',
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      go.property(
          "a",
          resource.atlas("/a.atlas")
      )
      go.property(
          "b",
          resource.font("/f.font")
      )
      go.property(
          "c",
          resource.texture("/t.png")
      )
      go.property(
          "m",
          resource.material("/m.material")
      )
      go.property(
          "k",
          resource.material("/k.material")
      )
      go.property(
          "d",
          resource.buffer()
      )
      go.property(
          "t",
          resource.tile_source("/t.tilesource")
      )
      return ____exports
      "
    `);
  });

  test("a direct go.property default reports only the deprecation warning", () => {
    const source = [
      IMPORT,
      "",
      'go.property("a", resource.atlas("/a.atlas"));',
      "",
      "defineScript({});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.category).toBe("warning");
  });

  test("a direct go.property default through an alias fails the build", () => {
    const source = [
      IMPORT,
      "",
      "const r = resource;",
      'go.property("a", r.atlas("/a.atlas"));',
      "",
      "defineScript({});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.filter((d) => d.category === "warning")).toHaveLength(1);
    const fatal = result.diagnostics.filter((d) => d.category === undefined);
    expect(fatal).toHaveLength(1);
    expect(fatal[0]?.message).toContain("resource.atlas");
  });

  test("a project's own resource object is not a marker", () => {
    const source = [
      IMPORT,
      "",
      "const resource = { atlas: (p: string) => p };",
      'const g = resource["atlas"];',
      'const h = resource[("atlas")];',
      "",
      "defineScript({",
      "  init() {",
      '    resource.atlas("x");',
      '    resource["atlas"]("y");',
      "  },",
      "});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": source } });
    expect(result.diagnostics).toEqual([]);
  });

  test("an optional chain, which TSTL lowers through synthesized nodes, transpiles", () => {
    const source = [
      IMPORT,
      "",
      "declare const cfg: { a?: { b: number } };",
      "",
      "defineScript({",
      "  init() {",
      "    print(cfg.a?.b);",
      '    print(cfg.a?.["b"]);',
      "  },",
      "});",
      "",
    ].join("\n");
    expect(transpile(source).diagnostics).toEqual([]);
  });

  test("the marker set is every resource function the binding gate records as unbound", () => {
    const typesRoot = path.dirname(
      createRequire(import.meta.url).resolve("@defold-typescript/types/package.json"),
    );
    const verdicts = JSON.parse(
      readFileSync(path.join(typesRoot, "scripts/engine-binding-verdicts.json"), "utf8"),
    ) as Record<string, unknown>;
    const unbound = new Set<string>();
    for (const key of Object.keys(verdicts)) {
      const match = /^[^:]+:(resource\.[a-z_]+):missing-binding$/.exec(key);
      if (match?.[1] !== undefined) {
        unbound.add(match[1]);
      }
    }
    expect([...RESOURCE_PROPERTY_MARKERS].sort()).toEqual([...unbound].sort());
  });
});

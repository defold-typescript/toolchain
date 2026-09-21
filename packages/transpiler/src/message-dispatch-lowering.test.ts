import { describe, expect, test } from "bun:test";
import { transpile, transpileProject } from "./transpile";

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

  test("lowers a built-in and a CustomMessages handler into one chain, in source order", () => {
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
      "  on_message: onMessage({",
      "    contact_point_response(self, message) {",
      "      handle(message.distance);",
      "    },",
      "    spawn_wave(self, message) {",
      "      handle(message.count);",
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
          elseif message_id == hash("spawn_wave") then
              handle(message.count)
          end
      end
      return ____exports
      "
    `);
    expect(result.lua).not.toContain("onMessage");
    expect(result.lua).not.toContain("CustomMessages");
    expect(result.lua).not.toContain("require(");
  });

  test("lowers a quoted numeric-looking custom id beside a built-in one", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "declare global {",
      "  interface CustomMessages {",
      '    "42": { count: number };',
      "  }",
      "}",
      "",
      "defineScript({",
      "  on_message: onMessage({",
      '    "42"(self, message) {',
      "      handle(message.count);",
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
          if message_id == hash("42") then
              handle(message.count)
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

  test("lowers numeric local keys under their JavaScript property key, in source order", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  on_message: onMessage({",
      "    42(self, message: { count: number }) {",
      "      handle(message.count);",
      "    },",
      "    1e3: (self, message: { n: number }) => {",
      "      handle(message.n);",
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
          if message_id == hash("42") then
              handle(message.count)
          elseif message_id == hash("1000") then
              handle(message.n)
          elseif message_id == hash("set_parent") then
              handle(0)
          end
      end
      return ____exports
      "
    `);
  });

  test("lowers computed literal keys under the literal they resolve to", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      'const WAVE = "spawn_wave";',
      "",
      "defineScript({",
      "  on_message: onMessage({",
      "    [WAVE](self, message: { count: number }) {",
      "      handle(message.count);",
      "    },",
      '    ["contact_point_response"](self, message) {',
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
      local WAVE = "spawn_wave"
      function on_message(self, message_id, message, sender)
          if message_id == hash("spawn_wave") then
              handle(message.count)
          elseif message_id == hash("contact_point_response") then
              handle(message.distance)
          end
      end
      return ____exports
      "
    `);
  });

  describe("rejects every accepted handler form it cannot lower", () => {
    const header = ['import { defineScript } from "@defold-typescript/types";', ""];
    const cases: ReadonlyArray<{
      readonly form: string;
      readonly offending: string;
      readonly prelude: readonly string[];
      readonly call: string;
    }> = [
      {
        form: "a string-typed computed key",
        offending: "[dyn]",
        prelude: ["declare const dyn: string;"],
        call: "onMessage({ [dyn](self: unknown, message: { n: number }) {} })",
      },
      {
        form: "a unique symbol key",
        offending: "[sym]",
        prelude: ["declare const sym: unique symbol;"],
        call: "onMessage({ [sym](self, message: { n: number }) {} })",
      },
      {
        form: "a shorthand handler",
        offending: "onHit",
        prelude: ["function onHit(self: unknown, message: { n: number }): void {}"],
        call: "onMessage({ onHit })",
      },
      {
        form: "a handler passed by reference",
        offending: "spawn_wave",
        prelude: ["function onHit(self: unknown, message: { n: number }): void {}"],
        call: "onMessage({ spawn_wave: onHit })",
      },
      {
        form: "a spread of another handler record",
        offending: "...base",
        prelude: ["const base = { spawn_wave(self: unknown, message: { count: number }) {} };"],
        call: "onMessage({ ...base })",
      },
      {
        form: "a non-literal argument",
        offending: "handlers",
        prelude: ["const handlers = { spawn_wave(self: unknown, message: { count: number }) {} };"],
        call: "onMessage(handlers)",
      },
    ];

    for (const { form, offending, prelude, call } of cases) {
      test(form, () => {
        const source = [
          ...header,
          ...prelude,
          "",
          "defineScript({",
          `  on_message: ${call},`,
          "});",
          "",
        ].join("\n");
        const callStart = source.indexOf("onMessage(");
        const offendingLine = source
          .slice(0, source.indexOf(offending, callStart + "onMessage(".length))
          .split("\n").length;
        const result = transpileProject({ files: { "main.ts": source } });
        expect(result.diagnostics).toHaveLength(1);
        const [diagnostic] = result.diagnostics;
        expect(diagnostic?.file).toBe("main.ts");
        expect(diagnostic?.line).toBe(offendingLine);
        expect(diagnostic?.category).toBeUndefined();
        expect(diagnostic?.message).toContain("onMessage");
        expect(diagnostic?.message).toContain(offending);
      });
    }
  });

  test("lowers an annotated script-local id beside a built-in one", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  on_message: onMessage({",
      "    spawn_wave(self, message: { count: number }) {",
      "      handle(message.count);",
      "    },",
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
          if message_id == hash("spawn_wave") then
              handle(message.count)
          elseif message_id == hash("contact_point_response") then
              handle(message.distance)
          end
      end
      return ____exports
      "
    `);
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

import { describe, expect, test } from "bun:test";
import type { TranspileProjectResult } from "./project-output";
import { runCallback, scriptChunk } from "./run-emitted-script.test-support";
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
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("contact_point_response") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.distance)
          end
      end
      return ____exports
      "
    `);
    expect(result.lua).toContain('if ____engine_message_id == hash("contact_point_response") then');
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
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("contact_point_response") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.distance)
          elseif ____engine_message_id == hash("set_parent") then
              local ____self, message = ____engine_self, ____engine_message
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
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("contact_point_response") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.distance)
          elseif ____engine_message_id == hash("spawn_wave") then
              local ____self, message = ____engine_self, ____engine_message
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
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("42") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.count)
          elseif ____engine_message_id == hash("set_parent") then
              local ____self, message = ____engine_self, ____engine_message
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
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("42") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.count)
          elseif ____engine_message_id == hash("1000") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.n)
          elseif ____engine_message_id == hash("set_parent") then
              local ____self, message = ____engine_self, ____engine_message
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
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("spawn_wave") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.count)
          elseif ____engine_message_id == hash("contact_point_response") then
              local ____self, message = ____engine_self, ____engine_message
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
      {
        form: "a destructured handler parameter",
        offending: "{ count }",
        prelude: [],
        call: "onMessage({ spawn_wave(self, { count }: { count: number }) {} })",
      },
      {
        form: "a defaulted handler parameter",
        offending: "message: { count: number } = { count: 1 }",
        prelude: [],
        call: "onMessage({ spawn_wave(self, message: { count: number } = { count: 1 }) {} })",
      },
      {
        form: "a rest handler parameter",
        offending: "...rest: unknown[]",
        prelude: [],
        call: "onMessage({ contact_point_response(self, ...rest: unknown[]) {} })",
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
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("spawn_wave") then
              local ____self, message = ____engine_self, ____engine_message
              handle(message.count)
          elseif ____engine_message_id == hash("contact_point_response") then
              local ____self, message = ____engine_self, ____engine_message
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
    expect(result.lua).toContain("local ____self, msg = ____engine_self, ____engine_message");
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

describe("the emitted on_message runs in Lua 5.1", () => {
  const REL = "main/receiver.ts";
  const CONTACT = 'on_message({ hp = 3 }, "contact_point_response", { distance = 2 }, nil)';

  function emit(lines: readonly string[]): TranspileProjectResult {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "declare function record(tag: string): void;",
      "",
      "type Self = { hp: number };",
      "",
      ...lines,
      "",
    ].join("\n");
    const result = transpileProject({ files: { [REL]: source } });
    expect(result.diagnostics).toEqual([]);
    return result;
  }

  function dispatch(handlers: readonly string[]): string[] {
    return [
      "defineScript<Self>({",
      "  on_message: onMessage<Self>({",
      ...handlers.map((line) => `    ${line}`),
      "  }),",
      "});",
    ];
  }

  const SELF_AND_MESSAGE = dispatch([
    "contact_point_response(self, message) {",
    "  record(String(self.hp));",
    "  record(String(message.distance));",
    "},",
  ]);

  test("a handler reading `self` and `message` reaches the engine arguments", () => {
    expect(runCallback(emit(SELF_AND_MESSAGE), REL, "on_message", CONTACT)).toEqual(["3", "2"]);
  });

  test("a handler parameter TypeScript-to-Lua renames reaches its engine argument", () => {
    const result = emit(
      dispatch([
        "contact_point_response(inst, type) {",
        "  record(String(inst.hp));",
        "  record(String(type.distance));",
        "},",
      ]),
    );
    expect(runCallback(result, REL, "on_message", CONTACT)).toEqual(["3", "2"]);
  });

  test("handler parameters named after other engine arguments each reach their own position", () => {
    const result = emit(
      dispatch([
        "contact_point_response(message, msg, from) {",
        "  record(String(message.hp));",
        "  record(String(msg.distance));",
        "  record(String(from));",
        "},",
      ]),
    );
    expect(
      runCallback(
        result,
        REL,
        "on_message",
        'on_message({ hp = 3 }, "contact_point_response", { distance = 2 }, "main:/go#script")',
      ),
    ).toEqual(["3", "2", "main:/go#script"]);
  });

  test("two handlers each bind their own parameters inside their own branch", () => {
    const result = emit(
      dispatch([
        "contact_point_response(self, message) {",
        "  record(String(self.hp));",
        "  record(String(message.distance));",
        "},",
        "set_parent(inst, m) {",
        "  record(String(inst.hp));",
        "  record(String(m.keep_world_transform));",
        "},",
      ]),
    );
    expect(
      runCallback(
        result,
        REL,
        "on_message",
        `${CONTACT} on_message({ hp = 5 }, "set_parent", { keep_world_transform = 1 }, nil)`,
      ),
    ).toEqual(["3", "2", "5", "1"]);
  });

  test("a handler parameter past `sender` is nil beside a same-named module const", () => {
    const result = emit([
      "const extra = 7;",
      "",
      ...dispatch([
        "contact_point_response(self, message, sender, extra?: number) {",
        "  record(String(extra ?? 0));",
        "},",
      ]),
    ]);
    expect(runCallback(result, REL, "on_message", CONTACT)).toEqual(["0"]);
  });

  test.each([
    ["const self = { hp: 7 };", "String(self.hp)", "String(inst.hp)", ["7", "3"]],
    [
      "const message = { distance: 9 };",
      "String(message.distance)",
      "String(m.distance)",
      ["9", "2"],
    ],
    ['const sender = "outer";', "sender", "String(from)", ["outer", "main:/go#script"]],
    ['const message_id = "outer";', "message_id", "String(inst.hp)", ["outer", "3"]],
  ] as const)(
    "a handler reads the module-level name beside its own parameters: %s",
    (outer, outerRead, paramRead, records) => {
      const result = emit([
        outer,
        "",
        ...dispatch([
          "contact_point_response(inst, m, from) {",
          `  record(${outerRead});`,
          `  record(${paramRead});`,
          "},",
        ]),
      ]);
      expect(
        runCallback(
          result,
          REL,
          "on_message",
          'on_message({ hp = 3 }, "contact_point_response", { distance = 2 }, "main:/go#script")',
        ),
      ).toEqual([...records]);
    },
  );

  test("the header binds the engine arguments under names no handler body reads", () => {
    expect(scriptChunk(emit(SELF_AND_MESSAGE), REL)).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      function on_message(____engine_self, ____engine_message_id, ____engine_message, ____engine_sender)
          if ____engine_message_id == hash("contact_point_response") then
              local ____self, message = ____engine_self, ____engine_message
              record(tostring(____self.hp))
              record(tostring(message.distance))
          end
      end
      return ____exports
      "
    `);
  });
});

import { describe, expect, test } from "bun:test";
import { createTranspileSession } from "./session";
import { findTextScriptProperties, type TextScriptPropertyFinding } from "./text-script-property";

const FACTORY_IMPORT = 'import { defineScript } from "@defold-typescript/types";';

function findingsOf(source: string): TextScriptPropertyFinding[] {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  return findTextScriptProperties(program, ["main.ts"]);
}

function lines(...rows: readonly string[]): string {
  return `${rows.join("\n")}\n`;
}

describe("findTextScriptProperties", () => {
  test("reports a string default with its initializer position, not a number default", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        "defineScript({",
        '  properties: { greeting: "Hello!\\nWelcome", speed: 1 },',
        "});",
      ),
    );
    expect(findings).toEqual([{ name: "greeting", file: "main.ts", line: 4, column: 27 }]);
  });

  test("reports a module const holding a string, by its type", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        'const GREETING = "Hello";',
        "",
        "defineScript({",
        "  properties: { greeting: GREETING },",
        "});",
      ),
    );
    expect(findings.map((finding) => finding.name)).toEqual(["greeting"]);
  });

  test("ignores hash, number, boolean and vector defaults", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        "defineScript({",
        "  properties: {",
        '    target: hash("x"),',
        "    speed: 1,",
        "    active: true,",
        "    offset: vmath.vector3(0, 0, 0),",
        "  },",
        "});",
      ),
    );
    expect(findings).toEqual([]);
  });

  test("reports a union default that may hold a string, with its position", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        "defineScript({",
        '  properties: { greeting: Math.random() > 0.5 ? "hi" : hash("hi") },',
        "});",
      ),
    );
    expect(findings).toEqual([{ name: "greeting", file: "main.ts", line: 4, column: 27 }]);
  });

  test("reports a branded string default", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        "defineScript({",
        '  properties: { greeting: "hi" as string & { readonly __brand: "Text" } },',
        "});",
      ),
    );
    expect(findings.map((finding) => finding.name)).toEqual(["greeting"]);
  });

  test("reports a default typed by a string-constrained type parameter", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        "function make<T extends string>(value: T) {",
        "  defineScript({ properties: { greeting: value } });",
        "}",
        'make("hi");',
      ),
    );
    expect(findings.map((finding) => finding.name)).toEqual(["greeting"]);
  });

  test("ignores a number-or-hash union, a number-constrained parameter and a vector", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        "function make<T extends number>(value: T) {",
        "  defineScript({",
        "    properties: {",
        '      pick: Math.random() > 0.5 ? 1 : hash("x"),',
        "      speed: value,",
        "      offset: vmath.vector3(0, 0, 0),",
        "    },",
        "  });",
        "}",
        "make(1);",
      ),
    );
    expect(findings).toEqual([]);
  });

  test("reports a direct string go.property at its value argument, not a number one", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        'const greeting = go.property("greeting", "Hello");',
        'const speed = go.property("speed", 1);',
        "",
        "defineScript({});",
      ),
    );
    expect(findings).toEqual([{ name: "greeting", file: "main.ts", line: 3, column: 42 }]);
  });

  test("reports a direct go.property whose value is a module const holding a string", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        'const NOTE = "note";',
        'const TEXT = "Hi";',
        "const note = go.property(NOTE, TEXT);",
        "",
        "defineScript({});",
      ),
    );
    expect(findings.map((finding) => finding.name)).toEqual(["NOTE"]);
  });

  test("reports a properties default and a direct call in source order", () => {
    const findings = findingsOf(
      lines(
        FACTORY_IMPORT,
        "",
        'const title = go.property("title", "Top");',
        "",
        "defineScript({",
        '  properties: { greeting: "Hello" },',
        "});",
      ),
    );
    expect(findings).toEqual([
      { name: "title", file: "main.ts", line: 3, column: 36 },
      { name: "greeting", file: "main.ts", line: 6, column: 27 },
    ]);
  });

  test("ignores a properties object on a local function named defineScript", () => {
    const findings = findingsOf(
      lines(
        "function defineScript(hooks: { properties: { greeting: string } }): void {}",
        "",
        'defineScript({ properties: { greeting: "Hello" } });',
      ),
    );
    expect(findings).toEqual([]);
  });
});

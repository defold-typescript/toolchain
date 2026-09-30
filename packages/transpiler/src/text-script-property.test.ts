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

import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import {
  COMPANION_INTERNAL_FIELD,
  type CompanionClosure,
  computeCompanionClosure,
} from "./companion-closure";
import { createTranspileSession } from "./session";

const FACTORY_IMPORT = 'import { defineScript } from "@defold-typescript/types";';

function closureOf(source: string): CompanionClosure {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  const sourceFile = program
    .getSourceFiles()
    .find((file: ts.SourceFile) => file.fileName.endsWith("main.ts"));
  if (!sourceFile) {
    throw new Error("session produced no main.ts");
  }
  return computeCompanionClosure(sourceFile, program.getTypeChecker());
}

function lines(...rows: readonly string[]): string {
  return `${rows.join("\n")}\n`;
}

function kinds(closure: CompanionClosure): string[] {
  return closure.violations.map((violation) => violation.kind);
}

function members(closure: CompanionClosure, kind: string): string[] {
  return closure.violations
    .filter((violation) => violation.kind === kind)
    .map((violation) => violation.member);
}

describe("computeCompanionClosure — the closure", () => {
  test("an exported const is the closure; the factory call is not", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "export const DOOR_SPEED = 3;",
        "",
        "defineScript({",
        "  init() {},",
        "});",
      ),
    );
    expect(closure.exports).toEqual(["DOOR_SPEED"]);
    expect(closure.members).toEqual(["DOOR_SPEED"]);
    expect(closure.members).not.toContain("defineScript");
    expect(closure.violations).toEqual([]);
  });

  test("the export-list spelling yields the same closure as an inline export", () => {
    const listed = closureOf(
      lines(FACTORY_IMPORT, "", "const state = {};", "export { state };", "", "defineScript({});"),
    );
    const inline = closureOf(
      lines(FACTORY_IMPORT, "", "export const state = {};", "", "defineScript({});"),
    );
    expect(listed.exports).toEqual(["state"]);
    expect(listed.members).toEqual(inline.members);
    expect(listed.exports).toEqual(inline.exports);
  });

  test("an exported function drags an unexported top-level const into the closure", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const BASE = 10;",
        "export function speed() {",
        "  return BASE * 2;",
        "}",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.exports).toEqual(["speed"]);
    expect(new Set(closure.members)).toEqual(new Set(["speed", "BASE"]));
  });

  test("a top-level binding used only inside a lifecycle hook stays out of the closure", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const LOCAL = 1;",
        "export const SHARED = 2;",
        "",
        "defineScript({",
        "  init() {",
        "    print(LOCAL);",
        "  },",
        "});",
      ),
    );
    expect(closure.members).toEqual(["SHARED"]);
    expect(closure.members).not.toContain("LOCAL");
  });

  test("an import used only by an exported declaration is in the closure", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        'import { helper } from "./helper";',
        "",
        "export const VALUE = helper();",
        "",
        "defineScript({});",
      ),
    );
    expect(new Set(closure.members)).toEqual(new Set(["VALUE", "helper"]));
    expect(closure.internals).toEqual([]);
  });

  test("an import used by both an exported declaration and a hook is in the closure once", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        'import { helper } from "./helper";',
        "",
        "export const VALUE = helper();",
        "",
        "defineScript({",
        "  init() {",
        "    helper();",
        "  },",
        "});",
      ),
    );
    expect(closure.members.filter((name) => name === "helper")).toEqual(["helper"]);
    expect(closure.internals).toEqual(["helper"]);
  });

  test("an import used only by a hook body is not in the closure", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        'import { helper } from "./helper";',
        "",
        "export const VALUE = 1;",
        "",
        "defineScript({",
        "  init() {",
        "    helper();",
        "  },",
        "});",
      ),
    );
    expect(closure.members).toEqual(["VALUE"]);
    expect(closure.members).not.toContain("helper");
  });

  test("a source exporting only types yields an empty closure", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "export type Speed = number;",
        "export interface Door {",
        "  open: boolean;",
        "}",
        "type Hidden = string;",
        "export type { Hidden };",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.exports).toEqual([]);
    expect(closure.members).toEqual([]);
    expect(closure.violations).toEqual([]);
  });

  test("an export alias is the public name; the closure stays keyed on the local symbol", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const value = 1;",
        "export { value as speed };",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.exports).toEqual(["speed"]);
    expect(closure.members).toEqual(["value"]);
    expect(closure.violations).toEqual([]);
  });

  test("repeated aliases of one binding are each an export", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const value = 1;",
        "export { value as a, value as b };",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.exports).toEqual(["a", "b"]);
    expect(closure.members).toEqual(["value"]);
  });

  test("a private closure member the script reads is recorded in internals", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const BASE = 10;",
        "export function speed() {",
        "  return BASE * 2;",
        "}",
        "",
        "defineScript({",
        "  init() {",
        "    print(BASE);",
        "  },",
        "});",
      ),
    );
    expect(closure.internals).toEqual(["BASE"]);
    expect(closure.exports).not.toContain("BASE");
  });
});

describe("computeCompanionClosure — shared mutable state", () => {
  test("a lifecycle hook reading a closure member is not a violation", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "export const SPEED = 3;",
        "",
        "defineScript({",
        "  init() {",
        "    print(SPEED);",
        "  },",
        "});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });

  test("a top-level statement reading a closure member is not a violation", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "export const SPEED = 3;",
        "print(SPEED);",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });

  test("mutating a property of a closure member is not a violation", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "export const state = { ready: false };",
        "state.ready = true;",
        "",
        "defineScript({",
        "  init() {",
        "    state.ready = false;",
        "  },",
        "});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });

  test("an export let reassigned at top level is reported", () => {
    const closure = closureOf(
      lines(FACTORY_IMPORT, "", "export let count = 0;", "count = 1;", "", "defineScript({});"),
    );
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    expect(members(closure, "shared-mutable")).toEqual(["count"]);
  });

  test("an export let reassigned inside a hook is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "export let count = 0;",
        "",
        "defineScript({",
        "  init() {",
        "    count = 1;",
        "  },",
        "});",
      ),
    );
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    expect(members(closure, "shared-mutable")).toEqual(["count"]);
  });

  test("a mutable member reached from both chunks is reported with both sites", () => {
    const source = lines(
      FACTORY_IMPORT,
      "",
      "let count = 0;",
      "export function increment() {",
      "  count++;",
      "}",
      "",
      "defineScript({",
      "  update() {",
      "    increment();",
      "    print(count);",
      "  },",
      "});",
    );
    const closure = closureOf(source);
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    const [violation] = closure.violations;
    expect(violation?.member).toBe("count");
    // The reassignment lives in the companion and the read in the script; a rule
    // keyed on script-side reassignment sees neither and reports nothing.
    expect(violation?.sites.map((site) => site.line)).toEqual([5, 11]);
    expect(violation?.message).toContain("count");
  });

  test("the same mutable member reached only from the companion is not reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "let count = 0;",
        "export function increment() {",
        "  count++;",
        "}",
        "",
        "defineScript({",
        "  update() {",
        "    increment();",
        "  },",
        "});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });

  test("exporting the reserved internal field's name is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        `export const ${COMPANION_INTERNAL_FIELD} = 1;`,
        "",
        "defineScript({});",
      ),
    );
    expect(kinds(closure)).toEqual(["reserved-internal-name"]);
    expect(members(closure, "reserved-internal-name")).toEqual([COMPANION_INTERNAL_FIELD]);
  });

  test("reaching the reserved internal field through an export alias is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const value = 1;",
        `export { value as ${COMPANION_INTERNAL_FIELD} };`,
        "",
        "defineScript({});",
      ),
    );
    expect(kinds(closure)).toEqual(["reserved-internal-name"]);
    expect(members(closure, "reserved-internal-name")).toEqual([COMPANION_INTERNAL_FIELD]);
  });

  test("array destructuring across the boundary is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "let count = 0;",
        "export function increment() {",
        "  [count] = [1];",
        "}",
        "",
        "defineScript({",
        "  update() {",
        "    increment();",
        "    print(count);",
        "  },",
        "});",
      ),
    );
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    expect(members(closure, "shared-mutable")).toEqual(["count"]);
  });

  test("object destructuring across the boundary is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "let count = 0;",
        "export function increment() {",
        "  ({ count } = { count: 1 });",
        "}",
        "",
        "defineScript({",
        "  update() {",
        "    increment();",
        "    print(count);",
        "  },",
        "});",
      ),
    );
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    expect(members(closure, "shared-mutable")).toEqual(["count"]);
  });

  test("a for…of loop target across the boundary is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "let count = 0;",
        "export function increment() {",
        "  for (count of [1, 2]) {}",
        "}",
        "",
        "defineScript({",
        "  update() {",
        "    increment();",
        "    print(count);",
        "  },",
        "});",
      ),
    );
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    expect(members(closure, "shared-mutable")).toEqual(["count"]);
  });

  test("a for…in loop target across the boundary is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        'let key = "";',
        "export function scan(table: Record<string, number>) {",
        "  for (key in table) {}",
        "}",
        "",
        "defineScript({",
        "  update() {",
        "    scan({});",
        "    print(key);",
        "  },",
        "});",
      ),
    );
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    expect(members(closure, "shared-mutable")).toEqual(["key"]);
  });

  test("a destructuring target the script never reads is not reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "let count = 0;",
        "export function increment() {",
        "  [count] = [1];",
        "}",
        "",
        "defineScript({",
        "  update() {",
        "    increment();",
        "  },",
        "});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });

  test("a shorthand property read drags its binding into the closure", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const count = 0;",
        "export const o = { count };",
        "",
        "defineScript({});",
      ),
    );
    expect(new Set(closure.members)).toEqual(new Set(["o", "count"]));
  });
});

describe("computeCompanionClosure — initialization order", () => {
  test("an effectful top-level statement before a closure member is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        'const first = register("first");',
        'export const second = register("second");',
        "",
        "defineScript({});",
      ),
    );
    expect(kinds(closure)).toEqual(["initialization-order"]);
    const [violation] = closure.violations;
    expect(violation?.member).toBe("second");
    expect(violation?.sites.map((site) => site.line)).toEqual([3, 4]);
  });

  test("an effect interleaved between two closure members is reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const BASE = 10;",
        'register("first");',
        "export const second = BASE * 2;",
        "",
        "defineScript({});",
      ),
    );
    expect(kinds(closure)).toEqual(["initialization-order"]);
    const [violation] = closure.violations;
    expect(violation?.member).toBe("second");
    expect(violation?.sites.map((site) => site.line)).toEqual([4, 5]);
  });

  test("the same effect written below the closure is not reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const BASE = 10;",
        "export const second = BASE * 2;",
        'register("first");',
        "",
        "defineScript({});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });

  test("an effect-free top-level statement before a closure member is not reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const first = 1;",
        'export const second = register("second");',
        "",
        "defineScript({});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });

  test("the ordinary factory import above an exported const is not reported", () => {
    const closure = closureOf(
      lines(FACTORY_IMPORT, "export const SPEED = 3;", "", "defineScript({});"),
    );
    expect(closure.members).toEqual(["SPEED"]);
    expect(closure.violations).toEqual([]);
  });

  test("a type-only import above a closure member is not reported", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        'import type { Door } from "./door";',
        "",
        "export const SPEED: number = 3;",
        "export type { Door };",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.violations).toEqual([]);
  });
});

describe("computeCompanionClosure — statement ownership", () => {
  test("an export declaration travels with the declarations it reads", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const value = 1;",
        "export { value as speed };",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.exports).toEqual(["speed"]);
    expect(closure.statements.filter(ts.isExportDeclaration)).toHaveLength(1);
    expect(closure.statements.filter(ts.isVariableStatement)).toHaveLength(1);
  });

  test("a carried sibling the script reads is a member and an internal", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const a = 1, b = 2;",
        "export function f(): number {",
        "  return a;",
        "}",
        "",
        "defineScript({",
        "  init() {",
        "    print(b);",
        "  },",
        "});",
      ),
    );
    expect(new Set(closure.members)).toEqual(new Set(["f", "a", "b"]));
    expect(closure.internals).toEqual(["b"]);
  });

  test("a carried sibling drags its own dependencies across", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "const p = 5;",
        "const a = 1, b = p + 1;",
        "export function f(): number {",
        "  return a;",
        "}",
        "",
        "defineScript({",
        "  init() {",
        "    print(b);",
        "  },",
        "});",
      ),
    );
    expect(new Set(closure.members)).toEqual(new Set(["f", "a", "b", "p"]));
    expect(closure.internals).toEqual(["b"]);
  });

  test("a carried sibling reassigned by the script is reported shared-mutable", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        "",
        "let a = 1, b = 2;",
        "export function f(): number {",
        "  return a;",
        "}",
        "",
        "defineScript({",
        "  init() {",
        "    b = b + 1;",
        "  },",
        "});",
      ),
    );
    expect(kinds(closure)).toEqual(["shared-mutable"]);
    expect(members(closure, "shared-mutable")).toEqual(["b"]);
  });

  test("an import the closure reaches is reported as a binding, not a moved statement", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        'import { helper } from "./helper";',
        "",
        "export const VALUE = helper();",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.importBindings).toEqual(["helper"]);
    expect(closure.statements.filter(ts.isImportDeclaration)).toEqual([]);
    expect(closure.statements.filter(ts.isVariableStatement)).toHaveLength(1);
  });

  test("a namespace import the closure reaches is reported the same way", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        'import * as helpers from "./helper";',
        "",
        "export const VALUE = helpers.helper();",
        "",
        "defineScript({});",
      ),
    );
    expect(closure.importBindings).toEqual(["helpers"]);
    expect(closure.statements.filter(ts.isImportDeclaration)).toEqual([]);
  });

  test("an import no closure member reaches is reported in neither", () => {
    const closure = closureOf(
      lines(
        FACTORY_IMPORT,
        'import { helper } from "./helper";',
        "",
        "export const VALUE = 1;",
        "",
        "defineScript({",
        "  init() {",
        "    helper();",
        "  },",
        "});",
      ),
    );
    expect(closure.importBindings).toEqual([]);
    expect(closure.statements.filter(ts.isImportDeclaration)).toEqual([]);
  });
});

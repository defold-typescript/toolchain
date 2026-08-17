import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { createTranspileSession } from "./session";

function programFor(source: string): ts.Program {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  return program;
}

function diagnosticsOf(source: string): string[] {
  const program = programFor(source);
  const sourceFile = program.getSourceFile("main.ts");
  if (!sourceFile) {
    throw new Error("session produced no main.ts");
  }
  return program
    .getSemanticDiagnostics(sourceFile)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}

// The type argument the checker gives the `hash(...)` call whose argument text
// is `argumentText`, rendered as the checker would print it.
function hashSourceOf(source: string, argumentText: string): string {
  const program = programFor(source);
  const sourceFile = program.getSourceFile("main.ts");
  if (!sourceFile) {
    throw new Error("session produced no main.ts");
  }
  const checker = program.getTypeChecker();

  let call: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "hash" &&
      node.arguments[0]?.getText(sourceFile) === argumentText
    ) {
      call = node;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  if (!call) {
    throw new Error(`no hash(${argumentText}) call in the source`);
  }

  const type = checker.getTypeAtLocation(call);
  const [argument] = checker.getTypeArguments(type as ts.TypeReference);
  if (!argument) {
    throw new Error("the hash call's type carries no type argument");
  }
  return checker.typeToString(argument);
}

// Every form Defold's single global `hash` legitimately serves, together with
// the address forms whose text is only known at runtime. The goal's Non-goals
// list names these by hand: none of them may stop compiling.
const LEGITIMATE_FORMS = [
  "export function on_input(_self: unknown, action_id: Hash | undefined) {",
  '  if (action_id === hash("jump")) {',
  "  }",
  "}",
  'const JUMP = hash("jump");',
  "void JUMP;",
  'const CONTACT = hash("contact_point");',
  "void CONTACT;",
  'go.set("#sprite", hash("tint"), vmath.vector4(1, 0, 0, 1));',
  "const i = 1;",
  'msg.post("/enemy" + i, "x");',
  'const someString: string = "/enemy";',
  'msg.post(someString, "x");',
  'msg.post(msg.url("#sprite"), "x");',
  'const spawned = factory.create("#factory");',
  'msg.post(spawned, "x");',
  "",
].join("\n");

describe("the hashed source string survives into the type", () => {
  test("every legitimate hash and address form still compiles", () => {
    expect(diagnosticsOf(LEGITIMATE_FORMS)).toEqual([]);
  });

  test("a bare Hash and a sourced Hash stay assignable in both directions", () => {
    const source = [
      'const bare: Hash = hash("#sprite");',
      "void bare;",
      'declare function takesSourced(h: Hash<"#sprite">): void;',
      "declare const opaque: Hash;",
      "takesSourced(opaque);",
      "",
    ].join("\n");
    expect(diagnosticsOf(source)).toEqual([]);
  });

  test("a hashed literal reports its source string, and a hashed variable does not", () => {
    const source = [
      'const known = hash("#sprite");',
      "void known;",
      'const dynamic: string = "#sprite";',
      "const unknown = hash(dynamic);",
      "void unknown;",
      "",
    ].join("\n");
    expect(hashSourceOf(source, '"#sprite"')).toBe('"#sprite"');
    expect(hashSourceOf(source, "dynamic")).toBe("string");
  });
});

// Type-only, and deliberately so: `@defold-typescript/types` resolves its
// runtime `exports` target to TypeScript source, so importing a *value* from it
// here would survive `--packages=external` into the packed CLI and fail under
// plain node exactly the way bug-88 did. The table arrives as a parameter and
// the lookup below stands in for `classifyUrlParameter`.
import type { UrlParameterClass, UrlParameterTable } from "@defold-typescript/types";
import * as ts from "typescript";

// A string literal sitting in an argument slot the classification table marks as
// addressing. Offsets are absolute source offsets: `textStart` is the first
// character inside the quotes, and `fragmentStart` is the first character after
// the last `#`, or -1 when the literal carries no fragment.
export interface AddressSlot {
  readonly class: UrlParameterClass;
  readonly text: string;
  readonly textStart: number;
  readonly fragmentStart: number;
}

function classOf(table: UrlParameterTable, fqn: string, parameter: string): UrlParameterClass {
  for (const entry of table) {
    if (entry.fqn === fqn && entry.parameter === parameter) return entry.class;
  }
  return "none";
}

// `getFullyQualifiedName` reports an ambient namespace member as
// `global.msg.post`, while the table is keyed on the Lua-side `msg.post`.
function tableKey(
  checker: ts.TypeChecker,
  callee: ts.PropertyAccessExpression,
): string | undefined {
  const symbol = checker.getSymbolAtLocation(callee.name);
  if (!symbol) return undefined;
  const fqn = checker.getFullyQualifiedName(symbol);
  return fqn.startsWith("global.") ? fqn.slice("global.".length) : fqn;
}

// The parameter this literal occupies, or `undefined` when the call does not
// resolve to a signature with a named parameter at that index. A rest parameter
// and a missing one both count as unresolved: neither can be classified, and
// guessing would report a fragment the project may well declare.
function parameterName(
  checker: ts.TypeChecker,
  call: ts.CallExpression,
  index: number,
): string | undefined {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (!declaration || !ts.isFunctionLike(declaration)) return undefined;
  const parameter = declaration.parameters[index];
  if (!parameter || parameter.dotDotDotToken || !ts.isIdentifier(parameter.name)) return undefined;
  return parameter.name.text;
}

// How the committed table classifies the argument slot this literal occupies —
// `"none"` when the call, the parameter, or the lookup does not resolve. The
// judgment is the table's alone: the parameter's declared type never
// participates, because an address slot and a `mesh_id` carry the same triple.
export function addressClassOfArgument(
  checker: ts.TypeChecker,
  table: UrlParameterTable,
  literal: ts.StringLiteralLike,
): UrlParameterClass {
  const call = literal.parent;
  if (!ts.isCallExpression(call)) return "none";
  const argumentIndex = call.arguments.indexOf(literal);
  if (argumentIndex === -1 || !ts.isPropertyAccessExpression(call.expression)) return "none";
  const fqn = tableKey(checker, call.expression);
  if (fqn === undefined) return "none";
  const parameter = parameterName(checker, call, argumentIndex);
  if (parameter === undefined) return "none";
  return classOf(table, fqn, parameter);
}

function innermostLiteralAt(
  sourceFile: ts.SourceFile,
  position: number,
): ts.StringLiteralLike | undefined {
  let found: ts.StringLiteralLike | undefined;
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(sourceFile) || position > node.getEnd()) return;
    if (ts.isStringLiteralLike(node)) found = node;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

// The address slot a cursor sits in, or `undefined` when it sits anywhere else.
// The cursor must be inside the quotes — including the append position at the
// very end of the text, which is where a fragment is most often typed.
export function resolveAddressSlotAtPosition(input: {
  program: ts.Program;
  table: UrlParameterTable;
  fileName: string;
  position: number;
}): AddressSlot | undefined {
  const { program, table, fileName, position } = input;
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) return undefined;

  const literal = innermostLiteralAt(sourceFile, position);
  if (!literal) return undefined;

  // An escape sequence or an implicit concatenation makes the cooked text
  // narrower than its source span, so text offsets would no longer be source
  // offsets and every span this returns would be wrong. Fail closed.
  if (literal.getWidth(sourceFile) !== literal.text.length + 2) return undefined;

  const textStart = literal.getStart(sourceFile) + 1;
  if (position < textStart || position > textStart + literal.text.length) return undefined;

  const slotClass = addressClassOfArgument(program.getTypeChecker(), table, literal);
  if (slotClass === "none") return undefined;

  const hash = literal.text.lastIndexOf("#");
  return {
    class: slotClass,
    text: literal.text,
    textStart,
    fragmentStart: hash === -1 ? -1 : textStart + hash + 1,
  };
}

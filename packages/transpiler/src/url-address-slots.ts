// Type-only, and deliberately so: `@defold-typescript/types` resolves its
// runtime `exports` target to TypeScript source, so importing a *value* from it
// here would survive `--packages=external` into the packed CLI and fail under
// plain node exactly the way bug-88 did. The table arrives as a parameter and
// the lookup below stands in for `classifyUrlParameter`.
import type {
  UrlParameterClass,
  UrlParameterEntry,
  UrlParameterTable,
} from "@defold-typescript/types";
import * as ts from "typescript";

// A string literal sitting in an argument slot the classification table
// classifies as anything but `none`. Offsets are absolute source offsets:
// `textStart` is the first character inside the quotes, and `fragmentStart` is
// the first character after the last `#`, or -1 when the literal carries no
// fragment. `addressText` is the statically-known text of the sibling argument
// the entry names as its address companion — present only for a class that
// declares one, and only when that argument is a plain string literal.
// `resourceExtensions` is the same shape for the file extensions a resource slot
// accepts: present only when the entry declares them.
export interface ClassifiedSlot {
  readonly class: UrlParameterClass;
  readonly text: string;
  readonly textStart: number;
  readonly fragmentStart: number;
  readonly addressText?: string;
  readonly resourceExtensions?: readonly string[];
}

// The classes that name something in the scene graph by address. A `gui-node`
// is classified but is not one: its `#` is part of a node's name, so treating it
// as an address would read that name as an unresolvable component fragment. The
// exhaustive `satisfies` makes a future class a type error here rather than a
// silent membership decision, which is why the set is spelled out instead of
// tested with `!== "none"`. Local by necessity — see the bug-88 note above.
const ADDRESS_CLASSES = {
  "game-object": true,
  component: true,
  either: true,
  "gui-node": false,
  animation: false,
  "resource-path": false,
  "config-key": false,
  none: false,
} satisfies Record<UrlParameterClass, boolean>;

export function isAddressClass(parameterClass: UrlParameterClass): boolean {
  return ADDRESS_CLASSES[parameterClass];
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

// The table entry governing the argument slot this literal occupies, together
// with the call it sits in — `undefined` when the call, the parameter, or the
// lookup does not resolve. The judgment is the table's alone: the parameter's
// declared type never participates, because an address slot and a `mesh_id`
// carry the same triple.
function classifiedEntryOfArgument(
  checker: ts.TypeChecker,
  table: UrlParameterTable,
  literal: ts.StringLiteralLike,
): { entry: UrlParameterEntry; call: ts.CallExpression } | undefined {
  const call = literal.parent;
  if (!ts.isCallExpression(call)) return undefined;
  const argumentIndex = call.arguments.indexOf(literal);
  if (argumentIndex === -1 || !ts.isPropertyAccessExpression(call.expression)) return undefined;
  const fqn = tableKey(checker, call.expression);
  if (fqn === undefined) return undefined;
  const parameter = parameterName(checker, call, argumentIndex);
  if (parameter === undefined) return undefined;
  for (const entry of table) {
    if (entry.fqn === fqn && entry.parameter === parameter) return { entry, call };
  }
  return undefined;
}

// How the committed table classifies the argument slot this literal occupies —
// `"none"` when nothing resolves.
export function addressClassOfArgument(
  checker: ts.TypeChecker,
  table: UrlParameterTable,
  literal: ts.StringLiteralLike,
): UrlParameterClass {
  return classifiedEntryOfArgument(checker, table, literal)?.entry.class ?? "none";
}

// The text of the sibling argument the entry names as its address companion.
// The parameter is found by *name* in the resolved signature — the companion is
// not at a fixed offset from the classified slot — and only a plain string
// literal counts: a variable, a `msg.url(…)` call and a substituted template
// are all unknown until runtime, and guessing would scope the candidates to the
// wrong component.
function addressTextOf(
  checker: ts.TypeChecker,
  entry: UrlParameterEntry,
  call: ts.CallExpression,
): string | undefined {
  if (entry.addressParameter === undefined) return undefined;
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (!declaration || !ts.isFunctionLike(declaration)) return undefined;
  const index = declaration.parameters.findIndex(
    (parameter) =>
      !parameter.dotDotDotToken &&
      ts.isIdentifier(parameter.name) &&
      parameter.name.text === entry.addressParameter,
  );
  if (index === -1) return undefined;
  const argument = call.arguments[index];
  return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
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

// The classified slot a cursor sits in, or `undefined` when it sits anywhere
// else. The cursor must be inside the quotes — including the append position at
// the very end of the text, which is where a fragment is most often typed.
export function resolveClassifiedSlotAtPosition(input: {
  program: ts.Program;
  table: UrlParameterTable;
  fileName: string;
  position: number;
}): ClassifiedSlot | undefined {
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

  const checker = program.getTypeChecker();
  const classified = classifiedEntryOfArgument(checker, table, literal);
  if (!classified || classified.entry.class === "none") return undefined;

  const hash = literal.text.lastIndexOf("#");
  const addressText = addressTextOf(checker, classified.entry, classified.call);
  return {
    class: classified.entry.class,
    text: literal.text,
    textStart,
    fragmentStart: hash === -1 ? -1 : textStart + hash + 1,
    ...(addressText === undefined ? {} : { addressText }),
    ...(classified.entry.resourceExtensions === undefined
      ? {}
      : { resourceExtensions: classified.entry.resourceExtensions }),
  };
}

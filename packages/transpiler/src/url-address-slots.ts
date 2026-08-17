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
  "action-id": false,
  none: false,
} satisfies Record<UrlParameterClass, boolean>;

export function isAddressClass(parameterClass: UrlParameterClass): boolean {
  return ADDRESS_CLASSES[parameterClass];
}

// Which of an address literal's two universes a caret stands in: component ids
// from `fragmentStart` on, game-object paths everywhere before it — including a
// literal carrying no `#` at all, which is all path. `>=` not `>`: at
// `fragmentStart` the fragment is merely empty, which is where it is most often
// typed. Stated once here so the entry builders and the provenance resolver
// cannot drift apart about where the boundary sits.
export function isFragmentCaret(slot: ClassifiedSlot, position: number): boolean {
  return slot.fragmentStart !== -1 && position >= slot.fragmentStart;
}

// `getFullyQualifiedName` reports a symbol declared in an ambient `declare
// global` block as `global.msg.post` / `global.hash`, while the table is keyed
// on the Lua-side `msg.post` / `hash`. The prefix is therefore the evidence that
// the callee *is* the Defold global the entry describes: a project's own `hash`,
// or a local object named `gui`, resolves prefixless and must not be keyed.
function tableKey(
  checker: ts.TypeChecker,
  callee: ts.PropertyAccessExpression | ts.Identifier,
): string | undefined {
  const symbol = checker.getSymbolAtLocation(ts.isIdentifier(callee) ? callee : callee.name);
  if (!symbol) return undefined;
  const fqn = checker.getFullyQualifiedName(symbol);
  return fqn.startsWith("global.") ? fqn.slice("global.".length) : undefined;
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

const EQUALITY_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

// Whether `call` sits in a comparison against the parameter the entry names. An
// entry declaring no `comparedParameter` is unscoped and always satisfied; for
// one that does, the class applies only where its universe can appear —
// `hash("…")` is a prefixless global a project writes for component ids, message
// ids and property names alike, and only the comparison against `on_input`'s
// action id says this one names an action.
//
// The other operand must *resolve* to a parameter declaration of that name.
// Matching the identifier's text instead would accept a local that merely reads
// like the hook's, whose value came from somewhere else entirely.
function comparisonSatisfied(
  checker: ts.TypeChecker,
  entry: UrlParameterEntry,
  call: ts.CallExpression,
): boolean {
  if (entry.comparedParameter === undefined) return true;
  let node: ts.Node = call;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  const comparison = node.parent;
  if (!ts.isBinaryExpression(comparison)) return false;
  if (!EQUALITY_OPERATORS.has(comparison.operatorToken.kind)) return false;
  const other = comparison.left === node ? comparison.right : comparison.left;
  const symbol = checker.getSymbolAtLocation(other);
  return (symbol?.declarations ?? []).some(
    (declaration) =>
      ts.isParameter(declaration) &&
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === entry.comparedParameter,
  );
}

// The table entry governing the argument slot this expression occupies, together
// with the call it sits in — `undefined` when the call, the parameter, or the
// lookup does not resolve. The judgment is the table's alone: the parameter's
// declared type never participates, because an address slot and a `mesh_id`
// carry the same triple.
//
// Any argument expression, not only a string literal: a hoisted `const SPRITE =
// hash("#sprite")` occupies the slot exactly as the written literal does, and
// driving both off this one lookup is what stops the two from ever disagreeing
// about whether a slot addresses.
function classifiedEntryOfArgument(
  checker: ts.TypeChecker,
  table: UrlParameterTable,
  argument: ts.Expression,
): { entry: UrlParameterEntry; call: ts.CallExpression } | undefined {
  const call = argument.parent;
  if (!ts.isCallExpression(call)) return undefined;
  const argumentIndex = call.arguments.indexOf(argument);
  if (argumentIndex === -1) return undefined;
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee) && !ts.isIdentifier(callee)) return undefined;
  const fqn = tableKey(checker, callee);
  if (fqn === undefined) return undefined;
  const parameter = parameterName(checker, call, argumentIndex);
  if (parameter === undefined) return undefined;
  for (const entry of table) {
    if (entry.fqn !== fqn || entry.parameter !== parameter) continue;
    // Inside the lookup, so `addressClassOfArgument` and
    // `resolveClassifiedSlotAtPosition` can never disagree about whether a
    // scoped entry applies.
    return comparisonSatisfied(checker, entry, call) ? { entry, call } : undefined;
  }
  return undefined;
}

// The entry governing the slot a literal *wrapped in* `hash(…)` occupies: the
// hashed name addresses whatever the enclosing call's slot addresses, so
// `msg.post(hash("#sprite"), …)` reads as the bare literal does. Handing the
// `hash(…)` call itself to the lookup above is what keeps the parameter search,
// the comparison scoping and the companion argument in one place.
//
// One level, and the stop is enforced rather than argued: a resolved entry that
// is itself the `hash` entry means the literal was doubly wrapped, and the
// compared outer `hash` of `action_id === hash(hash(""))` is exactly the shape
// that satisfies that entry — so prose about a scope it "cannot satisfy" was
// never enough to keep action ids off the inner literal.
//
// Only the ambient `hash` ascends. A project's own is prefixless, so `tableKey`
// declines it exactly as it declines it for an action id.
function slotThroughHashedCall(
  checker: ts.TypeChecker,
  table: UrlParameterTable,
  literal: ts.StringLiteralLike,
): { entry: UrlParameterEntry; call: ts.CallExpression } | undefined {
  const call = literal.parent;
  if (!ts.isCallExpression(call)) return undefined;
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee) && !ts.isIdentifier(callee)) return undefined;
  if (tableKey(checker, callee) !== "hash") return undefined;
  const ascended = classifiedEntryOfArgument(checker, table, call);
  return ascended?.entry.fqn === "hash" ? undefined : ascended;
}

// How the committed table classifies the argument slot this expression occupies
// — `"none"` when nothing resolves, which is also the answer for any node that
// is not a call argument at all.
export function addressClassOfArgument(
  checker: ts.TypeChecker,
  table: UrlParameterTable,
  argument: ts.Expression,
): UrlParameterClass {
  return classifiedEntryOfArgument(checker, table, argument)?.entry.class ?? "none";
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
  // fallback-only ascent: a literal whose own slot classifies — the action-id
  // caret inside a compared `hash` — never reaches it, so no shipped kind can
  // change meaning here.
  const own = classifiedEntryOfArgument(checker, table, literal);
  const classified =
    own && own.entry.class !== "none" ? own : slotThroughHashedCall(checker, table, literal);
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

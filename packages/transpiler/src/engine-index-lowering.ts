import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
// Type-only: the package's runtime entry is TypeScript source, which the
// published CLI cannot load under plain node. The table arrives as the JSON
// `scripts/regen.ts` writes from `INDEX_SLOT_CLASSIFICATIONS`.
import type { IndexSlotEntry, IndexSlotsArtifact } from "@defold-typescript/types";
import * as ts from "typescript";
import {
  createBinaryExpression,
  createBlock,
  createCallExpression,
  createDotsLiteral,
  createFunctionExpression,
  createIdentifier,
  createNumericLiteral,
  createParenthesizedExpression,
  createReturnStatement,
  createStringLiteral,
  type Expression,
  type File,
  getOriginalPos,
  type Identifier,
  isCallExpression,
  isIdentifier,
  isMethodCallExpression,
  isNilLiteral,
  isNumericLiteral,
  isParenthesizedExpression,
  isStringLiteral,
  isTableExpression,
  type Plugin,
  type Statement,
  SyntaxKind,
  setNodePosition,
  type TableExpression,
  type TransformationContext,
} from "typescript-to-lua";
import { EACH, engineIndexCall, engineIndexHelper, type FieldPath } from "./engine-index-runtime";

export const ENGINE_INDEX_FUNCTION_VALUE_MESSAGE =
  "This engine function takes or returns a zero-based index that is converted to Defold's base only where it is called; call it directly or through a `const` alias of its own type instead of using it as a value.";
export const ENGINE_INDEX_NAMESPACE_VALUE_MESSAGE =
  "This namespace holds engine functions whose zero-based indexes are converted only where they are called; reach its functions through property access instead of using the namespace as a value.";
export const ENGINE_INDEX_SPREAD_MESSAGE =
  "A spread argument covers a zero-based engine index that must be converted to Defold's base; pass that argument explicitly.";

const GLOBAL_PREFIX = "global.";

const INDEX_SLOTS: IndexSlotsArtifact = JSON.parse(
  readFileSync(
    createRequire(import.meta.url).resolve("@defold-typescript/types/index-slots.json"),
    "utf8",
  ),
);

interface SlotKey {
  readonly kind: "param" | "return";
  readonly slot: string;
  readonly classification: IndexSlotEntry;
}

// Each function base (`b2d.fixture.get_density`, `client:send`) mapped to its
// native-1 scalar params and returns, the slots this pass converts.
const CONVERTED_SLOTS: ReadonlyMap<string, readonly SlotKey[]> = (() => {
  const slots = new Map<string, SlotKey[]>();
  for (const [key, classification] of Object.entries(INDEX_SLOTS.slots)) {
    if (classification.class !== "native-1") continue;
    const match = /^(.+?):(param|return):([^:]+)$/.exec(key);
    if (match === null) continue;
    const [, base = "", kind, slot = ""] = match;
    const list = slots.get(base) ?? [];
    list.push({ kind: kind as SlotKey["kind"], slot, classification });
    slots.set(base, list);
  }
  return slots;
})();

interface FieldKey extends SlotKey {
  // The field names below the slot, as the classification key spells them. A
  // name may sit under a list or a nested table the key does not name
  // (`table:frame_start` is `table.animations[i].frame_start`).
  readonly fields: readonly string[];
}

// Each function base mapped to its native-1 table fields, param and return.
const CONVERTED_FIELDS: ReadonlyMap<string, readonly FieldKey[]> = (() => {
  const fields = new Map<string, FieldKey[]>();
  for (const [key, classification] of Object.entries(INDEX_SLOTS.slots)) {
    if (classification.class !== "native-1") continue;
    const match = /^(.+?):(param|return):([^:]+):(.+)$/.exec(key);
    if (match === null) continue;
    const [, base = "", kind, slot = "", names = ""] = match;
    const list = fields.get(base) ?? [];
    list.push({ kind: kind as SlotKey["kind"], slot, fields: names.split(":"), classification });
    fields.set(base, list);
  }
  return fields;
})();

const CONVERTING_BASES: ReadonlySet<string> = new Set([
  ...CONVERTED_SLOTS.keys(),
  ...CONVERTED_FIELDS.keys(),
]);

// Every namespace a converting function sits in, so a namespace value can be
// recognized as carrying one.
const CONVERTING_NAMESPACES: ReadonlySet<string> = new Set(
  [...CONVERTING_BASES]
    .filter((base) => !base.includes(":"))
    .flatMap((base) => {
      const segments = base.split(".").slice(0, -1);
      return segments.map((_, index) => segments.slice(0, index + 1).join("."));
    }),
);

function ambientName(node: ts.Node & { name?: ts.Node }, checker: ts.TypeChecker) {
  if (node.name === undefined) return undefined;
  const symbol = checker.getSymbolAtLocation(node.name);
  if (symbol === undefined) return undefined;
  const fqn = checker.getFullyQualifiedName(symbol);
  return fqn.startsWith(GLOBAL_PREFIX) ? fqn.slice(GLOBAL_PREFIX.length) : undefined;
}

// The classification base of a called declaration, keyed the way
// `INDEX_SLOT_CLASSIFICATIONS` is. Only a symbol declared in an ambient
// `declare global` block carries the `global.` prefix, so a project's own
// `get_density` never matches. A function type written as a declared function's
// return type (`go.get<P>()`'s curried call) takes that function's base.
function declarationBase(declaration: ts.Declaration, checker: ts.TypeChecker): string | undefined {
  if (ts.isFunctionDeclaration(declaration)) return ambientName(declaration, checker);
  if (
    (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration)) &&
    ts.isInterfaceDeclaration(declaration.parent) &&
    ts.isIdentifier(declaration.name) &&
    ambientName(declaration.parent, checker) !== undefined
  ) {
    return `${declaration.parent.name.text}:${declaration.name.text}`;
  }
  if (ts.isFunctionTypeNode(declaration)) {
    let node: ts.Node = declaration;
    while (ts.isTypeNode(node.parent)) node = node.parent;
    if (ts.isFunctionDeclaration(node.parent) && node.parent.type === node) {
      return ambientName(node.parent, checker);
    }
  }
  return undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function someConstituent(type: ts.Type, predicate: (type: ts.Type) => boolean): boolean {
  return type.isUnion() ? type.types.some(predicate) : predicate(type);
}

function isNullish(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Null)) !== 0;
}

function isNumeric(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.NumberLike) !== 0;
}

interface NumberShape {
  readonly numeric: boolean;
  readonly nullable: boolean;
  // A constituent that is neither a number nor nullish (a table form).
  readonly other: boolean;
}

const ANY_SHAPE: NumberShape = { numeric: true, nullable: true, other: true };

// An `any` may hold a number, nil or a table form, so it converts behind the
// run-time number check `convertedRead` already emits for a table form.
function numberShape(type: ts.Type, checker: ts.TypeChecker): NumberShape {
  if ((type.flags & ts.TypeFlags.Any) !== 0) return ANY_SHAPE;
  if ((type.flags & ts.TypeFlags.Instantiable) !== 0) {
    const constraint = checker.getBaseConstraintOfType(type);
    if (
      constraint === undefined ||
      constraint === type ||
      (constraint.flags & ts.TypeFlags.Unknown) !== 0
    ) {
      return ANY_SHAPE;
    }
    return numberShape(constraint, checker);
  }
  if (type.isUnion()) {
    const shapes = type.types.map((t) => numberShape(t, checker));
    return {
      numeric: shapes.some((shape) => shape.numeric),
      nullable: shapes.some((shape) => shape.nullable),
      other: shapes.some((shape) => shape.other),
    };
  }
  if (type.isIntersection() && type.types.some(isNumeric)) {
    return { numeric: true, nullable: false, other: false };
  }
  const numeric = isNumeric(type);
  const nullable = isNullish(type);
  return { numeric, nullable, other: !numeric && !nullable };
}

function rejection(node: ts.Node, messageText: string): ts.Diagnostic {
  const file = node.getSourceFile();
  const start = node.getStart(file);
  return {
    file,
    start,
    length: node.getEnd() - start,
    category: ts.DiagnosticCategory.Error,
    code: 0,
    messageText,
  };
}

// ---- table fields --------------------------------------------------------

const FIELD_CLASSIFICATION: IndexSlotEntry = { class: "native-1" };

// How far below a slot a classified field name is looked for.
const MAX_FIELD_DEPTH = 4;

function isOpen(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

function isTableLike(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.Object) !== 0 || type.isIntersection();
}

function listElement(type: ts.Type, checker: ts.TypeChecker): ts.Type | undefined {
  if (!checker.isArrayType(type) && !checker.isTupleType(type)) return undefined;
  return checker.getIndexTypeOfType(type, ts.IndexKind.Number);
}

function uniquePaths(paths: readonly FieldPath[]): FieldPath[] {
  return [...new Map(paths.map((path) => [JSON.stringify(path), path])).values()];
}

// Every path to `fields` in `type`. A list is entered through `EACH`, and a
// name the table does not hold is looked for one table deeper, since a
// classification key names the field, not every table above it.
function fieldPaths(
  type: ts.Type,
  fields: readonly string[],
  checker: ts.TypeChecker,
  depth = 0,
): FieldPath[] {
  const [head, ...rest] = fields;
  if (head === undefined || depth > MAX_FIELD_DEPTH) return [];
  if (type.isUnion()) {
    return uniquePaths(type.types.flatMap((part) => fieldPaths(part, fields, checker, depth)));
  }
  if (!isTableLike(type)) return [];
  const element = listElement(type, checker);
  if (element !== undefined) {
    return fieldPaths(element, fields, checker, depth + 1).map((path) => [EACH, ...path]);
  }
  const property = type.getProperty(head);
  if (property !== undefined) {
    if (rest.length === 0) return [[head]];
    return fieldPaths(checker.getTypeOfSymbol(property), rest, checker, depth + 1).map((path) => [
      head,
      ...path,
    ]);
  }
  if (rest.length === 0 && checker.getIndexInfoOfType(type, ts.IndexKind.String) !== undefined) {
    return [[head]];
  }
  return uniquePaths(
    type
      .getProperties()
      .flatMap((nested) =>
        fieldPaths(checker.getTypeOfSymbol(nested), fields, checker, depth + 1).map((path) => [
          nested.name,
          ...path,
        ]),
      ),
  );
}

// Whether a value of `type` may hold a table at every step of `path`.
function mayCarry(type: ts.Type, path: FieldPath, checker: ts.TypeChecker): boolean {
  const [head, ...rest] = path;
  if (head === undefined || isOpen(type)) return true;
  if ((type.flags & ts.TypeFlags.Instantiable) !== 0) {
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint === undefined || constraint === type || mayCarry(constraint, path, checker);
  }
  if (type.isUnion()) return type.types.some((part) => mayCarry(part, path, checker));
  if (!isTableLike(type)) return false;
  if (head === EACH) {
    const element = listElement(type, checker);
    return element !== undefined && mayCarry(element, rest, checker);
  }
  const property = type.getProperty(head);
  if (property !== undefined) return mayCarry(checker.getTypeOfSymbol(property), rest, checker);
  return checker.getIndexInfoOfType(type, ts.IndexKind.String) !== undefined;
}

function carriesField(type: ts.Type, field: string): boolean {
  return isOpen(type) || someConstituent(type, (t) => t.getProperty(field) !== undefined);
}

function propertyName(
  property: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): string | undefined {
  const name = property.name;
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const type = checker.getTypeAtLocation(name.expression);
    if (type.isStringLiteral()) return type.value;
  }
  return undefined;
}

function propertyValue(property: ts.ObjectLiteralElementLike): ts.Expression | undefined {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

interface FieldEdit {
  readonly key: string;
  // The field itself is the index, converted where it is written.
  readonly leaf?: ts.Expression;
  // Paths below the field's value, converted at run time.
  readonly paths?: readonly FieldPath[];
}

// The conversions a literal written at a converting call carries into the Lua
// it lowers to. Its visitor applies them, so a nested literal converts where it
// is written and nothing it builds is copied.
const objectEdits = new WeakMap<ts.Node, FieldEdit[]>();
const elementEdits = new WeakMap<ts.Node, { position: number; paths: FieldPath[] }[]>();
// A literal whose field the lowering cannot place (a spread that may override
// it, a list with a spread or a hole) is converted as a whole at run time.
const wholeConversions = new WeakMap<ts.Node, FieldPath[]>();

function append<T>(map: WeakMap<ts.Node, T[]>, node: ts.Node, values: readonly T[]): void {
  if (values.length > 0) map.set(node, [...(map.get(node) ?? []), ...values]);
}

// Arranges the conversion of `paths` below `expression`: a literal is
// rewritten where it is written, and the paths returned are left for the
// caller to convert on the expression's own value at run time.
function arrangeFields(
  expression: ts.Expression,
  paths: readonly FieldPath[],
  checker: ts.TypeChecker,
): FieldPath[] {
  const node = unwrap(expression);
  if (ts.isObjectLiteralExpression(node)) {
    arrangeObject(node, paths, checker);
    return [];
  }
  if (ts.isArrayLiteralExpression(node)) {
    arrangeArray(node, paths, checker);
    return [];
  }
  const type = checker.getTypeAtLocation(node);
  return paths.filter((path) => mayCarry(type, path, checker));
}

function arrangeObject(
  node: ts.ObjectLiteralExpression,
  paths: readonly FieldPath[],
  checker: ts.TypeChecker,
): void {
  const byKey = new Map<string, FieldPath[]>();
  for (const [head, ...rest] of paths) {
    if (typeof head === "string") byKey.set(head, [...(byKey.get(head) ?? []), rest]);
  }
  for (const [key, rests] of byKey) {
    let spread: ts.SpreadAssignment | undefined;
    let explicit: ts.ObjectLiteralElementLike | undefined;
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        if (carriesField(checker.getTypeAtLocation(property.expression), key)) spread = property;
      } else if (propertyName(property, checker) === key) {
        spread = undefined;
        explicit = property;
      }
    }
    if (spread !== undefined) {
      append(
        wholeConversions,
        node,
        rests.map((rest) => [key, ...rest]),
      );
      continue;
    }
    const value = explicit && propertyValue(explicit);
    if (value === undefined) continue;
    if (rests.some((rest) => rest.length === 0)) append(objectEdits, node, [{ key, leaf: value }]);
    const deeper = rests.filter((rest) => rest.length > 0);
    const runtime = deeper.length === 0 ? [] : arrangeFields(value, deeper, checker);
    if (runtime.length > 0) append(objectEdits, node, [{ key, paths: runtime }]);
  }
}

function arrangeArray(
  node: ts.ArrayLiteralExpression,
  paths: readonly FieldPath[],
  checker: ts.TypeChecker,
): void {
  const rests = paths.flatMap(([head, ...rest]) =>
    head === EACH && rest.length > 0 ? [rest] : [],
  );
  if (rests.length === 0) return;
  if (node.elements.some((e) => ts.isSpreadElement(e) || ts.isOmittedExpression(e))) {
    append(
      wholeConversions,
      node,
      rests.map((rest) => [EACH, ...rest]),
    );
    return;
  }
  node.elements.forEach((element, position) => {
    const runtime = arrangeFields(element, rests, checker);
    if (runtime.length > 0) append(elementEdits, node, [{ position, paths: runtime }]);
  });
}

// The files whose Lua calls the run-time helper, so it is defined once at the top.
const helperFiles = new WeakSet<ts.SourceFile>();

function runtimeConversion(
  value: Expression,
  paths: readonly FieldPath[],
  delta: 1 | -1,
  copy: boolean,
  context: TransformationContext,
): Expression {
  helperFiles.add(context.sourceFile);
  return engineIndexCall(value, paths, delta, copy);
}

// The entry a Lua table (or the tables `__TS__ObjectAssign` merges) ends up
// holding for `key`: the last one written.
function effectiveEntry(tables: readonly TableExpression[], key: string) {
  return tables
    .flatMap((table) => table.fields)
    .reverse()
    .find(
      (entry) => entry.key !== undefined && isStringLiteral(entry.key) && entry.key.value === key,
    );
}

// ---- scalar and tuple conversion ----------------------------------------

function positioned<T extends Expression>(node: T, from: Expression): T {
  return setNodePosition(node, getOriginalPos(from));
}

function plusOne(value: Expression): Expression {
  if (isNumericLiteral(value)) return positioned(createNumericLiteral(value.value + 1), value);
  return positioned(
    createBinaryExpression(value, createNumericLiteral(1), SyntaxKind.AdditionOperator),
    value,
  );
}

function minusOne(value: Expression): Expression {
  return createBinaryExpression(value, createNumericLiteral(1), SyntaxKind.SubtractionOperator);
}

function and(left: Expression, right: Expression): Expression {
  return createBinaryExpression(left, right, SyntaxKind.AndOperator);
}

function or(left: Expression, right: Expression): Expression {
  return createBinaryExpression(left, right, SyntaxKind.OrOperator);
}

function atLeastZero(value: Expression): Expression {
  return createBinaryExpression(value, createNumericLiteral(0), SyntaxKind.GreaterEqualOperator);
}

function isNumberCheck(value: Expression): Expression {
  return createBinaryExpression(
    createCallExpression(createIdentifier("type"), [value]),
    createStringLiteral("number"),
    SyntaxKind.EqualityOperator,
  );
}

// `(function(v) <body> end)(value)`: converts a value that must be read once.
function applied(
  params: Identifier[],
  body: Statement[],
  args: Expression[],
  from: Expression,
  dots = false,
): Expression {
  const fn = createFunctionExpression(
    createBlock(body),
    params,
    dots ? createDotsLiteral() : undefined,
  );
  return positioned(createCallExpression(createParenthesizedExpression(fn), args), from);
}

type Direction = "in" | "out";

interface Conversion {
  readonly direction: Direction;
  readonly shape: NumberShape;
  readonly fromEnd: boolean;
}

// The converted form of `value` read through the name `v`: nil stays nil, a
// table form stays as it is, and a negative `fromEnd` value passes through.
function convertedRead(v: Expression, conversion: Conversion): Expression {
  const shifted = conversion.direction === "in" ? plusOne(v) : minusOne(v);
  let result = conversion.fromEnd ? or(and(atLeastZero(v), shifted), v) : shifted;
  if (conversion.shape.other) result = or(and(isNumberCheck(v), result), v);
  else if (conversion.shape.nullable) result = and(v, result);
  return result;
}

function needsSingleRead(conversion: Conversion): boolean {
  return conversion.fromEnd || conversion.shape.nullable || conversion.shape.other;
}

function convertValue(value: Expression, conversion: Conversion): Expression {
  if (!needsSingleRead(conversion)) {
    return conversion.direction === "in" ? plusOne(value) : positioned(minusOne(value), value);
  }
  if (isIdentifier(value)) return positioned(convertedRead(value, conversion), value);
  const v = createIdentifier("v");
  return applied([v], [createReturnStatement([convertedRead(v, conversion)])], [value], value);
}

// A literal argument folds at compile time: `0` becomes `1`, and a negative
// literal in a `fromEnd` slot passes through.
function literalValue(argument: ts.Expression): number | undefined {
  const inner = unwrap(argument);
  if (ts.isNumericLiteral(inner)) return Number(inner.text);
  if (
    ts.isPrefixUnaryExpression(inner) &&
    inner.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(inner.operand)
  ) {
    return -Number(inner.operand.text);
  }
  return undefined;
}

function convertArgument(
  value: Expression,
  argument: ts.Expression,
  classification: IndexSlotEntry,
  checker: ts.TypeChecker,
): Expression {
  if (isNilLiteral(value)) return value;
  const literal = literalValue(argument);
  if (literal !== undefined) {
    if (classification.fromEnd === true && literal < 0) return value;
    return positioned(createNumericLiteral(literal + 1), value);
  }
  const shape = numberShape(checker.getTypeAtLocation(argument), checker);
  if (!shape.numeric) return value;
  return convertValue(value, { direction: "in", shape, fromEnd: classification.fromEnd === true });
}

// The Lua call a TSTL call lowering produced, through the table a multi-return
// call is wrapped in when it is not destructured.
function luaCallOf(result: Expression): Expression | undefined {
  if (isCallExpression(result) || isMethodCallExpression(result)) return result;
  if (isParenthesizedExpression(result)) return luaCallOf(result.expression);
  if (isTableExpression(result) && result.fields.length === 1) {
    const [field] = result.fields;
    if (field !== undefined && field.key === undefined) return luaCallOf(field.value);
  }
  return undefined;
}

function replaceLuaCall(result: Expression, replacement: (call: Expression) => Expression) {
  if (isCallExpression(result) || isMethodCallExpression(result)) return replacement(result);
  if (isParenthesizedExpression(result)) {
    result.expression = replaceLuaCall(result.expression, replacement);
    return result;
  }
  if (isTableExpression(result)) {
    const [field] = result.fields;
    if (field !== undefined) field.value = replaceLuaCall(field.value, replacement);
  }
  return result;
}

function tupleElements(type: ts.Type, checker: ts.TypeChecker): readonly ts.Type[] | undefined {
  const parts = type.isIntersection() ? type.types : [type];
  const tuple = parts.find((part) => checker.isTupleType(part));
  return tuple === undefined ? undefined : checker.getTypeArguments(tuple as ts.TypeReference);
}

interface ReturnFields {
  // The `LuaMultiReturn` slot holding the table; absent for a single return.
  readonly tupleSlot?: number;
  readonly paths: readonly FieldPath[];
}

function convertReturn(
  result: Expression,
  call: ts.CallExpression,
  returns: readonly SlotKey[],
  fields: readonly ReturnFields[],
  context: TransformationContext,
): Expression {
  const checker = context.checker;
  const type = checker.getTypeAtLocation(call);
  const tupled = returns.filter((slot) => slot.classification.tupleSlot !== undefined);
  const tupledFields = fields.filter((field) => field.tupleSlot !== undefined);
  if (tupled.length === 0 && tupledFields.length === 0) {
    let converted = result;
    if (returns.length > 0) {
      const shape = numberShape(type, checker);
      if (shape.numeric && !shape.other) {
        converted = convertValue(result, { direction: "out", shape, fromEnd: false });
      }
    }
    const own = fields.find((field) => field.tupleSlot === undefined);
    return own === undefined
      ? converted
      : runtimeConversion(converted, own.paths, -1, false, context);
  }
  const elements = tupleElements(type, checker) ?? [];
  const width = Math.max(
    ...tupled.map((slot) => (slot.classification.tupleSlot ?? 0) + 1),
    ...tupledFields.map((field) => (field.tupleSlot ?? 0) + 1),
  );
  const names = Array.from({ length: width }, (_, index) => createIdentifier(`v${index + 1}`));
  const values: Expression[] = names.map((name, index) => {
    const table = tupledFields.find((field) => field.tupleSlot === index);
    if (table !== undefined) return runtimeConversion(name, table.paths, -1, false, context);
    if (!tupled.some((slot) => slot.classification.tupleSlot === index)) return name;
    const element = elements[index];
    const shape =
      element === undefined
        ? { numeric: true, nullable: true, other: false }
        : numberShape(element, checker);
    if (!shape.numeric || shape.other) return name;
    return convertedRead(name, { direction: "out", shape, fromEnd: false });
  });
  return replaceLuaCall(result, (inner) =>
    applied(names, [createReturnStatement([...values, createDotsLiteral()])], [inner], inner, true),
  );
}

function isDiscarded(call: ts.CallExpression): boolean {
  let node: ts.Node = call;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  return ts.isExpressionStatement(node.parent) || ts.isVoidExpression(node.parent);
}

// ---- per-call plan -------------------------------------------------------

interface ArgumentConversion {
  readonly position: number;
  // The argument is itself a native-1 index.
  readonly classification?: IndexSlotEntry;
  // Fields below the argument converted at run time, into a copy.
  readonly paths: readonly FieldPath[];
}

interface CallPlan {
  readonly arguments: readonly ArgumentConversion[];
  readonly returns: readonly SlotKey[];
  readonly returnFields: readonly ReturnFields[];
  readonly diagnostics: readonly ts.Diagnostic[];
}

function planReturnFields(
  call: ts.CallExpression,
  fields: readonly FieldKey[],
  checker: ts.TypeChecker,
): ReturnFields[] {
  const type = checker.getTypeAtLocation(call);
  const bySlot = new Map<number | undefined, FieldPath[]>();
  for (const field of fields) {
    if (field.kind !== "return") continue;
    const { tupleSlot } = field.classification;
    const target = tupleSlot === undefined ? type : tupleElements(type, checker)?.[tupleSlot];
    if (target === undefined) continue;
    const paths = fieldPaths(target, field.fields, checker);
    if (paths.length > 0)
      bySlot.set(tupleSlot, uniquePaths([...(bySlot.get(tupleSlot) ?? []), ...paths]));
  }
  return [...bySlot].map(([tupleSlot, paths]) =>
    tupleSlot === undefined ? { paths } : { tupleSlot, paths },
  );
}

function planCall(call: ts.CallExpression, checker: ts.TypeChecker): CallPlan | undefined {
  const signature = checker.getResolvedSignature(call);
  const declaration = signature?.declaration;
  if (signature === undefined || declaration === undefined || !ts.isFunctionLike(declaration)) {
    return undefined;
  }
  const base = declarationBase(declaration, checker);
  if (base === undefined || !CONVERTING_BASES.has(base)) return undefined;
  const slots = CONVERTED_SLOTS.get(base) ?? [];
  const fields = CONVERTED_FIELDS.get(base) ?? [];
  const parameters = signature.getParameters();
  const conversions: ArgumentConversion[] = [];
  const diagnostics: ts.Diagnostic[] = [];
  const firstSpread = call.arguments.findIndex(ts.isSpreadElement);
  declaration.parameters.forEach((parameter, position) => {
    if (parameter.dotDotDotToken !== undefined || !ts.isIdentifier(parameter.name)) return;
    const name = parameter.name.text;
    const slot = slots.find((candidate) => candidate.kind === "param" && candidate.slot === name);
    const fieldKeys = fields.filter((key) => key.kind === "param" && key.slot === name);
    if (slot === undefined && fieldKeys.length === 0) return;
    if (firstSpread !== -1 && firstSpread <= position) {
      const spread = call.arguments[firstSpread] as ts.Expression;
      diagnostics.push(rejection(spread, ENGINE_INDEX_SPREAD_MESSAGE));
      return;
    }
    const argument = call.arguments[position];
    const symbol = parameters[position];
    if (argument === undefined) return;
    const paths =
      symbol === undefined
        ? []
        : uniquePaths(
            fieldKeys.flatMap((key) =>
              fieldPaths(checker.getTypeOfSymbol(symbol), key.fields, checker),
            ),
          );
    const runtime = paths.length === 0 ? [] : arrangeFields(argument, paths, checker);
    if (slot === undefined && runtime.length === 0) return;
    conversions.push({
      position,
      ...(slot === undefined ? {} : { classification: slot.classification }),
      paths: runtime,
    });
  });
  const discarded = isDiscarded(call);
  const returns = discarded ? [] : slots.filter((slot) => slot.kind === "return");
  const returnFields = discarded ? [] : planReturnFields(call, fields, checker);
  return { arguments: conversions, returns, returnFields, diagnostics };
}

function transformCall(node: ts.CallExpression, context: TransformationContext): Expression {
  const plan = planCall(node, context.checker);
  if (plan !== undefined && plan.diagnostics.length > 0) {
    context.diagnostics.push(...plan.diagnostics);
    return context.superTransformExpression(node);
  }
  const result = context.superTransformExpression(node);
  if (plan === undefined) return result;
  if (plan.arguments.length > 0) {
    const call = luaCallOf(result);
    if (call !== undefined && (isCallExpression(call) || isMethodCallExpression(call))) {
      const offset = call.params.length - node.arguments.length;
      for (const { position, classification, paths } of plan.arguments) {
        const index = position + Math.max(offset, 0);
        const value = call.params[index];
        const argument = node.arguments[position];
        if (value === undefined || argument === undefined) continue;
        let converted =
          classification === undefined
            ? value
            : convertArgument(value, argument, classification, context.checker);
        if (paths.length > 0) converted = runtimeConversion(converted, paths, 1, true, context);
        call.params[index] = converted;
      }
    }
  }
  return plan.returns.length > 0 || plan.returnFields.length > 0
    ? convertReturn(result, node, plan.returns, plan.returnFields, context)
    : result;
}

// ---- escapes -------------------------------------------------------------

type Holder = "function" | "namespace";

function convertingSignature(signature: ts.Signature, checker: ts.TypeChecker): boolean {
  const declaration = signature.declaration;
  if (declaration === undefined || ts.isJSDocSignature(declaration)) return false;
  const base = declarationBase(declaration, checker);
  return base !== undefined && CONVERTING_BASES.has(base);
}

function holderOf(expression: ts.Expression, checker: ts.TypeChecker): Holder | undefined {
  const type = checker.getTypeAtLocation(expression);
  const symbol = type.getSymbol();
  if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.ValueModule) !== 0) {
    const fqn = checker.getFullyQualifiedName(symbol);
    if (
      fqn.startsWith(GLOBAL_PREFIX) &&
      CONVERTING_NAMESPACES.has(fqn.slice(GLOBAL_PREFIX.length))
    ) {
      return "namespace";
    }
    return undefined;
  }
  return type.getCallSignatures().some((signature) => convertingSignature(signature, checker))
    ? "function"
    : undefined;
}

// A function holder may be called, a namespace holder may have a property read
// off it, and either may be bound by a `const` alias of its own type or an
// unannotated destructuring; the pass follows each of those back to the
// declaration. Anywhere else the declaration is lost: `.call`, `.apply` and
// `.bind` reach the function through a signature the pass cannot classify, and
// an alias typed as some other function keeps no link to it.
function followable(expression: ts.Expression, holder: Holder, checker: ts.TypeChecker): boolean {
  let node: ts.Node = expression;
  while (ts.isParenthesizedExpression(node.parent) || ts.isNonNullExpression(node.parent)) {
    node = node.parent;
  }
  const parent = node.parent;
  if (holder === "function" && ts.isCallExpression(parent) && parent.expression === node) {
    return true;
  }
  if (
    holder === "namespace" &&
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === node
  ) {
    return true;
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
    if ((ts.getCombinedNodeFlags(parent) & ts.NodeFlags.Const) === 0) return false;
    if (ts.isIdentifier(parent.name)) return holderOf(parent.name, checker) === holder;
    return parent.type === undefined;
  }
  return false;
}

function isValueReference(node: ts.Node): node is ts.Expression {
  if (ts.isIdentifier(node)) {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts.isShorthandPropertyAssignment(parent)) return true;
    if ((parent as { name?: ts.Node }).name === node) return false;
    if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
    return (
      !ts.isQualifiedName(parent) &&
      !ts.isLabeledStatement(parent) &&
      !ts.isBreakOrContinueStatement(parent)
    );
  }
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

function checkEscapes(file: ts.SourceFile, checker: ts.TypeChecker, out: ts.Diagnostic[]): void {
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return;
    }
    if (isValueReference(node)) {
      const holder = holderOf(node, checker);
      if (holder !== undefined && !followable(node, holder, checker)) {
        out.push(
          rejection(
            node,
            holder === "function"
              ? ENGINE_INDEX_FUNCTION_VALUE_MESSAGE
              : ENGINE_INDEX_NAMESPACE_VALUE_MESSAGE,
          ),
        );
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
}

// The whole literal converted at run time, when the lowering could not place a
// field of it.
function withWholeConversion(
  node: ts.Node,
  result: Expression,
  context: TransformationContext,
): Expression {
  const paths = wholeConversions.get(node);
  return paths === undefined ? result : runtimeConversion(result, paths, 1, true, context);
}

export const engineIndexLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.SourceFile]: (node, context) => {
      checkEscapes(node, context.checker, context.diagnostics);
      const file = context.superTransformNode(node)[0] as File;
      if (helperFiles.has(node)) file.statements.unshift(engineIndexHelper());
      return file;
    },
    [ts.SyntaxKind.CallExpression]: transformCall,
    // A spread lowers the literal to `__TS__ObjectAssign({}, base, {index = …})`,
    // so the table carrying the field can sit one call deep.
    [ts.SyntaxKind.ObjectLiteralExpression]: (node, context): Expression => {
      const result = context.superTransformExpression(node);
      const tables = isTableExpression(result)
        ? [result]
        : isCallExpression(result)
          ? result.params.filter(isTableExpression)
          : [];
      for (const edit of objectEdits.get(node) ?? []) {
        const entry = effectiveEntry(tables, edit.key);
        if (entry === undefined) continue;
        entry.value =
          edit.leaf !== undefined
            ? convertArgument(entry.value, edit.leaf, FIELD_CLASSIFICATION, context.checker)
            : runtimeConversion(entry.value, edit.paths ?? [], 1, true, context);
      }
      return withWholeConversion(node, result, context);
    },
    [ts.SyntaxKind.ArrayLiteralExpression]: (node, context): Expression => {
      const result = context.superTransformExpression(node);
      if (isTableExpression(result)) {
        for (const { position, paths } of elementEdits.get(node) ?? []) {
          const entry = result.fields[position];
          if (entry !== undefined)
            entry.value = runtimeConversion(entry.value, paths, 1, true, context);
        }
      }
      return withWholeConversion(node, result, context);
    },
  },
};

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

export const INDEX_OPTION_VARIABLE_MESSAGE =
  "`options.index` is zero-based and is converted to Defold's 1-based index only in an object literal written at the call; pass the options inline.";
export const INDEX_OPTION_SPREAD_MESSAGE =
  "A spread carrying `index` cannot be converted to Defold's 1-based index; write `index` explicitly after the spread.";
export const INDEX_OPTION_UNDEFINED_MESSAGE =
  "`options.index` may be undefined here, so it cannot be converted to Defold's 1-based index; pass a number, or leave `index` out.";
export const ENGINE_INDEX_FUNCTION_VALUE_MESSAGE =
  "This engine function takes or returns a zero-based index that is converted to Defold's base only where it is called; call it directly or through a `const` alias instead of using it as a value.";
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

// Each function base mapped to its param names whose lowered table fields this
// pass converts, and the field names.
const LOWERED_FIELDS: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>> = (() => {
  const fields = new Map<string, Map<string, string[]>>();
  for (const key of INDEX_SLOTS.loweredTableFields) {
    const match = /^(.+?):param:([^:]+):([^:]+)$/.exec(key);
    if (match === null) continue;
    const [, base = "", param = "", field = ""] = match;
    const byParam = fields.get(base) ?? new Map<string, string[]>();
    byParam.set(param, [...(byParam.get(param) ?? []), field]);
    fields.set(base, byParam);
  }
  return fields;
})();

const CONVERTING_BASES: ReadonlySet<string> = new Set([
  ...CONVERTED_SLOTS.keys(),
  ...LOWERED_FIELDS.keys(),
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

function numberShape(type: ts.Type): NumberShape {
  const types = type.isUnion() ? type.types : [type];
  return {
    numeric: types.some(isNumeric),
    nullable: types.some(isNullish),
    other: types.some((t) => !isNumeric(t) && !isNullish(t)),
  };
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

// ---- options.index -------------------------------------------------------

function carriesField(type: ts.Type, field: string): boolean {
  return someConstituent(type, (t) => t.getProperty(field) !== undefined);
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

function fieldValueType(
  property: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  if (ts.isPropertyAssignment(property)) return checker.getTypeAtLocation(property.initializer);
  if (ts.isShorthandPropertyAssignment(property)) return checker.getTypeAtLocation(property.name);
  return undefined;
}

// The first reason a lowered table field cannot be converted, or `undefined`
// when it can.
function rejectTableField(
  argument: ts.Expression,
  field: string,
  checker: ts.TypeChecker,
): ts.Diagnostic | undefined {
  const literal = unwrap(argument);
  if (!ts.isObjectLiteralExpression(literal)) {
    return carriesField(checker.getTypeAtLocation(literal), field)
      ? rejection(argument, INDEX_OPTION_VARIABLE_MESSAGE)
      : undefined;
  }
  let uncoveredSpread: ts.SpreadAssignment | undefined;
  let explicit: ts.ObjectLiteralElementLike | undefined;
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (carriesField(checker.getTypeAtLocation(property.expression), field)) {
        uncoveredSpread = property;
      }
    } else if (propertyName(property, checker) === field) {
      uncoveredSpread = undefined;
      explicit = property;
    }
  }
  if (uncoveredSpread !== undefined) return rejection(uncoveredSpread, INDEX_OPTION_SPREAD_MESSAGE);
  const valueType = explicit && fieldValueType(explicit, checker);
  if (explicit !== undefined && valueType !== undefined && someConstituent(valueType, isNullish)) {
    return rejection(explicit, INDEX_OPTION_UNDEFINED_MESSAGE);
  }
  return undefined;
}

const loweredLiterals = new WeakMap<ts.Node, readonly string[]>();

// A literal's diagnostics guarantee the last field of each name is the effective
// one: a spread carrying it after it is rejected. Every earlier one is shadowed
// and keeps its source value.
function offsetEffectiveField(tables: readonly TableExpression[], field: string): void {
  for (const entry of tables.flatMap((table) => table.fields).reverse()) {
    if (entry.key !== undefined && isStringLiteral(entry.key) && entry.key.value === field) {
      entry.value = plusOne(entry.value);
      return;
    }
  }
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
  const shape = numberShape(checker.getTypeAtLocation(argument));
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

function convertReturn(
  result: Expression,
  call: ts.CallExpression,
  returns: readonly SlotKey[],
  checker: ts.TypeChecker,
): Expression {
  const type = checker.getTypeAtLocation(call);
  const tupled = returns.filter((slot) => slot.classification.tupleSlot !== undefined);
  if (tupled.length === 0) {
    const shape = numberShape(type);
    if (!shape.numeric || shape.other) return result;
    return convertValue(result, { direction: "out", shape, fromEnd: false });
  }
  const elements = tupleElements(type, checker) ?? [];
  const width = Math.max(...tupled.map((slot) => (slot.classification.tupleSlot ?? 0) + 1));
  const names = Array.from({ length: width }, (_, index) => createIdentifier(`v${index + 1}`));
  const values: Expression[] = names.map((name, index) => {
    if (!tupled.some((slot) => slot.classification.tupleSlot === index)) return name;
    const element = elements[index];
    const shape =
      element === undefined
        ? { numeric: true, nullable: true, other: false }
        : numberShape(element);
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
  readonly classification: IndexSlotEntry;
}

interface CallPlan {
  readonly arguments: readonly ArgumentConversion[];
  readonly returns: readonly SlotKey[];
  readonly diagnostics: readonly ts.Diagnostic[];
}

function planCall(call: ts.CallExpression, checker: ts.TypeChecker): CallPlan | undefined {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === undefined || !ts.isFunctionLike(declaration)) return undefined;
  const base = declarationBase(declaration, checker);
  if (base === undefined || !CONVERTING_BASES.has(base)) return undefined;
  const slots = CONVERTED_SLOTS.get(base) ?? [];
  const fields = LOWERED_FIELDS.get(base);
  const conversions: ArgumentConversion[] = [];
  const diagnostics: ts.Diagnostic[] = [];
  const firstSpread = call.arguments.findIndex(ts.isSpreadElement);
  declaration.parameters.forEach((parameter, position) => {
    if (parameter.dotDotDotToken !== undefined || !ts.isIdentifier(parameter.name)) return;
    const name = parameter.name.text;
    const slot = slots.find((candidate) => candidate.kind === "param" && candidate.slot === name);
    const fieldNames = fields?.get(name) ?? [];
    if (slot === undefined && fieldNames.length === 0) return;
    if (firstSpread !== -1 && firstSpread <= position) {
      const spread = call.arguments[firstSpread] as ts.Expression;
      diagnostics.push(rejection(spread, ENGINE_INDEX_SPREAD_MESSAGE));
      return;
    }
    const argument = call.arguments[position];
    if (argument === undefined) return;
    if (slot !== undefined) conversions.push({ position, classification: slot.classification });
    for (const field of fieldNames) {
      const diagnostic = rejectTableField(argument, field, checker);
      if (diagnostic !== undefined) {
        diagnostics.push(diagnostic);
        continue;
      }
      const literal = unwrap(argument);
      if (ts.isObjectLiteralExpression(literal)) {
        loweredLiterals.set(literal, [...(loweredLiterals.get(literal) ?? []), field]);
      }
    }
  });
  const returns = isDiscarded(call) ? [] : slots.filter((slot) => slot.kind === "return");
  return { arguments: conversions, returns, diagnostics };
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
      for (const { position, classification } of plan.arguments) {
        const index = position + Math.max(offset, 0);
        const value = call.params[index];
        const argument = node.arguments[position];
        if (value === undefined || argument === undefined) continue;
        call.params[index] = convertArgument(value, argument, classification, context.checker);
      }
    }
  }
  return plan.returns.length > 0
    ? convertReturn(result, node, plan.returns, context.checker)
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

// A holder may be called, have a property read off it, or be bound by a `const`
// alias or destructuring; the pass follows each of those back to the
// declaration. Anywhere else the declaration is lost.
function followable(expression: ts.Expression, holder: Holder): boolean {
  let node: ts.Node = expression;
  while (ts.isParenthesizedExpression(node.parent) || ts.isNonNullExpression(node.parent)) {
    node = node.parent;
  }
  const parent = node.parent;
  if (holder === "function" && ts.isCallExpression(parent) && parent.expression === node) {
    return true;
  }
  if (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === node
  ) {
    return true;
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
    return (ts.getCombinedNodeFlags(parent) & ts.NodeFlags.Const) !== 0;
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
      if (holder !== undefined && !followable(node, holder)) {
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

export const engineIndexLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.SourceFile]: (node, context) => {
      checkEscapes(node, context.checker, context.diagnostics);
      return context.superTransformNode(node)[0] as File;
    },
    [ts.SyntaxKind.CallExpression]: transformCall,
    // A spread lowers the literal to `__TS__ObjectAssign({}, base, {index = …})`,
    // so the table carrying the field can sit one call deep.
    [ts.SyntaxKind.ObjectLiteralExpression]: (node, context): Expression => {
      const result = context.superTransformExpression(node);
      const fields = loweredLiterals.get(node);
      if (fields === undefined) return result;
      const tables = isTableExpression(result)
        ? [result]
        : isCallExpression(result)
          ? result.params.filter(isTableExpression)
          : [];
      for (const field of fields) offsetEffectiveField(tables, field);
      return result;
    },
  },
};

import * as ts from "typescript";
import {
  createAssignmentStatement,
  createBinaryExpression,
  createBlock,
  createBooleanLiteral,
  createCallExpression,
  createExpressionStatement,
  createForInStatement,
  createFunctionExpression,
  createIdentifier,
  createIfStatement,
  createNilLiteral,
  createNumericLiteral,
  createReturnStatement,
  createStringLiteral,
  createTableIndexExpression,
  createUnaryExpression,
  createVariableDeclarationStatement,
  type Expression,
  type Identifier,
  isBooleanLiteral,
  isCallExpression,
  isIdentifier,
  isNumericLiteral,
  isStringLiteral,
  isTableIndexExpression,
  isUnaryExpression,
  NodeFlags,
  type Plugin,
  type Statement,
  SyntaxKind,
  type TransformationContext,
} from "typescript-to-lua";
import { resolvesToDispatchExport } from "./message-dispatch-lowering";
import type { PropertyValue } from "./property-default-evaluator";

export const FACTORY_MODULE = "@defold-typescript/types";
export const FACTORY_NAMES = new Set(["defineScript", "defineGuiScript", "defineRenderScript"]);
// A walled source imports its factory from the matching kind subpath
// (`@defold-typescript/types/gui-script`) to avoid pulling the cross-kind
// `declare global` namespaces; those imports erase exactly like the bare one.
const FACTORY_SPECIFIERS = new Set([
  FACTORY_MODULE,
  `${FACTORY_MODULE}/script`,
  `${FACTORY_MODULE}/gui-script`,
  `${FACTORY_MODULE}/render-script`,
]);

// The lifecycle factory a callee resolves to, aliases followed, or `undefined`
// when it is not one of this package's factory exports.
function factoryExportName(callee: ts.Expression, checker: ts.TypeChecker): string | undefined {
  let symbol = checker.getSymbolAtLocation(callee);
  if (symbol === undefined) {
    return undefined;
  }
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  const name = symbol.getName();
  if (!FACTORY_NAMES.has(name)) {
    return undefined;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration === undefined) {
    return undefined;
  }
  return declaration.getSourceFile().fileName.includes(FACTORY_MODULE) ? name : undefined;
}

export function resolvesToFactoryExport(callee: ts.Expression, checker: ts.TypeChecker): boolean {
  return factoryExportName(callee, checker) !== undefined;
}

function isThisParameter(param: ts.ParameterDeclaration): boolean {
  return (
    ts.isIdentifier(param.name) &&
    ts.identifierToKeywordKind(param.name) === ts.SyntaxKind.ThisKeyword
  );
}

function hookName(property: ts.ObjectLiteralElementLike): string | undefined {
  const name = property.name;
  if (name === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

type HookFunction = (ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction) & {
  body: ts.ConciseBody;
};

function hookFunction(property: ts.ObjectLiteralElementLike): HookFunction | undefined {
  if (ts.isMethodDeclaration(property) && property.body !== undefined) {
    return property as HookFunction;
  }
  if (ts.isPropertyAssignment(property)) {
    const initializer = property.initializer;
    if (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)) {
      return initializer as HookFunction;
    }
  }
  return undefined;
}

function dispatcherInitializer(
  property: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): ts.CallExpression | undefined {
  if (!ts.isPropertyAssignment(property)) {
    return undefined;
  }
  const initializer = property.initializer;
  if (!ts.isCallExpression(initializer)) {
    return undefined;
  }
  return resolvesToDispatchExport(initializer.expression, checker) ? initializer : undefined;
}

function transformHookBody(fn: HookFunction, context: TransformationContext): Statement[] {
  if (ts.isBlock(fn.body)) {
    return context.transformStatements(fn.body.statements);
  }
  return [createExpressionStatement(context.transformExpression(fn.body))];
}

function crossesFunctionBoundary(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function initReturnsValue(fn: HookFunction): boolean {
  if (!ts.isBlock(fn.body)) {
    return true;
  }
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found || crossesFunctionBoundary(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return found;
}

function initBuilderBody(fn: HookFunction, context: TransformationContext): Statement[] {
  if (ts.isBlock(fn.body)) {
    return context.transformStatements(fn.body.statements);
  }
  return [createReturnStatement([context.transformExpression(fn.body)])];
}

// init-merge: Defold owns `self` (a userdata-backed table) and a script can
// populate but not replace it, so a returning `init(): TSelf` can't be emitted
// verbatim. Wrap the body in a `____init` builder and merge its result onto the
// engine `self`; a `nil` return (stateless script) merges nothing.
function emitInitMerge(
  fn: HookFunction,
  context: TransformationContext,
  property: ts.ObjectLiteralElementLike,
): Statement[] {
  // init-self: Defold has already populated `self` with the declared property
  // values when `init` runs, so an `init(self)` body must resolve `self` to the
  // engine table — not a nil global. Bind the builder's parameter to the
  // author's first non-`this:` param (which may be named anything) and pass the
  // engine `self` at the call. A param-less `init` keeps the zero-arg builder.
  const authorParam = fn.parameters.find(
    (param) => !isThisParameter(param) && ts.isIdentifier(param.name),
  );
  const builderParams: Identifier[] =
    authorParam === undefined
      ? []
      : [context.transformExpression(authorParam.name as ts.Identifier) as Identifier];
  const builder = createFunctionExpression(
    createBlock(initBuilderBody(fn, context)),
    builderParams,
    undefined,
    NodeFlags.Declaration,
    fn,
  );
  const builderDecl = createVariableDeclarationStatement(createIdentifier("____init"), builder);

  const builderArgs = authorParam === undefined ? [] : [createIdentifier("self")];
  const stateDecl = createVariableDeclarationStatement(
    createIdentifier("____s"),
    createCallExpression(createIdentifier("____init"), builderArgs),
  );
  const mergeAssignment = createAssignmentStatement(
    createTableIndexExpression(createIdentifier("self"), createIdentifier("____k")),
    createIdentifier("____v"),
  );
  const forIn = createForInStatement(
    createBlock([mergeAssignment]),
    [createIdentifier("____k"), createIdentifier("____v")],
    [createCallExpression(createIdentifier("pairs"), [createIdentifier("____s")])],
  );
  const guard = createIfStatement(
    createBinaryExpression(
      createIdentifier("____s"),
      createNilLiteral(),
      SyntaxKind.InequalityOperator,
    ),
    createBlock([forIn]),
  );
  const initFn = createFunctionExpression(
    createBlock([stateDecl, guard]),
    [createIdentifier("self")],
    undefined,
    NodeFlags.Declaration,
    fn,
  );
  return [builderDecl, createAssignmentStatement(createIdentifier("init"), initFn, property)];
}

// Build-time markers, never engine functions: bob reads `resource.<kind>("path")`
// only as a `go.property` default (`LuaScanner.java:923-933` at defold
// `a81dbb04`), and the engine's `resource` table registers none of them
// (`script_resource.cpp:3447-3463` in 1.14.0). Called anywhere else, each is nil.
export const RESOURCE_PROPERTY_MARKERS: ReadonlySet<string> = new Set([
  "resource.atlas",
  "resource.buffer",
  "resource.font",
  "resource.material",
  "resource.render_target",
  "resource.texture",
  "resource.tile_source",
]);

export interface PropertyMember {
  readonly name: string;
  readonly initializer: ts.Expression;
}

export interface PropertySource {
  readonly name: string;
  readonly type: ts.Type;
  /**
   * Where a finding about the name lands, always in the script's own file: a
   * `name: value` member's initializer, else the member that brings the name in,
   * else the `properties` value.
   */
  readonly node: ts.Node;
}

export interface PropertySpan {
  readonly file: ts.SourceFile;
  readonly start: number;
  readonly length: number;
}

export interface PendingProperties {
  readonly names: readonly string[];
  readonly propertiesSpan: PropertySpan;
  readonly memberSpans: ReadonlyMap<string, PropertySpan>;
}

export interface LifecycleErasure {
  readonly plugin: Plugin;
  /** The scripts an emit captured for evaluation, by source file name. */
  readonly pending: Map<string, PendingProperties>;
  /** Evaluated defaults by source file name, which every later emit writes as literals. */
  setEvaluatedDefaults(values: ReadonlyMap<string, ReadonlyMap<string, PropertyValue>>): void;
}

// The global a script's entry chunk assigns its properties value to; the
// evaluator reads it after `require(entry)`.
export const PROPERTIES_CAPTURE_GLOBAL = "____properties";

// The value a `properties` field holds, whether written `properties: value` or
// as a shorthand.
function propertiesValue(property: ts.ObjectLiteralElementLike): ts.Expression | undefined {
  if (ts.isPropertyAssignment(property)) {
    return property.initializer;
  }
  return ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
}

// The object literal a `properties` field holds once its parentheses and
// type-only wrappers are stripped, or `undefined` for any other value.
function propertiesObject(
  property: ts.ObjectLiteralElementLike,
): ts.ObjectLiteralExpression | undefined {
  if (!ts.isPropertyAssignment(property)) {
    return undefined;
  }
  const value = innermostExpression(property.initializer);
  return ts.isObjectLiteralExpression(value) ? value : undefined;
}

// The name a member gives its value: a literal key's JavaScript name, a
// shorthand's identifier, or the literal value of a computed key's type.
function memberName(
  member: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): string | undefined {
  if (ts.isShorthandPropertyAssignment(member)) {
    return member.name.text;
  }
  if (!ts.isPropertyAssignment(member)) {
    return undefined;
  }
  const literal = propertyName(member);
  if (literal !== undefined || !ts.isComputedPropertyName(member.name)) {
    return literal;
  }
  const key = checker.getTypeAtLocation(member.name.expression);
  if (key.isStringLiteral()) {
    return key.value;
  }
  return key.isNumberLiteral() ? String(key.value) : undefined;
}

// Every name `self` is typed with, from the type of the `properties` value, in
// JavaScript's key order: TypeScript lists a spread type's names in an order of
// its own, so the order folds over the object's members, each name keeping the
// position of its first appearance. Names the fold misses follow in the
// checker's order.
export function propertySources(
  property: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): PropertySource[] {
  const value = propertiesValue(property);
  if (value === undefined) {
    return [];
  }
  const typed = new Map(
    checker
      .getPropertiesOfType(checker.getTypeAtLocation(value))
      .map((symbol) => [symbol.getName(), symbol]),
  );
  const order: string[] = [];
  const sources = new Map<string, ts.Node>();
  const define = (name: string, node: ts.Node): void => {
    if (!sources.has(name)) {
      order.push(name);
    }
    sources.set(name, node);
  };
  const object = innermostExpression(value);
  for (const member of ts.isObjectLiteralExpression(object) ? object.properties : []) {
    if (ts.isSpreadAssignment(member)) {
      const spread = checker.getTypeAtLocation(member.expression);
      for (const symbol of checker.getPropertiesOfType(spread)) {
        define(symbol.getName(), member);
      }
      continue;
    }
    const name = memberName(member, checker);
    if (name !== undefined) {
      define(name, ts.isPropertyAssignment(member) ? member.initializer : member);
    }
  }
  const names = [
    ...order.filter((name) => typed.has(name)),
    ...[...typed.keys()].filter((name) => !order.includes(name)),
  ];
  return names.map((name) => {
    const symbol = typed.get(name) as ts.Symbol;
    return {
      name,
      type: checker.getTypeOfSymbolAtLocation(symbol, value),
      node: sources.get(name) ?? value,
    };
  });
}

// The property name JavaScript gives a key written as a literal, so `0x10`
// names `"16"`, or `undefined` for a key computed from anything else.
function propertyName(member: ts.PropertyAssignment): string | undefined {
  const key = member.name;
  if (ts.isIdentifier(key)) {
    return key.text;
  }
  const literal = ts.isComputedPropertyName(key) ? innermostExpression(key.expression) : key;
  if (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)) {
    return literal.text;
  }
  if (ts.isNumericLiteral(literal)) {
    return String(Number(literal.text));
  }
  return undefined;
}

// The `key: default` members of a factory's `properties` field that register as
// script properties: a property assignment keyed by an identifier or a literal.
// Shared by the emitter and every analysis of what it registers.
export function propertyMembers(property: ts.ObjectLiteralElementLike): PropertyMember[] {
  const members: PropertyMember[] = [];
  for (const member of propertiesObject(property)?.properties ?? []) {
    if (!ts.isPropertyAssignment(member)) {
      continue;
    }
    const name = propertyName(member);
    if (name !== undefined) {
      members.push({ name, initializer: member.initializer });
    }
  }
  return members;
}

// The hooks object literal of a call to a lifecycle factory, or `undefined` when
// the expression is not one the erasure rewrites.
export function factoryHooks(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.ObjectLiteralExpression | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  if (!resolvesToFactoryExport(expression.expression, checker)) {
    return undefined;
  }
  const hooks = expression.arguments[0];
  if (hooks === undefined || !ts.isObjectLiteralExpression(hooks)) {
    return undefined;
  }
  return hooks;
}

export function isPropertiesHook(property: ts.ObjectLiteralElementLike): boolean {
  return hookName(property) === "properties";
}

// The value-keyed `properties` field maps each `key: default` to a chunk-scope
// `go.property("key", default)` the editor reads. Defold's build reads the
// default from the Lua text alone and strips the call, so a default that names a
// module const never reaches the engine; a default is emitted as written only
// when the build reads that text, and is computed at build time otherwise.
function registration(name: string, value: Expression): Statement {
  return createExpressionStatement(
    createCallExpression(
      createTableIndexExpression(createIdentifier("go"), createStringLiteral("property")),
      [createStringLiteral(name), value],
    ),
  );
}

// The registrations of a `properties` object whose every member is `name: value`
// with a default the build reads as written, or `undefined`. A refused attempt
// leaves no diagnostic, lualib feature or preceding statement behind, because
// the value is then computed instead.
function writtenRegistrations(
  property: ts.ObjectLiteralElementLike,
  context: TransformationContext,
): Statement[] | undefined {
  const object = propertiesObject(property);
  if (
    object === undefined ||
    !object.properties.every(
      (member) => ts.isPropertyAssignment(member) && propertyName(member) !== undefined,
    )
  ) {
    return undefined;
  }
  const diagnosticCount = context.diagnostics.length;
  const features = [...context.usedLuaLibFeatures];
  const registrations: Statement[] = [];
  for (const { name, initializer } of propertyMembers(property)) {
    const value = writtenDefault(initializer, context);
    if (value === undefined) {
      context.diagnostics.splice(diagnosticCount);
      context.usedLuaLibFeatures.clear();
      for (const feature of features) {
        context.usedLuaLibFeatures.add(feature);
      }
      return undefined;
    }
    registrations.push(registration(name, value));
  }
  return registrations;
}

function writtenDefault(
  initializer: ts.Expression,
  context: TransformationContext,
): Expression | undefined {
  const infinite = infiniteDefault(initializer);
  if (infinite !== undefined) {
    return infinite;
  }
  context.pushPrecedingStatements();
  const value = context.transformExpression(initializer);
  const preceding = context.popPrecedingStatements();
  const reads = isMarkerDefault(initializer, context.checker) || readsAsDefault(value);
  return preceding.length === 0 && reads ? value : undefined;
}

// TSTL emits an infinite number as `math.huge`, a name the build rejects. The
// build reads `1e999` as an infinite float, and only a raw token prints it.
function infiniteDefault(initializer: ts.Expression): Expression | undefined {
  const value = innermostExpression(initializer);
  const negated = ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.MinusToken;
  const literal = negated ? innermostExpression(value.operand) : value;
  if (!ts.isNumericLiteral(literal) || Number.isFinite(Number(literal.text))) {
    return undefined;
  }
  return numberLiteral(negated ? -Infinity : Infinity);
}

function numberLiteral(value: number): Expression {
  const magnitude = Math.abs(value);
  const token = Number.isFinite(magnitude)
    ? createNumericLiteral(magnitude)
    : createIdentifier("1e999");
  return value < 0 || Object.is(value, -0)
    ? createUnaryExpression(token, SyntaxKind.NegationOperator)
    : token;
}

function fieldOf(table: string, field: string): Expression {
  return createTableIndexExpression(createIdentifier(table), createStringLiteral(field));
}

// A computed value as the default text Defold's build reads for it.
function literalDefault(value: PropertyValue): Expression {
  switch (value.kind) {
    case "number":
      return numberLiteral(value.value);
    case "boolean":
      return createBooleanLiteral(value.value);
    case "string":
      return createStringLiteral(value.value);
    case "hash":
      return createCallExpression(createIdentifier("hash"), [createStringLiteral(value.value)]);
    case "url":
      return createCallExpression(
        fieldOf("msg", "url"),
        value.value === "" ? [] : [createStringLiteral(value.value)],
      );
    case "resource":
      return createCallExpression(
        fieldOf("resource", value.resource),
        value.path === undefined ? [] : [createStringLiteral(value.path)],
      );
    default:
      return createCallExpression(fieldOf("vmath", value.kind), value.value.map(numberLiteral));
  }
}

interface ComputedDefaults {
  readonly pending: Map<string, PendingProperties>;
  readonly values: (fileName: string) => ReadonlyMap<string, PropertyValue> | undefined;
}

function spanOf(node: ts.Node): PropertySpan {
  const file = node.getSourceFile();
  const start = node.getStart(file);
  return { file, start, length: node.getEnd() - start };
}

// Defold's build registers one `go.property` per name, so the type must list
// every name: one object type, or an intersection of them, with no index
// signature.
function listsEveryName(type: ts.Type, checker: ts.TypeChecker): boolean {
  const parts = type.isIntersection() ? type.types : [type];
  return (
    parts.every((part) => (part.flags & ts.TypeFlags.Object) !== 0) &&
    checker.getIndexInfosOfType(type).length === 0
  );
}

// A `properties` value the build cannot read as written. Without evaluated
// values for the file, the value is assigned to the capture global and the
// script is recorded as pending; with them, each name registers its literal.
function computedRegistrations(
  property: ts.ObjectLiteralElementLike,
  context: TransformationContext,
  defaults: ComputedDefaults,
): Statement[] {
  const refusals = (propertiesObject(property)?.properties ?? [])
    .filter(
      (member) =>
        ts.isMethodDeclaration(member) ||
        ts.isGetAccessorDeclaration(member) ||
        ts.isSetAccessorDeclaration(member),
    )
    .map(unemittedMember);
  const value = propertiesValue(property);
  if (
    value === undefined ||
    !listsEveryName(context.checker.getTypeAtLocation(value), context.checker)
  ) {
    refusals.push(unknownNames(value ?? property));
  }
  if (value === undefined || refusals.length > 0) {
    context.diagnostics.push(...refusals);
    return [];
  }
  const sources = propertySources(property, context.checker);
  const fileName = context.sourceFile.fileName;
  const values = defaults.values(fileName);
  if (values !== undefined) {
    return sources.flatMap(({ name }) => {
      const computed = values.get(name);
      return computed === undefined ? [] : [registration(name, literalDefault(computed))];
    });
  }
  defaults.pending.set(fileName, {
    names: sources.map(({ name }) => name),
    propertiesSpan: spanOf(value),
    memberSpans: new Map(sources.map(({ name, node }) => [name, spanOf(node)])),
  });
  context.pushPrecedingStatements();
  const captured = context.transformExpression(value);
  return [
    ...context.popPrecedingStatements(),
    createAssignmentStatement(createIdentifier(PROPERTIES_CAPTURE_GLOBAL), captured, property),
  ];
}

// A marker default reports through the marker checks, which name its one
// readable form.
function isMarkerDefault(initializer: ts.Expression, checker: ts.TypeChecker): boolean {
  const value = innermostExpression(initializer);
  return (
    ts.isCallExpression(value) && RESOURCE_PROPERTY_MARKERS.has(calledGlobal(value, checker) ?? "")
  );
}

const VMATH_DEFAULT_ARITY: ReadonlyMap<string, number> = new Map([
  ["vector3", 3],
  ["vector4", 4],
  ["quat", 4],
]);

const RESOURCE_KINDS: ReadonlySet<string> = new Set(
  [...RESOURCE_PROPERTY_MARKERS].map((marker) => marker.slice("resource.".length)),
);

function isLuaNumber(value: Expression): boolean {
  const operand =
    isUnaryExpression(value) && value.operator === SyntaxKind.NegationOperator
      ? value.operand
      : value;
  return isNumericLiteral(operand) && Number.isFinite(operand.value);
}

// The defaults bob reads (`parsePropertyValue`, `LuaScanner.java:842-968` at
// defold `a81dbb04`): a number with an optional leading minus, a boolean, a
// string without NUL, `vmath.vector3`/`vector4`/`quat` with no argument, one
// number or every component, `hash` of a string, `msg.url` of none, one or
// three strings, and `resource.<kind>` of a string or nothing.
function readsAsDefault(value: Expression): boolean {
  if (isLuaNumber(value) || isBooleanLiteral(value)) {
    return true;
  }
  if (isStringLiteral(value)) {
    return !value.value.includes("\0");
  }
  if (!isCallExpression(value)) {
    return false;
  }
  const callee = value.expression;
  const args = value.params;
  if (isIdentifier(callee)) {
    return callee.text === "hash" && args[0] !== undefined && isStringLiteral(args[0]);
  }
  if (
    !isTableIndexExpression(callee) ||
    !isIdentifier(callee.table) ||
    !isStringLiteral(callee.index)
  ) {
    return false;
  }
  const field = callee.index.value;
  switch (callee.table.text) {
    case "vmath": {
      const arity = VMATH_DEFAULT_ARITY.get(field);
      return (
        arity !== undefined &&
        (args.length <= 1 || args.length === arity) &&
        args.every(isLuaNumber)
      );
    }
    case "msg":
      return field === "url" && [0, 1, 3].includes(args.length) && args.every(isStringLiteral);
    case "resource":
      return RESOURCE_KINDS.has(field) && (args[0] === undefined || isStringLiteral(args[0]));
    default:
      return false;
  }
}

function fatalAt(node: ts.Node, messageText: string): ts.Diagnostic {
  return { ...spanOf(node), category: ts.DiagnosticCategory.Error, code: 0, messageText };
}

// A value the type checker reads as `undefined` declares no properties, which
// is the only value the GUI and render factories accept.
function declaresNoProperties(
  property: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): boolean {
  const value = propertiesValue(property);
  return (
    value !== undefined && (checker.getTypeAtLocation(value).flags & ts.TypeFlags.Undefined) !== 0
  );
}

// A member of any kind, or any value but `undefined`.
function holdsProperties(property: ts.ObjectLiteralElementLike, checker: ts.TypeChecker): boolean {
  const object = propertiesObject(property);
  return object === undefined
    ? !declaresNoProperties(property, checker)
    : object.properties.length > 0;
}

function unknownNames(value: ts.Node): ts.Diagnostic {
  return fatalAt(
    value,
    "the names of `properties` must be known at compile time: Defold's build registers one `go.property` per name, and this value's type has an index signature or is not one object type.",
  );
}

// A method or accessor in `properties`, reported so none is dropped while
// `self` still types it.
function unemittedMember(member: ts.ObjectLiteralElementLike): ts.Diagnostic {
  const text = member.name === undefined ? member.getText() : member.name.getText();
  return fatalAt(
    member,
    `\`${text}\` in \`properties\` registers no script property: Defold's build reads one \`go.property\` per property, written as \`name: value\`.`,
  );
}

// Defold builds `go.property` only in `.script` files, so a GUI or render
// script's `properties` block has nothing it could lower to.
function scriptOnlyProperties(
  property: ts.ObjectLiteralElementLike,
  factory: string,
): ts.Diagnostic {
  return fatalAt(
    property,
    `\`${factory}\` cannot declare \`properties\`: Defold builds \`go.property\` only in \`.script\` files. Declare the property in a \`defineScript\` and send its value with \`msg.post\`.`,
  );
}

// The outermost expression that only wraps `node` in parentheses or a type-only
// form, so `(resource.atlas("/a.atlas") as Hash)` sits where the bare call would.
function outermostWrapper(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) ||
    ts.isNonNullExpression(current.parent) ||
    ts.isTypeAssertionExpression(current.parent)
  ) {
    current = current.parent;
  }
  return current;
}

// The inverse of `outermostWrapper`: the expression a run of parentheses and
// type-only forms wraps, which TSTL emits in place of the whole run.
function innermostExpression(node: ts.Expression): ts.Expression {
  let current = node;
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

// Keyed by the declaration's fully qualified name: only a symbol declared in an
// ambient `declare global` block carries the `global.` prefix, so a project's
// own `resource` never matches.
function globalName(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): string | undefined {
  if (symbol === undefined) {
    return undefined;
  }
  const fqn = checker.getFullyQualifiedName(symbol);
  return fqn.startsWith("global.") ? fqn.slice("global.".length) : undefined;
}

function calledGlobal(call: ts.CallExpression, checker: ts.TypeChecker): string | undefined {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (
    declaration === undefined ||
    !ts.isFunctionDeclaration(declaration) ||
    declaration.name === undefined
  ) {
    return undefined;
  }
  return globalName(checker.getSymbolAtLocation(declaration.name), checker);
}

// A `properties` default of a factory call, or the default argument of a
// direct `go.property` call: the two places bob reads a marker.
function isPropertyDefault(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const value = outermostWrapper(call);
  const parent = value.parent;
  if (ts.isCallExpression(parent)) {
    return parent.arguments[1] === value && calledGlobal(parent, checker) === "go.property";
  }
  if (!ts.isPropertyAssignment(parent) || !ts.isObjectLiteralExpression(parent.parent)) {
    return false;
  }
  const properties = outermostWrapper(parent.parent).parent;
  if (!ts.isPropertyAssignment(properties) || !isPropertiesHook(properties)) {
    return false;
  }
  const hooks = properties.parent;
  return (
    ts.isObjectLiteralExpression(hooks) &&
    factoryHooks(hooks.parent as ts.Expression, checker) === hooks &&
    propertyMembers(properties).some((member) => member.initializer === value)
  );
}

function misplacedMarker(node: ts.Expression, marker: string): ts.Diagnostic {
  return fatalAt(
    node,
    `\`${marker}\` is a build-time marker: Defold's build reads it only in a \`go.property\` default, and the engine binds no such function. Use it as a \`defineScript\` \`properties\` default.`,
  );
}

// Bob reads a default as a marker only when the emitted text is
// `resource.<kind>("<path>")` or `resource.<kind>()`: the object token must be
// `resource` with a dot `NAME` key, and the first argument a string literal or
// absent (`LuaScanner.java:801-822`, `:923-933` and `:493-510` at defold
// `a81dbb04`). The receiver test is textual like bob's; the marker resolution
// has already excluded a project's own `resource`.
function readsAsMarker(call: ts.CallExpression): boolean {
  const callee = innermostExpression(call.expression);
  if (ts.isOptionalChain(call) || ts.isOptionalChain(callee)) {
    return false;
  }
  if (
    !ts.isPropertyAccessExpression(callee) &&
    !(
      ts.isElementAccessExpression(callee) &&
      ts.isStringLiteralLike(innermostExpression(callee.argumentExpression))
    )
  ) {
    return false;
  }
  const receiver = innermostExpression(callee.expression);
  if (!ts.isIdentifier(receiver) || receiver.text !== "resource") {
    return false;
  }
  const [path] = call.arguments;
  return path === undefined || ts.isStringLiteralLike(innermostExpression(path));
}

function unreadableMarker(node: ts.CallExpression, marker: string): ts.Diagnostic {
  return fatalAt(
    node,
    `\`${marker}\` in a property default must be written \`${marker}("<path>")\`, with a string literal path: Defold's build reads no other form.`,
  );
}

function isCallee(node: ts.Expression): boolean {
  const callee = outermostWrapper(node);
  return ts.isCallExpression(callee.parent) && callee.parent.expression === callee;
}

function eraseFactoryCall(
  expression: ts.Expression,
  context: TransformationContext,
  defaults: ComputedDefaults,
): Statement[] | undefined {
  const hooks = factoryHooks(expression, context.checker);
  if (hooks === undefined || !ts.isCallExpression(expression)) {
    return undefined;
  }
  const factory = factoryExportName(expression.expression, context.checker);
  const registrations: Statement[] = [];
  const statements: Statement[] = [];
  for (const property of hooks.properties) {
    const name = hookName(property);
    if (name === undefined) {
      continue;
    }
    if (name === "properties") {
      if (factory === "defineScript") {
        if (!declaresNoProperties(property, context.checker)) {
          registrations.push(
            ...(writtenRegistrations(property, context) ??
              computedRegistrations(property, context, defaults)),
          );
        }
      } else if (factory !== undefined && holdsProperties(property, context.checker)) {
        context.diagnostics.push(scriptOnlyProperties(property, factory));
      }
      continue;
    }
    const fn = hookFunction(property);
    if (fn === undefined) {
      // A hook whose initializer is a recognized `onMessage({...})` call: let it
      // route through the message-dispatch lowering, which yields the flat
      // `function(self, message_id, message, sender)` chunk, then bind it.
      const dispatch = dispatcherInitializer(property, context.checker);
      if (dispatch !== undefined) {
        statements.push(
          createAssignmentStatement(
            createIdentifier(name),
            context.transformExpression(dispatch),
            property,
          ),
        );
      }
      continue;
    }
    if (name === "init" && initReturnsValue(fn)) {
      statements.push(...emitInitMerge(fn, context, property));
      continue;
    }
    const params: Identifier[] = fn.parameters
      .filter((param) => !isThisParameter(param) && ts.isIdentifier(param.name))
      .map((param) => context.transformExpression(param.name as ts.Identifier) as Identifier);
    const fnExpression = createFunctionExpression(
      createBlock(transformHookBody(fn, context)),
      params,
      undefined,
      NodeFlags.Declaration,
      fn,
    );
    statements.push(createAssignmentStatement(createIdentifier(name), fnExpression, property));
  }
  return [...registrations, ...statements];
}

export function isFactoryOnlyImport(node: ts.ImportDeclaration): boolean {
  if (
    !ts.isStringLiteral(node.moduleSpecifier) ||
    !FACTORY_SPECIFIERS.has(node.moduleSpecifier.text)
  ) {
    return false;
  }
  const clause = node.importClause;
  if (clause === undefined || clause.name !== undefined) {
    return false;
  }
  // A whole-clause `import type { ... }` binds nothing at runtime; leave it for
  // the normal transform, which elides it.
  if (clause.isTypeOnly) {
    return false;
  }
  const bindings = clause.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) {
    return false;
  }
  // Type-only specifiers ride along and drop with the erased statement; erase
  // only when every runtime specifier is a lifecycle factory.
  const runtime = bindings.elements.filter((element) => !element.isTypeOnly);
  if (runtime.length === 0) {
    return false;
  }
  return runtime.every((element) => FACTORY_NAMES.has((element.propertyName ?? element.name).text));
}

/**
 * The lifecycle erasure for one transpile. A factory rather than a shared
 * constant: the scripts it records as pending and the values it is handed
 * belong to one program, and a module-level plugin would leak them between the
 * editor's rebuilds.
 */
export function createLifecycleErasure(): LifecycleErasure {
  const pending = new Map<string, PendingProperties>();
  let evaluated: ReadonlyMap<string, ReadonlyMap<string, PropertyValue>> = new Map();
  const defaults: ComputedDefaults = {
    pending,
    values: (fileName) => evaluated.get(fileName),
  };
  return {
    plugin: lifecycleErasurePlugin(defaults),
    pending,
    setEvaluatedDefaults(values) {
      evaluated = values;
    },
  };
}

const lifecycleErasurePlugin = (defaults: ComputedDefaults): Plugin => ({
  visitors: {
    [ts.SyntaxKind.ExpressionStatement]: (node, context) =>
      eraseFactoryCall(node.expression, context, defaults) ??
      context.superTransformStatements(node),
    [ts.SyntaxKind.ExportAssignment]: (node, context) => {
      if (!node.isExportEquals) {
        const erased = eraseFactoryCall(node.expression, context, defaults);
        if (erased !== undefined) {
          return erased;
        }
      }
      return context.superTransformStatements(node);
    },
    [ts.SyntaxKind.ImportDeclaration]: (node, context) =>
      isFactoryOnlyImport(node) ? [] : context.superTransformStatements(node),
    // TSTL's optional-chain lowering also visits nodes it synthesizes, which have
    // no parent and no source span; only parsed nodes are checked.
    [ts.SyntaxKind.CallExpression]: (node, context) => {
      const marker = node.parent === undefined ? undefined : calledGlobal(node, context.checker);
      if (marker !== undefined && RESOURCE_PROPERTY_MARKERS.has(marker)) {
        if (!isPropertyDefault(node, context.checker)) {
          context.diagnostics.push(misplacedMarker(node, marker));
        } else if (!readsAsMarker(node)) {
          context.diagnostics.push(unreadableMarker(node, marker));
        }
      }
      return context.superTransformExpression(node);
    },
    [ts.SyntaxKind.PropertyAccessExpression]: (node, context) => {
      if (node.parent !== undefined && !isCallee(node)) {
        const marker = globalName(context.checker.getSymbolAtLocation(node.name), context.checker);
        if (marker !== undefined && RESOURCE_PROPERTY_MARKERS.has(marker)) {
          context.diagnostics.push(misplacedMarker(node, marker));
        }
      }
      return context.superTransformExpression(node);
    },
    [ts.SyntaxKind.ElementAccessExpression]: (node, context) => {
      if (node.parent !== undefined && !isCallee(node)) {
        // The checker resolves a string key only when it is the direct argument,
        // so a wrapped key is looked up by name on the receiver's type, as the
        // checker does for a direct one.
        const key = innermostExpression(node.argumentExpression);
        const marker = ts.isStringLiteralLike(key)
          ? globalName(
              context.checker.getPropertyOfType(
                context.checker.getTypeAtLocation(node.expression),
                key.text,
              ),
              context.checker,
            )
          : undefined;
        if (marker !== undefined && RESOURCE_PROPERTY_MARKERS.has(marker)) {
          context.diagnostics.push(misplacedMarker(node, marker));
        }
      }
      return context.superTransformExpression(node);
    },
  },
});

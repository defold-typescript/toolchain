import * as ts from "typescript";
import {
  createCallExpression,
  createIdentifier,
  createTableExpression,
  createTableFieldExpression,
  type Expression,
  isTableExpression,
  type Plugin,
  setNodePosition,
} from "typescript-to-lua";
import { reportOnce } from "./rebuilt-calls";

// The Defold functions declared with a curried type-application overload,
// `go.get<P>()(url, property)`, `go.set<P>()(url, property, value)`,
// `go.animate<P>()(url, property, ...)`,
// `factory.create<P>()(url, position, rotation, properties, scale)` and
// `collectionfactory.create<P>()(url, position, rotation, properties, scale)`:
// the empty call only fixes `P` for the checker.
export const TYPE_APPLICATION_APIS: ReadonlySet<string> = new Set([
  "collectionfactory.create",
  "factory.create",
  "go.animate",
  "go.get",
  "go.set",
]);

// `P` types `collectionfactory.create`'s instance ids as strings, but the
// engine reads each with `dmScript::CheckHash`, so the build hashes them.
const HASHED_IDS_API = "collectionfactory.create";
const PROPERTIES_INDEX = 3;

const STORED_APPLIER_MESSAGE =
  "`collectionfactory.create<P>()` must be called directly: the build hashes the instance ids of its `properties` only at that call, and the engine rejects a string id.";
const UNHASHABLE_PROPERTIES_MESSAGE =
  "Pass `properties` to `collectionfactory.create<P>()` as an object literal of instance ids: the build hashes each id it can see, and the engine rejects a string id. Build a `LuaMap<Hash, PlainTable>` with `hash(...)` for the bare `collectionfactory.create` instead.";

// Keyed by the declaration's fully qualified name: only a symbol declared in
// an ambient `declare global` block carries the `global.` prefix, so a
// project's own `go` never matches.
function typeApplicationApi(call: ts.CallExpression, checker: ts.TypeChecker): string | undefined {
  if (call.arguments.length !== 0) return undefined;
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === undefined || !ts.isFunctionDeclaration(declaration)) return undefined;
  if (declaration.parameters.length !== 0 || declaration.typeParameters === undefined) {
    return undefined;
  }
  if (declaration.name === undefined) return undefined;
  const symbol = checker.getSymbolAtLocation(declaration.name);
  if (symbol === undefined) return undefined;
  const fqn = checker.getFullyQualifiedName(symbol);
  if (!fqn.startsWith("global.")) return undefined;
  const api = fqn.slice("global.".length);
  return TYPE_APPLICATION_APIS.has(api) ? api : undefined;
}

function skipParentheses(node: ts.Expression): ts.Expression {
  let inner = node;
  while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
  return inner;
}

function skipTypeWrappers(node: ts.Expression): ts.Expression {
  let inner = node;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

function isCalledDirectly(application: ts.CallExpression): boolean {
  let callee: ts.Node = application;
  let parent = application.parent;
  while (ts.isParenthesizedExpression(parent)) {
    callee = parent;
    parent = parent.parent;
  }
  return ts.isCallExpression(parent) && parent.expression === callee;
}

function appliesHashedIds(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const callee = skipParentheses(call.expression);
  return ts.isCallExpression(callee) && typeApplicationApi(callee, checker) === HASHED_IDS_API;
}

function isHashableLiteral(node: ts.Expression): node is ts.ObjectLiteralExpression {
  return (
    ts.isObjectLiteralExpression(node) &&
    node.properties.every(
      (element) => ts.isPropertyAssignment(element) || ts.isShorthandPropertyAssignment(element),
    )
  );
}

// The argument that hides `properties` from the build, if any: a spread could
// supply it, and anything but an object literal of plain fields has keys the
// build cannot see.
function unhashableProperties(call: ts.CallExpression): ts.Node | undefined {
  const spread = call.arguments.slice(0, PROPERTIES_INDEX + 1).find(ts.isSpreadElement);
  if (spread !== undefined) return spread;
  const properties = call.arguments[PROPERTIES_INDEX];
  if (properties === undefined) return undefined;
  if (ts.isIdentifier(properties) && properties.text === "undefined") return undefined;
  return isHashableLiteral(skipTypeWrappers(properties)) ? undefined : properties;
}

// TSTL builds a tagged template's strings table as a literal with no parent;
// it is never a `properties` argument.
function isHashedIdsLiteral(literal: ts.ObjectLiteralExpression, checker: ts.TypeChecker): boolean {
  if (literal.parent === undefined) return false;
  let argument: ts.Node = literal;
  let parent = literal.parent;
  while (
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isSatisfiesExpression(parent)
  ) {
    argument = parent;
    parent = parent.parent;
  }
  return (
    ts.isCallExpression(parent) &&
    parent.arguments[PROPERTIES_INDEX] === argument &&
    isHashableLiteral(literal) &&
    appliesHashedIds(parent, checker)
  );
}

function buildError(node: ts.Node, messageText: string): ts.Diagnostic {
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

// `go.get<P>()` becomes `go.get`, so the curried call reaches the engine as
// `go.get(url, property)` and a stored `go.get<P>()` is the function itself.
// `collectionfactory.create<P>()` also hashes the instance ids of the
// `properties` literal at its call, so it is accepted only there.
export const typeApplicationErasurePlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      const api = typeApplicationApi(node, context.checker);
      if (api !== undefined) {
        // The checker resolves a synthetic chain link through its original,
        // so `api` is defined only when `source` is.
        const source = ts.getParseTreeNode(node, ts.isCallExpression);
        if (source !== undefined && api === HASHED_IDS_API && !isCalledDirectly(source)) {
          reportOnce(context.diagnostics, buildError(source, STORED_APPLIER_MESSAGE));
        }
        // A chain link's copy calls the chain's temp; the source callee would
        // re-enter the chain.
        return context.transformExpression(node.expression);
      }
      if (appliesHashedIds(node, context.checker)) {
        const offending = unhashableProperties(node);
        if (offending !== undefined) {
          reportOnce(context.diagnostics, buildError(offending, UNHASHABLE_PROPERTIES_MESSAGE));
        }
      }
      return context.superTransformExpression(node);
    },
    [ts.SyntaxKind.ObjectLiteralExpression]: (node, context): Expression => {
      const table = context.superTransformExpression(node);
      if (!isTableExpression(table) || !isHashedIdsLiteral(node, context.checker)) return table;
      const fields = table.fields.map((field) => {
        if (field.key === undefined) return field;
        const hashed = setNodePosition(
          createCallExpression(createIdentifier("hash"), [field.key]),
          field.key,
        );
        return setNodePosition(createTableFieldExpression(field.value, hashed), field);
      });
      return setNodePosition(createTableExpression(fields), table);
    },
  },
};

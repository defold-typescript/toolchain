import * as ts from "typescript";
import type { Expression, Plugin } from "typescript-to-lua";

// The Defold functions declared with a curried type-application overload,
// `go.get<P>()(url, property)`: the empty call only fixes `P` for the checker.
export const TYPE_APPLICATION_APIS: ReadonlySet<string> = new Set(["go.get", "go.set"]);

// Keyed by the declaration's fully qualified name: only a symbol declared in
// an ambient `declare global` block carries the `global.` prefix, so a
// project's own `go` never matches.
function isTypeApplication(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  if (call.arguments.length !== 0) return false;
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === undefined || !ts.isFunctionDeclaration(declaration)) return false;
  if (declaration.parameters.length !== 0 || declaration.typeParameters === undefined) return false;
  if (declaration.name === undefined) return false;
  const symbol = checker.getSymbolAtLocation(declaration.name);
  if (symbol === undefined) return false;
  const fqn = checker.getFullyQualifiedName(symbol);
  return fqn.startsWith("global.") && TYPE_APPLICATION_APIS.has(fqn.slice("global.".length));
}

// `go.get<P>()` becomes `go.get`, so the curried call reaches the engine as
// `go.get(url, property)` and a stored `go.get<P>()` is the function itself.
export const typeApplicationErasurePlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      if (isTypeApplication(node, context.checker)) {
        return context.transformExpression(node.expression);
      }
      return context.superTransformExpression(node);
    },
  },
};

import * as ts from "typescript";

export const GO_PROPERTY_DIRECT_CALL_MESSAGE =
  "`go.property` called directly is deprecated; declare the property in `defineScript({ properties })` so it types onto `self` (the transpiler emits the registration for you).";

// Match a user-source `go.property(...)` call — a `property` access on the `go`
// identifier. The blessed `properties`-field form never produces such a call;
// the synthesized registrations live only in emitted Lua, which this scan never
// sees (it walks the user TypeScript AST).
export function findDirectGoPropertyCalls(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "property" &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "go"
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return calls;
}

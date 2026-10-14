import * as ts from "typescript";
import {
  createBinaryExpression,
  createCallExpression,
  createIdentifier,
  createStringLiteral,
  createTableIndexExpression,
  type Expression,
  type Plugin,
  SyntaxKind,
} from "typescript-to-lua";

const GUARD_MODULE = "@defold-typescript/types";
const GUARD_NAME = "isPhysicsEvent";

function resolvesToGuardExport(callee: ts.Expression, checker: ts.TypeChecker): boolean {
  let symbol = checker.getSymbolAtLocation(callee);
  if (symbol === undefined) {
    return false;
  }
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  if (symbol.getName() !== GUARD_NAME) {
    return false;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration === undefined) {
    return false;
  }
  return declaration.getSourceFile().fileName.includes(GUARD_MODULE);
}

export const physicsEventGuardLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      const [eventArg, nameArg] = node.arguments;
      if (
        node.arguments.length === 2 &&
        eventArg !== undefined &&
        nameArg !== undefined &&
        resolvesToGuardExport(node.expression, context.checker)
      ) {
        const event = context.transformExpression(eventArg);
        const name = context.transformExpression(nameArg);
        return createBinaryExpression(
          createTableIndexExpression(event, createStringLiteral("type")),
          createCallExpression(createIdentifier("hash"), [name]),
          SyntaxKind.EqualityOperator,
          node,
        );
      }
      return context.superTransformExpression(node);
    },
  },
};

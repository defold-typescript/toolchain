import * as ts from "typescript";
import {
  createBinaryExpression,
  type Expression,
  type Plugin,
  SyntaxKind,
} from "typescript-to-lua";

const GUARD_MODULE = "@defold-typescript/types";
const GUARD_NAME = "isWindowEvent";

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

export const windowEventGuardLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      const [eventArg, , expectedArg] = node.arguments;
      if (
        node.arguments.length === 3 &&
        eventArg !== undefined &&
        expectedArg !== undefined &&
        resolvesToGuardExport(node.expression, context.checker)
      ) {
        const event = context.transformExpression(eventArg);
        const expected = context.transformExpression(expectedArg);
        return createBinaryExpression(event, expected, SyntaxKind.EqualityOperator, node);
      }
      return context.superTransformExpression(node);
    },
  },
};

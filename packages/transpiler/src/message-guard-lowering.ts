import * as ts from "typescript";
import {
  createBinaryExpression,
  createCallExpression,
  createIdentifier,
  type Expression,
  type Plugin,
  SyntaxKind,
} from "typescript-to-lua";

const GUARD_MODULE = "@defold-typescript/types";
export const GUARD_NAME = "isMessage";

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

export const messageGuardLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      const [messageIdArg, , expectedArg] = node.arguments;
      if (
        node.arguments.length === 3 &&
        messageIdArg !== undefined &&
        expectedArg !== undefined &&
        resolvesToGuardExport(node.expression, context.checker)
      ) {
        const messageId = context.transformExpression(messageIdArg);
        const expected = context.transformExpression(expectedArg);
        return createBinaryExpression(
          messageId,
          createCallExpression(createIdentifier("hash"), [expected]),
          SyntaxKind.EqualityOperator,
          node,
        );
      }
      return context.superTransformExpression(node);
    },
  },
};

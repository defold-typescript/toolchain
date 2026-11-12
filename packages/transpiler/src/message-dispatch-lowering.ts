import * as ts from "typescript";
import {
  createBinaryExpression,
  createBlock,
  createCallExpression,
  createFunctionExpression,
  createIdentifier,
  createIfStatement,
  createNilLiteral,
  createStringLiteral,
  createVariableDeclarationStatement,
  type Expression,
  type Identifier,
  type IfStatement,
  NodeFlags,
  type Plugin,
  type Statement,
  SyntaxKind,
  type TransformationContext,
} from "typescript-to-lua";

const DISPATCH_MODULE = "@defold-typescript/types";
const DISPATCH_NAME = "onMessage";

// The engine calls `on_message(self, message_id, message, sender)`; a handler's
// own params (in order) alias onto the three value-bearing arguments. Each takes
// a name TypeScript-to-Lua never gives a temp or a renamed identifier, so a
// header parameter never shadows a name the handler body captures.
const ENGINE_SELF = "____engine_self";
const ENGINE_MESSAGE_ID = "____engine_message_id";
const ENGINE_MESSAGE = "____engine_message";
const ENGINE_SENDER = "____engine_sender";
const HANDLER_PARAM_TARGETS = [ENGINE_SELF, ENGINE_MESSAGE, ENGINE_SENDER] as const;

export function resolvesToDispatchExport(callee: ts.Expression, checker: ts.TypeChecker): boolean {
  let symbol = checker.getSymbolAtLocation(callee);
  if (symbol === undefined) {
    return false;
  }
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  if (symbol.getName() !== DISPATCH_NAME) {
    return false;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration === undefined) {
    return false;
  }
  return declaration.getSourceFile().fileName.includes(DISPATCH_MODULE);
}

type HandlerFunction = (ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction) & {
  body: ts.ConciseBody;
};

function handlerName(
  property: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): string | undefined {
  const name = property.name;
  if (name === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  if (ts.isNumericLiteral(name)) {
    return String(Number(name.text));
  }
  if (ts.isComputedPropertyName(name)) {
    const type = checker.getTypeAtLocation(name.expression);
    if (type.isStringLiteral() || type.isNumberLiteral()) {
      return String(type.value);
    }
  }
  return undefined;
}

function unlowerableHandler(node: ts.Node, text: string): ts.Diagnostic {
  const file = node.getSourceFile();
  const start = node.getStart(file);
  return {
    file,
    start,
    length: node.getEnd() - start,
    category: ts.DiagnosticCategory.Error,
    code: 0,
    messageText: `${DISPATCH_NAME} cannot lower \`${text}\`: pass an object literal whose keys are an identifier, a quoted or numeric literal, or a computed literal constant, each with its handler written inline.`,
  };
}

// A handler or hook parameter binds to one engine argument by position, so only
// a plain name lowers: a destructured, defaulted or rest parameter has no single
// Lua name the engine argument can take.
export function isPlainParameter(param: ts.ParameterDeclaration): boolean {
  return (
    ts.isIdentifier(param.name) &&
    param.initializer === undefined &&
    param.dotDotDotToken === undefined
  );
}

export function unbindableParameter(param: ts.ParameterDeclaration, owner: string): ts.Diagnostic {
  const file = param.getSourceFile();
  const start = param.getStart(file);
  return {
    file,
    start,
    length: param.getEnd() - start,
    category: ts.DiagnosticCategory.Error,
    code: 0,
    messageText: `${owner} cannot bind the parameter \`${param.getText(file)}\`: give it a plain name, then destructure or default it inside the body.`,
  };
}

function handlerFunction(property: ts.ObjectLiteralElementLike): HandlerFunction | undefined {
  if (ts.isMethodDeclaration(property) && property.body !== undefined) {
    return property as HandlerFunction;
  }
  if (ts.isPropertyAssignment(property)) {
    const initializer = property.initializer;
    if (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)) {
      return initializer as HandlerFunction;
    }
  }
  return undefined;
}

function isThisParameter(param: ts.ParameterDeclaration): boolean {
  return (
    ts.isIdentifier(param.name) &&
    ts.identifierToKeywordKind(param.name) === ts.SyntaxKind.ThisKeyword
  );
}

// One multiple assignment binds every declared parameter to the engine argument
// at its position; no parameter's Lua name equals an engine name, so each one is
// aliased. A parameter past `sender` is bound to nil.
function aliasStatements(fn: HandlerFunction, context: TransformationContext): Statement[] {
  const lefts: Identifier[] = [];
  const rights: Expression[] = [];
  fn.parameters
    .filter((param) => !isThisParameter(param))
    .forEach((param, index) => {
      const engineName = HANDLER_PARAM_TARGETS[index];
      lefts.push(context.transformExpression(param.name as ts.Identifier) as Identifier);
      rights.push(engineName === undefined ? createNilLiteral() : createIdentifier(engineName));
    });
  return lefts.length === 0 ? [] : [createVariableDeclarationStatement(lefts, rights)];
}

function handlerBody(fn: HandlerFunction, context: TransformationContext): Statement[] {
  if (ts.isBlock(fn.body)) {
    return context.transformStatements(fn.body.statements);
  }
  return context.transformStatements([ts.factory.createExpressionStatement(fn.body)]);
}

export const messageDispatchLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      if (!resolvesToDispatchExport(node.expression, context.checker)) {
        return context.superTransformExpression(node);
      }
      const [handlersArg] = node.arguments;
      if (
        node.arguments.length === 1 &&
        handlersArg !== undefined &&
        ts.isObjectLiteralExpression(handlersArg)
      ) {
        let chain: IfStatement | undefined;
        const properties = [...handlersArg.properties];
        for (let i = properties.length - 1; i >= 0; i--) {
          const property = properties[i];
          if (property === undefined) {
            continue;
          }
          const name = handlerName(property, context.checker);
          const fn = handlerFunction(property);
          if (name === undefined || fn === undefined) {
            const offending = property.name ?? property;
            context.diagnostics.push(unlowerableHandler(property, offending.getText()));
            continue;
          }
          const unbindable = fn.parameters.find(
            (param) => !isThisParameter(param) && !isPlainParameter(param),
          );
          if (unbindable !== undefined) {
            context.diagnostics.push(
              unbindableParameter(unbindable, `${DISPATCH_NAME} handler \`${name}\``),
            );
            continue;
          }
          const condition = createBinaryExpression(
            createIdentifier(ENGINE_MESSAGE_ID),
            createCallExpression(createIdentifier("hash"), [createStringLiteral(name)]),
            SyntaxKind.EqualityOperator,
          );
          const body = [...aliasStatements(fn, context), ...handlerBody(fn, context)];
          chain = createIfStatement(condition, createBlock(body), chain);
        }
        const params: Identifier[] = [
          ENGINE_SELF,
          ENGINE_MESSAGE_ID,
          ENGINE_MESSAGE,
          ENGINE_SENDER,
        ].map((name) => createIdentifier(name));
        return createFunctionExpression(
          createBlock(chain === undefined ? [] : [chain]),
          params,
          undefined,
          NodeFlags.Declaration,
          node,
        );
      }
      const offending = handlersArg ?? node;
      context.diagnostics.push(unlowerableHandler(offending, offending.getText()));
      return context.superTransformExpression(node);
    },
  },
};

import * as ts from "typescript";
import {
  createAssignmentStatement,
  createBinaryExpression,
  createBlock,
  createCallExpression,
  createExpressionStatement,
  createForInStatement,
  createFunctionExpression,
  createIdentifier,
  createIfStatement,
  createNilLiteral,
  createReturnStatement,
  createStringLiteral,
  createTableIndexExpression,
  createVariableDeclarationStatement,
  type Identifier,
  NodeFlags,
  type Plugin,
  type Statement,
  SyntaxKind,
  type TransformationContext,
} from "typescript-to-lua";
import { resolvesToDispatchExport } from "./message-dispatch-lowering";

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

function resolvesToFactoryExport(callee: ts.Expression, checker: ts.TypeChecker): boolean {
  let symbol = checker.getSymbolAtLocation(callee);
  if (symbol === undefined) {
    return false;
  }
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  if (!FACTORY_NAMES.has(symbol.getName())) {
    return false;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration === undefined) {
    return false;
  }
  return declaration.getSourceFile().fileName.includes(FACTORY_MODULE);
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

// The value-keyed `properties` field maps each `key: default` to a chunk-scope
// `go.property("key", default)` the editor reads. Emitted before the hook
// assignments and after the source's `local` consts, so a default referencing a
// module const resolves.
function emitPropertyRegistrations(
  property: ts.ObjectLiteralElementLike,
  context: TransformationContext,
): Statement[] {
  if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
    return [];
  }
  const registrations: Statement[] = [];
  for (const member of property.initializer.properties) {
    if (!ts.isPropertyAssignment(member)) {
      continue;
    }
    const key = member.name;
    if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) {
      continue;
    }
    registrations.push(
      createExpressionStatement(
        createCallExpression(
          createTableIndexExpression(createIdentifier("go"), createStringLiteral("property")),
          [createStringLiteral(key.text), context.transformExpression(member.initializer)],
        ),
      ),
    );
  }
  return registrations;
}

function eraseFactoryCall(
  expression: ts.Expression,
  context: TransformationContext,
): Statement[] | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  if (!resolvesToFactoryExport(expression.expression, context.checker)) {
    return undefined;
  }
  const hooks = expression.arguments[0];
  if (hooks === undefined || !ts.isObjectLiteralExpression(hooks)) {
    return undefined;
  }
  const registrations: Statement[] = [];
  const statements: Statement[] = [];
  for (const property of hooks.properties) {
    const name = hookName(property);
    if (name === undefined) {
      continue;
    }
    if (name === "properties") {
      registrations.push(...emitPropertyRegistrations(property, context));
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
  const bindings = clause.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) {
    return false;
  }
  return bindings.elements.every((element) =>
    FACTORY_NAMES.has((element.propertyName ?? element.name).text),
  );
}

export const lifecycleErasurePlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.ExpressionStatement]: (node, context) =>
      eraseFactoryCall(node.expression, context) ?? context.superTransformStatements(node),
    [ts.SyntaxKind.ExportAssignment]: (node, context) => {
      if (!node.isExportEquals) {
        const erased = eraseFactoryCall(node.expression, context);
        if (erased !== undefined) {
          return erased;
        }
      }
      return context.superTransformStatements(node);
    },
    [ts.SyntaxKind.ImportDeclaration]: (node, context) =>
      isFactoryOnlyImport(node) ? [] : context.superTransformStatements(node),
  },
};

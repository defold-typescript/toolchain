import * as ts from "typescript";
import {
  createBinaryExpression,
  createNumericLiteral,
  type Expression,
  getOriginalPos,
  isCallExpression,
  isNumericLiteral,
  isStringLiteral,
  isTableExpression,
  type Plugin,
  SyntaxKind,
  setNodePosition,
  type TableExpression,
} from "typescript-to-lua";

// The Defold functions whose `options.index` upstream documents as "index into
// array property (1 based)". TypeScript authors it zero-based; the lowering
// adds the one Lua expects.
export const ONE_BASED_INDEX_OPTION_APIS: ReadonlySet<string> = new Set([
  "go.get",
  "go.set",
  "gui.get",
  "gui.set",
]);

export const INDEX_OPTION_VARIABLE_MESSAGE =
  "`options.index` is zero-based and is converted to Defold's 1-based index only in an object literal written at the call; pass the options inline.";
export const INDEX_OPTION_SPREAD_MESSAGE =
  "A spread carrying `index` cannot be converted to Defold's 1-based index; write `index` explicitly after the spread.";
export const INDEX_OPTION_UNDEFINED_MESSAGE =
  "`options.index` may be undefined here, so it cannot be converted to Defold's 1-based index; pass a number, or leave `index` out.";

const OPTIONS_PARAMETER = "options";
const INDEX_KEY = "index";

const loweredLiterals = new WeakSet<ts.Node>();

// Keyed like `tableKey` in url-address-slots.ts: only a symbol declared in an
// ambient `declare global` block carries the `global.` prefix, so a project's
// own `go` or `gui` never matches. Walking up from the signature declaration
// reaches `go.get<P>()` from the function type its curried inner call resolves to.
function oneBasedApi(declaration: ts.Declaration, checker: ts.TypeChecker): boolean {
  let node: ts.Node | undefined = declaration;
  while (node !== undefined && !ts.isFunctionDeclaration(node)) node = node.parent;
  if (node?.name === undefined) return false;
  const symbol = checker.getSymbolAtLocation(node.name);
  if (symbol === undefined) return false;
  const fqn = checker.getFullyQualifiedName(symbol);
  return fqn.startsWith("global.") && ONE_BASED_INDEX_OPTION_APIS.has(fqn.slice("global.".length));
}

function optionsArgument(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): ts.Expression | undefined {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === undefined || !ts.isFunctionLike(declaration)) return undefined;
  if (!oneBasedApi(declaration, checker)) return undefined;
  const index = declaration.parameters.findIndex(
    (parameter) =>
      parameter.dotDotDotToken === undefined &&
      ts.isIdentifier(parameter.name) &&
      parameter.name.text === OPTIONS_PARAMETER,
  );
  return index === -1 ? undefined : call.arguments[index];
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

function carriesIndex(type: ts.Type): boolean {
  return someConstituent(type, (t) => t.getProperty(INDEX_KEY) !== undefined);
}

function admitsUndefined(type: ts.Type): boolean {
  return someConstituent(
    type,
    (t) => (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0,
  );
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

function indexValueType(
  property: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  if (ts.isPropertyAssignment(property)) return checker.getTypeAtLocation(property.initializer);
  if (ts.isShorthandPropertyAssignment(property)) return checker.getTypeAtLocation(property.name);
  return undefined;
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

// The first reason `options` cannot be lowered, or `undefined` when it can.
function rejectOptions(options: ts.Expression, checker: ts.TypeChecker): ts.Diagnostic | undefined {
  const literal = unwrap(options);
  if (!ts.isObjectLiteralExpression(literal)) {
    return carriesIndex(checker.getTypeAtLocation(literal))
      ? rejection(options, INDEX_OPTION_VARIABLE_MESSAGE)
      : undefined;
  }
  let uncoveredSpread: ts.SpreadAssignment | undefined;
  let explicitIndex: ts.ObjectLiteralElementLike | undefined;
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (carriesIndex(checker.getTypeAtLocation(property.expression))) uncoveredSpread = property;
    } else if (propertyName(property, checker) === INDEX_KEY) {
      uncoveredSpread = undefined;
      explicitIndex = property;
    }
  }
  if (uncoveredSpread !== undefined) return rejection(uncoveredSpread, INDEX_OPTION_SPREAD_MESSAGE);
  const valueType = explicitIndex && indexValueType(explicitIndex, checker);
  if (explicitIndex !== undefined && valueType !== undefined && admitsUndefined(valueType)) {
    return rejection(explicitIndex, INDEX_OPTION_UNDEFINED_MESSAGE);
  }
  return undefined;
}

function plusOne(value: Expression): Expression {
  if (isNumericLiteral(value)) {
    return setNodePosition(createNumericLiteral(value.value + 1), getOriginalPos(value));
  }
  return setNodePosition(
    createBinaryExpression(value, createNumericLiteral(1), SyntaxKind.AdditionOperator),
    getOriginalPos(value),
  );
}

function offsetIndexFields(table: TableExpression): void {
  for (const field of table.fields) {
    if (field.key !== undefined && isStringLiteral(field.key) && field.key.value === INDEX_KEY) {
      field.value = plusOne(field.value);
    }
  }
}

export const arrayIndexOptionLoweringPlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      const options = optionsArgument(node, context.checker);
      if (options !== undefined) {
        const diagnostic = rejectOptions(options, context.checker);
        if (diagnostic !== undefined) {
          context.diagnostics.push(diagnostic);
        } else {
          const literal = unwrap(options);
          if (ts.isObjectLiteralExpression(literal)) loweredLiterals.add(literal);
        }
      }
      return context.superTransformExpression(node);
    },
    // A spread lowers the literal to `__TS__ObjectAssign({}, base, {index = …})`,
    // so the table carrying `index` can sit one call deep.
    [ts.SyntaxKind.ObjectLiteralExpression]: (node, context): Expression => {
      const result = context.superTransformExpression(node);
      if (!loweredLiterals.has(node)) return result;
      if (isTableExpression(result)) {
        offsetIndexFields(result);
      } else if (isCallExpression(result)) {
        for (const param of result.params) if (isTableExpression(param)) offsetIndexFields(param);
      }
      return result;
    },
  },
};

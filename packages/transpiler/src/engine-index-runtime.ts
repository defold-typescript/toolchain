import {
  createAssignmentStatement,
  createBinaryExpression,
  createBlock,
  createBooleanLiteral,
  createCallExpression,
  createForInStatement,
  createForStatement,
  createFunctionExpression,
  createIdentifier,
  createIfStatement,
  createNumericLiteral,
  createReturnStatement,
  createStringLiteral,
  createTableExpression,
  createTableFieldExpression,
  createTableIndexExpression,
  createUnaryExpression,
  createVariableDeclarationStatement,
  type Expression,
  NodeFlags,
  type Statement,
  SyntaxKind,
} from "typescript-to-lua";

export const ENGINE_INDEX_HELPER = "____engine_index";

// A step of a field path: a table key, or `EACH` for every element of a list.
export const EACH = true;
export type FieldPath = readonly (string | typeof EACH)[];

const id = createIdentifier;

function typeIs(
  value: Expression,
  name: string,
  operator:
    | SyntaxKind.EqualityOperator
    | SyntaxKind.InequalityOperator = SyntaxKind.EqualityOperator,
): Expression {
  return createBinaryExpression(
    createCallExpression(id("type"), [value]),
    createStringLiteral(name),
    operator,
  );
}

function recurse(value: Expression): Expression {
  return createCallExpression(id(ENGINE_INDEX_HELPER), [
    value,
    id("delta"),
    id("copy"),
    id("path"),
    createBinaryExpression(id("depth"), createNumericLiteral(1), SyntaxKind.AdditionOperator),
  ]);
}

// `____engine_index(value, delta, copy, path)` adds `delta` to the number at the
// end of `path` in `value` and returns the table. With `copy`, every table along
// the path is copied first, so a caller's table keeps its own values; without
// it, the engine's fresh table is converted in place.
export function engineIndexHelper(): Statement {
  const value = id("value");
  const key = id("key");
  const field = createTableIndexExpression(value, key);
  const body = createBlock([
    createIfStatement(
      typeIs(value, "table", SyntaxKind.InequalityOperator),
      createBlock([createReturnStatement([value])]),
    ),
    createAssignmentStatement(
      id("depth"),
      createBinaryExpression(id("depth"), createNumericLiteral(1), SyntaxKind.OrOperator),
    ),
    createIfStatement(
      id("copy"),
      createBlock([
        createVariableDeclarationStatement(id("copied"), createTableExpression()),
        createForInStatement(
          createBlock([
            createAssignmentStatement(createTableIndexExpression(id("copied"), id("k")), id("v")),
          ]),
          [id("k"), id("v")],
          [createCallExpression(id("pairs"), [value])],
        ),
        createAssignmentStatement(value, id("copied")),
      ]),
    ),
    createVariableDeclarationStatement(key, createTableIndexExpression(id("path"), id("depth"))),
    createIfStatement(
      createBinaryExpression(key, createBooleanLiteral(true), SyntaxKind.EqualityOperator),
      createBlock([
        createForStatement(
          createBlock([
            createAssignmentStatement(
              createTableIndexExpression(value, id("i")),
              recurse(createTableIndexExpression(value, id("i"))),
            ),
          ]),
          id("i"),
          createNumericLiteral(1),
          createUnaryExpression(value, SyntaxKind.LengthOperator),
        ),
      ]),
      createIfStatement(
        createBinaryExpression(
          id("depth"),
          createUnaryExpression(id("path"), SyntaxKind.LengthOperator),
          SyntaxKind.LessThanOperator,
        ),
        createBlock([createAssignmentStatement(field, recurse(field))]),
        createIfStatement(
          typeIs(field, "number"),
          createBlock([
            createAssignmentStatement(
              field,
              createBinaryExpression(field, id("delta"), SyntaxKind.AdditionOperator),
            ),
          ]),
        ),
      ),
    ),
    createReturnStatement([value]),
  ]);
  return createVariableDeclarationStatement(
    id(ENGINE_INDEX_HELPER),
    createFunctionExpression(
      body,
      [value, id("delta"), id("copy"), id("path"), id("depth")],
      undefined,
      NodeFlags.Declaration,
    ),
  );
}

function pathTable(path: FieldPath): Expression {
  return createTableExpression(
    path.map((step) =>
      createTableFieldExpression(
        step === EACH ? createBooleanLiteral(true) : createStringLiteral(step),
      ),
    ),
  );
}

// One helper call per path; a later path converts the table the earlier one
// returned.
export function engineIndexCall(
  value: Expression,
  paths: readonly FieldPath[],
  delta: 1 | -1,
  copy: boolean,
): Expression {
  return paths.reduce<Expression>(
    (current, path) =>
      createCallExpression(id(ENGINE_INDEX_HELPER), [
        current,
        createNumericLiteral(delta),
        createBooleanLiteral(copy),
        pathTable(path),
      ]),
    value,
  );
}

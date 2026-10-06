import ts from "typescript";

/**
 * Type-looseness rules over the authored example bodies, read through the
 * checker of the program the example gate already builds.
 *
 * Both shapes compile clean, which is why no diagnostic can carry them: a
 * callback parameter annotated `unknown` is accepted wherever a narrower type
 * is declared, and an assertion to a type the operand already has is a no-op.
 * Each one teaches a reader that the declarations are looser than they are.
 *
 * A finding carries no position, so reflowing a body never changes it.
 */

export type LooseTypeKind = "loose-parameter" | "redundant-assertion";

export interface LooseTypeFinding {
  readonly kind: LooseTypeKind;
  /** The parameter name, or the assertion expression as written. */
  readonly text: string;
  /** The type the declaration supplies: the callback slot's, or the operand's own. */
  readonly declared: string;
}

type CallbackNode = ts.FunctionExpression | ts.ArrowFunction | ts.FunctionDeclaration;

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

function isLoose(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

function isLooseKeyword(node: ts.TypeNode | undefined): boolean {
  return (
    node !== undefined &&
    (node.kind === ts.SyntaxKind.UnknownKeyword || node.kind === ts.SyntaxKind.AnyKeyword)
  );
}

function unparenthesized(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/**
 * The function an argument passes: written in place, or named and declared in
 * the same body. A name bound anywhere else is out of the body's reach.
 */
function callbackOf(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  argument: ts.Expression,
): CallbackNode | undefined {
  const expression = unparenthesized(argument);
  if (ts.isFunctionExpression(expression) || ts.isArrowFunction(expression)) return expression;
  if (!ts.isIdentifier(expression)) return undefined;
  for (const declaration of checker.getSymbolAtLocation(expression)?.declarations ?? []) {
    if (declaration.getSourceFile() !== source) continue;
    if (ts.isFunctionDeclaration(declaration)) return declaration;
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      const initializer = unparenthesized(declaration.initializer);
      if (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)) {
        return initializer;
      }
    }
  }
  return undefined;
}

/**
 * The type a callback slot hands its parameter at `index`. A rest slot
 * (`...args: unknown[]`) hands its element type to every position it covers.
 */
function slotType(
  checker: ts.TypeChecker,
  signature: ts.Signature,
  index: number,
  location: ts.Node,
): ts.Type | undefined {
  const last = signature.parameters[signature.parameters.length - 1];
  const lastDeclaration = last?.valueDeclaration;
  const rest =
    last !== undefined &&
    lastDeclaration !== undefined &&
    ts.isParameter(lastDeclaration) &&
    lastDeclaration.dotDotDotToken !== undefined
      ? last
      : undefined;
  const slot = signature.parameters[index];
  if (slot !== undefined && slot !== rest) return checker.getTypeOfSymbolAtLocation(slot, location);
  if (rest === undefined) return undefined;
  return checker.getTypeOfSymbolAtLocation(rest, location).getNumberIndexType();
}

function looseParameters(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  call: ts.CallExpression | ts.NewExpression,
): LooseTypeFinding[] {
  const findings: LooseTypeFinding[] = [];
  for (const argument of call.arguments ?? []) {
    const callback = callbackOf(checker, source, argument);
    if (callback === undefined) continue;
    const contextual = checker.getContextualType(argument);
    if (contextual === undefined) continue;
    const signatures = checker.getSignaturesOfType(
      checker.getNonNullableType(contextual),
      ts.SignatureKind.Call,
    );
    const [signature] = signatures;
    if (signature === undefined || signatures.length !== 1) continue;
    callback.parameters.forEach((parameter, index) => {
      if (!isLooseKeyword(parameter.type)) return;
      const declared = slotType(checker, signature, index, argument);
      if (declared === undefined || isLoose(declared)) return;
      findings.push({
        kind: "loose-parameter",
        text: parameter.name.getText(source),
        declared: checker.typeToString(declared),
      });
    });
  }
  return findings;
}

function redundantAssertion(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  node: ts.AsExpression | ts.NonNullExpression,
): LooseTypeFinding | undefined {
  const operand = unparenthesized(node.expression);
  const operandType = checker.getTypeAtLocation(operand);
  if (isLoose(operandType)) return undefined;
  if (ts.isAsExpression(node)) {
    if (ts.isConstTypeReference(node.type)) return undefined;
    // On a literal the assertion picks the contextual type the literal is read under.
    if (ts.isObjectLiteralExpression(operand) || ts.isArrayLiteralExpression(operand)) {
      return undefined;
    }
    const asserted = checker.getTypeFromTypeNode(node.type);
    // `x as unknown as T` is the first leg of a forced cast, not a restatement.
    if (isLoose(asserted)) return undefined;
    if (!checker.isTypeAssignableTo(operandType, asserted)) return undefined;
  } else if (checker.getNonNullableType(operandType) !== operandType) {
    return undefined;
  }
  return {
    kind: "redundant-assertion",
    text: node.getText(source),
    declared: checker.typeToString(operandType),
  };
}

/** Every loose annotation and redundant assertion in one compiled example body, in source order. */
export function looseTypeFindings(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
): LooseTypeFinding[] {
  const findings: LooseTypeFinding[] = [];
  walk(source, (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      findings.push(...looseParameters(checker, source, node));
    } else if (ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
      const finding = redundantAssertion(checker, source, node);
      if (finding !== undefined) findings.push(finding);
    }
  });
  return findings;
}

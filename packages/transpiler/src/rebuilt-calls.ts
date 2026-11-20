import * as ts from "typescript";

// TSTL rebuilds a call with `ts.factory` in its parenthesis-stripping pre-pass
// and in its optional-chain lowering. The copy keeps `original`, so the checker
// resolves it, but it has no `parent`, so position and text are read from its
// source call (`ts.getParseTreeNode`).

// An optional chain reaches the visitor as the source call and again as the
// synthetic copy TSTL rebuilds it into, which keeps the source `arguments`.
// The build deduplicates its diagnostics, but the editor's squiggle pass
// (`getProgramDiagnostics`) does not.
export function reportOnce(diagnostics: ts.Diagnostic[], error: ts.Diagnostic): void {
  const reported = diagnostics.some(
    (existing) =>
      existing.file === error.file &&
      existing.start === error.start &&
      existing.messageText === error.messageText,
  );
  if (!reported) diagnostics.push(error);
}

// The inverse of `outermostWrapper` (`lifecycle-erasure.ts`): the expression a
// run of parentheses and type-only forms wraps, which TSTL emits in place of the
// whole run.
export function innermostExpression(node: ts.Expression): ts.Expression {
  let current = node;
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

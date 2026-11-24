import * as ts from "typescript";

// A type erases, but two type-node forms are values the emitted Lua reads: an
// instantiation expression (`WeakRef<object>`), which lowers to the bare name,
// and a class `extends` clause. An interface `extends` or a class `implements`
// clause erases like any other type.
function isValueTypeNode(node: ts.Node): boolean {
  if (!ts.isExpressionWithTypeArguments(node)) {
    return false;
  }
  if (!ts.isHeritageClause(node.parent)) {
    return true;
  }
  return node.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(node.parent.parent);
}

/**
 * Whether `node` is a type node that emits nothing, so a walk over the code the
 * Lua runs skips it and everything under it.
 */
export function isErasedTypeNode(node: ts.Node): boolean {
  return ts.isTypeNode(node) && !isValueTypeNode(node);
}

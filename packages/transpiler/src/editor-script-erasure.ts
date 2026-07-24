import * as ts from "typescript";
import {
  createReturnStatement,
  type Plugin,
  type Statement,
  type TransformationContext,
} from "typescript-to-lua";

export const EDITOR_FACTORY_MODULE = "@defold-typescript/types";
export const EDITOR_FACTORY_NAME = "defineEditorScript";
// Only the bare main entry for now; the walled `@defold-typescript/types/editor-script`
// subpath import arrives with the per-kind editor wall (a deferred slice).
const EDITOR_FACTORY_SPECIFIERS = new Set([EDITOR_FACTORY_MODULE]);

function resolvesToEditorFactoryExport(callee: ts.Expression, checker: ts.TypeChecker): boolean {
  let symbol = checker.getSymbolAtLocation(callee);
  if (symbol === undefined) {
    return false;
  }
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  if (symbol.getName() !== EDITOR_FACTORY_NAME) {
    return false;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration === undefined) {
    return false;
  }
  return declaration.getSourceFile().fileName.includes(EDITOR_FACTORY_MODULE);
}

// Unlike the runtime kinds (lowered to flat top-level lifecycle globals), the
// editor loads the chunk and uses its return value, so the hooks table must be
// the chunk's return. Unwrap `defineEditorScript(OBJ)` and emit `return OBJ`
// directly — not `export default`, whose TSTL lowering returns `{ default = OBJ }`.
function lowerEditorFactoryCall(
  expression: ts.Expression,
  context: TransformationContext,
): Statement[] | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  if (!resolvesToEditorFactoryExport(expression.expression, context.checker)) {
    return undefined;
  }
  const module = expression.arguments[0];
  if (module === undefined) {
    return undefined;
  }
  return [createReturnStatement([context.transformExpression(module)])];
}

export function isEditorFactoryOnlyImport(node: ts.ImportDeclaration): boolean {
  if (
    !ts.isStringLiteral(node.moduleSpecifier) ||
    !EDITOR_FACTORY_SPECIFIERS.has(node.moduleSpecifier.text)
  ) {
    return false;
  }
  const clause = node.importClause;
  if (clause === undefined || clause.name !== undefined) {
    return false;
  }
  // A whole-clause `import type { ... }` binds nothing at runtime; leave it for
  // the normal transform, which elides it.
  if (clause.isTypeOnly) {
    return false;
  }
  const bindings = clause.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) {
    return false;
  }
  // Type-only specifiers ride along and drop with the erased statement; erase
  // only when every runtime specifier is the editor factory itself.
  const runtime = bindings.elements.filter((element) => !element.isTypeOnly);
  if (runtime.length === 0) {
    return false;
  }
  return runtime.every(
    (element) => (element.propertyName ?? element.name).text === EDITOR_FACTORY_NAME,
  );
}

// The editor-factory recognition is disjoint from the runtime factories, so this
// plugin composes with `lifecycleErasurePlugin` in either order: each visitor
// lowers its own kind and delegates the rest via `superTransformStatements`.
export const editorScriptErasurePlugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.ExportAssignment]: (node, context) => {
      if (!node.isExportEquals) {
        const lowered = lowerEditorFactoryCall(node.expression, context);
        if (lowered !== undefined) {
          return lowered;
        }
      }
      return context.superTransformStatements(node);
    },
    [ts.SyntaxKind.ImportDeclaration]: (node, context) =>
      isEditorFactoryOnlyImport(node) ? [] : context.superTransformStatements(node),
  },
};

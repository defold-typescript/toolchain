import * as ts from "typescript";
import {
  createReturnStatement,
  type Expression,
  type Plugin,
  type Statement,
  type TransformationContext,
} from "typescript-to-lua";

export const EDITOR_FACTORY_MODULE = "@defold-typescript/types";
export const EDITOR_SCRIPT_FACTORY_NAME = "defineEditorScript";
export const EDITOR_COMMAND_FACTORY_NAME = "defineEditorCommand";
const EDITOR_FACTORY_NAMES: ReadonlySet<string> = new Set([
  EDITOR_SCRIPT_FACTORY_NAME,
  EDITOR_COMMAND_FACTORY_NAME,
]);
// The bare main entry and the walled per-kind subpath the guide teaches; the
// other kinds' subpaths export their own factories, never these.
const EDITOR_FACTORY_SPECIFIERS = new Set([
  EDITOR_FACTORY_MODULE,
  `${EDITOR_FACTORY_MODULE}/editor-script`,
]);

function resolveEditorFactoryExport(
  callee: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined {
  let symbol = checker.getSymbolAtLocation(callee);
  if (symbol === undefined) {
    return undefined;
  }
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  const name = symbol.getName();
  if (!EDITOR_FACTORY_NAMES.has(name)) {
    return undefined;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration === undefined) {
    return undefined;
  }
  return declaration.getSourceFile().fileName.includes(EDITOR_FACTORY_MODULE) ? name : undefined;
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
  // Only the module factory owns the chunk-level return; a command factory call
  // is unwrapped in place by the `CallExpression` visitor below.
  if (
    resolveEditorFactoryExport(expression.expression, context.checker) !==
    EDITOR_SCRIPT_FACTORY_NAME
  ) {
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
  return runtime.every((element) =>
    EDITOR_FACTORY_NAMES.has((element.propertyName ?? element.name).text),
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
    // `defineEditorCommand` is a compile-time identity with no runtime
    // counterpart once its import is erased, so the call must collapse to the
    // command table it wraps rather than survive as a nil-global call.
    [ts.SyntaxKind.CallExpression]: (node, context): Expression => {
      const command = node.arguments[0];
      if (
        command !== undefined &&
        resolveEditorFactoryExport(node.expression, context.checker) === EDITOR_COMMAND_FACTORY_NAME
      ) {
        return context.transformExpression(command);
      }
      return context.superTransformExpression(node);
    },
    [ts.SyntaxKind.ImportDeclaration]: (node, context) =>
      isEditorFactoryOnlyImport(node) ? [] : context.superTransformStatements(node),
  },
};

import * as ts from "typescript";
import type { EmitResolver, TypeCheckerWithEmitResolver } from "typescript-to-lua";
import * as tstl from "typescript-to-lua";
import { methodExtensionKinds } from "typescript-to-lua/dist/transformation/utils/language-extensions.js";
import { isUnsafeName } from "typescript-to-lua/dist/transformation/utils/safe-names.js";
import { isEditorFactoryOnlyImport } from "./editor-script-erasure";
import { isErasedTypeNode } from "./erased-type-nodes";
import { referencedSymbol } from "./js-runtime-globals";
import { isFactoryOnlyImport } from "./lifecycle-erasure";
import { DISPATCH_NAME } from "./message-dispatch-lowering";
import { GUARD_NAME as MESSAGE_GUARD_NAME } from "./message-guard-lowering";
import { GUARD_NAME as PHYSICS_EVENT_GUARD_NAME } from "./physics-event-guard-lowering";
import { GUARD_NAME as WINDOW_EVENT_GUARD_NAME } from "./window-event-guard-lowering";

const LANGUAGE_EXTENSIONS_SEGMENT = "@typescript-to-lua/language-extensions/";

// Globals `@defold-typescript/types` declares for TypeScript alone: a lowering
// replaces each call, so no Lua global by that name exists to hide.
const LOWERED_GLOBALS: ReadonlySet<string> = new Set([
  DISPATCH_NAME,
  MESSAGE_GUARD_NAME,
  PHYSICS_EVENT_GUARD_NAME,
  WINDOW_EVENT_GUARD_NAME,
]);

/**
 * How the build treats a file-level Lua global shadow: a warning that leaves the
 * build green, or an error that fails it.
 */
export type GlobalShadowsMode = "warn" | "error";

/**
 * The code every Lua global shadow diagnostic carries, so the editor can find
 * it; the next one after `MISSING_JS_GLOBAL_CODE`.
 */
export const LUA_GLOBAL_SHADOW_CODE = 990_002;

/**
 * The `package.json` `"defold-typescript"."global-shadows"` setting from a
 * parsed `package.json`, `"warn"` when it is absent. Throws on any other value.
 */
export function readGlobalShadowsSetting(pkg: unknown): GlobalShadowsMode {
  if (typeof pkg !== "object" || pkg === null) {
    return "warn";
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null || !("global-shadows" in namespace)) {
    return "warn";
  }
  const value = (namespace as Record<string, unknown>)["global-shadows"];
  if (value !== "warn" && value !== "error") {
    throw new Error(
      `defold-typescript: package.json "defold-typescript"."global-shadows" is ${JSON.stringify(value)}; it must be "warn" or "error".`,
    );
  }
  return value;
}

export function luaGlobalShadowMessage(name: string): string {
  return `\`${name}\` is a file-level Lua local that hides the global \`${name}\` throughout this file, including Lua the build generates here; rename it.`;
}

export function luaLocalShadowMessage(name: string): string {
  return `\`${name}\` is a Lua local that hides the global \`${name}\` in its scope, including Lua the build generates there; rename it.`;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false)
  );
}

function bindingIdentifiers(name: ts.BindingName, into: ts.Identifier[]): void {
  if (ts.isIdentifier(name)) {
    into.push(name);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      bindingIdentifiers(element.name, into);
    }
  }
}

// The names a top-level statement turns into a chunk-wide Lua `local`. An
// `export` modifier puts the name on the module table instead, and `declare`,
// a `const enum` and a bodiless overload emit nothing. An import binding counts
// only when TypeScript-to-Lua emits it: its emit resolver must report the
// binding referenced, and the statement must not be a factory import the
// erasure plugins drop whole.
function fileLevelLocals(statement: ts.Statement, resolver: EmitResolver): ts.Identifier[] {
  if (
    hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
    hasModifier(statement, ts.SyntaxKind.DeclareKeyword)
  ) {
    return [];
  }
  const names: ts.Identifier[] = [];
  if (ts.isFunctionDeclaration(statement)) {
    if (statement.name !== undefined && statement.body !== undefined) {
      names.push(statement.name);
    }
  } else if (ts.isClassDeclaration(statement)) {
    if (statement.name !== undefined) {
      names.push(statement.name);
    }
  } else if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      bindingIdentifiers(declaration.name, names);
    }
  } else if (ts.isEnumDeclaration(statement)) {
    if (!hasModifier(statement, ts.SyntaxKind.ConstKeyword)) {
      names.push(statement.name);
    }
  } else if (ts.isImportDeclaration(statement)) {
    if (isFactoryOnlyImport(statement) || isEditorFactoryOnlyImport(statement)) {
      return [];
    }
    const clause = statement.importClause;
    if (clause !== undefined && !clause.isTypeOnly) {
      if (clause.name !== undefined && resolver.isReferencedAliasDeclaration(clause)) {
        names.push(clause.name);
      }
      const bindings = clause.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        if (resolver.isReferencedAliasDeclaration(bindings)) {
          names.push(bindings.name);
        }
      } else if (bindings !== undefined) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly && resolver.isReferencedAliasDeclaration(element)) {
            names.push(element.name);
          }
        }
      }
    }
  }
  return names;
}

/**
 * Whether `name` is a global the Lua runtime provides: a value the program's
 * global scope declares outside TypeScript's default library and the
 * TypeScript-to-Lua language extensions, which describe nothing at runtime.
 */
export function isLuaGlobal(program: ts.Program, checker: ts.TypeChecker, name: string): boolean {
  const symbol = checker.resolveName(name, undefined, ts.SymbolFlags.Value, false);
  return (
    symbol?.declarations?.some((declaration) => {
      const file = declaration.getSourceFile();
      return (
        !program.isSourceFileDefaultLibrary(file) &&
        !file.fileName.replace(/\\/g, "/").includes(LANGUAGE_EXTENSIONS_SEGMENT)
      );
    }) ?? false
  );
}

function hasBody(node: ts.Node): boolean {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)) &&
    node.body !== undefined
  );
}

function namespaceHasEmittedBody(node: ts.ModuleDeclaration): boolean {
  const body = node.body;
  if (body === undefined) {
    return false;
  }
  if (ts.isModuleBlock(body)) {
    return body.statements.some(
      (s) => !ts.isInterfaceDeclaration(s) && !ts.isTypeAliasDeclaration(s),
    );
  }
  return ts.isModuleDeclaration(body);
}

// Mirrors TypeScript-to-Lua's namespace transform. A namespace that is not
// exported declares `local NS = {}` on its first declaration; an exported one,
// or the inner part of a dotted name, keeps `local NS = <exports>.NS` only when
// it exports something and emits a body. A top-level namespace in a script file
// is a global, which the caller excludes.
function namespaceEmitsLocal(
  checker: ts.TypeChecker,
  node: ts.ModuleDeclaration,
  isModule: boolean,
): boolean {
  if (!ts.isIdentifier(node.name)) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(node.name);
  const declarations = symbol?.declarations ?? [];
  const isFirstDeclaration =
    symbol === undefined ||
    (!declarations.some((d) => ts.isClassLike(d) || ts.isFunctionDeclaration(d)) &&
      declarations.find(ts.isModuleDeclaration) === node);
  const isExported =
    hasModifier(node, ts.SyntaxKind.ExportKeyword) || ts.isModuleDeclaration(node.parent);
  if (!isExported) {
    return isFirstDeclaration;
  }
  return (
    (!isModule || isFirstDeclaration) &&
    symbol !== undefined &&
    checker.getExportsOfModule(symbol).length > 0 &&
    namespaceHasEmittedBody(node)
  );
}

// The names a top-level statement turns into a chunk-wide Lua `local` beyond
// `fileLevelLocals`: an exported class keeps a local alias of its export, and so
// does a namespace, exported or not.
function errorOnlyFileLevelLocals(
  checker: ts.TypeChecker,
  statement: ts.Statement,
): ts.Identifier[] {
  if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
    return [];
  }
  if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
    return [statement.name];
  }
  if (ts.isModuleDeclaration(statement) && namespaceEmitsLocal(checker, statement, true)) {
    return [statement.name as ts.Identifier];
  }
  return [];
}

// TypeScript-to-Lua gives a named function expression a local by its name only
// when the function refers to itself.
function referencesItself(
  checker: ts.TypeChecker,
  fn: ts.FunctionExpression,
  name: ts.Identifier,
): boolean {
  const own = checker.getSymbolAtLocation(name)?.valueDeclaration;
  if (own === undefined) {
    return false;
  }
  const visit = (node: ts.Node): boolean => {
    if (isErasedTypeNode(node)) {
      return false;
    }
    if (
      ts.isIdentifier(node) &&
      node !== name &&
      checker.getSymbolAtLocation(node)?.valueDeclaration === own
    ) {
      return true;
    }
    return ts.forEachChild(node, visit) ?? false;
  };
  return ts.forEachChild(fn, visit) ?? false;
}

function isFileLevelVariable(declaration: ts.VariableDeclaration): boolean {
  const statement = declaration.parent.parent;
  return ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent);
}

function isExportedVariable(declaration: ts.VariableDeclaration): boolean {
  const statement = declaration.parent.parent;
  return ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword);
}

// Whether TypeScript-to-Lua lowers `node` as a statement of its own: the
// expression of an expression statement, a `for` initializer or incrementor,
// or a side of a comma that is one (`transformExpressionStatement`,
// `transformBinaryExpressionStatement`, `transformForStatement`).
function isLoweredAsStatement(node: ts.Expression): boolean {
  const parent = node.parent;
  if (ts.isExpressionStatement(parent)) {
    return true;
  }
  if (ts.isForStatement(parent)) {
    return parent.initializer === node || parent.incrementor === node;
  }
  return (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
    isLoweredAsStatement(parent)
  );
}

function isLengthMember(node: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === "length";
  }
  return (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteral(node.argumentExpression) &&
    node.argumentExpression.text === "length"
  );
}

// Whether TypeScript-to-Lua lowers `call` to `rawget`, by the called member's
// name alone (`tryTransformObjectPrototypeCall` in `builtins/object.js`).
function callsHasOwnProperty(call: ts.CallExpression): boolean {
  let callee: ts.Node = call.expression;
  while (isOuterExpression(callee)) {
    callee = callee.expression;
  }
  return ts.isPropertyAccessExpression(callee) && callee.name.text === "hasOwnProperty";
}

// Whether `call` is a Lua table or operator method extension call, whose
// receiver TypeScript-to-Lua transforms before its arguments
// (`getNaryCallExtensionArgs` in `utils/language-extensions.js`). An optional
// chain transforms its receiver as a temp, after the arguments.
function callsMethodExtension(checker: ts.TypeChecker, call: ts.CallExpression): boolean {
  if (ts.isOptionalChain(call)) {
    return false;
  }
  const callee = call.expression;
  if (!(ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))) {
    return false;
  }
  const brand = checker.getTypeAtLocation(callee).getProperty("__tstlExtension");
  if (brand === undefined) {
    return false;
  }
  const kind = checker.getTypeOfSymbolAtLocation(brand, callee);
  return kind.isStringLiteral() && (methodExtensionKinds as ReadonlySet<string>).has(kind.value);
}

// The children of `node` in the order TypeScript-to-Lua transforms them.
function childrenInTransformOrder(checker: ts.TypeChecker, node: ts.Node): readonly ts.Node[] {
  if (ts.isCallExpression(node)) {
    return callsHasOwnProperty(node) || callsMethodExtension(checker, node)
      ? [node.expression, ...node.arguments]
      : [...node.arguments, node.expression];
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    (isLoweredAsStatement(node) || !isLengthMember(node.left))
  ) {
    return [node.right, node.left];
  }
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

// The identifiers in `body` TypeScript-to-Lua transforms as values, in
// TypeScript-to-Lua 1.37.2's transform order: no type, property name after
// `.`, or object key. That order is the source's except for calls and
// assignments. A call's arguments come before the function it calls
// (`transformCallAndArguments` and `transformContextualCallExpression` in
// `visitors/call.js`, `transformOptionalChain`), except a `hasOwnProperty`
// call's receiver, which comes first, as does a method extension call's
// receiver outside an optional chain, and an assignment's right
// side before its left (`transformAssignmentStatement` and
// `transformAssignmentExpression` in `visitors/binary-expression/assignments.js`),
// except an assignment to a `length` member inside an expression, which keeps
// source order since `isArrayLength` lowers it left side first when the member
// is an array's. The type is not checked, so a non-array `length` member
// assigned inside an expression, with a spread on its left and a hoisted read on
// its right, is ordered wrongly.
function valueIdentifiers(checker: ts.TypeChecker, body: ts.Node): ts.Identifier[] {
  const found: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (isErasedTypeNode(node)) {
      return;
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isKey =
        ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) &&
          parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node);
      if (!isKey) {
        found.push(node);
      }
      return;
    }
    for (const child of childrenInTransformOrder(checker, node)) {
      visit(child);
    }
  };
  visit(body);
  return found;
}

type OuterExpression =
  | ts.ParenthesizedExpression
  | ts.TypeAssertion
  | ts.AsExpression
  | ts.SatisfiesExpression
  | ts.ExpressionWithTypeArguments
  | ts.NonNullExpression
  | ts.PartiallyEmittedExpression;

// TypeScript's own `isOuterExpression`, which its typings leave out.
function isOuterExpression(node: ts.Node): node is OuterExpression {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isExpressionWithTypeArguments(node) ||
    ts.isNonNullExpression(node) ||
    ts.isPartiallyEmittedExpression(node)
  );
}

// Whether `reference` is spread, and TypeScript-to-Lua transforms the spread
// in `fn`'s own Lua function: no nested function, class field, static block,
// `try` block or `catch` clause lies between them.
function isSpreadInOwnFunction(reference: ts.Identifier, fn: ts.Node): boolean {
  let parent = reference.parent;
  while (isOuterExpression(parent)) {
    parent = parent.parent;
  }
  if (!ts.isSpreadElement(parent)) {
    return false;
  }
  for (let node: ts.Node = parent; node !== fn; node = node.parent) {
    if (
      ts.isFunctionLike(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isClassStaticBlockDeclaration(node) ||
      ts.isCatchClause(node) ||
      (ts.isTryStatement(node.parent) && node.parent.tryBlock === node)
    ) {
      return false;
    }
  }
  return true;
}

function isWithin(node: ts.Node, ancestor: ts.Node): boolean {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

// TypeScript-to-Lua's `hasReferencedUndefinedLocalFunction`: a value read
// before the spread, in transform order, whose type is a function declared in
// `fn` makes it keep the rest as a table, since that function may run hoisted
// and change it, unless the value is a function `fn`'s body declares above the
// spread. Statements transform in source order, so "above" compares positions.
function readsHoistedFunctionBefore(
  checker: ts.TypeChecker,
  fn: ts.Node,
  body: ts.Node,
  identifiers: readonly ts.Identifier[],
  spread: ts.Identifier,
): boolean {
  const spreadStart = spread.getStart();
  for (const identifier of identifiers) {
    if (identifier === spread) {
      return false;
    }
    const type = checker.getTypeAtLocation(identifier);
    const isLocalFunction =
      type.getCallSignatures().length > 0 &&
      (type.symbol?.declarations?.some((d) => ts.isFunctionDeclaration(d) && isWithin(d, fn)) ??
        false);
    if (!isLocalFunction) {
      continue;
    }
    const isDeclaredAbove =
      referencedSymbol(checker, identifier)?.declarations?.some(
        (d) =>
          ts.isFunctionDeclaration(d) &&
          d.body !== undefined &&
          d.parent === body &&
          d.getStart() < spreadStart,
      ) ?? false;
    if (!isDeclaredAbove) {
      return true;
    }
  }
  return false;
}

// Mirrors TypeScript-to-Lua 1.37.2, which passes a rest parameter on as Lua's
// `...` and declares `local <name> = {...}` only when the body reads it some
// other way (`transformFunctionBodyHeader` in `visitors/function.js`,
// `isOptimizedVarArgSpread` in `visitors/spread.js`). A destructured rest and
// a constructor's rest always get a local, and an `async` function never
// passes a spread on. A form this does not recognize counts as declared: a
// spurious error is fixed by a rename, while a missed shadow fails only at
// runtime.
function restParameterEmitsLocal(checker: ts.TypeChecker, param: ts.ParameterDeclaration): boolean {
  const fn = param.parent;
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!ts.isIdentifier(param.name) || ts.isConstructorDeclaration(fn) || body === undefined) {
    return true;
  }
  const symbol = checker.getSymbolAtLocation(param.name);
  if (symbol === undefined) {
    return true;
  }
  const identifiers = valueIdentifiers(checker, body);
  const references = identifiers.filter((id) => referencedSymbol(checker, id) === symbol);
  if (references.length === 0) {
    return false;
  }
  if (hasModifier(fn, ts.SyntaxKind.AsyncKeyword)) {
    return true;
  }
  return references.some(
    (reference) =>
      !isSpreadInOwnFunction(reference, fn) ||
      readsHoistedFunctionBefore(checker, fn, body, identifiers, reference),
  );
}

// The names below a top-level statement that emit as a Lua `local` in a
// function, block or namespace. A namespace member with an `export` modifier
// goes on the namespace table instead, except a class or namespace, which keeps
// a local alias.
function innerLocals(
  checker: ts.TypeChecker,
  statement: ts.Statement,
  isModule: boolean,
): ts.Identifier[] {
  const names: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (hasModifier(node, ts.SyntaxKind.DeclareKeyword) || isErasedTypeNode(node)) {
      return;
    }
    if (ts.isParameter(node)) {
      if (
        hasBody(node.parent) &&
        (node.dotDotDotToken === undefined || restParameterEmitsLocal(checker, node))
      ) {
        bindingIdentifiers(node.name, names);
      }
    } else if (ts.isVariableDeclaration(node)) {
      if (!isFileLevelVariable(node) && !isExportedVariable(node)) {
        bindingIdentifiers(node.name, names);
      }
    } else if (ts.isFunctionDeclaration(node)) {
      if (
        node.name !== undefined &&
        node.body !== undefined &&
        !hasModifier(node, ts.SyntaxKind.ExportKeyword)
      ) {
        names.push(node.name);
      }
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      if (node.name !== undefined) {
        names.push(node.name);
      }
    } else if (ts.isEnumDeclaration(node)) {
      if (
        !hasModifier(node, ts.SyntaxKind.ConstKeyword) &&
        !hasModifier(node, ts.SyntaxKind.ExportKeyword)
      ) {
        names.push(node.name);
      }
    } else if (ts.isModuleDeclaration(node)) {
      if (namespaceEmitsLocal(checker, node, isModule)) {
        names.push(node.name as ts.Identifier);
      }
    } else if (ts.isFunctionExpression(node)) {
      if (node.name !== undefined && referencesItself(checker, node, node.name)) {
        names.push(node.name);
      }
    }
    ts.forEachChild(node, visit);
  };
  if (!hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
    ts.forEachChild(statement, visit);
  }
  return names;
}

/**
 * Reports each name of `sourceFile` that emits as a Lua `local` hiding a global,
 * which TypeScript-to-Lua's own safe-name set leaves unrenamed. By default, a
 * warning for each top-level, non-exported name, a chunk-wide local. Under
 * `"error"`, an error for every local at any scope.
 */
export function findLuaGlobalShadows(
  program: ts.Program,
  sourceFile: ts.SourceFile,
  mode: GlobalShadowsMode = "warn",
): ts.Diagnostic[] {
  if (sourceFile.isDeclarationFile) {
    return [];
  }
  // A file with no import or export is a script: its top-level names are the
  // globals themselves, and they emit as global assignments, not locals.
  const isModule = ts.isExternalModule(sourceFile);
  if (mode === "warn" && !isModule) {
    return [];
  }
  const checker = program.getTypeChecker();
  const resolver = (checker as TypeCheckerWithEmitResolver).getEmitResolver(sourceFile);
  const found: { identifier: ts.Identifier; fileLevel: boolean }[] = [];
  for (const statement of sourceFile.statements) {
    if (isModule) {
      const fileLevel = new Set(fileLevelLocals(statement, resolver));
      if (mode === "error") {
        for (const identifier of errorOnlyFileLevelLocals(checker, statement)) {
          fileLevel.add(identifier);
        }
      }
      for (const identifier of fileLevel) {
        found.push({ identifier, fileLevel: true });
      }
    }
    if (mode === "error") {
      for (const identifier of innerLocals(checker, statement, isModule)) {
        found.push({ identifier, fileLevel: false });
      }
    }
  }
  const diagnostics: ts.Diagnostic[] = [];
  for (const { identifier, fileLevel } of found) {
    const name = identifier.text;
    if (isUnsafeName(name, { luaTarget: tstl.LuaTarget.Lua51 }) || LOWERED_GLOBALS.has(name)) {
      continue;
    }
    if (!isLuaGlobal(program, checker, name)) {
      continue;
    }
    const start = identifier.getStart(sourceFile);
    diagnostics.push({
      file: sourceFile,
      start,
      length: identifier.getEnd() - start,
      category: mode === "error" ? ts.DiagnosticCategory.Error : ts.DiagnosticCategory.Warning,
      code: LUA_GLOBAL_SHADOW_CODE,
      messageText: fileLevel ? luaGlobalShadowMessage(name) : luaLocalShadowMessage(name),
    });
  }
  return diagnostics.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

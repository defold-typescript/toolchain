import * as ts from "typescript";
import type { EmitResolver, TypeCheckerWithEmitResolver } from "typescript-to-lua";
import * as tstl from "typescript-to-lua";
import { isUnsafeName } from "typescript-to-lua/dist/transformation/utils/safe-names.js";
import { isEditorFactoryOnlyImport } from "./editor-script-erasure";
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
    if (ts.isTypeNode(node)) {
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
    if (hasModifier(node, ts.SyntaxKind.DeclareKeyword) || ts.isTypeNode(node)) {
      return;
    }
    if (ts.isParameter(node)) {
      if (hasBody(node.parent)) {
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

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

export function luaGlobalShadowMessage(name: string): string {
  return `\`${name}\` is a file-level Lua local that hides the global \`${name}\` throughout this file, including Lua the build generates here; rename it.`;
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

// A global the Lua runtime provides: a value the program's global scope declares
// outside TypeScript's default library and the TypeScript-to-Lua language
// extensions, which describe nothing at runtime.
function isLuaGlobal(program: ts.Program, checker: ts.TypeChecker, name: string): boolean {
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

/**
 * Warns on each top-level, non-exported name of `sourceFile` that emits as a
 * chunk-wide Lua `local` hiding a global, which TypeScript-to-Lua's own
 * safe-name set leaves unrenamed.
 */
export function findLuaGlobalShadows(
  program: ts.Program,
  sourceFile: ts.SourceFile,
): ts.Diagnostic[] {
  // A file with no import or export is a script: its top-level names are the
  // globals themselves, and they emit as global assignments, not locals.
  if (sourceFile.isDeclarationFile || !ts.isExternalModule(sourceFile)) {
    return [];
  }
  const checker = program.getTypeChecker();
  const resolver = (checker as TypeCheckerWithEmitResolver).getEmitResolver(sourceFile);
  const diagnostics: ts.Diagnostic[] = [];
  for (const statement of sourceFile.statements) {
    for (const identifier of fileLevelLocals(statement, resolver)) {
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
        category: ts.DiagnosticCategory.Warning,
        code: 0,
        messageText: luaGlobalShadowMessage(name),
      });
    }
  }
  return diagnostics;
}

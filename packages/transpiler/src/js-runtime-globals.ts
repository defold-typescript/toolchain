import * as ts from "typescript";
import { isErasedTypeNode } from "./erased-type-nodes";

const URI_REPLACEMENT = "Defold has no equivalent, so encode by hand with `string.gsub`";

/**
 * The JavaScript globals the Lua compile's lib declares that TypeScript-to-Lua
 * lowers in no form, so every reference reads a nil Lua global, each mapped to
 * the Defold replacement ("" when there is none). `js-runtime-globals.test.ts`
 * measures the set from the compiler and fails when it drifts.
 */
export const MISSING_JS_GLOBALS: ReadonlyMap<string, string> = new Map([
  ["AggregateError", ""],
  ["ArrayBuffer", ""],
  ["Atomics", ""],
  ["BigInt", ""],
  ["BigInt64Array", ""],
  ["BigUint64Array", ""],
  ["Boolean", ""],
  ["DataView", ""],
  ["Date", "use `os.time`, `os.date` and `socket.gettime`"],
  ["decodeURI", URI_REPLACEMENT],
  ["decodeURIComponent", URI_REPLACEMENT],
  ["encodeURI", URI_REPLACEMENT],
  ["encodeURIComponent", URI_REPLACEMENT],
  ["escape", ""],
  ["eval", ""],
  ["EvalError", ""],
  ["FinalizationRegistry", ""],
  ["Float32Array", ""],
  ["Float64Array", ""],
  ["Int16Array", ""],
  ["Int32Array", ""],
  ["Int8Array", ""],
  ["Intl", ""],
  ["JSON", "use `json.encode` and `json.decode`"],
  ["Proxy", ""],
  ["Reflect", ""],
  ["RegExp", "use Lua patterns with `string.find`, `string.match` and `string.gsub`"],
  ["SharedArrayBuffer", ""],
  ["Uint16Array", ""],
  ["Uint32Array", ""],
  ["Uint8Array", ""],
  ["Uint8ClampedArray", ""],
  ["unescape", ""],
  ["WeakRef", ""],
]);

// Outside TypeScript's own ranges and TypeScript-to-Lua's serial range, which
// starts at 100000, so the code alone identifies the diagnostic.
export const MISSING_JS_GLOBAL_CODE = 990_001;

export function isMissingJsGlobalDiagnostic(diagnostic: ts.Diagnostic): boolean {
  return diagnostic.code === MISSING_JS_GLOBAL_CODE;
}

export function missingJsGlobalMessage(name: string): string {
  const replacement = MISSING_JS_GLOBALS.get(name);
  const problem = `\`${name}\` does not exist in Defold's Lua, so this reference reads nil at runtime`;
  return replacement ? `${problem}; ${replacement}.` : `${problem}.`;
}

// Declared only by TypeScript's default library: a declaration anywhere else
// (a project `.d.ts`, a native extension's types) means the runtime provides it.
function isDefaultLibraryOnly(program: ts.Program, symbol: ts.Symbol): boolean {
  const declarations = symbol.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every((declaration) =>
      program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
    )
  );
}

/**
 * The symbol whose value `identifier` reads: for a shorthand property such as
 * `{ JSON }`, the variable rather than the new property.
 */
export function referencedSymbol(
  checker: ts.TypeChecker,
  identifier: ts.Identifier,
): ts.Symbol | undefined {
  const parent = identifier.parent;
  // `{ JSON }` reads the global; the symbol at the name is the new property.
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === identifier) {
    return checker.getShorthandAssignmentValueSymbol(parent);
  }
  return checker.getSymbolAtLocation(identifier);
}

/**
 * Errors on each value reference in `sourceFile` to a JavaScript global that
 * TypeScript-to-Lua emits as a bare Lua global and no Lua or Defold declaration
 * provides, so the reference reads nil when the engine runs it.
 */
export function findMissingJsGlobals(
  program: ts.Program,
  sourceFile: ts.SourceFile,
): ts.Diagnostic[] {
  if (sourceFile.isDeclarationFile) {
    return [];
  }
  const checker = program.getTypeChecker();
  const diagnostics: ts.Diagnostic[] = [];
  const visit = (node: ts.Node): void => {
    if (isErasedTypeNode(node)) {
      return;
    }
    if (ts.isIdentifier(node)) {
      if (!MISSING_JS_GLOBALS.has(node.text)) {
        return;
      }
      const symbol = referencedSymbol(checker, node);
      if (symbol === undefined || !isDefaultLibraryOnly(program, symbol)) {
        return;
      }
      const start = node.getStart(sourceFile);
      diagnostics.push({
        file: sourceFile,
        start,
        length: node.getEnd() - start,
        category: ts.DiagnosticCategory.Error,
        code: MISSING_JS_GLOBAL_CODE,
        messageText: missingJsGlobalMessage(node.text),
      });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return diagnostics;
}

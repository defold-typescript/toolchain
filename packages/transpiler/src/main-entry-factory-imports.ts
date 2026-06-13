import * as ts from "typescript";
import { FACTORY_MODULE, FACTORY_NAMES } from "./lifecycle-erasure";

// A walled source narrows only its ambient `types`; importing a factory from the
// bare main entry (`@defold-typescript/types`) still pulls the cross-kind
// `declare global` namespaces and silently re-defeats the wall. The sanctioned
// `@defold-typescript/types/<kind>` subpath imports are never flagged.
export function findMainEntryFactoryImports(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const factories: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier) || specifier.text !== FACTORY_MODULE) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (FACTORY_NAMES.has(imported)) {
        factories.push(imported);
      }
    }
  }
  return factories;
}

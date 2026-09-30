import * as ts from "typescript";
import { factoryHooks, isPropertiesHook, propertyMembers } from "./lifecycle-erasure";

export interface TextScriptPropertyFinding {
  readonly name: string;
  readonly file: string;
  /** 1-based line of the default's initializer. */
  readonly line: number;
  /** 1-based column of the default's initializer. */
  readonly column: number;
}

// The script properties whose default is a string. Defold registers a string
// `go.property` only from 1.13.2, so a build for an older target must refuse
// them; typed rather than literal-driven, so a const holding a string counts.
export function findTextScriptProperties(
  program: ts.Program,
  fileNames: readonly string[],
): TextScriptPropertyFinding[] {
  const checker = program.getTypeChecker();
  const findings: TextScriptPropertyFinding[] = [];

  for (const file of fileNames) {
    const sourceFile = program.getSourceFile(file);
    if (sourceFile === undefined) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const hooks = factoryHooks(node, checker);
        for (const property of hooks?.properties ?? []) {
          if (!isPropertiesHook(property)) {
            continue;
          }
          for (const { name, initializer } of propertyMembers(property)) {
            if (!(checker.getTypeAtLocation(initializer).flags & ts.TypeFlags.StringLike)) {
              continue;
            }
            const position = sourceFile.getLineAndCharacterOfPosition(
              initializer.getStart(sourceFile),
            );
            findings.push({
              name,
              file,
              line: position.line + 1,
              column: position.character + 1,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return findings;
}

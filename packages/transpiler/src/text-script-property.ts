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

// The script properties whose default may hold a string. Defold registers a
// string `go.property` only from 1.13.2, so a build for an older target must
// refuse them; typed rather than literal-driven, so a const holding a string
// counts.
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
            if (!mayHoldString(checker.getTypeAtLocation(initializer), checker)) {
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

/**
 * Whether a value of `type` may be a string at runtime: a string-like type, a
 * union or intersection with such a member, or a type parameter or other
 * instantiable type whose constraint may hold one.
 */
export function mayHoldString(
  type: ts.Type,
  checker: ts.TypeChecker,
  visited: Set<ts.Type> = new Set(),
): boolean {
  if (visited.has(type)) {
    return false;
  }
  visited.add(type);
  if (type.flags & ts.TypeFlags.StringLike) {
    return true;
  }
  if (type.isUnionOrIntersection()) {
    return type.types.some((member) => mayHoldString(member, checker, visited));
  }
  if (type.flags & ts.TypeFlags.Instantiable) {
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint !== undefined && constraint !== type
      ? mayHoldString(constraint, checker, visited)
      : false;
  }
  return false;
}

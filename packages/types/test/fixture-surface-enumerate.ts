import * as ts from "typescript";

export type DeclaredKind = "function" | "value" | "type" | "interface" | "enum";

export interface DeclaredSymbol {
  kind: DeclaredKind;
}

/**
 * AST-based enumeration of every declared symbol in a `.d.ts` surface, keyed by
 * its full dotted namespace path. Unlike the regex line-walker in
 * `doc-surface-extract.ts`, this tracks namespace frames through the real AST, so
 * interface/type bodies never corrupt the frame stack and type aliases,
 * interfaces, and enums are captured alongside functions and values. The
 * `declare global { ... }` augmentation wrapper contributes no name segment.
 */
export function enumerateDeclaredSymbols(
  source: string,
  fileName = "surface.d.ts",
): Map<string, DeclaredSymbol> {
  const out = new Map<string, DeclaredSymbol>();
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  const stack: string[] = [];

  const record = (name: string, kind: DeclaredKind): void => {
    const key = [...stack, name].join(".");
    if (!out.has(key)) out.set(key, { kind });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isModuleDeclaration(node)) {
      const isGlobalAugmentation = (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
      const named = ts.isIdentifier(node.name) && !isGlobalAugmentation;
      if (named) stack.push(node.name.text);
      if (node.body) visit(node.body);
      if (named) stack.pop();
      return;
    }
    if (ts.isModuleBlock(node)) {
      for (const stmt of node.statements) visit(stmt);
      return;
    }
    if (ts.isFunctionDeclaration(node)) {
      if (node.name) record(node.name.text, "function");
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) record(decl.name.text, "value");
      }
      return;
    }
    if (ts.isTypeAliasDeclaration(node)) {
      record(node.name.text, "type");
      return;
    }
    if (ts.isInterfaceDeclaration(node)) {
      record(node.name.text, "interface");
      return;
    }
    if (ts.isEnumDeclaration(node)) {
      record(node.name.text, "enum");
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return out;
}

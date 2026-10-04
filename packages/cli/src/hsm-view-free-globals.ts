import * as ts from "typescript";

// An identifier in one of these slots names a member, key or label, never a binding a scope resolves.
function isNameSlot(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (ts.isPropertyAccessExpression(parent)) {
    return parent.name === id;
  }
  if (ts.isQualifiedName(parent)) {
    return parent.right === id;
  }
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent)
  ) {
    return parent.name === id;
  }
  if (ts.isBindingElement(parent) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) {
    return parent.propertyName === id;
  }
  if (
    ts.isLabeledStatement(parent) ||
    ts.isBreakStatement(parent) ||
    ts.isContinueStatement(parent)
  ) {
    return parent.label === id;
  }
  return ts.isMetaProperty(parent);
}

function addBindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      addBindingNames(element.name, into);
    }
  }
}

function addDeclaredNames(node: ts.Node, into: Set<string>): void {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    addBindingNames(node.name, into);
  } else if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node)) &&
    node.name !== undefined
  ) {
    into.add(node.name.text);
  } else if (ts.isImportClause(node) && node.name !== undefined) {
    into.add(node.name.text);
  } else if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node)) {
    into.add(node.name.text);
  }
}

/**
 * The names a JavaScript module reads without declaring them anywhere in the file, sorted.
 * Scopes are flattened: a name declared at any depth is never free, so a stub can never shadow a
 * local, at the cost of a global that one scope reads while another declares the same name.
 */
export function freeGlobals(js: string): string[] {
  const source = ts.createSourceFile(
    "module.js",
    js,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declared = new Set<string>(["arguments"]);
  const referenced = new Set<string>();
  const visit = (node: ts.Node): void => {
    addDeclaredNames(node, declared);
    if (ts.isIdentifier(node) && !isNameSlot(node)) {
      referenced.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...referenced].filter((name) => !declared.has(name)).sort();
}

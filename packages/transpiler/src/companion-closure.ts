import * as ts from "typescript";
import { resolvesToFactoryExport } from "./lifecycle-erasure";

/**
 * The exports-table field a companion exposes its private members on. Reserving
 * one name keeps the field collision-safe without mangling every internal name,
 * which is why a source exporting it is rejected rather than shadowed.
 */
export const COMPANION_INTERNAL_FIELD = "____closure";

export type ClosureViolationKind =
  | "shared-mutable"
  | "initialization-order"
  | "reserved-internal-name";

export interface ClosureSite {
  /** What this position is — the phrase the message uses for it. */
  readonly role: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
}

export interface ClosureViolation {
  readonly kind: ClosureViolationKind;
  /** The declaration the split cannot preserve. */
  readonly member: string;
  readonly sites: readonly ClosureSite[];
  readonly message: string;
}

export interface CompanionClosure {
  /** Top-level declarations that would move into the companion, in source order. */
  readonly members: readonly string[];
  /** The runtime value exports that open the companion, in source order. */
  readonly exports: readonly string[];
  /** Members outside `exports` the script still references, in source order. */
  readonly internals: readonly string[];
  /**
   * The top-level statements carrying those members, in source order. A
   * statement, not a name, is what the emit actually moves: one `const a = 1, b
   * = 2;` is two members and one unit of code.
   */
  readonly statements: readonly ts.Statement[];
  /**
   * Import bindings the closure reaches, in source order. An import is copyable
   * rather than movable — its statement never appears in `statements` — so the
   * companion takes its own `require` of the same module instead.
   */
  readonly importBindings: readonly string[];
  /** Shapes a split cannot preserve. Empty means the source is splittable. */
  readonly violations: readonly ClosureViolation[];
}

/**
 * One runtime value export. The public `name` is what a consumer sees and what
 * the reserved-field rule judges; `symbol` is the local binding the dependency
 * closure walks, and the two differ under an alias.
 */
interface ExportEntry {
  readonly symbol: ts.Symbol;
  readonly name: string;
  /** Where the diagnostic points. */
  readonly nameNode: ts.Node;
}

interface TopLevelDecl {
  readonly name: string;
  /** The whole statement, which moves or stays as a unit. */
  readonly statement: ts.Statement;
  /** The individual declaration, walked for the references it reaches. */
  readonly node: ts.Node;
  readonly order: number;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

// A type annotation naming a value import must not drag it into the closure:
// the annotation is erased, so it can reach nothing at runtime.
function isTypePosition(node: ts.Node): boolean {
  let current = node.parent;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isTypeNode(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (parent === undefined) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent)) {
    return parent.name === node;
  }
  if (ts.isQualifiedName(parent)) {
    return parent.right === node;
  }
  if (
    (ts.isBindingElement(parent) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) &&
    parent.propertyName === node
  ) {
    return true;
  }
  const named = parent as ts.Node & { readonly name?: ts.Node };
  if (named.name !== node) {
    return false;
  }
  return (
    ts.isVariableDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isClassDeclaration(parent) ||
    ts.isEnumDeclaration(parent) ||
    ts.isEnumMember(parent) ||
    ts.isParameter(parent) ||
    ts.isBindingElement(parent) ||
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isGetAccessor(parent) ||
    ts.isSetAccessor(parent)
  );
}

function forEachReference(
  root: ts.Node,
  checker: ts.TypeChecker,
  visit: (node: ts.Identifier, symbol: ts.Symbol) => void,
): void {
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && !isDeclarationName(node) && !isTypePosition(node)) {
      const symbol = resolveReferencedSymbol(node, checker);
      if (symbol !== undefined) {
        visit(node, symbol);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(root);
}

// `getSymbolAtLocation` on a shorthand property's name yields the *property*
// symbol, so `{ count }` would name neither the binding it reads nor the one a
// destructuring assignment rebinds.
function resolveReferencedSymbol(
  node: ts.Identifier,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  const parent = node.parent;
  if (parent !== undefined && ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
    return checker.getShorthandAssignmentValueSymbol(parent) ?? checker.getSymbolAtLocation(node);
  }
  return checker.getSymbolAtLocation(node);
}

/**
 * Every position the source writes to, classified structurally. Recursing
 * through parentheses and destructuring patterns is what separates a rebinding
 * — which a split cannot carry — from a property or element write, which is
 * shared by reference and stays safe.
 */
function forEachAssignmentTarget(
  root: ts.Node,
  checker: ts.TypeChecker,
  visit: (node: ts.Identifier, symbol: ts.Symbol) => void,
): void {
  const classify = (target: ts.Node): void => {
    if (ts.isParenthesizedExpression(target)) {
      classify(target.expression);
      return;
    }
    if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
      return;
    }
    if (ts.isArrayLiteralExpression(target)) {
      for (const element of target.elements) {
        if (ts.isOmittedExpression(element)) {
          continue;
        }
        if (ts.isSpreadElement(element)) {
          classify(element.expression);
        } else if (
          ts.isBinaryExpression(element) &&
          element.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          classify(element.left);
        } else {
          classify(element);
        }
      }
      return;
    }
    if (ts.isObjectLiteralExpression(target)) {
      for (const property of target.properties) {
        if (ts.isPropertyAssignment(property)) {
          classify(property.initializer);
        } else if (ts.isSpreadAssignment(property)) {
          classify(property.expression);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          const symbol = checker.getShorthandAssignmentValueSymbol(property);
          if (symbol !== undefined) {
            visit(property.name, symbol);
          }
        }
      }
      return;
    }
    if (ts.isIdentifier(target)) {
      const symbol = checker.getSymbolAtLocation(target);
      if (symbol !== undefined) {
        visit(target, symbol);
      }
    }
  };

  const walk = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      classify(node.left);
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      classify(node.operand);
    } else if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer)
    ) {
      classify(node.initializer);
    }
    ts.forEachChild(node, walk);
  };
  walk(root);
}

function collectTopLevel(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): Map<ts.Symbol, TopLevelDecl> {
  const declarations = new Map<ts.Symbol, TopLevelDecl>();
  let order = 0;

  const add = (name: ts.Node | undefined, statement: ts.Statement, node: ts.Node): void => {
    if (name === undefined || !ts.isIdentifier(name)) {
      return;
    }
    const symbol = checker.getSymbolAtLocation(name);
    if (symbol === undefined || declarations.has(symbol)) {
      return;
    }
    declarations.set(symbol, { name: name.text, statement, node, order: order++ });
  };

  const addBinding = (name: ts.BindingName, statement: ts.Statement, node: ts.Node): void => {
    if (ts.isIdentifier(name)) {
      add(name, statement, node);
      return;
    }
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        addBinding(element.name, statement, node);
      }
    }
  };

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        addBinding(declaration.name, statement, declaration);
      }
    } else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      add(statement.name, statement, statement);
    } else if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause === undefined) {
        continue;
      }
      add(clause.name, statement, statement);
      const bindings = clause.namedBindings;
      if (bindings === undefined) {
        continue;
      }
      if (ts.isNamespaceImport(bindings)) {
        add(bindings.name, statement, statement);
      } else {
        for (const element of bindings.elements) {
          add(element.name, statement, statement);
        }
      }
    }
  }

  return declarations;
}

function hasExportModifier(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

// Runtime value meaning, not the `export` keyword: `export type` and
// `export interface` are erased before emit and never open a companion.
function isValueSymbol(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): boolean {
  if (symbol === undefined) {
    return false;
  }
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return (resolved.flags & ts.SymbolFlags.Value) !== 0;
}

/**
 * The source's runtime value exports, in source order. A default export is
 * excluded: on a script-kind source it is the lifecycle factory result, which
 * erasure removes and no companion can carry.
 */
function collectExports(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  topLevel: Map<ts.Symbol, TopLevelDecl>,
): ExportEntry[] {
  const exported: ExportEntry[] = [];
  const seen = new Set<string>();

  const take = (symbol: ts.Symbol | undefined, name: string, nameNode: ts.Node): void => {
    const declaration = symbol && topLevel.get(symbol);
    if (symbol === undefined || declaration === undefined) {
      return;
    }
    if (!isValueSymbol(symbol, checker)) {
      return;
    }
    // The pair, not the symbol: `export { value as a, value as b }` is two
    // exports of one member.
    const key = `${declaration.order} ${name}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    exported.push({ symbol, name, nameNode });
  };

  const takeLocal = (symbol: ts.Symbol | undefined, name: ts.Identifier): void => {
    const declaration = symbol && topLevel.get(symbol);
    if (declaration === undefined) {
      return;
    }
    take(symbol, name.text, declaration.node);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier !== undefined || statement.isTypeOnly) {
        continue;
      }
      const clause = statement.exportClause;
      if (clause === undefined || !ts.isNamedExports(clause)) {
        continue;
      }
      for (const element of clause.elements) {
        if (element.isTypeOnly) {
          continue;
        }
        take(checker.getExportSpecifierLocalTargetSymbol(element), element.name.text, element.name);
      }
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        forEachDeclaredName(declaration.name, (name) =>
          takeLocal(checker.getSymbolAtLocation(name), name),
        );
      }
    } else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name !== undefined) {
        takeLocal(checker.getSymbolAtLocation(statement.name), statement.name);
      }
    }
  }

  return exported;
}

function forEachDeclaredName(name: ts.BindingName, visit: (name: ts.Identifier) => void): void {
  if (ts.isIdentifier(name)) {
    visit(name);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      forEachDeclaredName(element.name, visit);
    }
  }
}

function isLifecycleFactoryCall(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  return ts.isCallExpression(expression) && resolvesToFactoryExport(expression.expression, checker);
}

function isEffectFreeExpression(expression: ts.Expression | undefined): boolean {
  if (expression === undefined) {
    return true;
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return isEffectFreeExpression(expression.expression);
  }
  if (ts.isIdentifier(expression) || ts.isLiteralExpression(expression)) {
    return true;
  }
  switch (expression.kind) {
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.ThisKeyword:
      return true;
    default:
      break;
  }
  if (ts.isFunctionExpression(expression) || ts.isArrowFunction(expression)) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    return (
      expression.operator !== ts.SyntaxKind.PlusPlusToken &&
      expression.operator !== ts.SyntaxKind.MinusMinusToken &&
      isEffectFreeExpression(expression.operand)
    );
  }
  if (ts.isBinaryExpression(expression)) {
    return (
      !isAssignmentOperator(expression.operatorToken.kind) &&
      isEffectFreeExpression(expression.left) &&
      isEffectFreeExpression(expression.right)
    );
  }
  if (ts.isConditionalExpression(expression)) {
    return (
      isEffectFreeExpression(expression.condition) &&
      isEffectFreeExpression(expression.whenTrue) &&
      isEffectFreeExpression(expression.whenFalse)
    );
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.every(isEffectFreeExpression);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.every((property) => {
      if (ts.isPropertyAssignment(property)) {
        return isEffectFreeExpression(property.initializer);
      }
      return ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property);
    });
  }
  return false;
}

/**
 * Whether a top-level statement can be reordered across the companion's load
 * without changing what the source does. Judged syntactically and
 * conservatively: anything not recognized is assumed effectful.
 *
 * Statements the emit erases are effect-free because they cannot reach the
 * output at all. That covers a factory-only import, elided by
 * `isFactoryOnlyImport`, and the lifecycle factory call itself, which erasure
 * rewrites into hook function declarations — plain assignments that no
 * companion load can observe. Classifying either as effectful would report the
 * ordinary opening of essentially every source this analysis serves.
 */
function isEffectFreeStatement(statement: ts.Statement, checker: ts.TypeChecker): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isExportDeclaration(statement)
  ) {
    return true;
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.every((declaration) =>
      isEffectFreeExpression(declaration.initializer),
    );
  }
  if (ts.isExpressionStatement(statement)) {
    return (
      isLifecycleFactoryCall(statement.expression, checker) ||
      isEffectFreeExpression(statement.expression)
    );
  }
  if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
    return (
      isLifecycleFactoryCall(statement.expression, checker) ||
      isEffectFreeExpression(statement.expression)
    );
  }
  return false;
}

function siteOf(node: ts.Node, role: string): ClosureSite {
  const sourceFile = node.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { role, line: line + 1, column: character + 1 };
}

function formatSites(sites: readonly ClosureSite[]): string {
  return sites.map((site) => `${site.role} at ${site.line}:${site.column}`).join(", ");
}

function bySourcePosition(a: ClosureSite, b: ClosureSite): number {
  return a.line === b.line ? a.column - b.column : a.line - b.line;
}

/**
 * Which of a script-kind source's top-level declarations would move into a
 * companion module, and the shapes a split cannot preserve.
 *
 * The companion holds the transitive closure of top-level declarations
 * reachable from the source's runtime value exports; everything else stays in
 * the script and runs there once. Two shapes break that split — a binding
 * reassigned on one side and read on the other, which a Lua local cannot carry,
 * and effectful top-level work the split would reorder — and both are reported
 * against the source rather than emitted.
 */
export function computeCompanionClosure(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): CompanionClosure {
  const topLevel = collectTopLevel(sourceFile, checker);
  const exportEntries = collectExports(sourceFile, checker, topLevel);

  // Which statement declares a binding is what the emit moves, so the walk
  // reaches its fixpoint over statements rather than names: moving one makes
  // every binding it declares a member, and those bindings' own references
  // extend the closure again. Without that, `const a = 1, b = p + 1` carries `b`
  // across while leaving `p` behind, and the companion reads an unbound global.
  const siblingsOf = new Map<ts.Statement, ts.Symbol[]>();
  for (const [symbol, declaration] of topLevel) {
    siblingsOf.set(declaration.statement, [
      ...(siblingsOf.get(declaration.statement) ?? []),
      symbol,
    ]);
  }

  const memberSymbols = new Set<ts.Symbol>();
  const importBindingSymbols = new Set<ts.Symbol>();
  const closureStatements = new Set<ts.Statement>();
  const queue: ts.Symbol[] = exportEntries.map((entry) => entry.symbol);
  while (queue.length > 0) {
    const symbol = queue.pop();
    if (symbol === undefined || memberSymbols.has(symbol)) {
      continue;
    }
    memberSymbols.add(symbol);
    const declaration = topLevel.get(symbol);
    if (declaration === undefined) {
      continue;
    }
    // An import is copyable, not movable: TSTL emits its `require` bindings
    // through its own hoisting, so there is no statement here to move.
    if (ts.isImportDeclaration(declaration.statement)) {
      importBindingSymbols.add(symbol);
      continue;
    }
    if (!closureStatements.has(declaration.statement)) {
      closureStatements.add(declaration.statement);
      for (const sibling of siblingsOf.get(declaration.statement) ?? []) {
        if (!memberSymbols.has(sibling)) {
          queue.push(sibling);
        }
      }
    }
    forEachReference(declaration.node, checker, (_node, referenced) => {
      if (topLevel.has(referenced) && !memberSymbols.has(referenced)) {
        queue.push(referenced);
      }
    });
  }

  // An export declaration is the machinery that opens the companion, so it
  // travels with what it reads: leaving it behind makes the script assign a
  // local it no longer binds, into a table every importer has already loaded.
  const splits = closureStatements.size > 0;
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
      continue;
    }
    if (statement.moduleSpecifier !== undefined) {
      // A re-export's whole emitted block is export machinery, with no local
      // half to keep, so it moves whenever the source splits at all.
      if (splits) {
        closureStatements.add(statement);
      }
      continue;
    }
    const clause = statement.exportClause;
    if (clause === undefined || !ts.isNamedExports(clause)) {
      continue;
    }
    const readsMember = clause.elements.some((element) => {
      if (element.isTypeOnly) {
        return false;
      }
      const local = checker.getExportSpecifierLocalTargetSymbol(element);
      return local !== undefined && memberSymbols.has(local);
    });
    if (readsMember) {
      closureStatements.add(statement);
    }
  }

  // Reassignment anywhere in the source, the companion side included: that is
  // what the `increment()` shape turns on, where nothing in the script assigns.
  const mutations = new Map<ts.Symbol, ts.Identifier[]>();
  forEachAssignmentTarget(sourceFile, checker, (node, symbol) => {
    if (!memberSymbols.has(symbol)) {
      return;
    }
    mutations.set(symbol, [...(mutations.get(symbol) ?? []), node]);
  });

  // The script is every top-level statement outside the closure. An export
  // declaration is neither: it is the machinery that opens the companion, not
  // code that runs in the script.
  const scriptReferences = new Map<ts.Symbol, ts.Identifier[]>();
  for (const statement of sourceFile.statements) {
    if (closureStatements.has(statement) || ts.isExportDeclaration(statement)) {
      continue;
    }
    forEachReference(statement, checker, (node, symbol) => {
      if (memberSymbols.has(symbol)) {
        scriptReferences.set(symbol, [...(scriptReferences.get(symbol) ?? []), node]);
      }
    });
  }

  const ordered = [...memberSymbols]
    .flatMap((symbol) => {
      const declaration = topLevel.get(symbol);
      return declaration === undefined ? [] : [{ symbol, declaration }];
    })
    .sort((a, b) => a.declaration.order - b.declaration.order);

  const exportSet = new Set(exportEntries.map((entry) => entry.symbol));
  const violations: ClosureViolation[] = [];

  for (const { symbol, declaration } of ordered) {
    const mutated = mutations.get(symbol);
    const referenced = scriptReferences.get(symbol);
    if (mutated === undefined || referenced === undefined) {
      continue;
    }
    const sites = [
      ...mutated.map((node) => siteOf(node, "reassigned")),
      ...referenced.map((node) => siteOf(node, "read by the script")),
    ]
      .filter(
        (site, index, all) =>
          all.findIndex((other) => other.line === site.line && other.column === site.column) ===
          index,
      )
      .sort(bySourcePosition);
    violations.push({
      kind: "shared-mutable",
      member: declaration.name,
      sites,
      message:
        `"${declaration.name}" is reassigned and is also used outside the companion, ` +
        `so the script's copy would never see the update (${formatSites(sites)}). ` +
        "Move that state into a source with no lifecycle factory.",
    });
  }

  for (const entry of exportEntries) {
    if (entry.name !== COMPANION_INTERNAL_FIELD) {
      continue;
    }
    const sites = [siteOf(entry.nameNode, "exported")];
    violations.push({
      kind: "reserved-internal-name",
      member: entry.name,
      sites,
      message:
        `"${COMPANION_INTERNAL_FIELD}" is reserved for the companion's own internals ` +
        `and cannot be exported (${formatSites(sites)}). Rename the export.`,
    });
  }

  // The companion loads as a unit, so the constraint is pairwise: any effectful
  // script statement with any closure declaration below it is reordered by the
  // split, whatever the first member's position.
  for (const statement of sourceFile.statements) {
    if (closureStatements.has(statement) || isEffectFreeStatement(statement, checker)) {
      continue;
    }
    const start = statement.getStart(sourceFile);
    const hoisted = ordered.find(
      (entry) => entry.declaration.statement.getStart(sourceFile) > start,
    );
    if (hoisted === undefined) {
      continue;
    }
    const sites = [
      siteOf(statement, "runs in the script"),
      siteOf(hoisted.declaration.node, "moves into the companion"),
    ];
    violations.push({
      kind: "initialization-order",
      member: hoisted.declaration.name,
      sites,
      message:
        `top-level work precedes "${hoisted.declaration.name}", which the companion would run first, ` +
        `reversing their order (${formatSites(sites)}). ` +
        "Move that work below the companion's declarations, or into a lifecycle hook.",
    });
  }

  return {
    members: ordered.map(({ declaration }) => declaration.name),
    exports: exportEntries.map((entry) => entry.name),
    statements: sourceFile.statements.filter((statement) => closureStatements.has(statement)),
    importBindings: ordered
      .filter(({ symbol }) => importBindingSymbols.has(symbol))
      .map(({ declaration }) => declaration.name),
    internals: ordered
      .filter(({ symbol }) => !exportSet.has(symbol) && scriptReferences.has(symbol))
      .map(({ declaration }) => declaration.name),
    violations,
  };
}

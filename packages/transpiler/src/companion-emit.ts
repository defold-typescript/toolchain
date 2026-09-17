import * as ts from "typescript";
import {
  createAssignmentStatement,
  createCallExpression,
  createFile,
  createIdentifier,
  createReturnStatement,
  createStringLiteral,
  createTableExpression,
  createTableFieldExpression,
  createTableIndexExpression,
  createVariableDeclarationStatement,
  isBlock,
  isCallExpression,
  isDoStatement,
  isForInStatement,
  isForStatement,
  isFunctionDefinition,
  isFunctionExpression,
  isIdentifier,
  isMethodCallExpression,
  isRepeatStatement,
  isReturnStatement,
  isStringLiteral,
  isTableExpression,
  isVariableDeclarationStatement,
  LuaPrinter,
  type Node,
  type Plugin,
  type ProcessedFile,
  type Statement,
  type TransformationContext,
} from "typescript-to-lua";
import { COMPANION_INTERNAL_FIELD, computeCompanionClosure } from "./companion-closure";
import { resolvesToFactoryExport } from "./lifecycle-erasure";
import { requirePathForRel } from "./output-paths";

/** The table TSTL opens every module chunk with and returns from it. */
const EXPORTS_NAME = "____exports";

function exportsIdentifier() {
  return createIdentifier(EXPORTS_NAME);
}

/**
 * Whether the source owns Defold lifecycle hooks, which is what makes its output
 * a component resource rather than a requirable module. Only the three runtime
 * kinds split: an editor script's chunk returns its own hooks table instead of
 * `____exports`, so the halves a split would produce are not the halves below.
 */
function isRuntimeScriptSource(sourceFile: ts.SourceFile, checker: ts.TypeChecker): boolean {
  return sourceFile.statements.some((statement) => {
    const expression = ts.isExpressionStatement(statement)
      ? statement.expression
      : ts.isExportAssignment(statement) && !statement.isExportEquals
        ? statement.expression
        : undefined;
    return (
      expression !== undefined &&
      ts.isCallExpression(expression) &&
      resolvesToFactoryExport(expression.expression, checker)
    );
  });
}

interface CompanionPlan {
  /** Full start of each top-level statement the companion takes over. */
  readonly closureStarts: ReadonlySet<number>;
  /** Members the script reaches by bare name, which the companion must expose. */
  readonly internals: readonly string[];
  /** Import bindings the companion needs its own `require` of. */
  readonly importBindings: readonly string[];
  /** The module path the script's `require` names. */
  readonly requirePath: string;
}

function planFor(sourceFile: ts.SourceFile, checker: ts.TypeChecker): CompanionPlan | undefined {
  if (sourceFile.isDeclarationFile || !isRuntimeScriptSource(sourceFile, checker)) {
    return undefined;
  }
  const closure = computeCompanionClosure(sourceFile, checker);
  // A source the previous slice rejects is reported by the build, not split: the
  // shapes it names are exactly the ones a companion would silently break.
  if (closure.statements.length === 0 || closure.violations.length > 0) {
    return undefined;
  }
  return {
    closureStarts: new Set(closure.statements.map((statement) => statement.pos)),
    internals: closure.internals,
    importBindings: closure.importBindings,
    requirePath: requirePathForRel(sourceFile.fileName),
  };
}

function isLuaNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).kind === "number";
}

function forEachLuaNode(root: Node, visit: (node: Node) => void): void {
  visit(root);
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      for (const element of value) {
        if (isLuaNode(element)) {
          forEachLuaNode(element, visit);
        }
      }
    } else if (isLuaNode(value)) {
      forEachLuaNode(value, visit);
    }
  }
}

function declaredNames(statement: Statement): readonly string[] {
  return isVariableDeclarationStatement(statement) ? statement.left.map((name) => name.text) : [];
}

/**
 * The names these statements read but do not bind, under Lua's own scoping.
 *
 * A flat identifier walk cannot answer this: a parameter, a nested `local` and a
 * loop variable are all spelled as plain identifiers, so every name introduced
 * inside a moved function would read as a free reference to whatever the script
 * happens to bind under the same spelling.
 *
 * The statements' own top level is one scope, pre-seeded with everything it
 * declares before the walk starts. That makes it order-insensitive, unlike the
 * nested scopes, which is what keeps TSTL's hoisted `local a, b` forward
 * references reading as bound.
 */
function freeNames(statements: readonly Statement[]): Set<string> {
  const free = new Set<string>();
  const scopes: Set<string>[] = [new Set()];

  function declare(name: string): void {
    scopes[scopes.length - 1]?.add(name);
  }

  function isBound(name: string): boolean {
    return scopes.some((scope) => scope.has(name));
  }

  function inScope(run: () => void): void {
    scopes.push(new Set());
    run();
    scopes.pop();
  }

  function visitEach(nodes: readonly Node[] | undefined): void {
    for (const node of nodes ?? []) {
      visit(node);
    }
  }

  function visit(node: Node | undefined): void {
    if (node === undefined) {
      return;
    }
    if (isIdentifier(node)) {
      if (!isBound(node.text)) {
        free.add(node.text);
      }
      return;
    }
    // `right` before `left`, so `local x = x` reads the outer `x` as Lua does.
    if (isVariableDeclarationStatement(node)) {
      // Except the one shape the printer emits as `local function name(...)`
      // "to allow recursion" — there the name is bound inside its own body.
      // `FunctionDefinition` narrows only `right`, so mirror the printer, which
      // binds `left[0]` and prints no other name in this shape.
      if (isFunctionDefinition(node)) {
        const [name] = node.left;
        if (name !== undefined) {
          declare(name.text);
        }
        visit(node.right[0]);
        return;
      }
      visitEach(node.right);
      for (const name of node.left) {
        declare(name.text);
      }
      return;
    }
    if (isFunctionExpression(node)) {
      inScope(() => {
        for (const param of node.params ?? []) {
          declare(param.text);
        }
        visit(node.body);
      });
      return;
    }
    if (isForStatement(node)) {
      visit(node.controlVariableInitializer);
      visit(node.limitExpression);
      visit(node.stepExpression);
      inScope(() => {
        declare(node.controlVariable.text);
        visit(node.body);
      });
      return;
    }
    if (isForInStatement(node)) {
      visitEach(node.expressions);
      inScope(() => {
        for (const name of node.names) {
          declare(name.text);
        }
        visit(node.body);
      });
      return;
    }
    // `repeat … until` is the one loop whose condition sees the body's locals.
    if (isRepeatStatement(node)) {
      inScope(() => {
        visitEach(node.body.statements);
        visit(node.condition);
      });
      return;
    }
    if (isBlock(node) || isDoStatement(node)) {
      inScope(() => visitEach(node.statements));
      return;
    }
    // A method name is not a variable read; a table index spelled as an
    // identifier is.
    if (isMethodCallExpression(node)) {
      visit(node.prefixExpression);
      visitEach(node.params);
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const element of value) {
          if (isLuaNode(element)) {
            visit(element);
          }
        }
      } else if (isLuaNode(value)) {
        visit(value);
      }
    }
  }

  for (const statement of statements) {
    for (const name of declaredNames(statement)) {
      declare(name);
    }
  }
  for (const statement of statements) {
    visit(statement);
  }
  return free;
}

/**
 * Where each module specifier the source imports from lands as a Lua require.
 *
 * TSTL rewrites its own requires by string substitution over the printed code,
 * in a pass that runs *after* `afterPrint` — so the script's copy is rewritten
 * and the companion's, printed here, never is. Resolving through the checker and
 * `requirePathForRel` reaches the same spelling by the same segment math the
 * build's resolution check reads. A specifier that resolves to no emitted source
 * — a declaration file, an unresolved module — is left as the source wrote it.
 */
function resolvedRequirePaths(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): Map<string, string> {
  const paths = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    const specifier =
      ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
        ? statement.moduleSpecifier
        : undefined;
    if (specifier === undefined || !ts.isStringLiteral(specifier)) {
      continue;
    }
    const target = checker
      .getSymbolAtLocation(specifier)
      ?.declarations?.find((declaration): declaration is ts.SourceFile =>
        ts.isSourceFile(declaration),
      );
    if (target === undefined || target.isDeclarationFile) {
      continue;
    }
    paths.set(specifier.text, requirePathForRel(target.fileName));
  }
  return paths;
}

/**
 * Rewrites every `require` a moved statement carries, at whatever depth — a
 * re-export's is nested in the `do … end` block TSTL emits for it.
 *
 * In place, which is safe for exactly these statements: `split` sends an owned
 * statement to the companion alone, so no printer ever sees the node again.
 */
function resolveMovedRequires(
  statements: readonly Statement[],
  paths: ReadonlyMap<string, string>,
) {
  for (const statement of statements) {
    forEachLuaNode(statement, (node) => {
      if (!isCallExpression(node) || !isIdentifier(node.expression)) {
        return;
      }
      if (node.expression.text !== "require" || node.params.length !== 1) {
        return;
      }
      const [argument] = node.params;
      if (argument === undefined || !isStringLiteral(argument)) {
        return;
      }
      const resolved = paths.get(argument.value);
      if (resolved !== undefined) {
        argument.value = resolved;
      }
    });
  }
}

// Rebuilt rather than mutated in place: the script keeps the very same node, and
// its require is still spelled the way TSTL's later pass expects to find it.
function withResolvedRequire(statement: Statement, paths: ReadonlyMap<string, string>): Statement {
  if (!isVariableDeclarationStatement(statement) || statement.left.length !== 1) {
    return statement;
  }
  const name = statement.left[0];
  const [value] = statement.right ?? [];
  if (name === undefined || value === undefined || !isCallExpression(value)) {
    return statement;
  }
  if (!isIdentifier(value.expression) || value.expression.text !== "require") {
    return statement;
  }
  const [argument] = value.params;
  if (argument === undefined || !isStringLiteral(argument)) {
    return statement;
  }
  const resolved = paths.get(argument.value);
  if (resolved === undefined) {
    return statement;
  }
  return createVariableDeclarationStatement(
    createIdentifier(name.text),
    createCallExpression(createIdentifier("require"), [createStringLiteral(resolved)]),
  );
}

/**
 * The script statements binding names the companion reads but does not bind —
 * TSTL's hoisted `require` prelude — to copy, not move, into the companion.
 *
 * Copying is the only option and also the right one: an import's Lua comes from
 * TSTL's own hoisting rather than from the visitor, so there is no statement to
 * move, and Lua's module cache makes the second `require` the same table, so a
 * mutable import keeps its identity across the split. The walk is transitive
 * because `local x = ____lib.x` is useless without `local ____lib = require(…)`.
 */
function copiedPrelude(halves: SplitHalves, importBindings: readonly string[]): Statement[] {
  const needed = new Set(importBindings);
  // `importBindings` is what the companion's import needs actually come from.
  // This second seed is a net over the scope model: today it contributes only
  // names no script declaration binds, so it copies nothing, and a future gap
  // in `freeNames` surfaces as an over-copy rather than an unbound global.
  for (const name of freeNames(halves.companion)) {
    needed.add(name);
  }

  const alreadyCarried = new Set(halves.companion);
  const candidates = halves.script.filter(
    (statement) => isVariableDeclarationStatement(statement) && !alreadyCarried.has(statement),
  );
  const copied = new Set<Statement>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const statement of candidates) {
      if (copied.has(statement) || !declaredNames(statement).some((name) => needed.has(name))) {
        continue;
      }
      copied.add(statement);
      // The statement's own free names, so copying `local warm = ____boot.warm`
      // pulls `____boot` behind it and not `warm`.
      for (const name of freeNames([statement])) {
        needed.add(name);
      }
      grew = true;
    }
  }
  return halves.script.filter((statement) => copied.has(statement));
}

function namesIdentifier(statement: Statement, names: ReadonlySet<string>): boolean {
  let found = false;
  forEachLuaNode(statement, (node) => {
    if (isIdentifier(node) && names.has(node.text)) {
      found = true;
    }
  });
  return found;
}

function isExportsTableInit(statement: Statement): boolean {
  if (!isVariableDeclarationStatement(statement) || statement.left.length !== 1) {
    return false;
  }
  const [single] = statement.right ?? [];
  return (
    statement.left[0]?.text === EXPORTS_NAME && single !== undefined && isTableExpression(single)
  );
}

function isExportsReturn(statement: Statement): boolean {
  if (!isReturnStatement(statement) || statement.expressions.length !== 1) {
    return false;
  }
  const [single] = statement.expressions;
  return single !== undefined && isIdentifier(single) && single.text === EXPORTS_NAME;
}

// A bare `local a, b` with no initializer is the declaration TSTL's hoisting
// prepends for forward-referenced names. It belongs to neither half, so both
// halves take a copy: without it the half that assigns one of those names would
// write a global instead.
function isHoistedNameDeclaration(statement: Statement): boolean {
  return isVariableDeclarationStatement(statement) && statement.right === undefined;
}

function internalsField(name: string) {
  return createTableIndexExpression(
    createTableIndexExpression(exportsIdentifier(), createStringLiteral(COMPANION_INTERNAL_FIELD)),
    createStringLiteral(name),
  );
}

interface SplitHalves {
  readonly script: Statement[];
  readonly companion: Statement[];
}

/**
 * Where the companion's `require` goes in the script: after the leading run of
 * plain declarations, which is where TSTL's hoisting has already put every other
 * module's `require`, so a runtime import written above the closure still loads
 * first. The run stops at the first statement that reads the companion, and at
 * the first non-declaration — a lifecycle hook closes over the internals it
 * reads, so its declaration must precede the hook's.
 */
function requireInsertionPoint(script: readonly Statement[], reads: ReadonlySet<string>): number {
  let index = 0;
  while (index < script.length) {
    const statement = script[index];
    if (statement === undefined || !isVariableDeclarationStatement(statement)) {
      break;
    }
    if (namesIdentifier(statement, reads)) {
      break;
    }
    index++;
  }
  return index;
}

function split(statements: readonly Statement[], owned: ReadonlySet<Statement>): SplitHalves {
  const script: Statement[] = [];
  const companion: Statement[] = [];
  for (const statement of statements) {
    if (isExportsTableInit(statement) || isExportsReturn(statement)) {
      continue;
    }
    if (owned.has(statement)) {
      companion.push(statement);
      continue;
    }
    if (isHoistedNameDeclaration(statement)) {
      companion.push(statement);
    }
    script.push(statement);
  }
  return { script, companion };
}

export interface CompanionEmitter {
  readonly plugin: Plugin;
  /**
   * Companion Lua by source file name, for the sources that produced one. Read
   * after a transpile; a source absent from it emits a single chunk.
   */
  readonly companions: ReadonlyMap<string, string>;
}

/**
 * Splits a script-kind source that exports runtime values into two chunks: a
 * companion module holding the dependency closure of those exports, and the
 * script, which requires it rather than redeclaring it. One definition then
 * serves the script's own hooks and every importer, which is what makes a
 * mutable export the same table on both sides.
 *
 * A factory rather than a shared constant: the captured chunks belong to one
 * transpile, and a module-level plugin would leak them between the editor
 * session's rebuilds.
 */
export function createCompanionEmitPlugin(): CompanionEmitter {
  const plans = new Map<string, CompanionPlan | undefined>();
  const owned = new Map<string, Set<Statement>>();
  const companions = new Map<string, string>();

  function planOf(sourceFile: ts.SourceFile, checker: ts.TypeChecker): CompanionPlan | undefined {
    const key = sourceFile.fileName;
    if (!plans.has(key)) {
      plans.set(key, planFor(sourceFile, checker));
    }
    return plans.get(key);
  }

  function capture(node: ts.Statement, context: TransformationContext): Statement[] {
    const statements = context.superTransformStatements(node);
    const sourceFile = context.sourceFile;
    const plan = planOf(sourceFile, context.checker);
    if (plan === undefined || !plan.closureStarts.has(node.pos)) {
      return statements;
    }
    let bucket = owned.get(sourceFile.fileName);
    if (bucket === undefined) {
      bucket = new Set();
      owned.set(sourceFile.fileName, bucket);
    }
    for (const statement of statements) {
      bucket.add(statement);
    }
    return statements;
  }

  const visitors: Plugin["visitors"] = {
    [ts.SyntaxKind.VariableStatement]: capture,
    [ts.SyntaxKind.FunctionDeclaration]: capture,
    [ts.SyntaxKind.ClassDeclaration]: capture,
    [ts.SyntaxKind.EnumDeclaration]: capture,
    // Not ImportDeclaration: `superTransformStatements` returns nothing for one,
    // because TSTL emits its `require` bindings through its own hoisting. The
    // companion takes a copy of that prelude instead — see `copiedPrelude`.
    [ts.SyntaxKind.ExportDeclaration]: capture,
  };

  let configuredNoResolvePaths: readonly string[] = [];

  const plugin: Plugin = {
    visitors,
    beforeTransform(_program, options) {
      configuredNoResolvePaths = options.noResolvePaths ?? [];
    },
    afterPrint(program, options, emitHost, result) {
      const emitted: string[] = [];
      for (const file of result) {
        const sourceFile = file.sourceFiles?.[0];
        if (sourceFile === undefined || file.luaAst === undefined) {
          continue;
        }
        const plan = plans.get(sourceFile.fileName);
        const bucket = owned.get(sourceFile.fileName);
        if (plan === undefined || bucket === undefined || bucket.size === 0) {
          continue;
        }
        emitCompanion(program, emitHost, file, sourceFile, plan, bucket, companions);
        emitted.push(plan.requirePath);
      }
      // The companion is written by the CLI, not by TSTL's emit plan, so TSTL's
      // resolver would report the script's own require as unresolvable and
      // rewrite it to a fallback path. Exempting exactly the paths just emitted
      // leaves the require spelled the way `requirePathForRel` spells it, which
      // is the spelling the build's resolution check reads.
      if (emitted.length > 0) {
        options.noResolvePaths = [...configuredNoResolvePaths, ...emitted];
      }
    },
  };

  return { plugin, companions };
}

function emitCompanion(
  program: ts.Program,
  emitHost: Parameters<NonNullable<Plugin["afterPrint"]>>[2],
  file: ProcessedFile,
  sourceFile: ts.SourceFile,
  plan: CompanionPlan,
  owned: ReadonlySet<Statement>,
  companions: Map<string, string>,
): void {
  const luaAst = file.luaAst;
  if (luaAst === undefined) {
    return;
  }
  const halves = split(luaAst.statements, owned);
  const requirePaths = resolvedRequirePaths(sourceFile, program.getTypeChecker());
  // A require that moved is no longer in the script for TSTL's later pass to
  // find, so the companion is the only place left to spell it correctly.
  resolveMovedRequires(halves.companion, requirePaths);

  const closureTable = createTableExpression(
    plan.internals.map((name) =>
      createTableFieldExpression(createIdentifier(name), createStringLiteral(name)),
    ),
  );
  const companionStatements: Statement[] = [
    createVariableDeclarationStatement(exportsIdentifier(), createTableExpression()),
    ...copiedPrelude(halves, plan.importBindings).map((statement) =>
      withResolvedRequire(statement, requirePaths),
    ),
    ...halves.companion,
    ...(plan.internals.length > 0
      ? [
          createAssignmentStatement(
            createTableIndexExpression(
              exportsIdentifier(),
              createStringLiteral(COMPANION_INTERNAL_FIELD),
            ),
            closureTable,
          ),
        ]
      : []),
    createReturnStatement([exportsIdentifier()]),
  ];

  const reads = new Set([EXPORTS_NAME, ...plan.internals]);
  const insertAt = requireInsertionPoint(halves.script, reads);
  const scriptStatements: Statement[] = [
    ...halves.script.slice(0, insertAt),
    createVariableDeclarationStatement(
      exportsIdentifier(),
      createCallExpression(createIdentifier("require"), [createStringLiteral(plan.requirePath)]),
    ),
    ...plan.internals.map((name) =>
      createVariableDeclarationStatement(createIdentifier(name), internalsField(name)),
    ),
    ...halves.script.slice(insertAt),
    createReturnStatement([exportsIdentifier()]),
  ];

  // Both halves carry the whole feature set rather than a per-half estimate: an
  // underestimate leaves a half calling a nil global, and the cost of an
  // overestimate is an unused local.
  const features = new Set(luaAst.luaLibFeatures);
  const printer = new LuaPrinter(emitHost, program, sourceFile.fileName);
  companions.set(
    sourceFile.fileName,
    printer.print(createFile(companionStatements, new Set(features), luaAst.trivia, sourceFile))
      .code,
  );

  const scriptFile = createFile(scriptStatements, features, luaAst.trivia, sourceFile);
  const printed = new LuaPrinter(emitHost, program, sourceFile.fileName).print(scriptFile);
  file.luaAst = scriptFile;
  file.code = printed.code;
  file.sourceMap = printed.sourceMap;
  file.sourceMapNode = printed.sourceMapNode;
}

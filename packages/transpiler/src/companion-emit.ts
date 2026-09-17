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
  isIdentifier,
  isReturnStatement,
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
    [ts.SyntaxKind.ImportDeclaration]: capture,
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

  const closureTable = createTableExpression(
    plan.internals.map((name) =>
      createTableFieldExpression(createIdentifier(name), createStringLiteral(name)),
    ),
  );
  const companionStatements: Statement[] = [
    createVariableDeclarationStatement(exportsIdentifier(), createTableExpression()),
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

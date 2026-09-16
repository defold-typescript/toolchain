import * as ts from "typescript";

const LIFECYCLE_HOOKS = new Set([
  "update",
  "fixed_update",
  "late_update",
  "on_message",
  "on_input",
  "final",
  "on_reload",
]);

type Hook = { name: string; fn: ts.FunctionLikeDeclaration };

function propertyName(member: ts.ObjectLiteralElementLike): string | undefined {
  const { name } = member;
  if (name === undefined) {
    return undefined;
  }
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
}

function hookFunction(member: ts.ObjectLiteralElementLike): ts.FunctionLikeDeclaration | undefined {
  if (ts.isMethodDeclaration(member)) {
    return member;
  }
  if (ts.isPropertyAssignment(member)) {
    const { initializer } = member;
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
      return initializer;
    }
  }
  return undefined;
}

function hooksOutsideInit(source: ts.SourceFile): Hook[] {
  const hooks: Hook[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (calleeName?.startsWith("define")) {
        for (const argument of node.arguments) {
          if (!ts.isObjectLiteralExpression(argument)) {
            continue;
          }
          for (const member of argument.properties) {
            const name = propertyName(member);
            if (name === undefined || !LIFECYCLE_HOOKS.has(name)) {
              continue;
            }
            const fn = hookFunction(member);
            if (fn !== undefined) {
              hooks.push({ name, fn });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hooks;
}

/**
 * Field names read off `fn`'s first parameter. Attribution is by the
 * parameter's own *binding*, resolved through the checker, so a hook that
 * names its parameter something else still counts, a read off a neighbouring
 * object never does, and neither does a read off a nested binding that merely
 * reuses the parameter's name.
 */
function fieldsReadOffFirstParameter(
  fn: ts.FunctionLikeDeclaration,
  checker: ts.TypeChecker,
): Set<string> {
  const fields = new Set<string>();
  const [first] = fn.parameters;
  if (first === undefined || !ts.isIdentifier(first.name) || fn.body === undefined) {
    return fields;
  }
  const binding = checker.getSymbolAtLocation(first.name);
  // Without a symbol every unresolved identifier would compare equal to every
  // other, which is the fail-open this guard exists to close.
  if (binding === undefined) {
    return fields;
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      checker.getSymbolAtLocation(node.expression) === binding
    ) {
      fields.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return fields;
}

const FENCE_FILE = "fence.ts";

/**
 * A single-file program over the fence text. The binder the checker runs is
 * what distinguishes a parameter from a same-name inner binding;
 * `ts.createSourceFile` alone parses without binding. `noLib`/`noResolve` keep
 * the fence's `@defold-typescript/types` import from reaching the filesystem.
 */
function fenceProgram(source: string): ts.Program {
  const file = ts.createSourceFile(FENCE_FILE, source, ts.ScriptTarget.Latest, true);
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === FENCE_FILE ? file : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name === FENCE_FILE,
    readFile: (name) => (name === FENCE_FILE ? source : undefined),
  };
  return ts.createProgram(
    [FENCE_FILE],
    { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest },
    host,
  );
}

/**
 * A hook other than `init` must read a property-backed field *and* a state
 * field off the same `self`, which is what makes the sample an executable
 * demonstration of the `TProps & TInitState` merge rather than a sample that
 * happens to compile while only ever touching one channel.
 *
 * Throws when no such hook can be located: a fence the locator cannot read is
 * an undecided question, and answering it from `init`'s reads is what let a
 * one-channel sample pass.
 */
export function readsBothChannels(
  source: string,
  propertyField: string,
  stateField: string,
): boolean {
  const program = fenceProgram(source);
  const bound = program.getSourceFile(FENCE_FILE);
  if (bound === undefined) {
    throw new Error("the fence source file could not be read back from its own program");
  }
  const checker = program.getTypeChecker();
  const hooks = hooksOutsideInit(bound);
  if (hooks.length === 0) {
    throw new Error(
      "no lifecycle hook outside `init` could be located in this fence — looked " +
        `for a \`define*\` call whose object literal carries one of ${[...LIFECYCLE_HOOKS].join(", ")} ` +
        "as a method, arrow property, or function property. Without one, whether " +
        `\`${propertyField}\` and \`${stateField}\` meet on a single \`self\` is undecided, ` +
        "not false.",
    );
  }
  return hooks.some((hook) => {
    const fields = fieldsReadOffFirstParameter(hook.fn, checker);
    return fields.has(propertyField) && fields.has(stateField);
  });
}

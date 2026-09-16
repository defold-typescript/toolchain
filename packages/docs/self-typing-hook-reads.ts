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
 * Field names read off `fn`'s first parameter. Attribution is by the binding's
 * own identifier text rather than by the literal `self.`, so a hook that names
 * its parameter something else still counts and a read off a neighbouring
 * object never does.
 */
function fieldsReadOffFirstParameter(fn: ts.FunctionLikeDeclaration): Set<string> {
  const fields = new Set<string>();
  const [first] = fn.parameters;
  if (first === undefined || !ts.isIdentifier(first.name) || fn.body === undefined) {
    return fields;
  }
  const binding = first.name.text;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === binding
    ) {
      fields.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return fields;
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
  const parsed = ts.createSourceFile("fence.ts", source, ts.ScriptTarget.Latest, true);
  const hooks = hooksOutsideInit(parsed);
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
    const fields = fieldsReadOffFirstParameter(hook.fn);
    return fields.has(propertyField) && fields.has(stateField);
  });
}

// Type-only, and deliberately so: `@defold-typescript/types` resolves its
// runtime `exports` target to TypeScript source, so importing a *value* from it
// here would survive `--packages=external` into the packed CLI and fail under
// plain node exactly the way bug-88 did. The table arrives as a parameter and
// the lookup below stands in for `classifyUrlParameter`.
import type { UrlParameterTable } from "@defold-typescript/types";
import * as ts from "typescript";
import type { SceneComponentIndex } from "./scene-component-index";

export interface UrlFragmentFinding {
  readonly fileName: string;
  readonly start: number;
  readonly length: number;
  readonly fragment: string;
  readonly message: string;
}

export type UrlFragmentReport =
  | { readonly kind: "suppressed"; readonly reasons: readonly string[] }
  | { readonly kind: "checked"; readonly findings: readonly UrlFragmentFinding[] };

function isAmbient(fileName: string): boolean {
  return /[\\/]node_modules[\\/]/.test(fileName) || /(^|[\\/])lib\.[^\\/]*\.d\.ts$/.test(fileName);
}

function addresses(table: UrlParameterTable, fqn: string, parameter: string): boolean {
  for (const entry of table) {
    if (entry.fqn === fqn && entry.parameter === parameter) return entry.class !== "none";
  }
  return false;
}

// `getFullyQualifiedName` reports an ambient namespace member as
// `global.msg.post`, while the table is keyed on the Lua-side `msg.post`.
function tableKey(
  checker: ts.TypeChecker,
  callee: ts.PropertyAccessExpression,
): string | undefined {
  const symbol = checker.getSymbolAtLocation(callee.name);
  if (!symbol) return undefined;
  const fqn = checker.getFullyQualifiedName(symbol);
  return fqn.startsWith("global.") ? fqn.slice("global.".length) : fqn;
}

// The parameter this literal occupies, or `undefined` when the call does not
// resolve to a signature with a named parameter at that index. A rest parameter
// and a missing one both count as unresolved: neither can be classified, and
// guessing would report a fragment the project may well declare.
function parameterName(
  checker: ts.TypeChecker,
  call: ts.CallExpression,
  index: number,
): string | undefined {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (!declaration || !ts.isFunctionLike(declaration)) return undefined;
  const parameter = declaration.parameters[index];
  if (!parameter || parameter.dotDotDotToken || !ts.isIdentifier(parameter.name)) return undefined;
  return parameter.name.text;
}

// Report every address-slot string literal — quoted or backtick-quoted, the two
// kinds whose text is statically known — whose `#fragment` names a component no
// `.go`/`.collection` in the project declares. A substituted template is out for
// that same reason: its fragment is only known at runtime, so no absence in the
// project's scene files can contradict it. A path is never reported:
// `factory.create` can produce a game object at any path, but it can never
// invent a component, which is what makes only the fragment decidable.
export function checkUrlFragmentReachability(input: {
  program: ts.Program;
  table: UrlParameterTable;
  index: SceneComponentIndex;
  sourceFiles?: readonly ts.SourceFile[];
}): UrlFragmentReport {
  const { program, table, index, sourceFiles } = input;
  if (index.incomplete.length > 0) {
    return { kind: "suppressed", reasons: index.incomplete };
  }

  const checker = program.getTypeChecker();
  const findings: UrlFragmentFinding[] = [];
  const targets = sourceFiles ?? program.getSourceFiles();

  for (const sourceFile of targets) {
    if (isAmbient(sourceFile.fileName)) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) && ts.isCallExpression(node.parent)) {
        const call = node.parent;
        const argumentIndex = call.arguments.indexOf(node);
        if (argumentIndex !== -1 && ts.isPropertyAccessExpression(call.expression)) {
          const fqn = tableKey(checker, call.expression);
          const parameter = parameterName(checker, call, argumentIndex);
          if (fqn !== undefined && parameter !== undefined && addresses(table, fqn, parameter)) {
            const hash = node.text.indexOf("#");
            const fragment = hash === -1 ? "" : node.text.slice(hash + 1);
            if (fragment !== "" && !index.ids.has(fragment)) {
              findings.push({
                fileName: sourceFile.fileName,
                start: node.getStart(sourceFile),
                length: node.getWidth(sourceFile),
                fragment,
                message:
                  `no \`.go\` or \`.collection\` in this project declares a component with the id ` +
                  `"${fragment}", so this address cannot resolve at runtime`,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  return { kind: "checked", findings };
}

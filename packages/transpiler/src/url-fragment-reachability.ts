// Type-only, and deliberately so: `@defold-typescript/types` resolves its
// runtime `exports` target to TypeScript source, so importing a *value* from it
// here would survive `--packages=external` into the packed CLI and fail under
// plain node exactly the way bug-88 did. The table arrives as a parameter and
// the lookup below stands in for `classifyUrlParameter`.
import type { UrlParameterTable } from "@defold-typescript/types";
import * as ts from "typescript";
import type { SceneComponentIndex } from "./scene-component-index";
import { addressClassOfArgument, isAddressClass } from "./url-address-slots";

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

// The string a `Hash` was hashed from, recovered from its type argument —
// `undefined` for anything else, including a bare `Hash`, a `Url`, a `string`,
// and a union. `hash` records the argument in `Hash<S>` (see the `Hash` JSDoc in
// `@defold-typescript/types`), so `const SPRITE = hash("#sprite")` carries the
// text on the constant's type and no reassignment tracking is needed.
//
// The interface must be *the* `Hash`: a project's own generic type named `Hash`
// resolves to its own declaration, and reading a type argument off it would
// report a fragment that was never an address. Same discipline as
// `tableKey`'s `global.` prefix in `url-address-slots.ts`.
function hashedSourceOfType(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  if ((type.flags & ts.TypeFlags.Object) === 0) return undefined;
  if (((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) === 0) return undefined;
  const reference = type as ts.TypeReference;
  const target = reference.target.symbol;
  if (target?.name !== "Hash") return undefined;
  const declaredIn = target.declarations?.[0]?.getSourceFile().fileName ?? "";
  if (!/@defold-typescript[\\/]types[\\/].*core-types\.ts$/.test(declaredIn)) return undefined;
  const [source] = checker.getTypeArguments(reference);
  return source?.isStringLiteral() ? source.value : undefined;
}

// Report every address-slot expression whose text is statically known — a
// quoted or backtick-quoted literal, or a value whose `Hash` type still carries
// the string it was hashed from — whose `#fragment` names a component no
// `.go`/`.collection` in the project declares. A substituted template is out
// because its fragment is only known at runtime, so no absence in the project's
// scene files can contradict it, and so is any value whose type carries no
// literal (a bare `Hash`, a `Url`, a `string`). A path is never reported:
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
      if (ts.isExpression(node) && isAddressClass(addressClassOfArgument(checker, table, node))) {
        const text = ts.isStringLiteralLike(node)
          ? node.text
          : hashedSourceOfType(checker, checker.getTypeAtLocation(node));
        if (text !== undefined) {
          const hash = text.indexOf("#");
          const fragment = hash === -1 ? "" : text.slice(hash + 1);
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
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  return { kind: "checked", findings };
}

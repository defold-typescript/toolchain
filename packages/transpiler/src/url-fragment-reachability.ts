// Type-only, and deliberately so: `@defold-typescript/types` resolves its
// runtime `exports` target to TypeScript source, so importing a *value* from it
// here would survive `--packages=external` into the packed CLI and fail under
// plain node exactly the way bug-88 did. The table arrives as a parameter and
// the lookup below stands in for `classifyUrlParameter`.
import type { UrlParameterTable } from "@defold-typescript/types";
import * as ts from "typescript";
import type { SceneComponentIndex } from "./scene-component-index";
import { canonicalHashSymbols, isAmbient, staticAddressTextOf } from "./url-address-literals";
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
  // Resolved once per call — measured at ~0.1 ms, so no laziness is warranted.
  // An empty set reports nothing from the type-directed branch and leaves inline
  // literals untouched, which is the answer for a program carrying no ambient
  // `hash` and the module's existing fail-closed posture.
  const canonical = canonicalHashSymbols(checker, program);
  const findings: UrlFragmentFinding[] = [];
  const targets = sourceFiles ?? program.getSourceFiles();

  for (const sourceFile of targets) {
    if (isAmbient(sourceFile.fileName)) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isExpression(node) && isAddressClass(addressClassOfArgument(checker, table, node))) {
        const text = staticAddressTextOf(checker, node, canonical);
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

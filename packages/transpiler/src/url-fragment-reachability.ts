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

// The symbol a generic type reference was instantiated from — `undefined` for
// anything that is not one.
function referenceTargetSymbol(type: ts.Type): ts.Symbol | undefined {
  if ((type.flags & ts.TypeFlags.Object) === 0) return undefined;
  if (((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) === 0) return undefined;
  return (type as ts.TypeReference).target.symbol;
}

// The declarations *the* `Hash` can come from, resolved from what the ambient
// `hash` global returns rather than from the file `Hash` happens to be declared
// in. A path test answers differently for an installed
// `node_modules/@defold-typescript/types/…` and a workspace-resolved
// `packages/types/…` copy of the very same declarations, which silently emptied
// this report for anyone consuming the package through a `paths` mapping or a
// symlink (bug-121); a symbol identity holds under both.
//
// The scope anchor is an ambient file so that no user module's own `hash`
// participates, and every call signature is walked because a project's
// global-script `function hash(s: string): string` *merges* into this symbol
// rather than replacing it — the declarations then span both files and a
// fully-qualified-name test would reject the real one. Asking the checker
// instead of the filesystem is the same discipline as `tableKey` in
// `url-address-slots.ts`.
function canonicalHashSymbols(
  checker: ts.TypeChecker,
  program: ts.Program,
): ReadonlySet<ts.Symbol> {
  const files = program.getSourceFiles();
  const anchor = files.find((file) => isAmbient(file.fileName)) ?? files[0];
  const canonical = new Set<ts.Symbol>();
  if (!anchor) return canonical;

  for (const symbol of checker.getSymbolsInScope(anchor, ts.SymbolFlags.Function)) {
    if (symbol.name !== "hash") continue;
    const declaration = symbol.declarations?.[0];
    if (!declaration) continue;
    for (const signature of checker
      .getTypeOfSymbolAtLocation(symbol, declaration)
      .getCallSignatures()) {
      const target = referenceTargetSymbol(signature.getReturnType());
      if (target?.name === "Hash") canonical.add(target);
    }
  }
  return canonical;
}

// The string a `Hash` was hashed from, recovered from its type argument —
// `undefined` for anything else, including a bare `Hash`, a `Url`, a `string`,
// and a union. `hash` records the argument in `Hash<S>` (see the `Hash` JSDoc in
// `@defold-typescript/types`), so `const SPRITE = hash("#sprite")` carries the
// text on the constant's type and no reassignment tracking is needed.
//
// The interface must be *the* `Hash`: a project's own generic type named `Hash`
// resolves to its own declaration, and reading a type argument off it would
// report a fragment that was never an address. `canonical` is what settles that.
function hashedSourceOfType(
  checker: ts.TypeChecker,
  type: ts.Type,
  canonical: ReadonlySet<ts.Symbol>,
): string | undefined {
  const target = referenceTargetSymbol(type);
  if (!target || !canonical.has(target)) return undefined;
  const [source] = checker.getTypeArguments(type as ts.TypeReference);
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
        const text = ts.isStringLiteralLike(node)
          ? node.text
          : hashedSourceOfType(checker, checker.getTypeAtLocation(node), canonical);
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

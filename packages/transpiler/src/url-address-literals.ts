import * as ts from "typescript";

// Shared by both address checks, so neither can drift about which slot
// expressions carry a statically-known address: the walk's ambient filter, the
// canonical `Hash` identity, and the recovery of the string a `Hash` was hashed
// from all live here and are imported, never re-derived.

export function isAmbient(fileName: string): boolean {
  return /[\\/]node_modules[\\/]/.test(fileName) || /(^|[\\/])lib\.[^\\/]*\.d\.ts$/.test(fileName);
}

// The symbol a generic type reference was instantiated from — `undefined` for
// anything that is not one.
function referenceTargetSymbol(type: ts.Type): ts.Symbol | undefined {
  if ((type.flags & ts.TypeFlags.Object) === 0) return undefined;
  if (((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) === 0) return undefined;
  return (type as ts.TypeReference).target.symbol;
}

// What the global `Hash` *type* name means in scope at the anchor, as symbols.
// The shipped `type Hash<S extends string = string> = Core.Hash<S>` yields the
// `Core.Hash` symbol; a project's `Project.Hash` is not in global scope under
// the bare name and never appears, and a project cannot add a second global
// `Hash` type without a duplicate-identifier error — so unlike the *name*, this
// anchor cannot be shadowed.
function ambientHashAliasTargets(checker: ts.TypeChecker, anchor: ts.Node): ReadonlySet<ts.Symbol> {
  const targets = new Set<ts.Symbol>();
  for (const symbol of checker.getSymbolsInScope(anchor, ts.SymbolFlags.Type)) {
    if (symbol.name !== "Hash") continue;
    const target = referenceTargetSymbol(checker.getDeclaredTypeOfSymbol(symbol));
    if (target) targets.add(target);
  }
  return targets;
}

// The declarations *the* `Hash` can come from, resolved from the two anchors the
// shipped ambient declarations carry one line apart rather than from the file
// `Hash` happens to be declared in. A path test answers differently for an
// installed `node_modules/@defold-typescript/types/…` and a workspace-resolved
// `packages/types/…` copy of the very same declarations, which silently emptied
// this report for anyone consuming the package through a `paths` mapping or a
// symlink (bug-121); a symbol identity holds under both.
//
// The answer is the *intersection* of the two anchors. The `hash` function is
// the scope-and-fail-closed anchor: its scope anchor is an ambient file so that
// no user module's own `hash` participates, and every call signature is walked
// because a project's global-script `function hash(s: string): string` *merges*
// into this symbol rather than replacing it — the declarations then span both
// files and a fully-qualified-name test would reject the real one. The global
// `Hash` alias is the identity anchor: the function alone is not enough, because
// a merged project overload contributes its own signatures, and testing what
// they return by *name* admits any project type called `Hash` and then reports a
// type argument that was never an address (bug-122). Asking the checker instead
// of the filesystem is the same discipline as `tableKey` in
// `url-address-slots.ts`.
export function canonicalHashSymbols(
  checker: ts.TypeChecker,
  program: ts.Program,
): ReadonlySet<ts.Symbol> {
  const files = program.getSourceFiles();
  const anchor = files.find((file) => isAmbient(file.fileName)) ?? files[0];
  const canonical = new Set<ts.Symbol>();
  if (!anchor) return canonical;

  const aliased = ambientHashAliasTargets(checker, anchor);

  for (const symbol of checker.getSymbolsInScope(anchor, ts.SymbolFlags.Function)) {
    if (symbol.name !== "hash") continue;
    const declaration = symbol.declarations?.[0];
    if (!declaration) continue;
    for (const signature of checker
      .getTypeOfSymbolAtLocation(symbol, declaration)
      .getCallSignatures()) {
      const target = referenceTargetSymbol(signature.getReturnType());
      if (target && aliased.has(target)) canonical.add(target);
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

/**
 * The address text a slot expression is statically known to carry — a quoted or
 * backtick-quoted literal's own text, or the string a `Hash`-typed value was
 * hashed from — and `undefined` for everything a project only settles at
 * runtime: a substituted template, a bare `Hash`, a `Url`, a `string`.
 */
export function staticAddressTextOf(
  checker: ts.TypeChecker,
  node: ts.Expression,
  canonical: ReadonlySet<ts.Symbol>,
): string | undefined {
  return ts.isStringLiteralLike(node)
    ? node.text
    : hashedSourceOfType(checker, checker.getTypeAtLocation(node), canonical);
}

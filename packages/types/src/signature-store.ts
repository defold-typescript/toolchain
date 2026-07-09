// A hand-authored override for one ref-doc element's signature, sourced from
// the `lua-types` declarations the compiler actually enforces. The ref-doc's
// own signatures are far weaker (`...` params show `unknown`, no return types),
// so these strengthen the rendered signature while the ref-doc prose stays.
export interface SignatureOverride {
  signatures: string[];
  // Optional per-overload descriptions, parallel to `signatures`: entry `i`
  // overrides row `i`'s rendered doc prose; a `null` entry or an array shorter
  // than `signatures` keeps the ref-doc fixture description for those rows. Every
  // existing override omits `docs` and renders exactly as before.
  docs?: (string | null)[];
}

// An FQN (`io.open`, `file:read`, …) maps to one override. An element with
// several overloads carries more than one entry in `signatures`, in authored
// order (the order the docs should render them).
export type SignatureStore = Record<string, SignatureOverride>;

// Return the override for an FQN, or `null` when the store has no entry. Pure
// and dependency-free like `example-store.ts`: this module is reachable from
// `index.ts`, so a `node:fs`/ambient-`Bun` reference here would fail type-checking
// in every downstream consumer that compiles the shipped `src/` graph.
export function lookupSignature(store: SignatureStore, fqn: string): SignatureOverride | null {
  return store[fqn] ?? null;
}

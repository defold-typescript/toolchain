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
  // Optional per-overload first release, parallel to `signatures`: entry `i` is
  // the bare semver from which row `i` exists, or `null` for a row every target
  // declares. An absent array means every row is ungated.
  since?: (string | null)[];
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

function versionParts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

function versionAtLeast(version: string, since: string): boolean {
  const [have, need] = [versionParts(version), versionParts(since)];
  for (let index = 0; index < Math.max(have.length, need.length); index += 1) {
    const diff = (have[index] ?? 0) - (need[index] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

// The override as a target at `version` declares it: only the rows whose `since`
// is absent, `null`, or at most `version`, with `docs` and `since` kept parallel.
export function signatureArmsFor(override: SignatureOverride, version: string): SignatureOverride {
  const since = override.since;
  if (since === undefined) return override;
  const kept = override.signatures
    .map((_, index) => index)
    .filter((index) => {
      const first = since[index];
      return first == null || versionAtLeast(version, first);
    });
  if (kept.length === override.signatures.length) return override;
  const docs = override.docs;
  return {
    signatures: kept.map((index) => override.signatures[index] as string),
    ...(docs === undefined
      ? {}
      : { docs: kept.filter((index) => index < docs.length).map((index) => docs[index] ?? null) }),
    since: kept.map((index) => since[index] ?? null),
  };
}

// The store as one version declares it: each entry keeps only the arms whose
// `since` the version meets, and an entry left with none is dropped.
export function signatureStoreFor(store: SignatureStore, version: string): SignatureStore {
  const scoped: SignatureStore = {};
  for (const [fqn, override] of Object.entries(store)) {
    const arms = signatureArmsFor(override, version);
    if (arms.signatures.length > 0) scoped[fqn] = arms;
  }
  return scoped;
}

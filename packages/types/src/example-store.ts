// A hand-authored TypeScript translation of one element's ref-doc `@example`,
// pinned by a hash of the exact source Lua it replaces. A ref-doc re-pin that
// changes the source Lua flips the hash, so a stale translation stops matching
// (drift guard) and the emit falls back to the Lua body.
export interface Translation {
  sourceHash: string;
  ts: string;
}

export type TranslationStore = Record<string, Translation>;

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const U64_MASK = 0xffffffffffffffffn;

// A pure, dependency-free FNV-1a 64-bit hash over the source's UTF-16 code
// units, returned as zero-padded hex. Deliberately node- and Bun-free: this
// module is reachable from `index.ts` (via `emit-dts`), so a `node:crypto` or
// ambient-`Bun` reference here would fail type-checking in every downstream
// consumer that compiles the shipped `src/` graph.
//
// The input is the already-normalized post-`htmlToCodeText` string (per-line
// trailing whitespace and surrounding blank lines stripped), so the hash is
// independent of trailing whitespace in the original ref-doc HTML.
export function hashExampleSource(source: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash ^ BigInt(source.charCodeAt(i))) * FNV_PRIME) & U64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

// Return the stored TypeScript body only when the FQN exists and its pinned
// `sourceHash` matches the source we are about to emit; any mismatch returns
// `null` so the caller keeps the Lua fallback.
export function lookupTranslation(
  store: TranslationStore,
  fqn: string,
  sourceHash: string,
): string | null {
  const entry = store[fqn];
  if (!entry || entry.sourceHash !== sourceHash) return null;
  return entry.ts;
}

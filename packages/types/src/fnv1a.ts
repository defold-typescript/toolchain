const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const U64_MASK = 0xffffffffffffffffn;

// A pure, dependency-free FNV-1a 64-bit hash over the text's UTF-16 code units,
// returned as zero-padded hex. Deliberately node- and Bun-free: this module is
// reachable from `index.ts`, so a `node:crypto` or ambient-`Bun` reference here
// would fail type-checking in every downstream consumer that compiles the
// shipped `src/` graph.
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash ^ BigInt(text.charCodeAt(i))) * FNV_PRIME) & U64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

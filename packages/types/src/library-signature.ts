/**
 * Pure string helpers for rendering variadic parameters and multi-value returns
 * the way the library `.d.ts` emitter does. Shared by the emitter
 * (`packages/library-types`) and the docs-site renderer (`packages/docs-site`),
 * which both depend on `@defold-typescript/types`, so a library `/api` signature
 * cannot drift from the shipped `generated/<ns>.d.ts` for these two shapes — the
 * same anti-drift move the type/name/generic primitives already use.
 */

/** True when a top-level `|` (a union) appears in a mapped type, honoring bracket depth. */
export function hasTopLevelUnion(ts: string): boolean {
  let depth = 0;
  for (let i = 0; i < ts.length; i++) {
    const c = ts[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === "|") return true;
  }
  return false;
}

/** An array element needs parentheses when it is a union, a function, or an object. */
export function needsArrayParens(ts: string): boolean {
  return hasTopLevelUnion(ts) || ts.includes("=>") || ts.startsWith("{");
}

/** A vararg's element type arrayified: `string` -> `string[]`, `a | b` -> `(a | b)[]`. */
export function varargElementType(mapped: string): string {
  return needsArrayParens(mapped) ? `(${mapped})[]` : `${mapped}[]`;
}

/** Wrap `>1` mapped return tokens in the `LuaMultiReturn<[...]>` tuple form. */
export function luaMultiReturn(mapped: readonly string[]): string {
  return `LuaMultiReturn<[${mapped.join(", ")}]>`;
}

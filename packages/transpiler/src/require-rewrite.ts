import { scanEmittedRequires } from "./lua-require-scan";

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Repoint every code-position `require` whose module path `rewrites` maps, and
 * leave the chunk byte-identical everywhere else.
 *
 * Built in one pass over the spans the shared scanner reports rather than by
 * iterated replacement: a chunk is rewritten against the map it was scanned
 * with, so a mapped value that is itself a key is never re-entered, and two
 * paths sharing a prefix cannot bleed into each other. The generated runtimes
 * are rewritten like any other require — unlike the resolution check, which
 * exempts them, the rewriter has to move them when the build writes them under
 * an `outDir`.
 */
export function rewriteEmittedRequires(lua: string, rewrites: ReadonlyMap<string, string>): string {
  if (rewrites.size === 0) {
    return lua;
  }

  let out = "";
  let cursor = 0;
  for (const { path, start, end } of scanEmittedRequires(lua)) {
    const mapped = rewrites.get(path);
    if (mapped === undefined) {
      continue;
    }
    out += lua.slice(cursor, start) + quote(mapped);
    cursor = end;
  }

  return cursor === 0 ? lua : out + lua.slice(cursor);
}

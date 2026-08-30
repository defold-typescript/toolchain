import { globSync, statSync } from "node:fs";
import * as path from "node:path";

export function normalizeScannedPath(rel: string): string {
  return rel.split(/[/\\]/).join("/");
}

function isFileAt(cwd: string, rel: string): boolean {
  try {
    return statSync(path.join(cwd, rel)).isFile();
  } catch {
    return false;
  }
}

const GLOB_METACHARACTER_RE = /[*?[\]{}]/;

// `Bun.Glob` is undefined when the published bin runs under plain node, so the
// scaffold/build path must use the cross-runtime `node:fs` glob instead. Bun's
// `globSync` does not support `withFileTypes`, so directories are filtered out
// with a stat to preserve the original `onlyFiles` contract.
//
// A wildcard-free pattern is resolved by stat instead of by glob: bun's
// `globSync` never descends a dot-directory and ignores `dot: true`, while
// node's matches one by default, so an exact entry such as
// `.defold-types/scene-addresses.d.ts` would otherwise reach the compiler on
// one runtime and not the other. A stat also answers the exact question the
// pattern asks, so the two runtimes cannot disagree.
export function scanFilesSync(cwd: string, pattern: string): string[] {
  const rel = normalizeScannedPath(pattern);
  if (!GLOB_METACHARACTER_RE.test(rel)) {
    return isFileAt(cwd, rel) ? [rel] : [];
  }
  return globSync(pattern, { cwd })
    .map(normalizeScannedPath)
    .filter((match) => isFileAt(cwd, match));
}

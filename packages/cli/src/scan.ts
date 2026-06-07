import { globSync, statSync } from "node:fs";
import * as path from "node:path";

export function normalizeScannedPath(rel: string): string {
  return rel.split(/[/\\]/).join("/");
}

// `Bun.Glob` is undefined when the published bin runs under plain node, so the
// scaffold/build path must use the cross-runtime `node:fs` glob instead. Bun's
// `globSync` does not support `withFileTypes`, so directories are filtered out
// with a stat to preserve the original `onlyFiles` contract.
export function scanFilesSync(cwd: string, pattern: string): string[] {
  return globSync(pattern, { cwd })
    .map(normalizeScannedPath)
    .filter((rel) => statSync(path.join(cwd, rel)).isFile());
}

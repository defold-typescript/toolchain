// Library data sits in folders named by the first CLI version that reads them, so
// a CLI keeps reading the layout it was built for after newer data lands beside it.

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

type Triple = readonly [number, number, number];

const DATA_FOLDER = /^(\d+)\.(\d+)\.(\d+)$/;

function parseTriple(version: string): Triple | null {
  const match = DATA_FOLDER.exec(version);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareTriples(a: Triple, b: Triple): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// The highest data folder at or below `cliVersion`, ignoring its prerelease or
// build suffix; an unversioned `0.0.0` CLI reads the newest folder.
export function selectDataFolder(base: string, cliVersion: string): string | null {
  const cli = parseTriple(cliVersion.replace(/[-+].*$/, ""));
  if (cli === null) return null;
  const newest = compareTriples(cli, [0, 0, 0]) === 0;
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  let best: { name: string; version: Triple } | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const version = parseTriple(entry.name);
    if (version === null) continue;
    if (!newest && compareTriples(version, cli) > 0) continue;
    if (best === null || compareTriples(version, best.version) > 0) {
      best = { name: entry.name, version };
    }
  }
  return best === null ? null : resolve(base, best.name);
}

// The newest data folder under a library-types package root, which is what the
// toolchain reads and writes.
export function newestDataFolder(packageRoot: string): string {
  const dir = selectDataFolder(join(packageRoot, "data"), "0.0.0");
  if (dir === null) {
    throw new Error(`${packageRoot}/data holds no library data folder`);
  }
  return dir;
}

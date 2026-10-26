import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DefoldEngineRelease {
  version: string;
  date: string;
}

// Every dated Defold engine version, written by
// `library-types/scripts/sync-defold-extensions.ts --dates`. An absent file
// degrades to no era on any page.
export function loadDefoldEngineReleases(libraryTypesDir: string): DefoldEngineRelease[] {
  const path = join(libraryTypesDir, "defold-engine-releases.json");
  if (!existsSync(path)) return [];
  const { releases } = JSON.parse(readFileSync(path, "utf8")) as {
    releases: DefoldEngineRelease[];
  };
  return releases;
}

/**
 * The Defold version that was current when a library pin was cut: the newest
 * release dated on or before `pinDate`, compared as instants. A hint about the
 * pin's age, not a compatibility claim.
 */
export function releaseEra(
  pinDate: string,
  releases: readonly DefoldEngineRelease[],
): string | undefined {
  const pinned = Date.parse(pinDate);
  let current: { version: string; at: number } | undefined;
  for (const { version, date } of releases) {
    const at = Date.parse(date);
    if (at <= pinned && (current === undefined || at > current.at)) current = { version, at };
  }
  return current?.version;
}

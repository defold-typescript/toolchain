// Defold's own copy of each library it fetched. Fetch Libraries writes
// `.internal/lib/dependencies.json`, listing each `[project] dependencies#N` URL
// with the commit it resolved to, and one zip per URL named
// `<sha1 of the URL>-<base64 of its ETag>.zip`. Neither file is documented, so
// a zip is trusted only when its own comment, the commit a GitHub archive was
// packed from, is the commit listed for its URL; anything else falls back to a
// download rather than failing. The directory is only ever read: it is
// Defold's, and the game builds from it.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadExtensionZip } from "./extension-archive";

export const DEFOLD_LIBRARY_DIR = ".internal/lib";
// Project-relative and `/`-separated, as the watcher keys an event.
export const DEFOLD_DEPENDENCIES_MANIFEST = `${DEFOLD_LIBRARY_DIR}/dependencies.json`;

function listedCommit(manifestPath: string, url: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) {
    return undefined;
  }
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.url === url) {
      const commit = record["commit-sha1"];
      return typeof commit === "string" && commit.length > 0 ? commit : undefined;
    }
  }
  return undefined;
}

// The prefix is the sha1 of the URL exactly as `game.project` declares it, so
// two spellings of one archive are two entries, as they are to Defold.
export async function findDefoldLibraryArchive(
  projectDir: string,
  url: string,
  readZip: ReadExtensionZip,
): Promise<string | null> {
  const lib = join(projectDir, DEFOLD_LIBRARY_DIR);
  const commit = listedCommit(join(projectDir, DEFOLD_DEPENDENCIES_MANIFEST), url);
  if (commit === undefined) {
    return null;
  }
  const prefix = `${createHash("sha1").update(url).digest("hex")}-`;
  let names: string[];
  try {
    names = readdirSync(lib);
  } catch {
    return null;
  }
  for (const name of names.filter((n) => n.startsWith(prefix) && n.endsWith(".zip")).sort()) {
    const path = join(lib, name);
    try {
      if ((await readZip(path)).comment() === commit) {
        return path;
      }
    } catch {
      // A partial download under the prefix is not an archive to build from.
    }
  }
  return null;
}

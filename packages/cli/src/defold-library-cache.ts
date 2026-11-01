// Defold's own copy of each library it fetched. Fetch Libraries writes
// `.internal/lib/dependencies.json`, listing each `[project] dependencies#N` URL
// with the commit it resolved to, and one zip per URL named
// `<sha1 of the URL>-<base64 of its ETag>.zip`. Neither file is documented, so
// a zip is trusted only when its own comment, the commit a GitHub archive was
// packed from, is the commit listed for its URL; anything else falls back to a
// download rather than failing, unless `--frozen` holds the run to the archive
// Bob will build. The directory is only ever read: it is Defold's, and the game
// builds from it.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadExtensionZip } from "./extension-archive";

export const DEFOLD_LIBRARY_DIR = ".internal/lib";
// Project-relative and `/`-separated, as the watcher keys an event.
export const DEFOLD_DEPENDENCIES_MANIFEST = `${DEFOLD_LIBRARY_DIR}/dependencies.json`;

// The commit listed for a URL, which is empty for a release asset. `undefined`
// means the manifest cannot answer for the URL.
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
      return typeof commit === "string" ? commit : undefined;
    }
  }
  return undefined;
}

// The prefix is the sha1 of the URL exactly as `game.project` declares it, so
// two spellings of one archive are two entries, as they are to Defold.
function archivesUnderPrefix(projectDir: string, url: string): string[] {
  const lib = join(projectDir, DEFOLD_LIBRARY_DIR);
  const prefix = `${createHash("sha1").update(url).digest("hex")}-`;
  let names: string[];
  try {
    names = readdirSync(lib);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.startsWith(prefix) && n.endsWith(".zip"))
    .sort()
    .map((name) => join(lib, name));
}

export async function findDefoldLibraryArchive(
  projectDir: string,
  url: string,
  readZip: ReadExtensionZip,
): Promise<string | null> {
  const commit = listedCommit(join(projectDir, DEFOLD_DEPENDENCIES_MANIFEST), url);
  if (commit === undefined || commit === "") {
    return null;
  }
  for (const path of archivesUnderPrefix(projectDir, url)) {
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

export type DefoldBuildArchive = { readonly path: string } | { readonly reason: string };

// What `bob build` reads for a URL, or why that cannot be told. Bob builds the
// first zip its directory listing yields under a prefix and purges the rest when
// it fetches, so more than one means no comment can say which the build reads.
export async function findDefoldBuildArchive(
  projectDir: string,
  url: string,
  readZip: ReadExtensionZip,
): Promise<DefoldBuildArchive> {
  const commit = listedCommit(join(projectDir, DEFOLD_DEPENDENCIES_MANIFEST), url);
  if (commit === undefined) {
    return { reason: `${DEFOLD_DEPENDENCIES_MANIFEST} does not list ${url}` };
  }
  const [path, ...others] = archivesUnderPrefix(projectDir, url);
  if (path === undefined) {
    return { reason: `${DEFOLD_LIBRARY_DIR} holds no archive for ${url}` };
  }
  if (others.length > 0) {
    return { reason: `${DEFOLD_LIBRARY_DIR} holds ${others.length + 1} archives for ${url}` };
  }
  let comment: string;
  try {
    comment = (await readZip(path)).comment();
  } catch {
    return { reason: `${DEFOLD_LIBRARY_DIR} holds an unreadable archive for ${url}` };
  }
  if (comment !== commit) {
    return {
      reason: `the archive for ${url} names ${comment || "no commit"}, but ${DEFOLD_DEPENDENCIES_MANIFEST} lists ${commit || "no commit"}`,
    };
  }
  return { path };
}

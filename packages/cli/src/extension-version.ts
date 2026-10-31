// Per-extension version pin alongside the engine `--defold-target` pin. The
// declared identity of a `[dependencies]` URL is often a moving ref
// (`.../archive/master.zip`), so the reproducible identity of *what was
// resolved* is the commit the archive was packed from, or failing that a digest
// of the files it shares, not a URL segment. `resolve` records that pin, seeds
// it into `package.json` `"defold-typescript": { "extensions": { url: commit:… } }`
// when absent (never clobbering a pin in a current form), and reports both the
// resolved and pinned version per extension in `--json` — the visible signal a
// user acts on to upgrade. `resolve` warns on drift and `--frozen` fails on it.

import { createHash } from "node:crypto";
import {
  archiveGameProjectEntry,
  archiveWrapperOf,
  type LibrarySharedEntry,
  libraryIncludeDirFiles,
} from "@defold-typescript/transpiler";
import type { ExtensionZip } from "./extension-archive";

export const COMMIT_COMMENT = /^[0-9a-f]{40}$/;

function archiveFiles(entries: readonly string[]): LibrarySharedEntry[] {
  const wrapper = archiveWrapperOf(entries);
  return entries
    .filter((entry) => !entry.endsWith("/"))
    .map((entry) => ({
      entry,
      path: wrapper === undefined ? entry : entry.slice(wrapper.length + 1),
    }));
}

// A GitHub archive of a branch, a tag or a commit names that commit in its zip
// comment. Any other archive is pinned by the files a game can use: the ones
// under its `include_dirs`, else every file. Each is hashed under its
// wrapper-stripped path, so neither a change outside what the library shares
// nor a renamed `<repo>-<ref>/` wrapper moves the pin.
export function archivePin(zip: ExtensionZip): string {
  const comment = zip.comment();
  if (COMMIT_COMMENT.test(comment)) {
    return `commit:${comment}`;
  }
  const entries = zip.entries();
  const gameProject = archiveGameProjectEntry(entries);
  const included = libraryIncludeDirFiles(
    entries,
    gameProject === undefined ? undefined : zip.read(gameProject),
  );
  const files = (included.length > 0 ? included : archiveFiles(entries)).sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const hash = createHash("sha256");
  for (const { entry, path } of files) {
    const bytes = zip.bytes(entry);
    hash.update(`${path}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return `files-sha256:${hash.digest("hex")}`;
}

// The zip-byte pin form: it named no commit and moved with any file in the
// repository, so a plain `resolve` replaces it and `--frozen` refuses it.
export function isRetiredPin(pin: string): boolean {
  return pin.startsWith("sha256:");
}

export function readExtensionVersionPins(pkg: unknown): Record<string, string> {
  if (typeof pkg !== "object" || pkg === null) {
    return {};
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null) {
    return {};
  }
  const extensions = (namespace as Record<string, unknown>).extensions;
  if (typeof extensions !== "object" || extensions === null) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [url, version] of Object.entries(extensions as Record<string, unknown>)) {
    if (typeof version === "string") {
      out[url] = version;
    }
  }
  return out;
}

// `replaceUrls` names the pins `resolved` overwrites instead of only seeding:
// ones in the retired form, which no resolved pin can ever match.
export function mergeResolvedVersionPins(
  pkg: unknown,
  resolved: Record<string, string>,
  liveUrls?: Iterable<string>,
  replaceUrls: Iterable<string> = [],
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof pkg === "object" && pkg !== null && !Array.isArray(pkg)
      ? { ...(pkg as Record<string, unknown>) }
      : {};
  const existingNamespace =
    typeof base["defold-typescript"] === "object" &&
    base["defold-typescript"] !== null &&
    !Array.isArray(base["defold-typescript"])
      ? { ...(base["defold-typescript"] as Record<string, unknown>) }
      : {};
  const existingExtensions =
    typeof existingNamespace.extensions === "object" &&
    existingNamespace.extensions !== null &&
    !Array.isArray(existingNamespace.extensions)
      ? { ...(existingNamespace.extensions as Record<string, unknown>) }
      : {};
  if (liveUrls !== undefined) {
    const live = new Set(liveUrls);
    for (const url of Object.keys(existingExtensions)) {
      if (!live.has(url)) {
        delete existingExtensions[url];
      }
    }
  }
  const replace = new Set(replaceUrls);
  for (const [url, version] of Object.entries(resolved)) {
    if (!(url in existingExtensions) || replace.has(url)) {
      existingExtensions[url] = version;
    }
  }
  existingNamespace.extensions = existingExtensions;
  base["defold-typescript"] = existingNamespace;
  return base;
}

// The library data commit a project last resolved against, unchecked: it comes
// from a file the user edits.
export function readLibraryDataCommit(pkg: unknown): string | null {
  if (typeof pkg !== "object" || pkg === null) {
    return null;
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null) {
    return null;
  }
  const commit = (namespace as Record<string, unknown>).libraryData;
  return typeof commit === "string" ? commit : null;
}

export function mergeLibraryDataCommit(pkg: unknown, commit: string): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof pkg === "object" && pkg !== null && !Array.isArray(pkg)
      ? { ...(pkg as Record<string, unknown>) }
      : {};
  const namespace = base["defold-typescript"];
  base["defold-typescript"] = {
    ...(typeof namespace === "object" && namespace !== null && !Array.isArray(namespace)
      ? namespace
      : {}),
    libraryData: commit,
  };
  return base;
}

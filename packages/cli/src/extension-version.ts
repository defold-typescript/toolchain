// Per-extension version pin alongside the engine `--defold-target` pin. The
// declared identity of a `[dependencies]` URL is often a moving ref
// (`.../archive/master.zip`), so the reproducible identity of *what was
// resolved* is the commit the archive was packed from, when it names one, and a
// digest of the files it shares, not a URL segment. `resolve` records that pin in
// `defold-typescript.lock` when absent (never clobbering one), and reports both
// the resolved and pinned version per extension in `--json` — the visible signal
// a user acts on to upgrade. `resolve` warns on drift and `--frozen` fails on it.

import { createHash } from "node:crypto";
import {
  archiveGameProjectEntry,
  archiveWrapperOf,
  type LibrarySharedEntry,
  libraryIncludeDirFiles,
} from "@defold-typescript/transpiler";
import type { ExtensionZip } from "./extension-archive";

export const COMMIT_COMMENT = /^[0-9a-f]{40}$/;

// `commit` is only what the zip comment claims, which a host other than GitHub or
// a tampered cache can keep across changed bytes, so `files` is always recorded too.
export interface ArchiveIdentity {
  readonly commit?: string;
  readonly files: string;
}

// `follows` is the ref a commit URL was moved from, since the URL alone gives
// `--update` nothing to check.
export interface ExtensionPin extends ArchiveIdentity {
  readonly follows?: string;
}

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
// comment. Every archive is also hashed over the files a game can use: the ones
// under its `include_dirs`, else every file. Each is hashed under its
// wrapper-stripped path, so neither a change outside what the library shares
// nor a renamed `<repo>-<ref>/` wrapper moves the pin.
export function archiveIdentity(zip: ExtensionZip): ArchiveIdentity {
  const comment = zip.comment();
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
  const digest = hash.digest("hex");
  return COMMIT_COMMENT.test(comment) ? { commit: comment, files: digest } : { files: digest };
}

// The one-string name `--json` and the drift line report an identity by.
export function archiveVersion({ commit, files }: ArchiveIdentity): string {
  return commit === undefined ? `files-sha256:${files}` : `commit:${commit}`;
}

export function sameArchive(a: ArchiveIdentity, b: ArchiveIdentity): boolean {
  return a.commit === b.commit && a.files === b.files;
}

// One pin per resolved URL, keeping a recorded one so drift stays visible until the
// user acts on it. A pin for a URL no longer resolved is dropped.
export function mergeResolvedVersionPins(
  pins: Readonly<Record<string, ExtensionPin>>,
  resolved: Readonly<Record<string, ArchiveIdentity>>,
): Record<string, ExtensionPin> {
  return Object.fromEntries(
    Object.entries(resolved).map(([url, version]) => [url, pins[url] ?? version]),
  );
}

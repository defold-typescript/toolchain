// How a project's copy of a library stands against the reviews in library data. A
// status only reports: it never changes what `resolve` prints or fails a run.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newerDataFolders } from "./data-folder";
import { type LibraryReview, REVIEWED_FILE } from "./library-data";
import { FINGERPRINT_VERSION, type LibraryFingerprint } from "./library-fingerprint";

export type LibraryStatus =
  | { status: "exact"; by: "commit" | "api" }
  | { status: "generated" }
  | { status: "unsupported"; closest: string | null; members: string[] }
  | { status: "newer-cli"; folder: string }
  | { status: "unrecorded" };

const MEMBERS_NAMED = 5;

export function differingMembers(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((key) => a[key] !== b[key]).sort();
}

// Member hashes compare only under one version, so another version's review says
// nothing about what differs. Reviews append, so the last of a tie is the later one.
function closestReview(
  reviews: readonly LibraryReview[],
  fingerprint: LibraryFingerprint,
): { closest: string | null; members: string[] } {
  let best: { closest: string | null; members: string[] } | null = null;
  for (const review of reviews) {
    if (review.version !== FINGERPRINT_VERSION) continue;
    const members = differingMembers(review.members, fingerprint.members);
    if (best === null || members.length <= best.members.length) {
      best = { closest: review.commits.at(-1) ?? null, members };
    }
  }
  return best ?? { closest: null, members: [] };
}

// A recipe that falls back counts as `unsupported`: its types then come from the
// pinned sources rather than the project's commit, the same claim a fork makes. So
// does a library this run printed nothing for, whose types are not from its archive.
export function classifyLibraryStatus(input: {
  reviews: readonly LibraryReview[] | null;
  commit: string | undefined;
  fingerprint: LibraryFingerprint;
  printedFrom: readonly ("archive" | "pinned")[];
  newerFolder: string | null;
}): LibraryStatus {
  const { reviews, commit, fingerprint, printedFrom, newerFolder } = input;
  const known = reviews ?? [];
  if (commit !== undefined && known.some(({ commits }) => commits.includes(commit))) {
    return { status: "exact", by: "commit" };
  }
  if (
    known.some(({ version, api }) => version === FINGERPRINT_VERSION && api === fingerprint.api)
  ) {
    return { status: "exact", by: "api" };
  }
  if (newerFolder !== null) {
    return { status: "newer-cli", folder: newerFolder };
  }
  if (reviews === null) {
    return { status: "unrecorded" };
  }
  if (printedFrom.length > 0 && printedFrom.every((from) => from === "archive")) {
    return { status: "generated" };
  }
  return { status: "unsupported", ...closestReview(known, fingerprint) };
}

// Read leniently, since a newer format is allowed to differ: what this CLI cannot
// read covers nothing, and never fails the run.
function folderCovers(
  path: string,
  commit: string | undefined,
  fingerprint: LibraryFingerprint,
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
  const reviews = (parsed as { reviews?: unknown } | null)?.reviews;
  if (!Array.isArray(reviews)) return false;
  return reviews.some((review: unknown) => {
    if (typeof review !== "object" || review === null) return false;
    const { commits, version, api } = review as Record<string, unknown>;
    return (
      (commit !== undefined && Array.isArray(commits) && commits.includes(commit)) ||
      (version === FINGERPRINT_VERSION && api === fingerprint.api)
    );
  });
}

/** The lowest data folder above `folder` whose reviews cover this library's archive. */
export function newerFolderCovering(
  dataRoot: string,
  folder: string,
  library: string,
  commit: string | undefined,
  fingerprint: LibraryFingerprint,
): string | null {
  for (const newer of newerDataFolders(dataRoot, folder)) {
    if (folderCovers(join(dataRoot, newer, library, REVIEWED_FILE), commit, fingerprint)) {
      return newer;
    }
  }
  return null;
}

function namedMembers(members: readonly string[]): string {
  const named = members.slice(0, MEMBERS_NAMED).join(", ");
  const rest = members.length - MEMBERS_NAMED;
  return rest > 0 ? `${named} +${rest} more` : named;
}

/**
 * What the plain report says about each library that is not exact. `movedByUpdate`
 * tells which this run's `--update` already moved: `resolve --update` is no advice for
 * those.
 */
export function libraryStatusMessages(
  statuses: readonly { readonly url: string; readonly status: LibraryStatus }[],
  movedByUpdate: (url: string) => boolean = () => false,
): { warnings: string[]; notices: string[] } {
  const warnings: string[] = [];
  const notices: string[] = [];
  const unrecorded: string[] = [];
  for (const { url, status } of statuses) {
    switch (status.status) {
      case "exact":
        break;
      case "generated":
        notices.push(
          `the types for ${url} were generated from its archive, at a commit library data has not reviewed`,
        );
        break;
      case "newer-cli":
        notices.push(
          `${url} is reviewed only in library data for CLI ${status.folder} and later: upgrade defold-typescript to ${status.folder} to read it`,
        );
        break;
      case "unsupported":
        warnings.push(
          status.closest === null
            ? `${url} matches no reviewed commit, and library data has none to compare it with, so its types may not fit`
            : `${url} matches no reviewed commit, so its types may not fit: the closest is ${status.closest}, which differs in ${namedMembers(status.members)}`,
        );
        break;
      case "unrecorded":
        unrecorded.push(url);
        break;
    }
  }
  if (unrecorded.length > 0) {
    const advice = unrecorded.every(movedByUpdate)
      ? ""
      : "; run `defold-typescript resolve --update` to move to newer data";
    notices.push(
      `the library data this project is pinned to records no reviews for ${unrecorded.join(", ")}${advice}`,
    );
  }
  return { warnings, notices };
}

// Three hashes over the files a library archive shares, split by what a change to
// them can break: `api` moves when a member's shape or an annotation changes, `doc`
// when only documentation does, and `source` on any change. A file this cannot read
// member by member counts whole under `api`, because a false "needs review" is cheap
// and a false "exact" is not. `api` does not see a body: a change to what an
// unannotated function returns, or to a constant's value, moves `source` alone.

import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { ExtensionZip } from "../extension-archive";
import { archiveIdentity, archiveSharedFiles } from "../extension-version";
import type { LibraryReview } from "./library-data";
import { parseLuaSurface } from "./parse-lua-surface";

// A review records the version it was hashed under, and a CLI compares `api` only
// with reviews of its own version, so changing these rules cannot make an older CLI
// report false differences.
export const FINGERPRINT_VERSION = 1;

export interface LibraryFingerprint {
  version: number;
  api: string;
  doc: string;
  source: string;
  members: Record<string, string>;
}

const WHOLE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".script_api",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hpp",
  ".m",
  ".mm",
]);

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function memberHash(text: string): string {
  return sha256(text).slice(0, 16);
}

const isComment = (line: string): boolean => line.trimStart().startsWith("--");
const isAnnotation = (line: string): boolean => line.trimStart().startsWith("---@");
const isDoc = (line: string): boolean => line.trimStart().startsWith("---") && !isAnnotation(line);

function luaMembers(path: string, text: string, lines: readonly string[]): [string, string][] {
  let surface: ReturnType<typeof parseLuaSurface>;
  try {
    surface = parseLuaSurface(text);
  } catch {
    // A `---@meta` file is refused for returning nothing, and its annotations are all
    // it declares, so they count here with the code.
    const counted = lines.filter((line) => !isComment(line) || isAnnotation(line));
    return [[path, memberHash(counted.join("\n"))]];
  }
  const entries = surface.members.map(({ name, params, varargs, method }): [string, string] => [
    `${path}#${name}`,
    memberHash(JSON.stringify([params ?? null, varargs, method === true])),
  ]);
  const annotations = lines.filter(isAnnotation);
  return annotations.length === 0
    ? entries
    : [...entries, [`${path}#@annotations`, memberHash(annotations.join("\n"))]];
}

export function archiveFingerprint(zip: ExtensionZip): LibraryFingerprint {
  const members: [string, string][] = [];
  const docs: [string, string[]][] = [];
  for (const { entry, path } of archiveSharedFiles(zip)) {
    const extension = posix.extname(path).toLowerCase();
    if (extension === ".lua") {
      const text = zip.read(entry).replaceAll("\r\n", "\n");
      const lines = text.split("\n");
      members.push(...luaMembers(path, text, lines));
      const doc = lines.filter(isDoc);
      if (doc.length > 0) docs.push([path, doc]);
    } else if (WHOLE_FILE_EXTENSIONS.has(extension)) {
      members.push([path, memberHash(zip.read(entry).replaceAll("\r\n", "\n"))]);
    }
  }
  const sorted = members.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    version: FINGERPRINT_VERSION,
    api: sha256(JSON.stringify(sorted)),
    doc: sha256(JSON.stringify(docs)),
    source: archiveIdentity(zip).files,
    members: Object.fromEntries(sorted),
  };
}

/** `reviews` with this fingerprint recorded, and whether that changed anything. */
export function recordReview(
  reviews: readonly LibraryReview[],
  fingerprint: LibraryFingerprint,
  commit: string | undefined,
): { reviews: LibraryReview[]; added: boolean } {
  const { version, api, doc, source, members } = fingerprint;
  const index = reviews.findIndex(
    (review) =>
      review.version === version &&
      review.api === api &&
      review.doc === doc &&
      review.source === source,
  );
  const match = reviews[index];
  if (match === undefined) {
    const commits = commit === undefined ? [] : [commit];
    return {
      reviews: [...reviews, { version, commits, api, doc, source, members }],
      added: true,
    };
  }
  if (commit === undefined || match.commits.includes(commit)) {
    return { reviews: [...reviews], added: false };
  }
  return {
    reviews: reviews.map((review, at) =>
      at === index ? { ...review, commits: [...review.commits, commit] } : review,
    ),
    added: true,
  };
}

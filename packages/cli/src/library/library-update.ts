// `library update` walks what each library follows upstream and records a new commit
// whose hashes a review already holds. The newest commit that differs moves the
// library: its pin, its review and the upstream files its lanes read go together, or
// not at all, and the report says what the change did to its members. Hand-kept files
// are never written, and `library check` stays the judge of whether a fork still fits.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  defaultReadZip,
  type ExtensionZip,
  extensionCacheDir,
  resolveExtensionArchive,
} from "../extension-archive";
import { type AddLibraryOptions, requireContainedFiles } from "./library-add";
import {
  type LibraryData,
  type LibraryReview,
  REVIEWED_FILE,
  type ReadLibraryOptions,
  readLibraryData,
  readLibraryReviews,
  writeReviewedJson,
} from "./library-data";
import {
  archiveFingerprint,
  FINGERPRINT_VERSION,
  findReview,
  type LibraryFingerprint,
  recordReview,
} from "./library-fingerprint";
import type { FailedReview } from "./library-review";
import { differingMembers } from "./library-status";
import { archiveFiles } from "./source-tree";
import { selectLualsSources } from "./sync-luals-types";
import { datedTags, type ForgeReads, forgeReadsFor, tagSeries } from "./upstream-forge";

export type UpdateForge = Pick<ForgeReads, "listTags" | "readCommit" | "readRepo" | "headCommit">;

export interface UpdateLibrariesOptions extends AddLibraryOptions, ReadLibraryOptions {
  readonly forge?: (repo: string) => UpdateForge;
}

/**
 * What upstream did to a library's members, against the review of the pinned commit.
 * `kept`: its `api` hash held, so only doc comments or function bodies moved. `added`:
 * every old member held its hash and new ones exist. `changed`: anything else, or no
 * single review of the pinned commit to compare with.
 */
export type LibraryChange = "kept" | "added" | "changed";

export interface MemberChanges {
  readonly added: string[];
  readonly removed: string[];
  readonly changed: string[];
}

export interface UpdatedLibrary {
  readonly library: string;
  readonly status: "held" | "current" | "recorded" | "regenerated";
  readonly recorded: string[];
  readonly differs: string[];
  // Forward-slash paths relative to the library's folder.
  readonly written: string[];
  // A regenerated library's new pin, and what the move did to its members.
  readonly ref?: string;
  readonly change?: LibraryChange;
  readonly members?: MemberChanges;
}

export interface LibraryUpdateResult {
  readonly updated: UpdatedLibrary[];
  readonly failed: FailedReview[];
}

export function reportedLibraryPath(
  dataFolder: string,
  library: string,
  file: string,
  flavor: Pick<typeof path, "join" | "sep"> = path,
): string {
  return flavor.join(dataFolder, library, file).split(flavor.sep).join("/");
}

interface Candidate {
  readonly ref: string;
  readonly commit: string;
}

interface Candidates {
  // The commit the pin names today, whose review a change is compared with.
  readonly pinCommit: string;
  readonly candidates: Candidate[];
}

const UPSTREAM_DIR = "source/upstream";

async function tagCandidates({ repo, ref }: LibraryData, forge: UpdateForge): Promise<Candidates> {
  const tags = await datedTags(repo, forge);
  const pinned = tags.find((tag) => tag.name === ref);
  if (pinned === undefined || Number.isNaN(pinned.date)) {
    throw new Error(`upstream no longer lists the pinned tag ${ref}`);
  }
  const series = tagSeries(ref);
  return {
    pinCommit: pinned.sha,
    candidates: tags
      .filter(
        (tag) =>
          !Number.isNaN(tag.date) && tag.date > pinned.date && tagSeries(tag.name) === series,
      )
      .sort((a, b) => a.date - b.date)
      .map((tag) => ({ ref: tag.name, commit: tag.sha })),
  };
}

async function branchCandidates(
  { repo, ref }: LibraryData,
  forge: UpdateForge,
): Promise<Candidates> {
  const { defaultBranch } = await forge.readRepo(repo);
  const head = await forge.headCommit(repo, defaultBranch);
  return { pinCommit: ref, candidates: head === ref ? [] : [{ ref: head, commit: head }] };
}

/**
 * The one review of this fingerprint version that lists `pinCommit`, or `undefined`
 * when none does or several do: two reviews of one commit hold different hashes, so
 * neither can be trusted as its baseline.
 */
function reviewOfPin(
  reviews: readonly LibraryReview[],
  pinCommit: string,
): LibraryReview | undefined {
  const listing = reviews.filter(
    ({ version, commits }) => version === FINGERPRINT_VERSION && commits.includes(pinCommit),
  );
  return listing.length === 1 ? listing[0] : undefined;
}

function classifyChange(
  reviews: readonly LibraryReview[],
  pinCommit: string,
  fingerprint: LibraryFingerprint,
): { change: LibraryChange; members: MemberChanges } {
  // By the pin's commit, not list order: a restored pin keeps its review where it was.
  const pinned = reviewOfPin(reviews, pinCommit);
  if (pinned === undefined) {
    return { change: "changed", members: { added: [], removed: [], changed: [] } };
  }
  const differing = differingMembers(pinned.members, fingerprint.members);
  const added = differing.filter((member) => !Object.hasOwn(pinned.members, member));
  const removed = differing.filter((member) => !Object.hasOwn(fingerprint.members, member));
  const changed = differing.filter(
    (member) => !added.includes(member) && !removed.includes(member),
  );
  const onlyAdded = added.length > 0 && removed.length === 0 && changed.length === 0;
  return {
    change: pinned.api === fingerprint.api ? "kept" : onlyAdded ? "added" : "changed",
    members: { added, removed, changed },
  };
}

function upstreamFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    );
}

interface Regeneration {
  // Folders replaced whole, so a file upstream removed leaves.
  readonly replaced: string[];
  // Bytes by the path they land at, relative to the data folder.
  readonly copies: Map<string, Uint8Array>;
}

// Built whole in memory, so a failed read writes nothing for the library.
function planRegeneration(
  dataDir: string,
  { dir, repo, luals, scriptApi }: LibraryData,
  zip: ExtensionZip,
  ref: string,
): Regeneration {
  const files = archiveFiles(zip);
  const entryAt = new Map(files.map(({ entry, path: file }) => [file, entry]));
  const luaPaths = [...entryAt.keys()].filter((file) => file.endsWith(".lua"));
  const sources = new Map<string, string>();
  for (const target of luals) {
    for (const file of selectLualsSources(luaPaths, target)) {
      sources.set(`${target.sourceDir}/${file}`, file);
    }
  }
  for (const { sourceFile, scriptApi: file } of scriptApi) sources.set(sourceFile, file);
  const upstreamRoot = path.join(dataDir, dir, UPSTREAM_DIR);
  for (const file of upstreamFiles(upstreamRoot)) {
    sources.set(`${dir}/${UPSTREAM_DIR}/${file}`, file);
  }

  const chosen = [...sources.values()].map((file) => {
    const entry = entryAt.get(file);
    if (entry === undefined) throw new Error(`${file} is gone from ${ref}`);
    return { entry, path: file };
  });
  requireContainedFiles(chosen, `${repo} at ${ref}`);
  const copies = new Map<string, Uint8Array>();
  for (const [dest, file] of sources) copies.set(dest, zip.bytes(entryAt.get(file) as string));
  return { replaced: luals.map(({ sourceDir }) => sourceDir), copies };
}

function writeRegeneration(dataDir: string, { replaced, copies }: Regeneration): void {
  for (const folder of replaced) {
    rmSync(path.join(dataDir, folder), { recursive: true, force: true });
  }
  for (const [dest, bytes] of copies) {
    const file = path.join(dataDir, dest);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}

async function updateLibrary(
  dataDir: string,
  library: LibraryData,
  opts: UpdateLibrariesOptions,
): Promise<UpdatedLibrary> {
  const { dir, follows, repo, ref } = library;
  if (follows === "none") {
    return { library: dir, status: "held", recorded: [], differs: [], written: [] };
  }

  const forge = (opts.forge ?? forgeReadsFor)(repo);
  const { pinCommit, candidates } =
    follows === "tags"
      ? await tagCandidates(library, forge)
      : await branchCandidates(library, forge);

  let reviews: LibraryReview[] = readLibraryReviews(dataDir, dir) ?? [];
  const recorded: string[] = [];
  const differs: string[] = [];
  let newest: { candidate: Candidate; zip: ExtensionZip; fingerprint: LibraryFingerprint } | null =
    null;
  for (const candidate of candidates) {
    // Two tags on one commit name one candidate.
    if (differs.includes(candidate.commit)) continue;
    if (reviews.some(({ commits }) => commits.includes(candidate.commit))) continue;
    // By commit, since a tag can move after the forge names its commit.
    const archive = await resolveExtensionArchive(
      { index: 0, url: `${repo}/archive/${candidate.commit}.zip` },
      {
        cacheDir: opts.cacheDir ?? extensionCacheDir(),
        requireRevalidation: true,
        ...(opts.download === undefined ? {} : { download: opts.download }),
      },
    );
    const zip = await defaultReadZip(archive.archivePath);
    const fingerprint = archiveFingerprint(zip);
    if (findReview(reviews, fingerprint) === -1) {
      differs.push(candidate.commit);
      // An older one stays unrecorded: a review claims the data was checked against
      // that commit, and the data never was.
      newest = { candidate, zip, fingerprint };
      continue;
    }
    // The forge's commit, since a Codeberg archive may name none.
    ({ reviews } = recordReview(reviews, fingerprint, candidate.commit));
    recorded.push(candidate.commit);
  }
  // Written once the walk is whole, so a failed read leaves the library's record alone.
  if (newest === null) {
    if (recorded.length > 0) writeReviewedJson(dataDir, dir, { ref, reviews });
    return {
      library: dir,
      status: recorded.length > 0 ? "recorded" : "current",
      recorded,
      differs,
      written: recorded.length > 0 ? [REVIEWED_FILE] : [],
    };
  }

  const { candidate, zip, fingerprint } = newest;
  const regeneration = planRegeneration(dataDir, library, zip, candidate.ref);
  const classified = classifyChange(reviews, pinCommit, fingerprint);
  writeRegeneration(dataDir, regeneration);
  writeReviewedJson(dataDir, dir, {
    ref: candidate.ref,
    reviews: recordReview(reviews, fingerprint, candidate.commit).reviews,
  });
  return {
    library: dir,
    status: "regenerated",
    recorded,
    differs,
    written: [
      ...[...regeneration.copies.keys()].map((dest) => dest.slice(dir.length + 1)).sort(),
      REVIEWED_FILE,
    ],
    ref: candidate.ref,
    ...classified,
  };
}

/**
 * Walk the libraries `names` lists, or every library when it is empty. Throws, before
 * any request, on a name the data folder does not hold; a library that cannot be read
 * upstream is reported in `failed` and leaves the others to run.
 */
export async function updateLibraries(
  dataDir: string,
  names: readonly string[],
  opts: UpdateLibrariesOptions,
): Promise<LibraryUpdateResult> {
  const libraries = readLibraryData(dataDir, { cliVersion: opts.cliVersion });
  for (const name of names) {
    if (!libraries.some(({ dir }) => dir === name)) {
      throw new Error(`no library ${name} in ${dataDir}`);
    }
  }
  const updated: UpdatedLibrary[] = [];
  const failed: FailedReview[] = [];
  for (const library of libraries) {
    if (names.length > 0 && !names.includes(library.dir)) continue;
    try {
      updated.push(await updateLibrary(dataDir, library, opts));
    } catch (error) {
      failed.push({
        library: library.dir,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { updated, failed };
}

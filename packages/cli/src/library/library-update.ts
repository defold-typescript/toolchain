// `library update` walks what each library follows upstream and records a new commit
// whose hashes a review already holds. A commit that differs is reported, and its
// library's record is left alone.

import { defaultReadZip, extensionCacheDir, resolveExtensionArchive } from "../extension-archive";
import type { AddLibraryOptions } from "./library-add";
import {
  type LibraryData,
  type LibraryReview,
  readLibraryData,
  readLibraryReviews,
  writeReviewedJson,
} from "./library-data";
import { archiveFingerprint, findReview, recordReview } from "./library-fingerprint";
import type { FailedReview } from "./library-review";
import { datedTags, type ForgeReads, forgeReadsFor, tagSeries } from "./upstream-forge";

export type UpdateForge = Pick<ForgeReads, "listTags" | "readCommit" | "readRepo" | "headCommit">;

export interface UpdateLibrariesOptions extends AddLibraryOptions {
  readonly forge?: (repo: string) => UpdateForge;
}

export interface UpdatedLibrary {
  readonly library: string;
  readonly status: "held" | "current" | "recorded" | "differs";
  readonly recorded: string[];
  readonly differs: string[];
}

export interface LibraryUpdateResult {
  readonly updated: UpdatedLibrary[];
  readonly failed: FailedReview[];
}

interface Candidate {
  readonly ref: string;
  readonly commit: string;
}

async function tagCandidates({ repo, ref }: LibraryData, forge: UpdateForge): Promise<Candidate[]> {
  const tags = await datedTags(repo, forge);
  const pinned = tags.find((tag) => tag.name === ref);
  if (pinned === undefined || Number.isNaN(pinned.date)) {
    throw new Error(`upstream no longer lists the pinned tag ${ref}`);
  }
  const series = tagSeries(ref);
  return tags
    .filter(
      (tag) => !Number.isNaN(tag.date) && tag.date > pinned.date && tagSeries(tag.name) === series,
    )
    .sort((a, b) => a.date - b.date)
    .map((tag) => ({ ref: tag.name, commit: tag.sha }));
}

async function branchCandidates(
  { repo, ref }: LibraryData,
  forge: UpdateForge,
): Promise<Candidate[]> {
  const { defaultBranch } = await forge.readRepo(repo);
  const head = await forge.headCommit(repo, defaultBranch);
  return head === ref ? [] : [{ ref: head, commit: head }];
}

async function updateLibrary(
  dataDir: string,
  library: LibraryData,
  opts: UpdateLibrariesOptions,
): Promise<UpdatedLibrary> {
  const { dir, follows, repo, ref } = library;
  if (follows === "none") return { library: dir, status: "held", recorded: [], differs: [] };

  const forge = (opts.forge ?? forgeReadsFor)(repo);
  const candidates =
    follows === "tags"
      ? await tagCandidates(library, forge)
      : await branchCandidates(library, forge);

  let reviews: LibraryReview[] = readLibraryReviews(dataDir, dir) ?? [];
  const recorded: string[] = [];
  const differs: string[] = [];
  for (const candidate of candidates) {
    // Two tags on one commit name one candidate.
    if (differs.includes(candidate.commit)) continue;
    if (reviews.some(({ commits }) => commits.includes(candidate.commit))) continue;
    const archive = await resolveExtensionArchive(
      { index: 0, url: `${repo}/archive/${candidate.ref}.zip` },
      {
        cacheDir: opts.cacheDir ?? extensionCacheDir(),
        requireRevalidation: true,
        ...(opts.download === undefined ? {} : { download: opts.download }),
      },
    );
    const fingerprint = archiveFingerprint(await defaultReadZip(archive.archivePath));
    if (findReview(reviews, fingerprint) === -1) {
      differs.push(candidate.commit);
      continue;
    }
    // The forge's commit, since a Codeberg archive may name none.
    ({ reviews } = recordReview(reviews, fingerprint, candidate.commit));
    recorded.push(candidate.commit);
  }
  // Written once the walk is whole, so a failed read leaves the library's record alone.
  if (recorded.length > 0) writeReviewedJson(dataDir, dir, { ref, reviews });
  return {
    library: dir,
    status: differs.length > 0 ? "differs" : recorded.length > 0 ? "recorded" : "current",
    recorded,
    differs,
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
  const libraries = readLibraryData(dataDir);
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

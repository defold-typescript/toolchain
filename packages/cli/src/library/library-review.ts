// `library review` records the hashes of the archive each library's `ref` pins, so a
// later `resolve` can tell whether a project's commit matches what the data covers.

import { defaultReadZip, extensionCacheDir, resolveExtensionArchive } from "../extension-archive";
import type { AddLibraryOptions } from "./library-add";
import { readLibraryData, readLibraryReviews, writeReviewedJson } from "./library-data";
import { archiveFingerprint, recordReview } from "./library-fingerprint";

export interface ReviewedLibrary {
  readonly library: string;
  readonly commit: string | null;
  readonly added: boolean;
}

export interface FailedReview {
  readonly library: string;
  readonly message: string;
}

export interface LibraryReviewResult {
  readonly reviewed: ReviewedLibrary[];
  readonly failed: FailedReview[];
}

/**
 * Record a review for the libraries `names` lists, or for every library when it is
 * empty. Throws, before any download, on a name the data folder does not hold; a
 * library whose archive cannot be read is reported in `failed` and leaves the others
 * to be written. A failed download fails its library even when a cached copy exists,
 * because a record says what the archive holds now.
 */
export async function reviewLibraries(
  dataDir: string,
  names: readonly string[],
  opts: AddLibraryOptions,
): Promise<LibraryReviewResult> {
  const libraries = readLibraryData(dataDir);
  for (const name of names) {
    if (!libraries.some(({ dir }) => dir === name)) {
      throw new Error(`no library ${name} in ${dataDir}`);
    }
  }
  const reviewed: ReviewedLibrary[] = [];
  const failed: FailedReview[] = [];
  for (const { dir, repo, ref } of libraries) {
    if (names.length > 0 && !names.includes(dir)) continue;
    try {
      const archive = await resolveExtensionArchive(
        { index: 0, url: `${repo}/archive/${ref}.zip` },
        {
          cacheDir: opts.cacheDir ?? extensionCacheDir(),
          requireRevalidation: true,
          ...(opts.download === undefined ? {} : { download: opts.download }),
        },
      );
      const { commit } = archive.identity;
      const { reviews, added } = recordReview(
        readLibraryReviews(dataDir, dir) ?? [],
        archiveFingerprint(await defaultReadZip(archive.archivePath)),
        commit,
      );
      if (added) writeReviewedJson(dataDir, dir, { ref, reviews });
      reviewed.push({ library: dir, commit: commit ?? null, added });
    } catch (error) {
      failed.push({
        library: dir,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { reviewed, failed };
}

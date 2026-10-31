import { readCliVersion } from "../packages/cli/src/cli-version.ts";
import type { DownloadExtensionArchive } from "../packages/cli/src/extension-archive.ts";
import { checkLibraryData } from "../packages/cli/src/library/library-check.ts";
import {
  LIBRARY_DATA_MAIN_URL,
  libraryDataCacheDir,
  resolveLibraryDataArchive,
} from "../packages/cli/src/library-data-archive.ts";

// Runs `library check` with this working tree's CLI against the data repo's live
// `main`, the data a released CLI would read. The release gate and the nightly run
// both call it.

export interface LiveLibraryCheckOptions {
  readonly download?: DownloadExtensionArchive;
  readonly cacheDir: string;
  readonly cliVersion: string;
  readonly write: (text: string) => void;
}

export async function runLiveLibraryCheck(opts: LiveLibraryCheckOptions): Promise<number> {
  const { download, cacheDir, cliVersion, write } = opts;
  const { dir, commit, warning, error } = await resolveLibraryDataArchive({
    mainUrl: LIBRARY_DATA_MAIN_URL,
    cacheDir,
    recorded: null,
    frozen: false,
    cliVersion,
    ...(download === undefined ? {} : { download }),
  });

  // A warning means the run fell back to a cached copy or found no data, and a gate
  // that checks a stale copy would pass on data it never saw.
  const unread = error ?? warning;
  if (unread !== undefined || dir === null) {
    write(`library check: ${unread ?? `no library data for CLI ${cliVersion}`}\n`);
    return 1;
  }

  const problems = await checkLibraryData(dir);
  for (const { library, check, message } of problems) {
    write(`${library}: ${check}: ${message}\n`);
  }
  if (problems.length > 0) {
    write(
      `library check: ${problems.length} problem${problems.length === 1 ? "" : "s"} in commit ${commit} for CLI ${cliVersion}\n`,
    );
    return 1;
  }
  write(`library check: commit ${commit} is clean for CLI ${cliVersion}\n`);
  return 0;
}

if (import.meta.main) {
  process.exit(
    await runLiveLibraryCheck({
      cacheDir: libraryDataCacheDir(),
      cliVersion: readCliVersion(),
      write: (text) => process.stdout.write(text),
    }),
  );
}

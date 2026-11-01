// Library data as the data repo's archive: a moving `main.zip` revalidated by
// ETag, unpacked once per commit, so a project can record the commit it resolved
// against and `--frozen` can hold to it. A commit reaches this module from a
// project's lockfile and becomes a cache path and a URL, so it is checked before
// either.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { archiveWrapperOf, isContainedResourcePath } from "@defold-typescript/transpiler";
import {
  cachedOrDownloaded,
  type DownloadExtensionArchive,
  defaultReadZip,
  type ExtensionZip,
  fetchExtensionArchive,
  type ReadExtensionZip,
} from "./extension-archive";
import { COMMIT_COMMENT } from "./extension-version";
import { selectDataFolder } from "./library/data-folder";

export const LIBRARY_DATA_MAIN_URL =
  "https://github.com/defold-typescript/library-data/archive/refs/heads/main.zip";

export interface ResolveLibraryDataArchiveOptions {
  readonly mainUrl: string;
  readonly cacheDir: string;
  // The commit the project's lockfile holds.
  readonly recorded: string | null;
  readonly frozen: boolean;
  // Moves a recorded commit to newer data. Without it a recorded commit holds, the
  // way `bun install` holds its lockfile.
  readonly update?: boolean;
  readonly cliVersion: string;
  readonly download?: DownloadExtensionArchive;
  readonly readZip?: ReadExtensionZip;
}

// `dir` and `commit` are both set or both null. A failure is a `warning` on a
// plain run and an `error` on a frozen one, which must not guess.
export interface LibraryDataArchive {
  readonly dir: string | null;
  readonly commit: string | null;
  readonly warning?: string;
  readonly error?: string;
  // Main's data folder when it differs from the recorded commit this holds to, for
  // the caller to weigh against what the project uses.
  readonly newer?: { readonly dir: string; readonly commit: string };
  // Why a run left its recorded commit without being asked to.
  readonly moved?: string;
}

// Mirrors `extensionCacheDir`.
export function libraryDataCacheDir(
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string {
  if (env.DEFOLD_TYPESCRIPT_CACHE) {
    return join(env.DEFOLD_TYPESCRIPT_CACHE, "library-data");
  }
  return join(env.XDG_CACHE_HOME ?? join(home(), ".cache"), "defold-typescript", "library-data");
}

// A commit's archive sits in the same repository as `mainUrl`, so a data repo
// other than the default never sends a frozen run to the default's archive.
export function libraryDataCommitUrl(commit: string, mainUrl = LIBRARY_DATA_MAIN_URL): string {
  return mainUrl.replace(/refs\/heads\/[^/]+\.zip$/, `${commit}.zip`);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Lands by rename, so a concurrent run sees a whole commit folder or none. A
// commit's contents never change, so a folder that landed first is as good as
// this one.
function unpackCommit(zip: ExtensionZip, target: string): void {
  if (existsSync(target)) {
    return;
  }
  const entries = zip.entries();
  const wrapper = archiveWrapperOf(entries);
  if (wrapper === undefined || !isContainedResourcePath(wrapper)) {
    throw new Error("its entries do not share one top folder");
  }
  const files: { entry: string; path: string }[] = [];
  for (const entry of entries) {
    const path = entry.slice(wrapper.length + 1);
    if (path.length === 0) {
      continue;
    }
    if (!isContainedResourcePath(path.replace(/\/$/, ""))) {
      throw new Error(`it holds the unsafe entry ${entry}`);
    }
    if (!path.endsWith("/")) {
      files.push({ entry, path });
    }
  }

  const stage = `${target}.${process.pid}.partial`;
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  try {
    for (const { entry, path } of files) {
      const out = join(stage, path);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, zip.bytes(entry));
    }
    try {
      renameSync(stage, target);
    } catch (err) {
      if (!existsSync(target)) {
        throw err;
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

// Each file's length is hashed before its bytes, so bytes that read like the next
// file's name cannot make two different folders hash alike.
export function dataFolderDigest(dir: string): string {
  const hash = createHash("sha256");
  const paths = (readdirSync(dir, { recursive: true }) as string[])
    .filter((path) => statSync(join(dir, path)).isFile())
    .map((path) => path.split(sep).join("/"))
    .sort();
  for (const path of paths) {
    const bytes = readFileSync(join(dir, path));
    hash.update(`${path}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

export async function resolveLibraryDataArchive(
  opts: ResolveLibraryDataArchiveOptions,
): Promise<LibraryDataArchive> {
  const { mainUrl, cacheDir, frozen, cliVersion } = opts;
  const download = opts.download ?? fetchExtensionArchive;
  const open = opts.readZip ?? defaultReadZip;
  const recorded =
    opts.recorded !== null && COMMIT_COMMENT.test(opts.recorded) ? opts.recorded : null;
  const commitDir = (commit: string) => join(cacheDir, "commits", commit);

  const unavailable = (message: string): LibraryDataArchive =>
    frozen
      ? { dir: null, commit: null, error: message }
      : { dir: null, commit: null, warning: message };

  const fromCommit = (commit: string, warning?: string): LibraryDataArchive => {
    const dir = selectDataFolder(join(commitDir(commit), "data"), cliVersion);
    if (dir === null) {
      return unavailable(`library data commit ${commit} holds no folder for CLI ${cliVersion}`);
    }
    return { dir, commit, ...(warning === undefined ? {} : { warning }) };
  };

  const fromArchive = async (
    url: string,
    archivePath: string,
    expected: string | null,
    warning?: string,
  ): Promise<LibraryDataArchive> => {
    let commit: string;
    try {
      const zip = await open(archivePath);
      commit = zip.comment();
      if (!COMMIT_COMMENT.test(commit)) {
        return unavailable(`the archive at ${url} names no commit in its comment`);
      }
      if (expected !== null && commit !== expected) {
        return unavailable(`the archive at ${url} holds commit ${commit}, not ${expected}`);
      }
      unpackCommit(zip, commitDir(commit));
    } catch (err) {
      return unavailable(`could not unpack the archive at ${url}: ${errorMessage(err)}`);
    }
    return fromCommit(commit, warning);
  };

  const fromCommitUrl = async (commit: string): Promise<LibraryDataArchive> => {
    if (existsSync(commitDir(commit))) {
      return fromCommit(commit);
    }
    const url = libraryDataCommitUrl(commit, mainUrl);
    try {
      const { archivePath, warning } = await cachedOrDownloaded(url, cacheDir, download);
      return await fromArchive(url, archivePath, commit, warning);
    } catch (err) {
      return unavailable(`could not download ${url}: ${errorMessage(err)}`);
    }
  };

  // Only a data change moves a project's commit, so a commit to the data repo's
  // docs or workflows rewrites no lockfile. This never fails a run, which
  // already holds good data at the newest commit.
  const keepingRecorded = async (
    newest: LibraryDataArchive,
    warning?: string,
  ): Promise<LibraryDataArchive> => {
    if (recorded === null || newest.dir === null || newest.commit === recorded) {
      return newest;
    }
    const held = await fromCommitUrl(recorded);
    if (held.dir === null) {
      return newest;
    }
    try {
      const unchanged =
        basename(held.dir) === basename(newest.dir) &&
        dataFolderDigest(held.dir) === dataFolderDigest(newest.dir);
      return unchanged ? fromCommit(recorded, warning) : newest;
    } catch {
      return newest;
    }
  };

  // Main is checked before the recorded commit is fetched, so a project already at
  // main's commit downloads one archive. Data this run could not check never moves
  // the commit.
  const holdingRecorded = async (commit: string): Promise<LibraryDataArchive> => {
    let newest: LibraryDataArchive;
    try {
      const { archivePath, warning } = await cachedOrDownloaded(mainUrl, cacheDir, download);
      newest =
        warning === undefined
          ? await fromArchive(mainUrl, archivePath, null)
          : unavailable(warning);
    } catch (err) {
      newest = unavailable(
        `could not download ${mainUrl} and nothing is cached: ${errorMessage(err)}`,
      );
    }
    if (newest.commit === commit) {
      return newest;
    }
    const held = await fromCommitUrl(commit);
    if (newest.dir === null || newest.commit === null) {
      return held.dir === null ? newest : { dir: held.dir, commit: held.commit };
    }
    const movedFrom = (reason: string): LibraryDataArchive => ({
      dir: newest.dir,
      commit: newest.commit,
      moved: `${reason}, so library data moved to commit ${newest.commit}`,
    });
    if (held.dir === null) {
      return movedFrom(held.warning ?? `library data commit ${commit} could not be read`);
    }
    if (basename(held.dir) !== basename(newest.dir)) {
      return movedFrom(`this CLI now reads the ${basename(newest.dir)} data folder`);
    }
    try {
      return dataFolderDigest(held.dir) === dataFolderDigest(newest.dir)
        ? { dir: held.dir, commit: held.commit }
        : {
            dir: held.dir,
            commit: held.commit,
            newer: { dir: newest.dir, commit: newest.commit },
          };
    } catch {
      return movedFrom(`library data commit ${commit} could not be read`);
    }
  };

  if (frozen) {
    if (recorded === null) {
      return unavailable(
        "--frozen needs a recorded library data commit: run a plain `defold-typescript resolve` first",
      );
    }
    return fromCommitUrl(recorded);
  }

  if (recorded !== null && opts.update !== true) {
    return holdingRecorded(recorded);
  }

  const recordedCached = recorded !== null && existsSync(commitDir(recorded));
  try {
    const { archivePath, warning } = await cachedOrDownloaded(mainUrl, cacheDir, download);
    if (warning !== undefined && recordedCached) {
      return fromCommit(recorded, warning);
    }
    return await keepingRecorded(await fromArchive(mainUrl, archivePath, null, warning), warning);
  } catch (err) {
    const message = errorMessage(err);
    if (recordedCached) {
      return fromCommit(
        recorded,
        `could not download ${mainUrl}, using the recorded commit ${recorded}: ${message}`,
      );
    }
    return unavailable(`could not download ${mainUrl} and nothing is cached: ${message}`);
  }
}

// Library data as the data repo's archive: a moving `main.zip` revalidated by
// ETag, unpacked once per commit, so a project can record the commit it resolved
// against and `--frozen` can hold to it. A commit reaches this module from a
// project's `package.json` and becomes a cache path and a URL, so it is checked
// before either.

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
  // The commit the project's `package.json` holds, unchecked.
  readonly recorded: string | null;
  readonly frozen: boolean;
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
    const dir = selectDataFolder(commitDir(commit), cliVersion);
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

  if (frozen) {
    if (recorded === null) {
      return unavailable(
        "--frozen needs a recorded library data commit: run a plain `defold-typescript resolve` first",
      );
    }
    if (existsSync(commitDir(recorded))) {
      return fromCommit(recorded);
    }
    const url = libraryDataCommitUrl(recorded, mainUrl);
    try {
      const { archivePath, warning } = await cachedOrDownloaded(url, cacheDir, download);
      return await fromArchive(url, archivePath, recorded, warning);
    } catch (err) {
      return unavailable(`could not download ${url}: ${errorMessage(err)}`);
    }
  }

  const recordedCached = recorded !== null && existsSync(commitDir(recorded));
  try {
    const { archivePath, warning } = await cachedOrDownloaded(mainUrl, cacheDir, download);
    if (warning !== undefined && recordedCached) {
      return fromCommit(recorded, warning);
    }
    return await fromArchive(mainUrl, archivePath, null, warning);
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

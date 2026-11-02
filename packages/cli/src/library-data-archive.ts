// Library data as the data repo's archive: a moving `main.zip` revalidated by
// ETag, unpacked once per commit, so a project can record the commits it resolved
// against and `--frozen` can hold to them. A commit reaches this module from a
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
import { REVIEWED_FILE } from "./library/library-data";

export const LIBRARY_DATA_MAIN_URL =
  "https://github.com/defold-typescript/library-data/archive/refs/heads/main.zip";

export interface LibraryDataSource {
  readonly mainUrl: string;
  readonly cacheDir: string;
  readonly cliVersion: string;
  readonly download?: DownloadExtensionArchive;
  readonly readZip?: ReadExtensionZip;
}

export interface LibraryDataFolder {
  readonly dir: string;
  readonly commit: string;
  // The selected version folder's name.
  readonly folder: string;
  readonly warning?: string;
}

export interface LibraryDataUnavailable {
  readonly dir: null;
  readonly reason: string;
}

export type LibraryDataAtCommit = LibraryDataFolder | LibraryDataUnavailable;

// `stale` is a cached copy served after a failed request, which `warning` explains.
export type NewestLibraryData =
  | (LibraryDataFolder & { readonly stale: boolean })
  | LibraryDataUnavailable;

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

// Lands by rename, so a concurrent run sees a whole folder or none. A commit's
// contents never change, and neither do a folder's whose name is derived from
// them, so a folder that landed first is as good as this one.
export function landFolder(target: string, fill: (stage: string) => void): void {
  if (existsSync(target)) {
    return;
  }
  const stage = `${target}.${process.pid}.partial`;
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  try {
    fill(stage);
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

function unpackCommit(zip: ExtensionZip, target: string): void {
  landFolder(target, (stage) => {
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
    for (const { entry, path } of files) {
      const out = join(stage, path);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, zip.bytes(entry));
    }
  });
}

// Each file's length is hashed before its bytes, so bytes that read like the next
// file's name cannot make two different folders hash alike.
export function dataFolderDigest(
  dir: string,
  transform: (path: string, bytes: Uint8Array) => Uint8Array = (_path, bytes) => bytes,
): string {
  const hash = createHash("sha256");
  const paths = (readdirSync(dir, { recursive: true }) as string[])
    .filter((path) => statSync(join(dir, path)).isFile())
    .map((path) => path.split(sep).join("/"))
    .sort();
  for (const path of paths) {
    const bytes = transform(path, readFileSync(join(dir, path)));
    hash.update(`${path}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function withoutReviews(path: string, bytes: Uint8Array): Uint8Array {
  if (path !== REVIEWED_FILE) {
    return bytes;
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${REVIEWED_FILE} holds no object`);
  }
  const { reviews: _reviews, ...rest } = parsed as Record<string, unknown>;
  return new TextEncoder().encode(JSON.stringify(rest));
}

// `reviews` is what a followed branch's every commit adds to, so a change to it alone
// leaves a library's types alone. A folder that cannot be read counts as changed.
export function libraryFolderChange(a: string, b: string): "same" | "reviews" | "data" {
  try {
    if (dataFolderDigest(a) === dataFolderDigest(b)) {
      return "same";
    }
    return dataFolderDigest(a, withoutReviews) === dataFolderDigest(b, withoutReviews)
      ? "reviews"
      : "data";
  } catch {
    return "data";
  }
}

const commitDirOf = (cacheDir: string, commit: string) => join(cacheDir, "commits", commit);

function readCommit(
  source: LibraryDataSource,
  commit: string,
  warning?: string,
): LibraryDataAtCommit {
  const { cacheDir, cliVersion } = source;
  const dir = selectDataFolder(join(commitDirOf(cacheDir, commit), "data"), cliVersion);
  if (dir === null) {
    return {
      dir: null,
      reason: `library data commit ${commit} holds no folder for CLI ${cliVersion}`,
    };
  }
  return { dir, commit, folder: basename(dir), ...(warning === undefined ? {} : { warning }) };
}

async function readArchive(
  source: LibraryDataSource,
  url: string,
  archivePath: string,
  expected: string | null,
  warning?: string,
): Promise<LibraryDataAtCommit> {
  const open = source.readZip ?? defaultReadZip;
  let commit: string;
  try {
    const zip = await open(archivePath);
    commit = zip.comment();
    if (!COMMIT_COMMENT.test(commit)) {
      return { dir: null, reason: `the archive at ${url} names no commit in its comment` };
    }
    if (expected !== null && commit !== expected) {
      return { dir: null, reason: `the archive at ${url} holds commit ${commit}, not ${expected}` };
    }
    unpackCommit(zip, commitDirOf(source.cacheDir, commit));
  } catch (err) {
    return { dir: null, reason: `could not unpack the archive at ${url}: ${errorMessage(err)}` };
  }
  return readCommit(source, commit, warning);
}

export async function fetchNewestLibraryData(
  source: LibraryDataSource,
): Promise<NewestLibraryData> {
  const { mainUrl, cacheDir } = source;
  try {
    const { archivePath, warning } = await cachedOrDownloaded(
      mainUrl,
      cacheDir,
      source.download ?? fetchExtensionArchive,
    );
    const read = await readArchive(source, mainUrl, archivePath, null, warning);
    return read.dir === null ? read : { ...read, stale: warning !== undefined };
  } catch (err) {
    return {
      dir: null,
      reason: `could not download ${mainUrl} and nothing is cached: ${errorMessage(err)}`,
    };
  }
}

export async function libraryDataAtCommit(
  source: LibraryDataSource,
  commit: string,
): Promise<LibraryDataAtCommit> {
  if (!COMMIT_COMMENT.test(commit)) {
    return { dir: null, reason: `${commit} is not a library data commit` };
  }
  if (existsSync(commitDirOf(source.cacheDir, commit))) {
    return readCommit(source, commit);
  }
  const url = libraryDataCommitUrl(commit, source.mainUrl);
  try {
    const { archivePath, warning } = await cachedOrDownloaded(
      url,
      source.cacheDir,
      source.download ?? fetchExtensionArchive,
    );
    return await readArchive(source, url, archivePath, commit, warning);
  } catch (err) {
    return { dir: null, reason: `could not download ${url}: ${errorMessage(err)}` };
  }
}

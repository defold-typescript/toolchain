// Network/IO half of the `[dependencies]`-driven extension typing pipeline. The
// foundational slice (extension-deps.ts) built the pure resolver core; this turns
// each declared `dependencies#N` URL into a `ResolvedExtensionArchive` carrying
// real `.script_api` paths plus defold/cache/download provenance. The archive is
// Defold's own fetched copy when its commit checks out (defold-library-cache.ts),
// else this pipeline's cached copy revalidated by ETag, else a fresh download,
// keyed by the arbitrary extension URL instead of a Defold version.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findDefoldLibraryArchive } from "./defold-library-cache";
import {
  classifyExtension,
  type ExtensionDependency,
  type ResolvedExtension,
} from "./extension-deps";
import { archivePin } from "./extension-version";

export type ExtensionArchiveProvenance = "defold" | "cache" | "download";

// The accessor methods this pipeline needs: `entries()` lists the archive (fed to
// the pure `classifyExtension`), `read(entry)` returns one entry's text (fed to
// `emitExtensionDeclaration`), and `bytes(entry)` and `comment()` feed the pin.
// The shared `ZipArchive` (sync-api-docs.ts) is a structural superset of all
// four, so its `readZip` satisfies this without a cast.
export interface ExtensionZip {
  entries(): string[];
  read(entry: string): string;
  bytes(entry: string): Uint8Array;
  comment(): string;
}

// `etag` is the validator the cached copy was stored with, sent only when there
// is a cached copy; `not-modified` means that copy is still what the URL serves.
export type DownloadExtensionArchive = (
  url: string,
  etag?: string,
) => Promise<{ status: "ok"; bytes: Uint8Array; etag?: string } | { status: "not-modified" }>;
export type ReadExtensionZip = (zipPath: string) => ExtensionZip | Promise<ExtensionZip>;

export interface ResolvedExtensionArchive extends ResolvedExtension {
  readonly provenance: ExtensionArchiveProvenance;
  readonly archivePath: string;
  readonly resolvedVersion: string;
  // Set when the cached copy was served because revalidating it failed.
  readonly warning?: string;
}

export interface ResolveExtensionArchiveOptions {
  readonly cacheDir: string;
  // The project Defold fetched libraries into; unset, `.internal/lib/` is not read.
  readonly projectDir?: string;
  readonly download?: DownloadExtensionArchive;
  readonly readZip?: ReadExtensionZip;
}

// Mirrors `refDocCacheDir`: a `DEFOLD_TYPESCRIPT_CACHE` override wins, else the
// XDG cache root, both under an `extensions` subdir.
export function extensionCacheDir(
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string {
  if (env.DEFOLD_TYPESCRIPT_CACHE) {
    return join(env.DEFOLD_TYPESCRIPT_CACHE, "extensions");
  }
  return join(env.XDG_CACHE_HOME ?? join(home(), ".cache"), "defold-typescript", "extensions");
}

// Filesystem-safe per-URL cache key: the URL is arbitrary, so hash it rather
// than trying to map it onto a path.
export function extensionArchiveKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

const fetchExtensionArchive: DownloadExtensionArchive = async (url, etag) => {
  const res = await fetch(url, etag === undefined ? {} : { headers: { "If-None-Match": etag } });
  if (res.status === 304) {
    return { status: "not-modified" };
  }
  if (!res.ok) {
    throw new Error(`download failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  const served = res.headers.get("etag");
  return {
    status: "ok",
    bytes: new Uint8Array(await res.arrayBuffer()),
    ...(served === null ? {} : { etag: served }),
  };
};

// Revalidated on every run, so a moving ref such as `master.zip` follows its
// branch; when the request fails, the cached copy is served with a warning so
// an offline run still resolves. The archive lands by rename, so a concurrent
// run reads the old copy or the new one, never half of one.
async function cachedOrDownloaded(
  url: string,
  cacheDir: string,
  download: DownloadExtensionArchive,
): Promise<{ provenance: "cache" | "download"; archivePath: string; warning?: string }> {
  const dir = join(cacheDir, extensionArchiveKey(url));
  const archivePath = join(dir, "archive.zip");
  const etagPath = join(dir, "etag");
  const cached = existsSync(archivePath);
  const etag = cached && existsSync(etagPath) ? readFileSync(etagPath, "utf8") : undefined;

  let answer: Awaited<ReturnType<DownloadExtensionArchive>>;
  try {
    answer = await download(url, etag);
  } catch (err) {
    if (!cached) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      provenance: "cache",
      archivePath,
      warning: `could not revalidate ${url}, using the cached copy: ${message}`,
    };
  }
  if (answer.status === "not-modified") {
    if (!cached) {
      throw new Error(`download of ${url} answered not modified, but nothing is cached`);
    }
    return { provenance: "cache", archivePath };
  }

  mkdirSync(dir, { recursive: true });
  const staged = `${archivePath}.${process.pid}.partial`;
  writeFileSync(staged, answer.bytes);
  renameSync(staged, archivePath);
  if (answer.etag === undefined) {
    rmSync(etagPath, { force: true });
  } else {
    writeFileSync(etagPath, answer.etag);
  }
  return { provenance: "download", archivePath };
}

// Default accessor: `readZip` ships in `@defold-typescript/types` behind its
// `cli-runtime` export, imported by that specifier because Node's loader reads
// a path as a URL and never strips types under `node_modules`; each runtime
// resolves the entry its export condition names. The import stays dynamic so
// the generator's module graph loads only when a verb needs it (mirrors
// `materializeRefDocSurface`).
export const defaultReadZip: ReadExtensionZip = async (zipPath) => {
  const { readZip } = await import("@defold-typescript/types/cli-runtime");
  return readZip(zipPath);
};

export async function resolveExtensionArchive(
  dep: ExtensionDependency,
  opts: ResolveExtensionArchiveOptions,
): Promise<ResolvedExtensionArchive> {
  const open = opts.readZip ?? defaultReadZip;
  const defoldPath =
    opts.projectDir === undefined
      ? null
      : await findDefoldLibraryArchive(opts.projectDir, dep.url, open);
  const source =
    defoldPath !== null
      ? { provenance: "defold" as const, archivePath: defoldPath }
      : await cachedOrDownloaded(dep.url, opts.cacheDir, opts.download ?? fetchExtensionArchive);

  const zip = await open(source.archivePath);
  return {
    ...classifyExtension(dep.url, zip.entries()),
    ...source,
    resolvedVersion: archivePin(zip),
  };
}

export async function resolveExtensions(
  deps: readonly ExtensionDependency[],
  opts: ResolveExtensionArchiveOptions,
): Promise<ResolvedExtensionArchive[]> {
  const resolved: ResolvedExtensionArchive[] = [];
  for (const dep of deps) {
    resolved.push(await resolveExtensionArchive(dep, opts));
  }
  return resolved;
}

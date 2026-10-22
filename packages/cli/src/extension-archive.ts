// Network/IO half of the `[dependencies]`-driven extension typing pipeline. The
// foundational slice (extension-deps.ts) built the pure resolver core; this turns
// each declared `dependencies#N` URL into a `ResolvedExtensionArchive` carrying
// real `.script_api` paths plus cache/download provenance. It mirrors the
// `versioned-api-surface` doc-source seam (cache->download, the types package's
// `ZipAccessor`) keyed by the arbitrary extension URL instead of a Defold version.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  classifyExtension,
  type ExtensionDependency,
  type ResolvedExtension,
} from "./extension-deps";
import { extensionArchiveVersion } from "./extension-version";

export type ExtensionArchiveProvenance = "cache" | "download";

// The accessor methods this pipeline needs: `entries()` lists the archive (fed to
// the pure `classifyExtension`) and `read(entry)` returns one entry's text (fed to
// `emitExtensionDeclaration`). The shared `ZipAccessor` (sync-api-docs.ts) is a
// structural superset of both, so its `readZip` satisfies this without a cast.
export interface ExtensionZip {
  entries(): string[];
  read(entry: string): string;
}

export type DownloadExtensionArchive = (url: string) => Promise<Uint8Array>;
export type ReadExtensionZip = (zipPath: string) => ExtensionZip | Promise<ExtensionZip>;

export interface ResolvedExtensionArchive extends ResolvedExtension {
  readonly provenance: ExtensionArchiveProvenance;
  readonly archivePath: string;
  readonly resolvedVersion: string;
}

export interface ResolveExtensionArchiveOptions {
  readonly cacheDir: string;
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

const fetchExtensionArchive: DownloadExtensionArchive = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
};

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
  const archivePath = join(opts.cacheDir, extensionArchiveKey(dep.url), "archive.zip");

  let provenance: ExtensionArchiveProvenance;
  let bytes: Uint8Array;
  if (existsSync(archivePath)) {
    provenance = "cache";
    bytes = new Uint8Array(readFileSync(archivePath));
  } else {
    const download = opts.download ?? fetchExtensionArchive;
    bytes = await download(dep.url);
    mkdirSync(dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, bytes);
    provenance = "download";
  }

  const zip = await open(archivePath);
  return {
    ...classifyExtension(dep.url, zip.entries()),
    provenance,
    archivePath,
    resolvedVersion: extensionArchiveVersion(bytes),
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

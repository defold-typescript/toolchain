// Network/IO half of the `[dependencies]`-driven extension typing pipeline. The
// foundational slice (extension-deps.ts) built the pure resolver core; this turns
// each declared `dependencies#N` URL into a `ResolvedExtensionArchive` carrying
// real `.script_api` paths plus cache/download provenance. It mirrors the
// `versioned-api-surface` doc-source seam (cache->download, `unzip`-backed
// `ZipAccessor`) keyed by the arbitrary extension URL instead of a Defold version.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import {
  classifyExtension,
  type ExtensionDependency,
  type ResolvedExtension,
} from "./extension-deps";

export type ExtensionArchiveProvenance = "cache" | "download";

// The single accessor method this slice needs: the archive's entry list, fed to
// the pure `classifyExtension`. The shared `ZipAccessor` (sync-api-docs.ts) is a
// structural superset, so its `readZip` satisfies this without a cast.
export interface ExtensionZip {
  entries(): string[];
}

export type DownloadExtensionArchive = (url: string) => Promise<Uint8Array>;
export type ReadExtensionZip = (zipPath: string) => ExtensionZip | Promise<ExtensionZip>;

export interface ResolvedExtensionArchive extends ResolvedExtension {
  readonly provenance: ExtensionArchiveProvenance;
  readonly archivePath: string;
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

// Default accessor: the `unzip`-backed `readZip` ships in the `@defold-typescript/types`
// tarball (`scripts/`). Loaded by resolved path so the CLI never statically pulls
// in its fixture-reading module side effects (mirrors `materializeRefDocSurface`).
const defaultReadZip: ReadExtensionZip = async (zipPath) => {
  const root = resolveTypesPackageRoot();
  if (root === null) {
    throw new Error("cannot locate @defold-typescript/types to open the extension archive");
  }
  const mod = (await import(join(root, "scripts", "sync-api-docs.ts"))) as {
    readZip: (path: string) => ExtensionZip;
  };
  return mod.readZip(zipPath);
};

export async function resolveExtensionArchive(
  dep: ExtensionDependency,
  opts: ResolveExtensionArchiveOptions,
): Promise<ResolvedExtensionArchive> {
  const open = opts.readZip ?? defaultReadZip;
  const archivePath = join(opts.cacheDir, extensionArchiveKey(dep.url), "archive.zip");

  let provenance: ExtensionArchiveProvenance;
  if (existsSync(archivePath)) {
    provenance = "cache";
  } else {
    const download = opts.download ?? fetchExtensionArchive;
    const bytes = await download(dep.url);
    mkdirSync(dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, bytes);
    provenance = "download";
  }

  const zip = await open(archivePath);
  return { ...classifyExtension(dep.url, zip.entries()), provenance, archivePath };
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

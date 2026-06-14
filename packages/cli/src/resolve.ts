// The user-facing orchestration slice of the `[dependencies]`-driven extension
// typing pipeline. `runResolve` joins the five prior pure slices end to end:
// `readExtensionDependencies` (game.project -> URLs), `resolveExtensionDeclarations`
// (download/cache each archive -> one emitted bundle per dependency),
// `materializeExtensionDeclarations` (write the bundles into
// `.defold-types/extensions/`), and `ensureExtensionTypesReference` (point tsconfig
// at the sibling surface). The CLI `resolve` verb in dispatch.ts drives this; the
// download/readZip/cacheDir seams stay injectable so the orchestration is
// network-free under test.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type DownloadExtensionArchive,
  type ExtensionArchiveProvenance,
  extensionCacheDir,
  type ReadExtensionZip,
} from "./extension-archive";
import { resolveExtensionDeclarations } from "./extension-declarations";
import { readExtensionDependencies } from "./extension-deps";
import {
  ensureExtensionTypesReference,
  materializeExtensionDeclarations,
} from "./extension-materialize";
import { mergeResolvedVersionPins, readExtensionVersionPins } from "./extension-version";
import { formatJsonLikeBiome } from "./format-json";

export interface ResolvedExtensionReport {
  readonly url: string;
  readonly provenance: ExtensionArchiveProvenance;
  readonly namespaces: string[];
  readonly scriptApiCount: number;
  readonly assetOnly: boolean;
  readonly resolvedVersion: string;
  readonly pinnedVersion?: string;
  readonly pinStatus: "unpinned" | "match" | "drift";
}

export interface RunResolveOptions {
  readonly cwd: string;
  readonly cacheDir?: string;
  readonly download?: DownloadExtensionArchive;
  readonly readZip?: ReadExtensionZip;
  // When true, skip writing newly-resolved pins into `package.json`. Used by
  // `--frozen` to verify the committed pin set without mutating it.
  readonly freeze?: boolean;
}

export interface RunResolveResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly materializedSurface: string | null;
  readonly extensions: ResolvedExtensionReport[];
}

function hasProjectSection(text: string): boolean {
  return text.split("\n").some((line) => line.trim() === "[project]");
}

function readExistingPackageJson(cwd: string): { value: unknown; writable: boolean } {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return { value: {}, writable: true };
  }
  try {
    return { value: JSON.parse(readFileSync(pkgPath, "utf8")) as unknown, writable: true };
  } catch {
    return { value: null, writable: false };
  }
}

function seedExtensionPins(cwd: string, existing: unknown, resolved: Record<string, string>): void {
  const merged = mergeResolvedVersionPins(existing, resolved);
  writeFileSync(join(cwd, "package.json"), `${formatJsonLikeBiome(merged)}\n`);
}

export async function runResolve(opts: RunResolveOptions): Promise<RunResolveResult> {
  const { cwd } = opts;
  const gameProjectPath = join(cwd, "game.project");
  if (!existsSync(gameProjectPath)) {
    return {
      ok: false,
      error: `no game.project found in ${cwd}`,
      materializedSurface: null,
      extensions: [],
    };
  }

  const text = readFileSync(gameProjectPath, "utf8");
  if (!hasProjectSection(text)) {
    return {
      ok: false,
      error: "game.project has no [project] section",
      materializedSurface: null,
      extensions: [],
    };
  }

  const deps = readExtensionDependencies(text);
  if (deps.length === 0) {
    return { ok: true, materializedSurface: null, extensions: [] };
  }

  const bundles = await resolveExtensionDeclarations(deps, {
    cacheDir: opts.cacheDir ?? extensionCacheDir(),
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
  });

  const { materializedDir } = materializeExtensionDeclarations({ cwd, bundles });
  ensureExtensionTypesReference(cwd, materializedDir);

  const existingPkg = readExistingPackageJson(cwd);
  const pins = readExtensionVersionPins(existingPkg.value);
  const resolvedForSeed: Record<string, string> = {};
  for (const bundle of bundles) {
    if (!(bundle.url in pins)) {
      resolvedForSeed[bundle.url] = bundle.resolvedVersion;
    }
  }
  if (!opts.freeze && Object.keys(resolvedForSeed).length > 0 && existingPkg.writable) {
    seedExtensionPins(cwd, existingPkg.value, resolvedForSeed);
  }

  const extensions: ResolvedExtensionReport[] = bundles.map((bundle) => {
    const pin = pins[bundle.url];
    const pinStatus: "unpinned" | "match" | "drift" =
      pin === undefined ? "unpinned" : pin === bundle.resolvedVersion ? "match" : "drift";
    const report: {
      url: string;
      provenance: ExtensionArchiveProvenance;
      namespaces: string[];
      scriptApiCount: number;
      assetOnly: boolean;
      resolvedVersion: string;
      pinnedVersion?: string;
      pinStatus: "unpinned" | "match" | "drift";
    } = {
      url: bundle.url,
      provenance: bundle.provenance,
      namespaces: bundle.declarations.map((d) => d.namespace).sort(),
      scriptApiCount: bundle.declarations.length,
      assetOnly: bundle.assetOnly,
      resolvedVersion: bundle.resolvedVersion,
      pinStatus,
    };
    if (pin !== undefined) {
      report.pinnedVersion = pin;
    }
    return report;
  });

  return { ok: true, materializedSurface: materializedDir, extensions };
}

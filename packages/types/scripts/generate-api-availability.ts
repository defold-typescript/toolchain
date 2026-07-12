import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ApiAvailability,
  type ApiMigrationCatalog,
  applyMigrationOverlay,
  collectSymbolIdentities,
  deriveAvailabilityMatrix,
  symbolIdentityKey,
  type VersionSurface,
  validateAvailability,
} from "../src/api-availability";
import { type ApiModule, parseDefoldApiDoc } from "../src/api-doc";
import { type ApiTarget, loadApiTargets, loadTargetModules } from "./regen";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const MIGRATIONS_PATH = resolve(PACKAGE_ROOT, "api-migrations.json");
const AVAILABILITY_PATH = resolve(PACKAGE_ROOT, "api-availability.json");

const VERSION_FROM_ID = /^defold-(\d+\.\d+\.\d+)$/;

export interface AvailabilityArtifact {
  readonly versions: readonly string[];
  readonly records: readonly ApiAvailability[];
}

export function versionOf(target: ApiTarget): string {
  const match = VERSION_FROM_ID.exec(target.id);
  if (!match?.[1]) throw new Error(`cannot derive a release version from target id "${target.id}"`);
  return match[1];
}

function versionTuple(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

function compareVersions(a: string, b: string): number {
  const [ta, tb] = [versionTuple(a), versionTuple(b)];
  for (let index = 0; index < Math.max(ta.length, tb.length); index += 1) {
    const diff = (ta[index] ?? 0) - (tb[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Every complete committed surface, newest first. The committed targets are the
// `source == null` entries of `api-targets.json` (ref-doc-sourced historical
// targets are resolved on demand and never a committed-derivation input). This
// registry-derived, version-desc list is the single source for the availability
// version axis — it mirrors the CLI `DEFOLD_VERSIONS` order without inverting
// the package layering (`types` must not import `cli`).
export function selectCompleteVersionSurfaces(targets: readonly ApiTarget[]): ApiTarget[] {
  const complete = targets
    .filter((target) => (target.source ?? null) == null)
    .sort((a, b) => compareVersions(versionOf(b), versionOf(a)));
  if (complete.length === 0) {
    throw new Error("api-targets.json has no committed (source == null) targets");
  }
  return complete;
}

export function loadMigrationCatalog(path: string = MIGRATIONS_PATH): ApiMigrationCatalog {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { migrations?: unknown }).migrations)
  ) {
    throw new Error(`${path}: expected an object with a "migrations" array`);
  }
  return raw as ApiMigrationCatalog;
}

export interface BuildAvailabilityOptions {
  readonly packageRoot?: string;
  readonly registryPath?: string;
  readonly catalog?: ApiMigrationCatalog;
}

export function buildAvailabilityArtifact(
  options: BuildAvailabilityOptions = {},
): AvailabilityArtifact {
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const registryPath = options.registryPath ?? resolve(packageRoot, "api-targets.json");
  const targets = loadApiTargets(registryPath);
  const completeTargets = selectCompleteVersionSurfaces(targets);
  const parse = (target: ApiTarget): ApiModule[] =>
    loadTargetModules(target, packageRoot).map((entry) => parseDefoldApiDoc(entry.doc));
  const surfaces: VersionSurface[] = completeTargets.map((target) => ({
    version: versionOf(target),
    modules: parse(target),
  }));
  const versions = surfaces.map((surface) => surface.version);

  const derived = deriveAvailabilityMatrix({ surfaces });
  const catalog =
    options.catalog ?? loadMigrationCatalog(resolve(packageRoot, "api-migrations.json"));
  const universe = collectSymbolIdentities(surfaces.flatMap((surface) => surface.modules));
  const records = applyMigrationOverlay({ derived, catalog, universe, versions });

  const newestSurface = surfaces[0] as VersionSurface;
  const currentSurface = new Set(
    collectSymbolIdentities(newestSurface.modules).map(symbolIdentityKey),
  );
  const knownIdentities = new Set(universe.map(symbolIdentityKey));
  const errors = validateAvailability({ records, versions, currentSurface, knownIdentities });
  if (errors.length > 0) {
    throw new Error(`api-availability validation failed:\n  ${errors.join("\n  ")}`);
  }

  return { versions, records };
}

function biomeFormatJson(raw: string): string {
  const out = Bun.spawnSync(
    ["bunx", "biome", "format", "--stdin-file-path=api-availability.json"],
    {
      stdin: Buffer.from(raw),
    },
  );
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  return out.stdout.toString();
}

export function serializeAvailabilityArtifact(artifact: AvailabilityArtifact): string {
  return biomeFormatJson(JSON.stringify(artifact));
}

if (import.meta.main) {
  const artifact = buildAvailabilityArtifact();
  if (process.argv.includes("--write")) {
    Bun.write(AVAILABILITY_PATH, serializeAvailabilityArtifact(artifact));
    console.log(`wrote ${AVAILABILITY_PATH} (${artifact.records.length} records)`);
  } else {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  }
}

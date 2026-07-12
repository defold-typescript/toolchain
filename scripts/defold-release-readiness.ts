import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fetchVersionInfo } from "../packages/cli/src/defold-target.ts";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "../packages/cli/src/defold-version.ts";
import { RELEASE_TARGET_MATRIX } from "../packages/cli/src/release-target-matrix.ts";

// Aggregates the committed, offline evidence a Defold release promotion is gated
// on and fails closed when any dimension is absent or stale. Each blocker is
// named by category so `--json` output is actionable in CI.

export type ReadinessCategory =
  | "import"
  | "unknown-type"
  | "declaration"
  | "docs-route"
  | "search"
  | "migration-guide"
  | "target"
  | "integration";

export interface ReadinessProblem {
  readonly category: ReadinessCategory;
  readonly message: string;
}

export interface ReadinessResult {
  readonly ok: boolean;
  readonly problems: ReadinessProblem[];
}

export interface ImportManifestEvidence {
  readonly version: string | undefined;
  readonly baseline: string | undefined;
  readonly ready: boolean | undefined;
  readonly unknownTypeCount: number;
  readonly unmappedNamespaceCount: number;
  readonly declarationNamespaceCount: number;
}

export interface AvailabilityEvidence {
  readonly current: string | undefined;
  readonly baseline: string | undefined;
  readonly removedSymbols: readonly string[];
  readonly sinceCurrentSymbols: readonly string[];
}

export interface TargetEvidence {
  readonly id: string;
  readonly isDefault: boolean;
  // True only when a committed-surface target's generatedDir exists on disk AND
  // every registered module outFile is present under it — not merely asserted by
  // registry metadata.
  readonly hasCommittedSurface: boolean;
  // Registered outFile declarations that are absent under the target's
  // generatedDir (empty when the surface is fully committed). Optional so
  // hand-built evidence bundles in tests may omit it.
  readonly missingDeclarations?: readonly string[];
}

export interface MigrationGuideEvidence {
  readonly headings: readonly string[];
}

export interface DocsEvidence {
  readonly canonicalRoutes: readonly string[];
  readonly historicalRoutes: readonly string[];
  readonly searchMachinery: boolean;
}

export interface MatrixTargetEvidence {
  readonly version: string;
  readonly surfaceId: string;
  readonly isCurrentStable: boolean;
}

export interface ReadinessEvidence {
  readonly expected: { readonly release: string; readonly baseline: string };
  readonly importManifest: ImportManifestEvidence | null;
  readonly availability: AvailabilityEvidence | null;
  readonly targets: readonly TargetEvidence[] | null;
  readonly migrationGuide: MigrationGuideEvidence | null;
  readonly docs: DocsEvidence | null;
  readonly matrix: readonly MatrixTargetEvidence[] | null;
}

const stripSurfacePrefix = (value?: string): string => (value ?? "").replace(/^defold-/, "");

export function evaluateReleaseReadiness(evidence: ReadinessEvidence): ReadinessResult {
  const problems: ReadinessProblem[] = [];
  const add = (category: ReadinessCategory, message: string): void => {
    problems.push({ category, message });
  };
  const { expected } = evidence;

  const im = evidence.importManifest;
  if (im === null) {
    add("import", "import evidence absent: no committed import manifest");
  } else {
    if (im.version !== expected.release) {
      add(
        "import",
        `import evidence stale: manifest version ${im.version ?? "(none)"} != release ${expected.release}`,
      );
    }
    if (stripSurfacePrefix(im.baseline) !== expected.baseline) {
      add(
        "import",
        `import evidence stale: manifest baseline ${im.baseline ?? "(none)"} != ${expected.baseline}`,
      );
    }
    if (im.ready !== true) {
      add("import", "import manifest reports ready=false");
    }
  }

  if (im === null) {
    add("unknown-type", "unknown-type evidence absent: no import manifest");
  } else if (im.unknownTypeCount > 0 || im.unmappedNamespaceCount > 0) {
    add(
      "unknown-type",
      `${im.unknownTypeCount} unknown type(s) and ${im.unmappedNamespaceCount} unmapped namespace(s) block promotion`,
    );
  }

  // Declaration evidence is the committed `generated/*.d.ts` for the default
  // target, not the importer's in-manifest snapshot count: a target could carry
  // snapshots yet ship no committed declarations. Validate the physical files.
  const declTargets = evidence.targets;
  if (declTargets === null) {
    add("declaration", "declaration evidence absent: no target registry");
  } else {
    const declDefault = declTargets.find((t) => t.isDefault);
    if (declDefault === undefined) {
      add("declaration", "declaration evidence absent: no default target");
    } else {
      for (const outFile of declDefault.missingDeclarations ?? []) {
        add("declaration", `committed declaration missing for default target: ${outFile}`);
      }
    }
  }

  const docs = evidence.docs;
  if (docs === null) {
    add("docs-route", "docs-route evidence absent: migration guide not readable");
  } else {
    if (docs.canonicalRoutes.length === 0) {
      add("docs-route", "no canonical /api routes referenced");
    }
    if (docs.historicalRoutes.length === 0) {
      add("docs-route", `no historical /api/defold-${expected.baseline} routes referenced`);
    }
  }

  if (docs === null) {
    add("search", "search evidence absent: migration guide not readable");
  } else if (!docs.searchMachinery) {
    add("search", "search index machinery is not committed");
  }

  const av = evidence.availability;
  const guide = evidence.migrationGuide;
  if (av === null) {
    add("migration-guide", "migration-guide evidence absent: no availability catalog");
  } else if (guide === null) {
    add("migration-guide", "migration-guide evidence absent: no migration guide");
  } else {
    if (stripSurfacePrefix(av.current) !== expected.release || av.baseline !== expected.baseline) {
      add(
        "migration-guide",
        `availability catalog stale: current ${av.current ?? "(none)"} baseline ${av.baseline ?? "(none)"}`,
      );
    }
    for (const symbol of av.removedSymbols) {
      if (!guide.headings.some((heading) => heading.includes(symbol))) {
        add("migration-guide", `removed symbol ${symbol} has no migration-guide heading`);
      }
    }
  }

  const targets = evidence.targets;
  if (targets === null) {
    add("target", "target evidence absent: no target registry");
  } else {
    const wantCurrent = `defold-${expected.release}`;
    const wantBaseline = `defold-${expected.baseline}`;
    const current = targets.find((t) => t.id === wantCurrent);
    if (current === undefined || !current.hasCommittedSurface) {
      add("target", `current target ${wantCurrent} lacks a committed surface`);
    } else if (!current.isDefault) {
      add("target", `current target ${wantCurrent} is not the default`);
    }
    const baseline = targets.find((t) => t.id === wantBaseline);
    if (baseline === undefined || !baseline.hasCommittedSurface) {
      add("target", `baseline target ${wantBaseline} lacks a committed surface`);
    }
  }

  const matrix = evidence.matrix;
  if (matrix === null) {
    add("integration", "integration evidence absent: no release matrix");
  } else {
    for (const version of [expected.release, expected.baseline]) {
      if (!matrix.some((m) => m.version === version)) {
        add("integration", `release matrix omits ${version}`);
      }
    }
    const current = matrix.find((m) => m.isCurrentStable);
    if (current === undefined) {
      add("integration", "release matrix has no current-stable entry");
    } else if (current.version !== expected.release) {
      add("integration", `release matrix current-stable ${current.version} != ${expected.release}`);
    }
  }

  return { ok: problems.length === 0, problems };
}

function readJson<T>(abs: string): T | null {
  try {
    return JSON.parse(readFileSync(abs, "utf8")) as T;
  } catch {
    return null;
  }
}

function readText(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function guidePath(root: string, release: string): string {
  return path.join(
    root,
    `packages/docs/guide/upgrading-to-defold-${release.replace(/\./g, "-")}.md`,
  );
}

function collectImportManifest(root: string, release: string): ImportManifestEvidence | null {
  const raw = readJson<{
    version?: string;
    baseline?: string;
    ready?: boolean;
    blockers?: { unknownTypes?: unknown[]; unmappedFunctionNamespaces?: unknown[] };
    snapshots?: { symbols?: unknown[] }[];
  }>(path.join(root, `packages/types/fixtures/defold-${release}/import-manifest.json`));
  if (raw === null) {
    return null;
  }
  const snapshots = raw.snapshots ?? [];
  return {
    version: raw.version,
    baseline: raw.baseline,
    ready: raw.ready,
    unknownTypeCount: raw.blockers?.unknownTypes?.length ?? 0,
    unmappedNamespaceCount: raw.blockers?.unmappedFunctionNamespaces?.length ?? 0,
    declarationNamespaceCount: snapshots.filter((s) => (s.symbols?.length ?? 0) > 0).length,
  };
}

function collectAvailability(root: string, release: string): AvailabilityEvidence | null {
  const raw = readJson<{
    current?: string;
    baseline?: string;
    records?: { identity: { name: string }; since?: string; removedIn?: string }[];
  }>(path.join(root, "packages/types/api-availability.json"));
  if (raw === null) {
    return null;
  }
  const records = raw.records ?? [];
  return {
    current: raw.current,
    baseline: raw.baseline,
    removedSymbols: records.filter((r) => r.removedIn === release).map((r) => r.identity.name),
    sinceCurrentSymbols: records.filter((r) => r.since === release).map((r) => r.identity.name),
  };
}

export function collectTargets(root: string): TargetEvidence[] | null {
  const raw = readJson<{
    targets?: {
      id: string;
      default?: boolean;
      source?: unknown;
      generatedDir?: string | null;
      modules?: { outFile?: string }[];
    }[];
  }>(path.join(root, "packages/types/api-targets.json"));
  if (raw?.targets === undefined) {
    return null;
  }
  return raw.targets.map((t) => {
    // A committed-surface target is one Defold ships no live import for
    // (`source === null`) with a registered output directory. Its evidence is
    // only real when that directory and every registered declaration exist on
    // disk — registry metadata alone is not proof.
    const committedMeta = t.source === null && typeof t.generatedDir === "string";
    const missingDeclarations: string[] = [];
    let surfaceReal = false;
    if (committedMeta && typeof t.generatedDir === "string") {
      const dir = path.join(root, "packages/types", t.generatedDir);
      const dirExists = existsSync(dir);
      for (const module of t.modules ?? []) {
        if (typeof module.outFile !== "string") continue;
        if (!dirExists || !existsSync(path.join(dir, module.outFile))) {
          missingDeclarations.push(module.outFile);
        }
      }
      surfaceReal = dirExists && missingDeclarations.length === 0;
    }
    return {
      id: t.id,
      isDefault: t.default === true,
      hasCommittedSurface: surfaceReal,
      missingDeclarations,
    };
  });
}

function collectMigrationGuide(root: string, release: string): MigrationGuideEvidence | null {
  const text = readText(guidePath(root, release));
  if (text === null) {
    return null;
  }
  const headings = [...text.matchAll(/^#{2,4}\s+(.+?)\s*$/gm)].map((m) => m[1] ?? "");
  return { headings };
}

function collectDocs(root: string, release: string, baseline: string): DocsEvidence | null {
  const text = readText(guidePath(root, release));
  if (text === null) {
    return null;
  }
  const routes = [...text.matchAll(/\/api\/[a-z0-9._/-]+/g)].map((m) => m[0]);
  const historicalPrefix = `/api/defold-${baseline}/`;
  const historicalRoutes = [...new Set(routes.filter((r) => r.startsWith(historicalPrefix)))];
  const canonicalRoutes = [...new Set(routes.filter((r) => !/^\/api\/defold-/.test(r)))];
  const searchMachinery =
    existsSync(path.join(root, "packages/docs-site/scripts/build-search-index.ts")) &&
    existsSync(path.join(root, "packages/docs-site/app/lib/release-manifest.ts"));
  return { canonicalRoutes, historicalRoutes, searchMachinery };
}

function collectMatrix(): MatrixTargetEvidence[] {
  return RELEASE_TARGET_MATRIX.map((s) => ({
    version: s.version,
    surfaceId: s.surfaceId,
    isCurrentStable: s.isCurrentStable,
  }));
}

export function collectEvidence(
  root: string,
  expected: { release: string; baseline: string },
): ReadinessEvidence {
  return {
    expected,
    importManifest: collectImportManifest(root, expected.release),
    availability: collectAvailability(root, expected.release),
    targets: collectTargets(root),
    migrationGuide: collectMigrationGuide(root, expected.release),
    docs: collectDocs(root, expected.release, expected.baseline),
    matrix: collectMatrix(),
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const live = args.includes("--live");
  const repoRoot = path.resolve(import.meta.dir, "..");
  const expected = {
    release: CURRENT_STABLE_DEFOLD_VERSION,
    baseline: PREVIOUS_STABLE_DEFOLD_VERSION,
  };
  const evidence = collectEvidence(repoRoot, expected);
  const result = evaluateReleaseReadiness(evidence);

  if (live) {
    // Advisory-only: refreshes the real archive SHA over the network. Never part
    // of the offline gate, so a failure here does not change the exit code.
    try {
      const { sha1 } = await fetchVersionInfo(expected.release);
      process.stderr.write(`[advisory] resolved archive sha for ${expected.release}: ${sha1}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[advisory] live archive refresh failed: ${message}\n`);
    }
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      `release-readiness: ready to promote Defold ${expected.release} over ${expected.baseline}\n`,
    );
  } else {
    process.stdout.write(`release-readiness: BLOCKED (${result.problems.length} blocker(s))\n`);
    for (const problem of result.problems) {
      process.stdout.write(`  - [${problem.category}] ${problem.message}\n`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

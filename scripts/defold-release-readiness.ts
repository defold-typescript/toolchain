import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fetchVersionInfo } from "../packages/cli/src/defold-target.ts";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "../packages/cli/src/defold-version.ts";
import { RELEASE_TARGET_MATRIX } from "../packages/cli/src/release-target-matrix.ts";
import { canonicalApiPages } from "../packages/docs-site/app/lib/api-content.ts";
import {
  loadApiSurfaceForVersion,
  versionsWithDiskFixtures,
} from "../packages/docs-site/app/lib/api-surface-loader.ts";
import {
  buildReleaseRouteManifest,
  type ReleaseRouteManifest,
  validateReleaseRouteManifest,
} from "../packages/docs-site/app/lib/release-manifest.ts";
import { searchIndexOutputs } from "../packages/docs-site/scripts/build-search-index.ts";
import { symbolIndexOutputs } from "../packages/docs-site/scripts/build-symbol-index.ts";
import {
  type ApiTarget,
  generateModuleDeclaration,
  loadApiTargets,
  loadTargetModules,
} from "../packages/types/scripts/regen.ts";

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
  // Registered outFile declarations present on disk whose bytes differ from the
  // in-memory regeneration of their fixture through the production path (stale
  // or unrelated content). Empty when every committed declaration corresponds.
  // Optional so hand-built evidence bundles in tests may omit it.
  readonly mismatchedDeclarations?: readonly string[];
}

export interface MigrationGuideEvidence {
  readonly headings: readonly string[];
}

export interface DocsEvidence {
  readonly canonicalRoutes: readonly string[];
  readonly historicalRoutes: readonly string[];
  readonly searchMachinery: boolean;
  // The complete versions a release MUST publish in full: the current release and
  // every materialized historical version. The evaluator iterates this set rather
  // than whatever `exactRoutesByVersion` keys happen to exist, so an entirely
  // absent family (a missing key, not just an empty array) still fails closed.
  readonly requiredVersionIds: readonly string[];
  // Structural route/index families derived from the release route manifest over
  // the real docs-site surfaces: each complete version's exact `/api/<id>/…` route
  // family and the search / symbol index files assigned to it. Distinct from the
  // guide-scraped canonical/historical route coverage above — the guide prose may
  // legitimately name the `/api/combined` compat route, so the structural checks
  // never read it.
  readonly exactRoutesByVersion: Readonly<Record<string, readonly string[]>>;
  readonly searchIndexByVersion: Readonly<Record<string, string>>;
  readonly symbolIndexByVersion: Readonly<Record<string, string>>;
  // Every problem `validateReleaseRouteManifest` plus the generated-index
  // comparison (`releaseIndexProblems`) return for the real manifest; the
  // evaluator rejects each one, so structural route/index drift is a blocker.
  readonly manifestProblems: readonly string[];
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
      for (const outFile of declDefault.mismatchedDeclarations ?? []) {
        add(
          "declaration",
          `committed declaration does not match regeneration for default target: ${outFile}`,
        );
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
    // Canonical is the Combined/unprefixed surface: no canonical route may carry a
    // version prefix, and none may be the `/api/combined` compatibility route.
    for (const route of docs.canonicalRoutes) {
      if (/^\/api\/defold-/.test(route)) {
        add("docs-route", `canonical route carries a version prefix: ${route}`);
      }
      if (/^\/api\/combined(\/|$)/.test(route)) {
        add("docs-route", `canonical route emitted under /api/combined: ${route}`);
      }
    }
    // Every REQUIRED complete version, the current one included, owns a non-empty
    // exact family, and each exact route carries its own `/api/<id>/` prefix.
    // Iterate the required-id set, not the object entries that happen to exist, so
    // an entirely absent family (a missing key) is caught, not only an empty one.
    const wantCurrent = `defold-${expected.release}`;
    if (!docs.requiredVersionIds.includes(wantCurrent)) {
      add(
        "docs-route",
        `current version ${wantCurrent} is not among the required complete versions`,
      );
    }
    for (const version of docs.requiredVersionIds) {
      const routes = docs.exactRoutesByVersion[version] ?? [];
      if (routes.length === 0) {
        add("docs-route", `version ${version} has no exact route family`);
        continue;
      }
      for (const route of routes) {
        if (!route.startsWith(`/api/${version}/`)) {
          add("docs-route", `exact route missing its ${version} prefix: ${route}`);
        }
      }
    }
    // Every structural route/index problem the manifest validation and the
    // generated-index comparison surfaced is a blocker.
    for (const problem of docs.manifestProblems) {
      add("docs-route", problem);
    }
  }

  if (docs === null) {
    add("search", "search evidence absent: migration guide not readable");
  } else {
    if (!docs.searchMachinery) {
      add("search", "search index machinery is not committed");
    }
    // Every required complete version must carry a fresh search AND symbol index
    // assignment; a missing assignment (absent key) is as much a blocker as a
    // stale one.
    for (const version of docs.requiredVersionIds) {
      const searchFile = docs.searchIndexByVersion[version];
      if (searchFile === undefined) {
        add("search", `version ${version} has no search index assignment`);
      } else if (searchFile !== `search-index-${version}.json`) {
        add("search", `version ${version} search index assignment is stale: ${searchFile}`);
      }
      const symbolFile = docs.symbolIndexByVersion[version];
      if (symbolFile === undefined) {
        add("search", `version ${version} has no symbol index assignment`);
      } else if (symbolFile !== `symbol-index-${version}.json`) {
        add("search", `version ${version} symbol index assignment is stale: ${symbolFile}`);
      }
    }
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

export interface ReleaseIndexOutputs {
  readonly searchFiles: readonly string[];
  readonly symbolFiles: readonly string[];
}

// Compare the release manifest's per-version and shared index assignments against
// the filenames the pure search / symbol generators actually emit. A required file
// the generators do not produce is a blocker. This reads the in-memory generator
// output only — never the ignored, build-time `public/*.json` — so a docs build is
// not a precondition of the gate.
export function releaseIndexProblems(
  manifest: ReleaseRouteManifest,
  outputs: ReleaseIndexOutputs,
): string[] {
  const problems: string[] = [];
  const search = new Set(outputs.searchFiles);
  const symbol = new Set(outputs.symbolFiles);
  const requireSearch = (file: string): void => {
    if (!search.has(file)) problems.push(`generated search outputs omit ${file}`);
  };
  const requireSymbol = (file: string): void => {
    if (!symbol.has(file)) problems.push(`generated symbol outputs omit ${file}`);
  };
  for (const version of manifest.versions) {
    requireSearch(version.searchIndexFile);
    requireSymbol(version.symbolIndexFile);
  }
  requireSearch(manifest.combinedSearchIndexFile);
  requireSymbol(manifest.combinedSymbolIndexFile);
  return problems;
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

function collectAvailability(root: string): AvailabilityEvidence | null {
  const raw = readJson<{
    versions?: string[];
    records?: { identity: { name: string }; availableIn?: string[] }[];
  }>(path.join(root, "packages/types/api-availability.json"));
  if (raw === null) {
    return null;
  }
  const versions = raw.versions ?? [];
  const records = raw.records ?? [];
  // `current` is the newest tracked version; `baseline` the immediately-preceding
  // one (`PREVIOUS_STABLE`). A "removed" symbol is one absent from the newest
  // version (`availableIn` omits it) — this spans genuine removals and the retired
  // side of a signature transition, exactly what the migration guide must cover.
  const newest = versions[0];
  const baseline = versions[1];
  const has = (r: { availableIn?: string[] }, version: string | undefined): boolean =>
    version !== undefined && (r.availableIn ?? []).includes(version);
  return {
    current: newest,
    baseline,
    removedSymbols: records.filter((r) => !has(r, newest)).map((r) => r.identity.name),
    sinceCurrentSymbols: records
      .filter((r) => has(r, newest) && !has(r, baseline))
      .map((r) => r.identity.name),
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
  const packageRoot = path.join(root, "packages/types");
  // Load the typed registry once for the offline regeneration comparison. A
  // malformed registry (or a bad fixture, handled per-target below) degrades a
  // committed-meta target to "content unproven" rather than throwing — the gate
  // fails closed, it never crashes.
  let apiTargets: ApiTarget[] | null;
  try {
    apiTargets = loadApiTargets(path.join(packageRoot, "api-targets.json"));
  } catch {
    apiTargets = null;
  }
  return raw.targets.map((t) => {
    // A committed-surface target is one Defold ships no live import for
    // (`source === null`) with a registered output directory. Its evidence is
    // only real when that directory exists, every registered declaration is
    // present, and each present declaration's bytes match the in-memory
    // regeneration of its fixture — registry metadata and mere presence are not
    // proof.
    const committedMeta = t.source === null && typeof t.generatedDir === "string";
    const missingDeclarations: string[] = [];
    const mismatchedDeclarations: string[] = [];
    let surfaceReal = false;
    if (committedMeta && typeof t.generatedDir === "string") {
      const dir = path.join(root, "packages/types", t.generatedDir);
      const dirExists = existsSync(dir);
      const regenerated = regenerateTargetDeclarations(apiTargets, t.id, packageRoot);
      for (const module of t.modules ?? []) {
        if (typeof module.outFile !== "string") continue;
        const file = path.join(dir, module.outFile);
        if (!dirExists || !existsSync(file)) {
          missingDeclarations.push(module.outFile);
          continue;
        }
        // Present but unprovable (regen unavailable) or bytes differ from the
        // production regeneration -> a content mismatch, not a real surface.
        const expected = regenerated?.get(module.outFile);
        if (expected === undefined || readFileSync(file, "utf8") !== expected) {
          mismatchedDeclarations.push(module.outFile);
        }
      }
      surfaceReal =
        dirExists && missingDeclarations.length === 0 && mismatchedDeclarations.length === 0;
    }
    return {
      id: t.id,
      isDefault: t.default === true,
      hasCommittedSurface: surfaceReal,
      missingDeclarations,
      mismatchedDeclarations,
    };
  });
}

// Regenerate every module of a `source === null` target in memory through the
// production path (loadTargetModules + generateModuleDeclaration), keyed by
// outFile, for byte-for-byte comparison against the committed declarations. A
// missing target or a fixture/registry failure returns null so the caller marks
// content unproven instead of throwing.
function regenerateTargetDeclarations(
  apiTargets: ApiTarget[] | null,
  id: string,
  packageRoot: string,
): Map<string, string> | null {
  if (apiTargets === null) return null;
  const target = apiTargets.find((t) => t.id === id);
  if (target === undefined) return null;
  try {
    const byOutFile = new Map<string, string>();
    for (const entry of loadTargetModules(target, packageRoot)) {
      byOutFile.set(entry.outFile, generateModuleDeclaration(entry).contents);
    }
    return byOutFile;
  } catch {
    return null;
  }
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
  const searchMachinery =
    existsSync(path.join(root, "packages/docs-site/scripts/build-search-index.ts")) &&
    existsSync(path.join(root, "packages/docs-site/app/lib/release-manifest.ts"));

  // The structural canonical/exact split and the per-version index assignments
  // come from the release route manifest built over the real docs-site surfaces —
  // Combined is canonical, every version owns an exact `/api/defold-<version>/…`
  // family. Structural drift is caught by validating the manifest and comparing
  // its index assignments against the pure generators' actual outputs (never the
  // ignored, build-time `public/*.json`). A malformed surface degrades to empty
  // families with a synthetic problem (the gate then fails closed) rather than
  // crashing.
  let canonicalRoutes: readonly string[] = [];
  let requiredVersionIds: readonly string[] = [];
  let exactRoutesByVersion: Record<string, readonly string[]> = {};
  let searchIndexByVersion: Record<string, string> = {};
  let symbolIndexByVersion: Record<string, string> = {};
  let manifestProblems: readonly string[] = [];
  try {
    const typesDir = path.join(root, "packages/types");
    const libraryTypesDir = path.join(root, "packages/library-types");
    const versions = versionsWithDiskFixtures(typesDir);
    const manifest = buildReleaseRouteManifest({
      versions,
      canonicalPages: canonicalApiPages(typesDir, libraryTypesDir),
      pagesByVersion: Object.fromEntries(
        versions.map((v) => [v.id, loadApiSurfaceForVersion(typesDir, v.id)]),
      ),
    });
    canonicalRoutes = manifest.canonicalRoutes;
    requiredVersionIds = manifest.versions.map((v) => v.id);
    exactRoutesByVersion = Object.fromEntries(manifest.versions.map((v) => [v.id, v.routes]));
    searchIndexByVersion = Object.fromEntries(
      manifest.versions.map((v) => [v.id, v.searchIndexFile]),
    );
    symbolIndexByVersion = Object.fromEntries(
      manifest.versions.map((v) => [v.id, v.symbolIndexFile]),
    );
    manifestProblems = [
      ...validateReleaseRouteManifest(manifest),
      ...releaseIndexProblems(manifest, {
        searchFiles: searchIndexOutputs({ typesDir, libraryTypesDir }).map((o) => o.file),
        symbolFiles: symbolIndexOutputs({ typesDir, libraryTypesDir }).map((o) => o.file),
      }),
    ];
  } catch (err) {
    canonicalRoutes = [];
    requiredVersionIds = [];
    exactRoutesByVersion = {};
    searchIndexByVersion = {};
    symbolIndexByVersion = {};
    manifestProblems = [
      `release route manifest could not be built: ${err instanceof Error ? err.message : String(err)}`,
    ];
  }

  return {
    canonicalRoutes,
    historicalRoutes,
    searchMachinery,
    requiredVersionIds,
    exactRoutesByVersion,
    searchIndexByVersion,
    symbolIndexByVersion,
    manifestProblems,
  };
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
    availability: collectAvailability(root),
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

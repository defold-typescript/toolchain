import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AssetPortalManifest,
  livePortalHead,
  type PortalAliases,
  type PortalEntry,
  type PortalHead,
  type PortalKind,
  portalEntryId,
  readAssetPortalManifest,
  readPortalAliases,
} from "../packages/cli/src/library/sync-asset-portal.ts";
import type { DefoldExtensionsManifest } from "../packages/cli/src/library/sync-defold-extensions.ts";
import { readNativeTargets } from "../packages/cli/src/library/sync-native-types.ts";
import { type LaneId, type PinnedTarget, readPinnedTargets } from "./library-upstream-check.ts";

// Joins the pinned Asset Portal manifest against every lane registry to answer,
// offline, which entries this repo already types, which untracked ones are worth
// typing, and which have nothing to type. Online, it compares the portal head's
// entry ids with the manifest. Only the id set is compared: the portal rewrites
// release metadata every six hours, so a content comparison would file an issue
// every week.

export type CoverageLane = LaneId | "native" | "defold" | "portal";

const LANE_ORDER: readonly CoverageLane[] = [
  "authored",
  "luals",
  "markdown",
  "openapi",
  "scriptApi",
  "native",
  "defold",
  "portal",
];

const KIND_ORDER: readonly PortalKind[] = [
  "script-api",
  "native-untyped",
  "pure-lua-annotated",
  "pure-lua",
  "no-lua-api",
  "not-a-dependency",
  "no-source",
];

const LUA_API_KINDS: ReadonlySet<PortalKind> = new Set([
  "script-api",
  "native-untyped",
  "pure-lua-annotated",
  "pure-lua",
]);

const MAINTAINED_WINDOW_MS = 730 * 86_400_000;

/** The repo URLs each lane registry pins, in the shapes their readers return. */
export interface CoverageRegistries {
  readonly pinned: readonly Pick<PinnedTarget, "lane" | "repo">[];
  readonly native: readonly { readonly repo: string }[];
  readonly defold: readonly { readonly repo: string }[];
  /** The portal `script-api` libraries `asset-portal-script-api.json` gives a page. */
  readonly portal: readonly { readonly repo: string }[];
}

export { type PortalAliases, readAssetPortalManifest, readPortalAliases };

/** Portal entry id -> why the project does not type it. */
export type PortalVerdicts = Readonly<Record<string, string>>;

export interface PortalCoverage {
  readonly id: string;
  readonly kind: PortalKind;
  readonly repo: string | null;
  readonly stars: number | null;
  readonly lanes: readonly CoverageLane[];
  /** The recorded reason this untracked entry is not typed, when a verdict exists. */
  readonly declined: string | null;
  readonly candidate: boolean;
}

export interface CoverageReport {
  readonly total: number;
  readonly tracked: Readonly<Partial<Record<CoverageLane, readonly PortalCoverage[]>>>;
  /** Untracked entries with a verdict, by id. A verdict outranks the maintenance rule. */
  readonly declined: readonly PortalCoverage[];
  /** Ranked by stars descending, then id. */
  readonly candidates: Readonly<Partial<Record<PortalKind, readonly PortalCoverage[]>>>;
  /** Untracked entries with a Lua API that fail the maintenance rule. */
  readonly inactive: readonly PortalCoverage[];
  readonly nothingToType: Readonly<Partial<Record<PortalKind, readonly PortalCoverage[]>>>;
}

export const PORTAL_DRIFT_ISSUE_TITLE = "Asset portal entries differ from asset-portal.json";

export interface PortalDriftReport {
  readonly command: "asset-portal:check";
  readonly pinnedCommit: string;
  readonly headCommit?: string;
  readonly added: readonly { readonly id: string; readonly projectUrl: string }[];
  readonly removed: readonly string[];
  readonly actionable: boolean;
  readonly issueTitle?: string;
  readonly issueBody?: string;
  readonly error?: string;
}

export interface AssetPortalCheckIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly head: PortalHead;
}

const PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");

/**
 * The shape the ratchet probe needs before it joins: a manifest it cannot read
 * is unknown backlog, never a drained one.
 */
export function parseAssetPortalManifest(raw: unknown, path: string): AssetPortalManifest {
  const manifest = raw as Partial<AssetPortalManifest> | null;
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.entries) ||
    typeof manifest.source?.syncedAt !== "string"
  ) {
    throw new Error(`${path}: expected an asset-portal manifest`);
  }
  return manifest as AssetPortalManifest;
}

export function readPortalVerdicts(packageRoot: string = PACKAGE_ROOT): PortalVerdicts {
  const file = join(packageRoot, "asset-portal-verdicts.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { verdicts: PortalVerdicts }).verdicts;
}

export function readCoverageRegistries(packageRoot: string = PACKAGE_ROOT): CoverageRegistries {
  const defold = JSON.parse(
    readFileSync(join(packageRoot, "defold-extensions.json"), "utf8"),
  ) as DefoldExtensionsManifest;
  const portalPath = join(packageRoot, "asset-portal-script-api.json");
  const portal = existsSync(portalPath)
    ? (JSON.parse(readFileSync(portalPath, "utf8")) as { libraries: { repo: string }[] }).libraries
    : [];
  return {
    pinned: readPinnedTargets(packageRoot),
    native: readNativeTargets(packageRoot),
    defold: defold.libraries,
    portal,
  };
}

/** Host, owner and repo, case-folded, without a trailing `/` or `.git`. */
function repoKey(repo: string): string {
  return repo
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

function lanesByRepo(registries: CoverageRegistries): Map<string, Set<CoverageLane>> {
  const lanes = new Map<string, Set<CoverageLane>>();
  const pin = (lane: CoverageLane, repo: string) => {
    const key = repoKey(repo);
    const set = lanes.get(key) ?? new Set();
    set.add(lane);
    lanes.set(key, set);
  };
  for (const target of registries.pinned) pin(target.lane, target.repo);
  for (const target of registries.native) pin("native", target.repo);
  for (const library of registries.defold) pin("defold", library.repo);
  for (const library of registries.portal) pin("portal", library.repo);
  return lanes;
}

function isMaintainedLuaApi(entry: PortalEntry, syncedAt: number): boolean {
  return (
    LUA_API_KINDS.has(entry.kind) &&
    entry.archived === false &&
    entry.fork === false &&
    entry.pushedAt !== null &&
    syncedAt - Date.parse(entry.pushedAt) <= MAINTAINED_WINDOW_MS
  );
}

/**
 * Per entry, the lanes whose registries pin its repo (or its alias's), and
 * whether it is a candidate: untracked, shipping a Lua API, not archived, not a
 * fork, pushed within 730 days of the sync, and without a verdict. An alias for
 * an entry the manifest no longer lists, or for a repo no registry pins, throws:
 * either would silently hide a real gap. A verdict for an unlisted entry, or for
 * one a lane pins (directly or through its alias), throws for the same reason:
 * it is stale, and keeping it would hide the next entry it is mistaken for.
 */
export function portalCoverage(
  manifest: AssetPortalManifest,
  registries: CoverageRegistries,
  aliases: PortalAliases,
  verdicts: PortalVerdicts,
): PortalCoverage[] {
  const pinned = lanesByRepo(registries);
  const aliasMap = new Map(Object.entries(aliases));
  const ids = new Set(manifest.entries.map((entry) => entry.id));
  for (const [id, target] of aliasMap) {
    if (!ids.has(id)) {
      throw new Error(`asset-portal-aliases.json: ${id} is not an asset-portal.json entry`);
    }
    if (!pinned.has(repoKey(target))) {
      throw new Error(`asset-portal-aliases.json: ${id} points at ${target}, which no lane pins`);
    }
  }
  const lanesOf = (entry: PortalEntry): { repo: string | null; lanes: CoverageLane[] } => {
    const repo = aliasMap.get(entry.id) ?? entry.repo;
    const repoLanes = repo === null ? undefined : pinned.get(repoKey(repo));
    return { repo, lanes: LANE_ORDER.filter((lane) => repoLanes?.has(lane)) };
  };
  const verdictMap = new Map(Object.entries(verdicts));
  const entriesById = new Map(manifest.entries.map((entry) => [entry.id, entry]));
  for (const id of verdictMap.keys()) {
    const entry = entriesById.get(id);
    if (entry === undefined) {
      throw new Error(`asset-portal-verdicts.json: ${id} is not an asset-portal.json entry`);
    }
    const [lane] = lanesOf(entry).lanes;
    if (lane !== undefined) {
      throw new Error(`asset-portal-verdicts.json: ${id} is pinned by ${lane}`);
    }
  }
  const syncedAt = Date.parse(manifest.source.syncedAt);
  return manifest.entries.map((entry) => {
    const { repo, lanes } = lanesOf(entry);
    const declined = verdictMap.get(entry.id) ?? null;
    return {
      id: entry.id,
      kind: entry.kind,
      repo,
      stars: entry.stars,
      lanes,
      declined,
      candidate: lanes.length === 0 && declined === null && isMaintainedLuaApi(entry, syncedAt),
    };
  });
}

function byStars(a: PortalCoverage, b: PortalCoverage): number {
  return (b.stars ?? 0) - (a.stars ?? 0) || a.id.localeCompare(b.id);
}

function addTo<K extends string>(
  groups: Partial<Record<K, PortalCoverage[]>>,
  key: K,
  entry: PortalCoverage,
): void {
  const list = groups[key] ?? [];
  list.push(entry);
  groups[key] = list;
}

/**
 * Tracked entries file under every lane that pins them, whatever their kind, so
 * a typed library never reads as "nothing to type".
 */
export function coverageReport(coverage: readonly PortalCoverage[]): CoverageReport {
  const tracked: Partial<Record<CoverageLane, PortalCoverage[]>> = {};
  const declined: PortalCoverage[] = [];
  const candidates: Partial<Record<PortalKind, PortalCoverage[]>> = {};
  const inactive: PortalCoverage[] = [];
  const nothingToType: Partial<Record<PortalKind, PortalCoverage[]>> = {};
  for (const entry of coverage) {
    if (entry.lanes.length > 0) {
      for (const lane of entry.lanes) addTo(tracked, lane, entry);
    } else if (entry.declined !== null) {
      declined.push(entry);
    } else if (entry.candidate) {
      addTo(candidates, entry.kind, entry);
    } else if (LUA_API_KINDS.has(entry.kind)) {
      inactive.push(entry);
    } else {
      addTo(nothingToType, entry.kind, entry);
    }
  }
  declined.sort((a, b) => a.id.localeCompare(b.id));
  for (const list of Object.values(candidates)) list.sort(byStars);
  return { total: coverage.length, tracked, declined, candidates, inactive, nothingToType };
}

/**
 * The candidate list in the one-line-per-slot shape the ratchet probe prints,
 * in the report's order: kind, then stars descending, then id.
 */
export function candidateSlots(
  manifestFile: string,
  coverage: readonly PortalCoverage[],
): string[] {
  const { candidates } = coverageReport(coverage);
  return KIND_ORDER.flatMap((kind) =>
    (candidates[kind] ?? []).map((entry) => `${manifestFile}: ${kind}:${entry.id}:${entry.repo}`),
  );
}

function countOf(groups: CoverageReport["candidates"]): number {
  return Object.values(groups).reduce((sum, list) => sum + list.length, 0);
}

export function describeCoverageReport(report: CoverageReport): string {
  const trackedIds = new Set(
    Object.values(report.tracked).flatMap((list) => list.map((e) => e.id)),
  );
  const lines = [`Tracked: ${trackedIds.size} entries a lane registry already pins`];
  for (const lane of LANE_ORDER) {
    const count = report.tracked[lane]?.length;
    if (count) lines.push(`  ${lane.padEnd(9)}  ${count}`);
  }

  lines.push(
    "",
    `Candidates: ${countOf(report.candidates)} untracked, maintained entries with a Lua API, by stars`,
  );
  for (const kind of KIND_ORDER) {
    const list = report.candidates[kind];
    if (list === undefined) continue;
    const idWidth = Math.max(...list.map((entry) => entry.id.length));
    lines.push(`  ${kind} (${list.length})`);
    for (const entry of list) {
      lines.push(
        `    ${String(entry.stars ?? 0).padStart(5)}  ${entry.id.padEnd(idWidth)}  ${entry.repo}`,
      );
    }
  }

  lines.push("", `Declined: ${report.declined.length} untracked entries the project does not type`);
  const declinedWidth = Math.max(0, ...report.declined.map((entry) => entry.id.length));
  for (const entry of report.declined) {
    lines.push(`  ${entry.id.padEnd(declinedWidth)}  ${entry.declined}`);
  }

  lines.push(
    "",
    `Not maintained: ${report.inactive.length} untracked entries with a Lua API that are archived, a fork, or unpushed for over 730 days`,
    "",
    `Nothing to type: ${countOf(report.nothingToType)} untracked entries`,
  );
  for (const kind of KIND_ORDER) {
    const list = report.nothingToType[kind];
    if (list === undefined) continue;
    lines.push(`  ${kind} (${list.length}): ${list.map((entry) => entry.id).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function driftIssueBody(report: PortalDriftReport): string {
  const added =
    report.added.length === 0
      ? []
      : [
          "",
          `Added (${report.added.length}):`,
          ...report.added.map((entry) => `- \`${entry.id}\` — ${entry.projectUrl}`),
        ];
  const removed =
    report.removed.length === 0
      ? []
      : ["", `Removed (${report.removed.length}):`, ...report.removed.map((id) => `- \`${id}\``)];
  return [
    `The entries the Asset Portal head \`${shortSha(report.headCommit ?? "")}\` lists differ from those \`packages/library-types/asset-portal.json\` classified at \`${shortSha(report.pinnedCommit)}\`.`,
    ...added,
    ...removed,
    "",
    "Re-sync the manifest, then rerun the coverage report:",
    "",
    "```sh",
    'GITHUB_TOKEN="$(gh auth token)" bun run --cwd packages/library-types asset-portal:sync',
    "bun run asset-portal:report",
    "```",
    "",
    "A changed entry under an unchanged id is not reported: the portal rewrites release metadata every six hours.",
    "",
    "_Opened automatically by `library-upstream-check`._",
  ].join("\n");
}

/**
 * Compare the portal head's entry ids with the manifest's. Only an added id's
 * entry is read, for its `project_url`. A head that cannot be read reports
 * `error` rather than "no drift", so an outage is not mistaken for a quiet week.
 */
export async function portalDrift(
  manifest: AssetPortalManifest,
  head: PortalHead,
): Promise<PortalDriftReport> {
  const base = { command: "asset-portal:check", pinnedCommit: manifest.source.commit } as const;
  try {
    const headCommit = await head.head();
    const files = await head.entryFiles(headCommit);
    const pinned = new Set(manifest.entries.map((entry) => entry.id));
    const listed = new Set(files.map(portalEntryId));
    const added: { id: string; projectUrl: string }[] = [];
    for (const file of files) {
      const id = portalEntryId(file);
      if (pinned.has(id)) continue;
      added.push({ id, projectUrl: (await head.entry(headCommit, file)).project_url });
    }
    added.sort((a, b) => a.id.localeCompare(b.id));
    const removed = [...pinned].filter((id) => !listed.has(id)).sort();
    const report: PortalDriftReport = {
      ...base,
      headCommit,
      added,
      removed,
      actionable: added.length > 0 || removed.length > 0,
    };
    if (!report.actionable) return report;
    return { ...report, issueTitle: PORTAL_DRIFT_ISSUE_TITLE, issueBody: driftIssueBody(report) };
  } catch (error) {
    return { ...base, added: [], removed: [], actionable: false, error: messageOf(error) };
  }
}

function describeDrift(report: PortalDriftReport): string {
  const pinned = `pinned ${shortSha(report.pinnedCommit)}`;
  if (report.error !== undefined) {
    return `asset-portal:check — ${pinned}, the portal head could not be read: ${report.error}\n`;
  }
  const lines = [
    `asset-portal:check — ${pinned}, head ${shortSha(report.headCommit ?? "")}: ${report.added.length} added, ${report.removed.length} removed`,
    ...report.added.map((entry) => `  + ${entry.id}  ${entry.projectUrl}`),
    ...report.removed.map((id) => `  - ${id}`),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * `--report` is offline and prints the coverage report. Otherwise the portal
 * head is compared with the manifest (`--json` for one object). Drift exits 0,
 * since it is a finding; an unreadable head exits 1.
 */
export async function runAssetPortalCheckCli(
  argv: string[],
  io: AssetPortalCheckIo,
  packageRoot: string = PACKAGE_ROOT,
): Promise<number> {
  const manifest = readAssetPortalManifest(packageRoot);
  if (argv.includes("--report")) {
    const report = coverageReport(
      portalCoverage(
        manifest,
        readCoverageRegistries(packageRoot),
        readPortalAliases(packageRoot),
        readPortalVerdicts(packageRoot),
      ),
    );
    const { commit, syncedAt } = manifest.source;
    io.stdout(
      `asset-portal:report — ${report.total} entries at ${shortSha(commit)}, synced ${syncedAt.slice(0, 10)}\n\n${describeCoverageReport(report)}`,
    );
    return 0;
  }
  const drift = await portalDrift(manifest, io.head);
  io.stdout(argv.includes("--json") ? `${JSON.stringify(drift)}\n` : describeDrift(drift));
  if (drift.error === undefined) return 0;
  io.stderr(`asset-portal:check FAILED: ${drift.error}\n`);
  return 1;
}

if (import.meta.main) {
  process.exit(
    await runAssetPortalCheckCli(process.argv.slice(2), {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      head: livePortalHead(),
    }),
  );
}

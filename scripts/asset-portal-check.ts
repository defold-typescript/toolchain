import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AssetPortalManifest,
  livePortalHead,
  type PortalEntry,
  type PortalHead,
  type PortalKind,
  portalEntryId,
} from "../packages/library-types/scripts/sync-asset-portal.ts";
import type { DefoldExtensionsManifest } from "../packages/library-types/scripts/sync-defold-extensions.ts";
import { readNativeTargets } from "../packages/library-types/scripts/sync-native-types.ts";
import { type LaneId, type PinnedTarget, readPinnedTargets } from "./library-upstream-check.ts";

// Joins the pinned Asset Portal manifest against every lane registry to answer,
// offline, which entries this repo already types, which untracked ones are worth
// typing, and which have nothing to type. Online, it compares the portal head's
// entry ids with the manifest. Only the id set is compared: the portal rewrites
// release metadata every six hours, so a content comparison would file an issue
// every week.

export type CoverageLane = LaneId | "native" | "defold";

const LANE_ORDER: readonly CoverageLane[] = [
  "authored",
  "luals",
  "markdown",
  "openapi",
  "scriptApi",
  "native",
  "defold",
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
}

/** Portal entry id -> the tracked repo URL its library moved to. */
export type PortalAliases = Readonly<Record<string, string>>;

export interface PortalCoverage {
  readonly id: string;
  readonly kind: PortalKind;
  readonly repo: string | null;
  readonly stars: number | null;
  readonly lanes: readonly CoverageLane[];
  readonly candidate: boolean;
}

export interface CoverageReport {
  readonly total: number;
  readonly tracked: Readonly<Partial<Record<CoverageLane, readonly PortalCoverage[]>>>;
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

export function readAssetPortalManifest(packageRoot: string = PACKAGE_ROOT): AssetPortalManifest {
  return JSON.parse(readFileSync(join(packageRoot, "asset-portal.json"), "utf8"));
}

export function readPortalAliases(packageRoot: string = PACKAGE_ROOT): PortalAliases {
  const file = join(packageRoot, "asset-portal-aliases.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { aliases: PortalAliases }).aliases;
}

export function readCoverageRegistries(packageRoot: string = PACKAGE_ROOT): CoverageRegistries {
  const defold = JSON.parse(
    readFileSync(join(packageRoot, "defold-extensions.json"), "utf8"),
  ) as DefoldExtensionsManifest;
  return {
    pinned: readPinnedTargets(packageRoot),
    native: readNativeTargets(packageRoot),
    defold: defold.libraries,
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
 * fork, and pushed within 730 days of the sync. An alias for an entry the
 * manifest no longer lists, or for a repo no registry pins, throws: either would
 * silently hide a real gap.
 */
export function portalCoverage(
  manifest: AssetPortalManifest,
  registries: CoverageRegistries,
  aliases: PortalAliases,
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
  const syncedAt = Date.parse(manifest.source.syncedAt);
  return manifest.entries.map((entry) => {
    const repo = aliasMap.get(entry.id) ?? entry.repo;
    const repoLanes = repo === null ? undefined : pinned.get(repoKey(repo));
    const lanes = LANE_ORDER.filter((lane) => repoLanes?.has(lane));
    return {
      id: entry.id,
      kind: entry.kind,
      repo,
      stars: entry.stars,
      lanes,
      candidate: lanes.length === 0 && isMaintainedLuaApi(entry, syncedAt),
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
  const candidates: Partial<Record<PortalKind, PortalCoverage[]>> = {};
  const inactive: PortalCoverage[] = [];
  const nothingToType: Partial<Record<PortalKind, PortalCoverage[]>> = {};
  for (const entry of coverage) {
    if (entry.lanes.length > 0) {
      for (const lane of entry.lanes) addTo(tracked, lane, entry);
    } else if (entry.candidate) {
      addTo(candidates, entry.kind, entry);
    } else if (LUA_API_KINDS.has(entry.kind)) {
      inactive.push(entry);
    } else {
      addTo(nothingToType, entry.kind, entry);
    }
  }
  for (const list of Object.values(candidates)) list.sort(byStars);
  return { total: coverage.length, tracked, candidates, inactive, nothingToType };
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
      portalCoverage(manifest, readCoverageRegistries(packageRoot), readPortalAliases(packageRoot)),
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

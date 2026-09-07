import { join } from "node:path";
import { readAuthoredTargets } from "../packages/library-types/scripts/sync-authored-types.ts";
import { readLualsTargets } from "../packages/library-types/scripts/sync-luals-types.ts";
import { readMarkdownTargets } from "../packages/library-types/scripts/sync-markdown-types.ts";
import { readOpenApiTargets } from "../packages/library-types/scripts/sync-openapi-types.ts";
import { readScriptApiTargets } from "../packages/library-types/scripts/sync-script-api-types.ts";

// Checks every library-types lane registry for an upstream that has moved past
// the pin. `upstream:release-check` is the same idea for the engine itself; the
// library corpus had no equivalent, so a stale pin was only ever noticed by hand.
//
// Two properties of the corpus drive the shape here. Tag listing order is not
// recency (the registries pin bare integers, `runtime.*` series, `v`-prefixed
// semver and `v.1.2` alike), so every tag is resolved to its commit date. And a
// repo is not a target: `britzl/defold-input` backs ten modules and
// `britzl/defold-orthographic` is consumed by two lanes, so the unit of work is
// the repo+ref pin, not the module.

export type LaneId = "authored" | "luals" | "markdown" | "openapi" | "scriptApi";

export type LibraryDriftReason = "newer-tag" | "behind-head" | "current" | "unknown";

/** One registry entry reduced to what the upstream check needs. */
export interface PinnedTarget {
  readonly lane: LaneId;
  readonly repo: string;
  readonly ref: string;
  readonly moduleId: string;
  /** Upstream-repo-relative paths (or globs) this target reads. */
  readonly paths: readonly string[];
}

/** Every target sharing one `repo` + `ref` pin — one unit of re-pin work. */
export interface PinnedGroup {
  readonly repo: string;
  readonly slug: string;
  readonly ref: string;
  readonly pinKind: "tag" | "sha";
  readonly dependents: readonly string[];
  readonly consumedPaths: readonly string[];
}

export interface LibraryUpstreamReport {
  readonly command: "upstream:library-check";
  readonly repo: string;
  readonly pinned: string;
  readonly upstream?: string;
  readonly actionable: boolean;
  readonly reason: LibraryDriftReason;
  readonly dependents: readonly string[];
  readonly intervening?: readonly string[];
  readonly commitsBehind?: number;
  readonly error?: string;
  readonly issueTitle?: string;
  readonly issueBody?: string;
}

export interface LibraryUpstreamRun {
  readonly command: "upstream:library-check";
  readonly actionable: boolean;
  readonly reports: readonly LibraryUpstreamReport[];
}

export interface LibraryCheckIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly listTags: (slug: string) => Promise<Array<{ name: string; sha: string }>>;
  readonly readCommit: (slug: string, sha: string) => Promise<{ sha: string; date: string }>;
  readonly readRepo: (slug: string) => Promise<{ defaultBranch: string }>;
  readonly compareRefs: (
    slug: string,
    base: string,
    head: string,
  ) => Promise<{ aheadBy: number; files: string[] }>;
}

const PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");

/** The authored lane records its snapshots repo-locally under this prefix. */
const AUTHORED_FIXTURE_PREFIX = "fixtures/upstream-lua";

const SHA_REF = /^[0-9a-f]{40}$/;

/** `https://github.com/owner/repo` -> `owner/repo`. */
export function repoSlug(repo: string): string {
  const parts = repo
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  return parts.slice(-2).join("/");
}

// The authored lane's `upstreamLua` entries name the vendored snapshot, not the
// upstream file: `fixtures/upstream-lua/library-defold-rendy/rendy/rendy.lua` is
// `rendy/rendy.lua` upstream. Comparing the vendored form against a compare API
// would match nothing and silence the whole SHA arm.
function upstreamPathFromFixture(repo: string, fixturePath: string): string {
  const prefix = `${AUTHORED_FIXTURE_PREFIX}/${repoSlug(repo).split("/")[1] ?? ""}/`;
  return fixturePath.startsWith(prefix) ? fixturePath.slice(prefix.length) : fixturePath;
}

/** Every registry entry across the five lanes, flattened and path-normalized. */
export function readPinnedTargets(packageRoot: string = PACKAGE_ROOT): PinnedTarget[] {
  const targets: PinnedTarget[] = [];
  for (const t of readAuthoredTargets(packageRoot)) {
    targets.push({
      lane: "authored",
      repo: t.repo,
      ref: t.ref,
      moduleId: t.moduleId,
      paths: t.upstreamLua.map((path) => upstreamPathFromFixture(t.repo, path)),
    });
  }
  for (const t of readLualsTargets(packageRoot)) {
    targets.push({
      lane: "luals",
      repo: t.repo,
      ref: t.ref,
      moduleId: t.moduleId,
      paths: t.sourceGlobs,
    });
  }
  for (const t of readMarkdownTargets(packageRoot)) {
    targets.push({
      lane: "markdown",
      repo: t.repo,
      ref: t.ref,
      moduleId: t.moduleId,
      paths: [t.markdown],
    });
  }
  for (const t of readOpenApiTargets(packageRoot)) {
    targets.push({
      lane: "openapi",
      repo: t.repo,
      ref: t.ref,
      moduleId: t.moduleId,
      paths: [t.swagger, t.proto],
    });
  }
  for (const t of readScriptApiTargets(packageRoot)) {
    targets.push({
      lane: "scriptApi",
      repo: t.repo,
      ref: t.ref,
      moduleId: t.moduleId,
      paths: [t.scriptApi],
    });
  }
  return targets;
}

/**
 * Group by `repo` + `ref`, not by repo alone and not by module: one bump answers
 * every dependent of one pin, while two different pins of one repo are two
 * genuinely separate bumps.
 */
export function groupPinnedTargets(targets: readonly PinnedTarget[]): PinnedGroup[] {
  const groups = new Map<string, { group: PinnedGroup; paths: Set<string> }>();
  for (const target of targets) {
    const key = `${target.repo}@${target.ref}`;
    const existing = groups.get(key);
    const dependent = `${target.lane}:${target.moduleId}`;
    if (existing === undefined) {
      groups.set(key, {
        group: {
          repo: target.repo,
          slug: repoSlug(target.repo),
          ref: target.ref,
          pinKind: SHA_REF.test(target.ref) ? "sha" : "tag",
          dependents: [dependent],
          consumedPaths: [],
        },
        paths: new Set(target.paths),
      });
      continue;
    }
    if (!existing.group.dependents.includes(dependent)) {
      existing.group = {
        ...existing.group,
        dependents: [...existing.group.dependents, dependent],
      };
    }
    for (const path of target.paths) existing.paths.add(path);
  }
  return [...groups.values()].map(({ group, paths }) => ({ ...group, consumedPaths: [...paths] }));
}

export function collectPinnedTargets(packageRoot: string = PACKAGE_ROOT): PinnedGroup[] {
  return groupPinnedTargets(readPinnedTargets(packageRoot));
}

// Keyed on the repo slug and the upstream version alone so a rerun before the
// bump lands finds the issue it opened last time; folding the pinned version in
// would mint a second issue the moment anything else rotated the pin.
export function issueTitleFor(slug: string, upstream: string): string {
  return `${slug} moved to ${upstream} — refresh the pinned library types`;
}

function issueBodyFor(
  group: PinnedGroup,
  report: Omit<LibraryUpstreamReport, "issueBody">,
): string {
  const moved =
    report.reason === "behind-head"
      ? `\`${group.slug}\` is pinned at the commit \`${group.ref}\`, which is **${report.commitsBehind}** commit(s) behind \`${report.upstream}\`, and the delta touches a path this repo consumes.`
      : `\`${group.slug}\` is pinned at **${group.ref}**; upstream now tags **${report.upstream}**.`;
  const intervening =
    report.intervening === undefined
      ? []
      : [
          "",
          `Tags released since the pin: ${report.intervening.map((t) => `\`${t}\``).join(", ")}.`,
        ];
  return [
    moved,
    "",
    "Dependent modules:",
    ...group.dependents.map((dependent) => `- \`${dependent}\``),
    ...intervening,
    "",
    "Re-pinning is not a find-and-replace: the lanes differ in cost, and a bump",
    "moves a committed fidelity floor, the docs-site provenance assertions, and the",
    "generated docs artifacts with it. Follow *Refreshing library pins* in",
    "`packages/docs/guide/refreshing-library-pins.md`.",
    "",
    "_Opened automatically by `library-upstream-check`._",
  ].join("\n");
}

function matchesConsumedPath(patterns: readonly string[], file: string): boolean {
  return patterns.some((pattern) => new Bun.Glob(pattern).match(file));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A repo may publish two unrelated tag series — `Insality/panthera` ships
// `runtime.*` beside a busier, newer `editor.*` — so "the newest tag" is only
// meaningful within the pin's own series. Everything before the first digit is
// that series: `runtime.` for `runtime.8`, `v` for `v3.21.1`, empty for `1.2.5`.
function tagSeries(name: string): string {
  const firstDigit = name.search(/\d/);
  return firstDigit === -1 ? name : name.slice(0, firstDigit);
}

/** Resolve each tag to its commit date; the listing's own order is not recency. */
async function datedTags(
  group: PinnedGroup,
  io: LibraryCheckIo,
): Promise<Array<{ name: string; date: number }>> {
  const tags = await io.listTags(group.slug);
  const dates = new Map<string, string>();
  for (const tag of tags) {
    if (dates.has(tag.sha)) continue;
    dates.set(tag.sha, (await io.readCommit(group.slug, tag.sha)).date);
  }
  return tags.map((tag) => ({
    name: tag.name,
    date: Date.parse(dates.get(tag.sha) ?? ""),
  }));
}

async function evaluateTagPin(
  group: PinnedGroup,
  io: LibraryCheckIo,
  base: Omit<LibraryUpstreamReport, "actionable" | "reason">,
): Promise<LibraryUpstreamReport> {
  const tags = await datedTags(group, io);
  const pinned = tags.find((tag) => tag.name === group.ref);
  if (pinned === undefined || Number.isNaN(pinned.date)) {
    return {
      ...base,
      actionable: false,
      reason: "unknown",
      error: `upstream no longer lists the pinned tag ${group.ref}`,
    };
  }
  const series = tagSeries(pinned.name);
  const newer = tags
    .filter(
      (tag) => !Number.isNaN(tag.date) && tag.date > pinned.date && tagSeries(tag.name) === series,
    )
    .sort((a, b) => a.date - b.date);
  const head = newer.at(-1);
  if (head === undefined) return { ...base, actionable: false, reason: "current" };
  const report = {
    ...base,
    upstream: head.name,
    actionable: true,
    reason: "newer-tag" as const,
    intervening: newer.map((tag) => tag.name),
    issueTitle: issueTitleFor(group.slug, head.name),
  };
  return { ...report, issueBody: issueBodyFor(group, report) };
}

async function evaluateShaPin(
  group: PinnedGroup,
  io: LibraryCheckIo,
  base: Omit<LibraryUpstreamReport, "actionable" | "reason">,
): Promise<LibraryUpstreamReport> {
  const { defaultBranch } = await io.readRepo(group.slug);
  const { aheadBy, files } = await io.compareRefs(group.slug, group.ref, defaultBranch);
  if (aheadBy === 0) return { ...base, actionable: false, reason: "current" };
  const behind = {
    ...base,
    upstream: defaultBranch,
    reason: "behind-head" as const,
    commitsBehind: aheadBy,
  };
  // A repo whose default branch moves for a README edit would otherwise nag every
  // week, and a check that cries wolf is the first thing a maintainer mutes.
  if (!files.some((file) => matchesConsumedPath(group.consumedPaths, file))) {
    return { ...behind, actionable: false };
  }
  const report = {
    ...behind,
    actionable: true,
    issueTitle: issueTitleFor(group.slug, defaultBranch),
  };
  return { ...report, issueBody: issueBodyFor(group, report) };
}

/**
 * Classify one pin against its upstream. An upstream that cannot be read is
 * `unknown` rather than `current`, so a renamed or deleted repo surfaces as a
 * finding instead of a silent green.
 */
export async function evaluateLibraryDrift(
  group: PinnedGroup,
  io: LibraryCheckIo,
): Promise<LibraryUpstreamReport> {
  const base = {
    command: "upstream:library-check",
    repo: group.slug,
    pinned: group.ref,
    dependents: group.dependents,
  } as const;
  try {
    return group.pinKind === "sha"
      ? await evaluateShaPin(group, io, base)
      : await evaluateTagPin(group, io, base);
  } catch (error) {
    return { ...base, actionable: false, reason: "unknown", error: messageOf(error) };
  }
}

export function describeReport(report: LibraryUpstreamReport): string {
  const who = `${report.repo} (${report.dependents.length} module(s))`;
  switch (report.reason) {
    case "newer-tag":
      return `  ${who} — pinned ${report.pinned}, upstream tags ${report.upstream}\n`;
    case "behind-head":
      return `  ${who} — pinned ${report.pinned} is ${report.commitsBehind} commit(s) behind ${report.upstream}${report.actionable ? "" : " (no consumed path touched)"}\n`;
    case "current":
      return `  ${who} — pinned ${report.pinned} is current\n`;
    case "unknown":
      return `  ${who} — pinned ${report.pinned} could not be compared: ${report.error}\n`;
  }
}

export function describeRun(run: LibraryUpstreamRun): string {
  const actionable = run.reports.filter((report) => report.actionable);
  return [
    `upstream:library-check — ${run.reports.length} pin(s), ${actionable.length} actionable\n`,
    ...run.reports.map(describeReport),
  ].join("");
}

/**
 * Exit 0 whether or not there is drift: drift is a finding to report, not a
 * failure. An upstream that could not be read is the failure, so the weekly job
 * stays quiet until a pin actually moves and still goes red on an outage.
 */
export async function runLibraryCheckCli(
  argv: string[],
  io: LibraryCheckIo,
  groups: readonly PinnedGroup[] = collectPinnedTargets(),
): Promise<number> {
  const reports: LibraryUpstreamReport[] = [];
  for (const group of groups) reports.push(await evaluateLibraryDrift(group, io));
  const run: LibraryUpstreamRun = {
    command: "upstream:library-check",
    actionable: reports.some((report) => report.actionable),
    reports,
  };
  io.stdout(argv.includes("--json") ? `${JSON.stringify(run)}\n` : describeRun(run));
  const unreadable = reports.filter((report) => report.reason === "unknown");
  if (unreadable.length === 0) return 0;
  for (const report of unreadable) {
    io.stderr(`upstream:library-check FAILED: ${report.repo}: ${report.error}\n`);
  }
  return 1;
}

const GITHUB_API = "https://api.github.com";

async function githubJson(path: string): Promise<unknown> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
  });
  if (!response.ok) throw new Error(`GET ${path} responded ${response.status}`);
  return response.json();
}

const githubIo: LibraryCheckIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  listTags: async (slug) => {
    const tags = (await githubJson(`/repos/${slug}/tags?per_page=100`)) as Array<{
      name: string;
      commit: { sha: string };
    }>;
    return tags.map((tag) => ({ name: tag.name, sha: tag.commit.sha }));
  },
  readCommit: async (slug, sha) => {
    const commit = (await githubJson(`/repos/${slug}/commits/${sha}`)) as {
      sha: string;
      commit: { committer: { date: string } };
    };
    return { sha: commit.sha, date: commit.commit.committer.date };
  },
  readRepo: async (slug) => {
    const repo = (await githubJson(`/repos/${slug}`)) as { default_branch: string };
    return { defaultBranch: repo.default_branch };
  },
  compareRefs: async (slug, base, head) => {
    const compare = (await githubJson(`/repos/${slug}/compare/${base}...${head}`)) as {
      ahead_by: number;
      files?: Array<{ filename: string }>;
    };
    return {
      aheadBy: compare.ahead_by,
      files: (compare.files ?? []).map((file) => file.filename),
    };
  },
};

if (import.meta.main) {
  process.exit(await runLibraryCheckCli(process.argv.slice(2), githubIo));
}

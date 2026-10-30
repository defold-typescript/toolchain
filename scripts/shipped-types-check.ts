import { join } from "node:path";
import { newestDataFolder } from "../packages/cli/src/library/data-folder.ts";
import { readAuthoredTargets } from "../packages/cli/src/library/sync-authored-types.ts";
import { readLualsTargets } from "../packages/cli/src/library/sync-luals-types.ts";
import { readNativeTargets } from "../packages/cli/src/library/sync-native-types.ts";
import { readScriptApiTargets } from "../packages/cli/src/library/sync-script-api-types.ts";
import {
  checkShippedDeclarations,
  locateShippedDeclarations,
  selectShippedDeclarations,
} from "../packages/cli/src/shipped-declarations.ts";
import {
  datedTags,
  type ForgeReads,
  forgeReadsFor,
  type LibraryCheckIo,
  repoSlug,
} from "./library-upstream-check.ts";

// Reports each curated repo whose newest upstream release ships a `types/`
// folder that `resolve` would install in place of the curated declarations.
// Such a target can leave the corpus, as `pixels` did once
// `king8fisher/defold-pixels` shipped its own; the retirement itself stays a
// reviewed change, so this only names the candidates.
//
// Acceptance is never re-implemented here: the folder goes through the same
// locate, select and check calls `resolve` makes, against the same
// `@defold-typescript/types`.

export type { TypesFolderFile } from "./library-upstream-check.ts";

export type CuratedLane = "authored" | "luals" | "native" | "scriptApi";

/** One curated surface a retirement removes. */
export interface RetireEntry {
  readonly lane: CuratedLane;
  /** The Lua `moduleId`, or the native namespace. */
  readonly id: string;
  /** The curated input the lane prints from, relative to the library data folder. */
  readonly source: string;
}

/** Every curated entry one upstream repo backs, so the repo is read once. */
export interface CuratedRepo {
  readonly repo: string;
  readonly slug: string;
  readonly retire: readonly RetireEntry[];
}

export type ShippedTypesReason = "accepted" | "rejected" | "none" | "unknown";

export interface ShippedTypesReport {
  readonly command: "upstream:shipped-types-check";
  readonly repo: string;
  /** The tag or branch read; absent when the repo could not be read. */
  readonly ref?: string;
  readonly actionable: boolean;
  readonly reason: ShippedTypesReason;
  readonly retire: readonly RetireEntry[];
  /** The files `resolve` would install, relative to `types/`. */
  readonly files?: readonly string[];
  /** The first message the check reports, when it rejects the folder. */
  readonly message?: string;
  readonly error?: string;
  readonly issueTitle?: string;
  readonly issueBody?: string;
}

export interface ShippedTypesRun {
  readonly command: "upstream:shipped-types-check";
  readonly actionable: boolean;
  readonly reports: readonly ShippedTypesReport[];
}

export interface ShippedTypesIo
  extends Pick<LibraryCheckIo, "stdout" | "stderr" | "listTags" | "readCommit" | "readRepo">,
    Pick<ForgeReads, "listTypesFolder"> {}

const PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");

const TYPES_ROOT = join(import.meta.dir, "..", "packages", "types");

// `locateShippedDeclarations` reads archive entries and strips the one folder a
// Defold archive wraps its tree in. Bare `types/<name>` entries would have
// `types` itself taken for that wrapper and match nothing.
const ARCHIVE_WRAPPER = "archive";

const SHIPPED_DIR = "types/";

/** The four lanes `resolve` installs curated declarations from, grouped by repo. */
export function readCuratedRepos(dataDir: string = newestDataFolder(PACKAGE_ROOT)): CuratedRepo[] {
  const entries: Array<{ repo: string; entry: RetireEntry }> = [];
  const add = (repo: string, lane: CuratedLane, id: string, source: string) =>
    entries.push({ repo, entry: { lane, id, source } });
  for (const t of readAuthoredTargets(dataDir)) {
    add(t.repo, "authored", t.moduleId, t.authored);
  }
  for (const t of readLualsTargets(dataDir)) {
    add(t.repo, "luals", t.moduleId, `fixtures/luals/${t.namespace}/`);
  }
  for (const t of readScriptApiTargets(dataDir)) {
    add(t.repo, "scriptApi", t.moduleId, `fixtures/script-api/${t.moduleId}.script_api`);
  }
  for (const t of readNativeTargets(dataDir)) {
    add(t.repo, "native", t.namespace, t.declaration);
  }

  const byRepo = new Map<string, RetireEntry[]>();
  for (const { repo, entry } of entries) {
    const retire = byRepo.get(repo);
    if (retire === undefined) byRepo.set(repo, [entry]);
    else retire.push(entry);
  }
  return [...byRepo].map(([repo, retire]) => ({ repo, slug: repoSlug(repo), retire }));
}

// Keyed on the slug and the release, so a rerun finds the issue it opened until
// the retirement lands, and a later release is a new question.
export function issueTitleFor(slug: string, ref: string): string {
  return `retire curated types for ${slug}: ${ref} ships types`;
}

function issueBodyFor(report: ShippedTypesReport & { ref: string }): string {
  return [
    `\`${report.repo}\` ships a \`types/\` folder at **${report.ref}**, and \`resolve\` accepts it: every file compiles against \`@defold-typescript/types\`, so a project depending on it gets these declarations in place of the curated ones.`,
    "",
    "Shipped files:",
    ...(report.files ?? []).map((file) => `- \`${SHIPPED_DIR}${file}\``),
    "",
    "Curated entries to retire (paths under the newest `packages/library-types/data/` folder):",
    ...report.retire.map((entry) => `- \`${entry.lane}:${entry.id}\` — \`${entry.source}\``),
    "",
    "A project on an earlier release has no `types/` folder to fall back on once the curated copy is gone, so weigh that before retiring.",
    "Retiring is a reviewed change, as `pixels` was: follow *Retiring a curated target* in",
    "`packages/docs/guide/refreshing-library-pins.md`.",
    "",
    "_Opened automatically by `shipped-types-check`._",
  ].join("\n");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The newest tag by commit date, since listing order is not recency; a repo that
// tags nothing is read at its default branch head.
async function newestRef(repo: string, io: ShippedTypesIo): Promise<string> {
  let newest: { name: string; date: number } | undefined;
  for (const tag of await datedTags(repo, io)) {
    if (!Number.isNaN(tag.date) && (newest === undefined || tag.date > newest.date)) newest = tag;
  }
  return newest?.name ?? (await io.readRepo(repo)).defaultBranch;
}

/**
 * Classify one repo's newest release. A repo that cannot be read is `unknown`
 * rather than `none`, so a renamed or deleted upstream surfaces as a finding.
 */
export async function evaluateShippedTypes(
  curated: CuratedRepo,
  io: ShippedTypesIo,
  typesRoot: string = TYPES_ROOT,
): Promise<ShippedTypesReport> {
  const base = {
    command: "upstream:shipped-types-check",
    repo: curated.slug,
    retire: curated.retire,
  } as const;
  let ref: string;
  let folder: Awaited<ReturnType<ShippedTypesIo["listTypesFolder"]>>;
  try {
    ref = await newestRef(curated.repo, io);
    folder = await io.listTypesFolder(curated.repo, ref);
  } catch (error) {
    return { ...base, actionable: false, reason: "unknown", error: messageOf(error) };
  }

  const contents = new Map((folder ?? []).map((file) => [`${SHIPPED_DIR}${file.name}`, file]));
  const located = locateShippedDeclarations(
    [...contents.keys()].map((entry) => `${ARCHIVE_WRAPPER}/${entry}`),
  ).map((entry) => entry.slice(ARCHIVE_WRAPPER.length + 1));
  const shipped = selectShippedDeclarations(
    located.map((entry) => ({ entry, contents: contents.get(entry)?.contents ?? "" })),
  );
  if (shipped.length === 0) return { ...base, ref, actionable: false, reason: "none" };

  const files = shipped.map(({ entry }) => entry.slice(SHIPPED_DIR.length));
  const checked = checkShippedDeclarations(shipped, typesRoot);
  const message = shipped.flatMap(({ entry }) => checked.get(entry) ?? [])[0];
  if (message !== undefined) {
    return { ...base, ref, files, actionable: false, reason: "rejected", message };
  }
  const report = {
    ...base,
    ref,
    files,
    actionable: true,
    reason: "accepted" as const,
    issueTitle: issueTitleFor(curated.slug, ref),
  };
  return { ...report, issueBody: issueBodyFor(report) };
}

function reportDetail(report: ShippedTypesReport): string {
  switch (report.reason) {
    case "accepted":
      return `${report.ref} ships types resolve accepts: ${(report.files ?? []).join(", ")}`;
    case "rejected":
      return `${report.ref} ships types resolve rejects: ${report.message}`;
    case "none":
      return `${report.ref} ships no types`;
    case "unknown":
      return `could not be read: ${report.error}`;
  }
}

export function describeRun(run: ShippedTypesRun): string {
  const actionable = run.reports.filter((report) => report.actionable);
  return [
    `upstream:shipped-types-check — ${run.reports.length} repo(s), ${actionable.length} actionable\n`,
    ...run.reports.map(
      (report) => `  ${report.repo} (${report.retire.length} curated) — ${reportDetail(report)}\n`,
    ),
  ].join("");
}

/**
 * Exit 0 whether or not a repo ships types: that is a finding, not a failure. A
 * repo that could not be read is the failure, as in `upstream:library-check`.
 */
export async function runShippedTypesCheck(
  argv: string[],
  io: ShippedTypesIo,
  repos: readonly CuratedRepo[] = readCuratedRepos(),
  typesRoot: string = TYPES_ROOT,
): Promise<number> {
  const reports: ShippedTypesReport[] = [];
  for (const repo of repos) reports.push(await evaluateShippedTypes(repo, io, typesRoot));
  const run: ShippedTypesRun = {
    command: "upstream:shipped-types-check",
    actionable: reports.some((report) => report.actionable),
    reports,
  };
  io.stdout(argv.includes("--json") ? `${JSON.stringify(run)}\n` : describeRun(run));
  const unreadable = reports.filter((report) => report.reason === "unknown");
  if (unreadable.length === 0) return 0;
  for (const report of unreadable) {
    io.stderr(`upstream:shipped-types-check FAILED: ${report.repo}: ${report.error}\n`);
  }
  return 1;
}

const forgeIo: ShippedTypesIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  listTags: async (repo) => forgeReadsFor(repo).listTags(repo),
  readCommit: async (repo, sha) => forgeReadsFor(repo).readCommit(repo, sha),
  readRepo: async (repo) => forgeReadsFor(repo).readRepo(repo),
  listTypesFolder: async (repo, ref) => forgeReadsFor(repo).listTypesFolder(repo, ref),
};

if (import.meta.main) {
  process.exit(await runShippedTypesCheck(process.argv.slice(2), forgeIo));
}

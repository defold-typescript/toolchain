import { readFileSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { scopesOf } from "./ci-scope.ts";
import { isIssueTitle as isMovedIssueTitle } from "./library-upstream-issue.ts";

export const BOT_BRANCH_PREFIX = "library-update/";
export const ISSUE_TITLE_PREFIX = "library update cannot land ";

// Opens one PR per library that `library update --json` changed, and turns on
// auto-merge for a PR only when the change is safe and every path is library data,
// and only for the commit it checked. It closes its PR for a library found current
// or held, and keeps one issue open per library it cannot land: one that failed to
// update, or whose PR's checks were red when the run started.

type Change = "kept" | "added" | "changed";

// One library's entry in the `library update --json` report.
export interface UpdateEntry {
  readonly library: string;
  readonly status: "held" | "current" | "recorded" | "regenerated";
  readonly recorded: string[];
  readonly differs: string[];
  // Forward-slash paths relative to the library's folder.
  readonly written: string[];
  readonly ref?: string;
  readonly change?: Change;
  readonly members?: {
    readonly added: string[];
    readonly removed: string[];
    readonly changed: string[];
  };
}

interface UpdateReport {
  readonly dataFolder: string;
  readonly updated?: UpdateEntry[];
  readonly failed?: { library: string; message: string }[];
  readonly error?: string;
}

export type Run = (args: string[]) => { code: number; stdout: string; stderr: string };

// One entry of `gh pr list --json statusCheckRollup`: a check run, or a commit
// status from a service that reports through the statuses API.
export interface Check {
  readonly __typename?: string;
  readonly name?: string;
  readonly context?: string;
  readonly status?: string;
  readonly conclusion?: string | null;
  readonly state?: string;
}

interface OpenPull {
  readonly number: number;
  readonly headRefName: string;
  readonly statusCheckRollup: Check[] | null;
}

interface OpenIssue {
  readonly number: number;
  readonly title: string;
}

const RED_CONCLUSIONS = ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"];
const RED_STATES = ["FAILURE", "ERROR"];
const GREEN_CONCLUSIONS = ["SUCCESS", "SKIPPED", "NEUTRAL"];

export function checksState(rollup: readonly Check[]): "red" | "green" | "pending" {
  const failed = ({ conclusion, state }: Check) =>
    RED_CONCLUSIONS.includes(conclusion ?? "") || RED_STATES.includes(state ?? "");
  const passed = ({ status, conclusion, state }: Check) =>
    (status === "COMPLETED" && GREEN_CONCLUSIONS.includes(conclusion ?? "")) || state === "SUCCESS";
  if (rollup.some(failed)) return "red";
  return rollup.length > 0 && rollup.every(passed) ? "green" : "pending";
}

const SAFE_CHANGES: readonly Change[] = ["kept", "added"];
const BASE = "main";
const USAGE = "usage: library-update-prs.ts <report.json>";

function isLibraryData(paths: string[]): boolean {
  const scopes = scopesOf(paths);
  return scopes.length === 1 && scopes[0] === "data";
}

// `library update` writes a library's `reviewed.json` and the files under its
// `source/`, and nothing else, so any other path means something else produced it.
// Library data itself is whatever the CI scope rule says it is, so a data folder
// CI does not check as library data never merges without a human.
export function mayAutoMerge(
  entry: UpdateEntry,
  changedPaths: string[],
  dataFolder: string,
): boolean {
  const safeChange =
    entry.change === undefined ? entry.status === "recorded" : SAFE_CHANGES.includes(entry.change);
  const folder = `${dataFolder}/${entry.library}/`;
  return (
    safeChange &&
    isLibraryData(changedPaths) &&
    changedPaths.every((path) => {
      if (!path.startsWith(folder)) return false;
      const inner = path.slice(folder.length);
      return inner === "reviewed.json" || inner.startsWith("source/");
    })
  );
}

function must(run: Run, args: string[]): string {
  const result = run(args);
  if (result.code !== 0)
    throw new Error(`${args.join(" ")} exited ${result.code}: ${result.stderr}`);
  return result.stdout;
}

function repoRelative(cwd: string, folder: string): string {
  const path = relative(cwd, folder).split(sep).join("/");
  if (path === "" || path === ".." || path.startsWith("../") || isAbsolute(path)) {
    throw new Error(`data folder ${folder} is not inside ${cwd}`);
  }
  return path;
}

function names(list: string[]): string {
  return list.length === 0 ? "none" : list.map((name) => `\`${name}\``).join(", ");
}

function title(entry: UpdateEntry): string {
  return entry.change === undefined
    ? `record ${entry.library} commits`
    : `update ${entry.library} to ${entry.ref}`;
}

function body(entry: UpdateEntry): string {
  if (entry.change === undefined) {
    return `\`library update\` recorded commits whose hashes a review already holds: ${names(entry.recorded)}.\n`;
  }
  const members = entry.members ?? { added: [], removed: [], changed: [] };
  return [
    `\`library update\` moved ${entry.library} to ${entry.ref}. Change: \`${entry.change}\`.`,
    "",
    `- added: ${names(members.added)}`,
    `- removed: ${names(members.removed)}`,
    `- changed: ${names(members.changed)}`,
    "",
  ].join("\n");
}

function openPullRequest(entry: UpdateEntry, dataFolder: string, run: Run): void {
  const branch = `${BOT_BRANCH_PREFIX}${entry.library}`;
  must(run, ["git", "add", "-A", "--", `${dataFolder}/${entry.library}`]);
  must(run, ["git", "commit", "--quiet", "-m", title(entry)]);
  const sha = must(run, ["git", "rev-parse", "HEAD"]).trim();
  // From the commit rather than the report, and with renames split, so a file moved
  // out of a hand-kept folder still names that folder.
  const changedPaths = must(run, [
    "git",
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    "HEAD~1",
    "HEAD",
  ])
    .split("\0")
    .filter(Boolean);
  // Leaves the other libraries' files in the working tree for their own commit.
  must(run, ["git", "reset", "--quiet", "HEAD~1"]);

  const open = JSON.parse(
    must(run, [
      "gh",
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--json",
      "number,autoMergeRequest",
    ]),
  ) as { number: number; autoMergeRequest: unknown }[];
  // A request left on would merge whatever the force-push brings, checked or not, so
  // it goes off before the push and comes back only for the commit read above.
  if (open.some(({ autoMergeRequest }) => autoMergeRequest)) {
    must(run, ["gh", "pr", "merge", branch, "--disable-auto"]);
  }
  must(run, ["git", "push", "--force", "--quiet", "origin", `${sha}:refs/heads/${branch}`]);
  const text = ["--title", title(entry), "--body", body(entry)];
  if (open.length === 0) {
    must(run, ["gh", "pr", "create", "--head", branch, "--base", BASE, ...text]);
  } else {
    must(run, ["gh", "pr", "edit", branch, ...text]);
  }
  if (mayAutoMerge(entry, changedPaths, dataFolder)) {
    // GitHub refuses the request if another push moved the branch off this commit.
    must(run, ["gh", "pr", "merge", branch, "--auto", "--squash", "--match-head-commit", sha]);
  }
}

function listed<T>(run: Run, args: string[]): T[] {
  return JSON.parse(must(run, args)) as T[];
}

function settledReason(entry: UpdateEntry): string {
  return entry.status === "held"
    ? `\`library update\` found ${entry.library} held: its \`follows\` is \`none\`.`
    : `\`library update\` found ${entry.library} current.`;
}

function issueBody(library: string, failure: string | undefined, pull: number | undefined): string {
  const lines: string[] = [];
  if (failure !== undefined)
    lines.push(`\`library update\` could not update ${library}: ${failure}`);
  if (pull !== undefined) lines.push(`#${pull} has a failed check, so it cannot merge.`);
  lines.push(
    "",
    "The library update bot edits this issue on each run and closes it once nothing stops the library landing.",
  );
  return `${lines.join("\n")}\n`;
}

const MOVED_ISSUE_COMMENT =
  "The library update bot tracks upstream moves: it opens a PR for each library that moved, and files `library update cannot land <library>` when one cannot land.";

// `pulls` holds the bot PRs still open, keyed by library, with the checks read
// before the run pushed anything.
function reconcileIssues(
  failed: readonly { library: string; message: string }[],
  pulls: ReadonlyMap<string, OpenPull>,
  settled: ReadonlyMap<string, string>,
  issues: readonly OpenIssue[],
  run: Run,
): void {
  const failures = new Map(failed.map(({ library, message }) => [library, message]));
  const red = new Map(
    [...pulls]
      .filter(([, pull]) => checksState(pull.statusCheckRollup ?? []) === "red")
      .map(([library, pull]) => [library, pull.number]),
  );
  const open = new Map(
    issues
      .filter(({ title }) => title.startsWith(ISSUE_TITLE_PREFIX))
      .map((issue) => [issue.title.slice(ISSUE_TITLE_PREFIX.length), issue]),
  );
  for (const library of new Set([...failures.keys(), ...red.keys()])) {
    const body = issueBody(library, failures.get(library), red.get(library));
    const issue = open.get(library);
    if (issue === undefined) {
      must(run, [
        "gh",
        "issue",
        "create",
        "--title",
        `${ISSUE_TITLE_PREFIX}${library}`,
        "--body",
        body,
      ]);
    } else {
      must(run, ["gh", "issue", "edit", String(issue.number), "--body", body]);
    }
  }
  for (const [library, issue] of open) {
    if (failures.has(library) || red.has(library)) continue;
    const pull = pulls.get(library);
    const state = pull === undefined ? undefined : checksState(pull.statusCheckRollup ?? []);
    if (state === "pending") continue;
    const reason =
      settled.get(library) ??
      (pull === undefined
        ? `\`library update\` no longer fails for ${library}.`
        : `#${pull.number} passed its checks.`);
    must(run, ["gh", "issue", "close", String(issue.number), "--comment", reason]);
  }
  for (const issue of issues) {
    if (isMovedIssueTitle(issue.title)) {
      must(run, ["gh", "issue", "close", String(issue.number), "--comment", MOVED_ISSUE_COMMENT]);
    }
  }
}

export function main(reportPath: string, { cwd, run }: { cwd: string; run: Run }): number {
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as UpdateReport;
  if (report.updated === undefined || report.failed === undefined) {
    throw new Error(
      `${reportPath} holds no update: ${report.error ?? "no updated or failed list"}`,
    );
  }
  const dataFolder = repoRelative(cwd, report.dataFolder);
  // Read before the first push: a force-push restarts a PR's checks, so only the
  // state from before it says how the last refresh did.
  const pulls = new Map(
    listed<OpenPull>(run, [
      "gh",
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "200",
      "--json",
      "number,headRefName,statusCheckRollup",
    ])
      .filter(({ headRefName }) => headRefName.startsWith(BOT_BRANCH_PREFIX))
      .map((pull) => [pull.headRefName.slice(BOT_BRANCH_PREFIX.length), pull]),
  );
  const issues = listed<OpenIssue>(run, [
    "gh",
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    "number,title",
  ]);
  const settled = new Map<string, string>();
  for (const entry of report.updated) {
    if (entry.written.length > 0) {
      openPullRequest(entry, dataFolder, run);
      continue;
    }
    const reason = settledReason(entry);
    settled.set(entry.library, reason);
    if (pulls.delete(entry.library)) {
      must(run, [
        "gh",
        "pr",
        "close",
        `${BOT_BRANCH_PREFIX}${entry.library}`,
        "--delete-branch",
        "--comment",
        `${reason} This PR has nothing left to land.`,
      ]);
    }
  }
  reconcileIssues(report.failed, pulls, settled, issues, run);
  for (const { library, message } of report.failed) console.error(`${library}: ${message}`);
  return report.failed.length > 0 ? 1 : 0;
}

function spawn(cwd: string): Run {
  return (args) => {
    const result = Bun.spawnSync(args, { cwd });
    return {
      code: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };
}

if (import.meta.main) {
  const [reportPath, ...rest] = process.argv.slice(2);
  if (reportPath === undefined || rest.length > 0 || reportPath.startsWith("-"))
    throw new Error(USAGE);
  const cwd = process.cwd();
  process.exitCode = main(reportPath, { cwd, run: spawn(cwd) });
}

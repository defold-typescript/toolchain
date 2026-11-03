import { readFileSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { scopesOf } from "./ci-scope.ts";

// Opens one PR per library that `library update --json` changed, and turns on
// auto-merge for a PR only when the change is safe and every path is library data.

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
  const branch = `library-update/${entry.library}`;
  must(run, ["git", "add", "-A", "--", `${dataFolder}/${entry.library}`]);
  must(run, ["git", "commit", "--quiet", "-m", title(entry)]);
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
  must(run, ["git", "push", "--force", "--quiet", "origin", `HEAD:refs/heads/${branch}`]);
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
  const text = ["--title", title(entry), "--body", body(entry)];
  if (open.length === 0) {
    must(run, ["gh", "pr", "create", "--head", branch, "--base", BASE, ...text]);
  } else {
    must(run, ["gh", "pr", "edit", branch, ...text]);
  }
  if (mayAutoMerge(entry, changedPaths, dataFolder)) {
    must(run, ["gh", "pr", "merge", branch, "--auto", "--squash"]);
  } else if (open.some(({ autoMergeRequest }) => autoMergeRequest)) {
    // The force-push may have turned a safe PR into one a human has to read.
    must(run, ["gh", "pr", "merge", branch, "--disable-auto"]);
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
  for (const entry of report.updated) {
    if (entry.written.length > 0) openPullRequest(entry, dataFolder, run);
  }
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

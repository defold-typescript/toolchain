// Print the raw material for a curated changelog entry: the release date and the
// deduped commit subjects (+ PR numbers) between two tags.
//
// The changelog is curated, not generated — this helper never emits finished
// Added/Improved/Fixed buckets. Its output is a scaffold to hand-edit, and the
// starting point for both backfill and each future release. The pure core
// (parseGitLog/formatCommitBlock) is unit-tested offline with fixture git output;
// buildChangelogBlock resolves the two git calls behind an injectable RunGit seam
// so date resolution and failure handling are unit-testable with canned output,
// and a thin spawnSync CLI wraps it, mirroring scripts/current-version.ts. Both
// git calls fail loud: a non-zero `git log` (unknown ref) or an unresolvable tag
// date throws rather than printing a well-formed heading with an empty date.
//
// Usage:
//   bun scripts/changelog-commits.ts <fromTag> <toTag>

import { spawnSync } from "node:child_process";

export interface Commit {
  hash: string;
  subject: string;
  pr?: number;
}

export function parseGitLog(raw: string): Commit[] {
  const seen = new Set<string>();
  const commits: Commit[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const tab = line.indexOf("\t");
    const hash = tab === -1 ? line : line.slice(0, tab);
    let subject = tab === -1 ? "" : line.slice(tab + 1);
    const commit: Commit = { hash, subject };
    const prMatch = subject.match(/\s*\(#(\d+)\)\s*$/);
    if (prMatch) {
      commit.pr = Number(prMatch[1]);
      subject = subject.slice(0, prMatch.index).trimEnd();
      commit.subject = subject;
    }
    if (seen.has(subject)) {
      continue;
    }
    seen.add(subject);
    commits.push(commit);
  }
  return commits;
}

export function formatCommitBlock(input: { to: string; date: string; commits: Commit[] }): string {
  const heading = `## ${input.to} - ${input.date}`;
  if (input.commits.length === 0) {
    return `${heading}\n\n_No commits in range._`;
  }
  const bullets = input.commits
    .map((c) => `- ${c.subject}${c.pr === undefined ? "" : ` (#${c.pr})`}`)
    .join("\n");
  return `${heading}\n\n${bullets}`;
}

export type RunGit = (args: string[]) => {
  status: number | null;
  stdout: string;
  error?: Error | undefined;
};

export function buildChangelogBlock(from: string, to: string, run: RunGit): string {
  const logResult = run(["log", "--no-merges", "--format=%h%x09%s", `${from}..${to}`]);
  if (logResult.error || logResult.status !== 0) {
    const detail = logResult.error ? `: ${logResult.error.message}` : ` (exit ${logResult.status})`;
    throw new Error(`git log ${from}..${to} failed${detail}`);
  }
  const commits = parseGitLog(logResult.stdout ?? "");

  // creatordate = tagger date for an annotated tag, commit date for a lightweight
  // tag; %ad follows the tag to its commit's author date and is off by a day.
  const dateResult = run(["for-each-ref", "--format=%(creatordate:short)", `refs/tags/${to}`]);
  if (dateResult.error || dateResult.status !== 0) {
    const detail = dateResult.error
      ? `: ${dateResult.error.message}`
      : ` (exit ${dateResult.status})`;
    throw new Error(`git for-each-ref refs/tags/${to} failed${detail}`);
  }
  const date = (dateResult.stdout ?? "").trim();
  if (date === "") {
    throw new Error(`could not resolve a tag date for ${to} (is it an existing tag?)`);
  }

  return formatCommitBlock({ to, date, commits });
}

if (import.meta.main) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) {
    process.stderr.write("usage: bun scripts/changelog-commits.ts <fromTag> <toTag>\n");
    process.exit(1);
  }
  const run: RunGit = (args) => {
    const p = spawnSync("git", args, { encoding: "utf8" });
    return { status: p.status, stdout: p.stdout ?? "", error: p.error };
  };
  try {
    process.stdout.write(`${buildChangelogBlock(from, to, run)}\n`);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

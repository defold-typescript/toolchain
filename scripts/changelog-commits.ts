// Print the raw material for a curated changelog entry: the release date and the
// deduped commit subjects (+ PR numbers) between two tags.
//
// The changelog is curated, not generated — this helper never emits finished
// Added/Improved/Fixed buckets. Its output is a scaffold to hand-edit, and the
// starting point for both backfill and each future release. The pure core
// (parseGitLog/formatCommitBlock) is unit-tested offline with fixture git output;
// a thin spawnSync CLI wraps it, mirroring scripts/current-version.ts.
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

if (import.meta.main) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) {
    process.stderr.write("usage: bun scripts/changelog-commits.ts <fromTag> <toTag>\n");
    process.exit(1);
  }
  const log = spawnSync("git", ["log", "--no-merges", "--format=%h%x09%s", `${from}..${to}`], {
    encoding: "utf8",
  });
  const dateProc = spawnSync("git", ["log", "-1", "--format=%ad", "--date=short", to], {
    encoding: "utf8",
  });
  const commits = parseGitLog(log.stdout ?? "");
  const date = (dateProc.stdout ?? "").trim();
  process.stdout.write(`${formatCommitBlock({ to, date, commits })}\n`);
}

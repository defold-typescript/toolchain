import { parseArgs } from "node:util";

// Holds a release until ci.yml's full scope has passed on the tagged commit. A
// change that touched only library data or the library docs site skips the full
// suite, so its tag waits for the full run the tag push starts.

// The check runs ci.yml's full scope creates.
export const GATED_CHECKS = [
  "lint-typecheck",
  "test (ubuntu-latest)",
  "test (windows-latest)",
  "test (macos-latest)",
  "library-data",
] as const;

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export type GateVerdict =
  | { state: "pass" }
  | { state: "wait"; pending: string[] }
  | { state: "fail"; failed: string[] };

// A commit carries one run of each check per CI run, so only the newest run of a
// check counts: an earlier cancelled run cannot veto a later green one, and a
// later red one still blocks. A skipped run proves nothing either way.
export function gateVerdict(
  runs: readonly CheckRun[],
  required: readonly string[] = GATED_CHECKS,
): GateVerdict {
  const newest = new Map<string, CheckRun>();
  for (const run of runs) {
    if (!required.includes(run.name)) continue;
    if (run.status === "completed" && run.conclusion === "skipped") continue;
    const seen = newest.get(run.name);
    if (seen === undefined || run.id > seen.id) newest.set(run.name, run);
  }
  const failed: string[] = [];
  const pending: string[] = [];
  for (const name of required) {
    const run = newest.get(name);
    if (run === undefined) pending.push(`${name}: not run`);
    else if (run.status !== "completed") pending.push(`${name}: ${run.status}`);
    else if (run.conclusion !== "success") failed.push(`${name}: ${run.conclusion}`);
  }
  if (failed.length > 0) return { state: "fail", failed };
  if (pending.length > 0) return { state: "wait", pending };
  return { state: "pass" };
}

export interface GateLoop {
  fetchRuns: () => Promise<CheckRun[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs: number;
  intervalMs: number;
  log: (line: string) => void;
}

// Polls until the gate passes or fails. A verdict still waiting at the deadline is
// returned as is; a failed read is retried like a pending check.
export async function awaitCiGate(loop: GateLoop): Promise<GateVerdict> {
  const deadline = loop.now() + loop.timeoutMs;
  for (;;) {
    let verdict: GateVerdict;
    try {
      verdict = gateVerdict(await loop.fetchRuns());
    } catch (err) {
      verdict = { state: "wait", pending: [`check runs unreadable: ${(err as Error).message}`] };
    }
    if (verdict.state !== "wait" || loop.now() >= deadline) return verdict;
    loop.log(`waiting for ${verdict.pending.join(", ")}`);
    await loop.sleep(loop.intervalMs);
  }
}

async function fetchCheckRuns(repo: string, sha: string): Promise<CheckRun[]> {
  const proc = Bun.spawn(
    [
      "gh",
      "api",
      "--paginate",
      `repos/${repo}/commits/${sha}/check-runs?per_page=100`,
      "--jq",
      ".check_runs[] | {id, name, status, conclusion}",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(stderr.trim() || `gh exited ${code}`);
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as CheckRun);
}

const USAGE =
  "usage: release-ci-gate.ts --repo <owner/name> --sha <commit> [--timeout-minutes <n>]";

async function main(argv: string[]): Promise<number> {
  let values: { repo?: string; sha?: string; "timeout-minutes"?: string };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        repo: { type: "string" },
        sha: { type: "string" },
        "timeout-minutes": { type: "string", default: "120" },
      },
    }));
  } catch {
    console.error(USAGE);
    return 2;
  }
  const { repo, sha } = values;
  const timeoutMinutes = Number(values["timeout-minutes"]);
  if (repo === undefined || sha === undefined || !(timeoutMinutes >= 0)) {
    console.error(USAGE);
    return 2;
  }
  const verdict = await awaitCiGate({
    fetchRuns: () => fetchCheckRuns(repo, sha),
    sleep: (ms) => Bun.sleep(ms),
    now: () => Date.now(),
    timeoutMs: timeoutMinutes * 60_000,
    intervalMs: 30_000,
    log: (line) => console.log(line),
  });
  if (verdict.state === "pass") {
    console.log(`CI's full scope is green on ${sha}. Proceeding to publish.`);
    return 0;
  }
  if (verdict.state === "fail") {
    console.log(`::error::CI is not green on ${sha}; refusing to publish:`);
    for (const line of verdict.failed) console.log(`  - ${line}`);
    return 1;
  }
  console.log(
    `::error::CI's full scope did not finish on ${sha} within ${timeoutMinutes} minutes; refusing to publish:`,
  );
  for (const line of verdict.pending) console.log(`  - ${line}`);
  console.log("Re-run this release once a full-scope CI run on this commit is green.");
  return 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));

import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { LIBRARY_TYPES_ROOT } from "../packages/cli/src/library/package-root.ts";

// Holds a release until the data repo's `data/` holds the library data of the
// commit it releases. The CLI reads its library data from there, and
// library-data-publish writes it only after a data change reaches main, so a tag
// pushed right after a data merge can race that merge's publish.

const REPO_ROOT = join(import.meta.dir, "..");
// Repo-relative, as git names tree paths.
export const LIBRARY_DATA = relative(REPO_ROOT, join(LIBRARY_TYPES_ROOT, "data")).replaceAll(
  "\\",
  "/",
);

// One child of a `data/` folder: a git object id, which the mirror's whole-folder
// writes keep equal on both sides exactly when the contents match.
export interface DataEntry {
  name: string;
  sha: string;
}

export type DataGateVerdict =
  | { state: "current" }
  | { state: "stale"; stale: string[] }
  | { state: "unreadable"; reason: string };

// A remote-only entry is left alone: the CLI reads only the folder its version
// selects, so a folder this repo deleted does not make the data repo stale.
export function staleDataEntries(
  local: readonly DataEntry[],
  remote: readonly DataEntry[],
): string[] {
  const remoteSha = new Map(remote.map((e) => [e.name, e.sha]));
  const stale: string[] = [];
  for (const { name, sha } of local) {
    const held = remoteSha.get(name);
    if (held === undefined) stale.push(`${name}: missing`);
    else if (held !== sha) stale.push(`${name}: differs`);
  }
  return stale;
}

export function readLocalDataEntries(sha: string, repoRoot: string = REPO_ROOT): DataEntry[] {
  const proc = Bun.spawnSync(["git", "ls-tree", "-z", sha, `${LIBRARY_DATA}/`], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`git ls-tree ${sha}: ${proc.stderr.toString().trim()}`);
  }
  // Each record is `<mode> <type> <object>\t<path>`.
  const entries = proc.stdout
    .toString()
    .split("\0")
    .filter((record) => record !== "")
    .map((record) => {
      const tab = record.indexOf("\t");
      const object = record.slice(0, tab).split(" ")[2] ?? "";
      const path = record.slice(tab + 1);
      return { name: path.slice(LIBRARY_DATA.length + 1), sha: object };
    });
  if (entries.length === 0) throw new Error(`${sha} holds no library data under ${LIBRARY_DATA}`);
  return entries;
}

export interface GhApiResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type GhApi = (path: string) => Promise<GhApiResult>;

async function runGhApi(path: string): Promise<GhApiResult> {
  const proc = Bun.spawn(["gh", "api", path], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

// A data repo with no `data/` on main yet holds none of this commit's data, so a
// 404 reads as no entries rather than as a failed read.
export async function readRemoteDataEntries(
  repo: string,
  gh: GhApi = runGhApi,
): Promise<DataEntry[]> {
  const { code, stdout, stderr } = await gh(`repos/${repo}/contents/data?ref=main`);
  if (code !== 0) {
    if (/\(HTTP 404\)/.test(stderr)) return [];
    throw new Error(stderr.trim() || `gh exited ${code}`);
  }
  const listing = JSON.parse(stdout) as unknown;
  if (!Array.isArray(listing)) throw new Error(`${repo}'s data/ on main is not a folder`);
  return listing.map((e: { name: string; sha: string }) => ({ name: e.name, sha: e.sha }));
}

export interface DataGateLoop {
  local: readonly DataEntry[];
  fetchRemote: () => Promise<DataEntry[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs: number;
  intervalMs: number;
  log: (line: string) => void;
}

// Polls until the remote holds the local entries or the deadline passes. A stale
// remote is waited on rather than failed, since the publish may still land; a
// failed read is retried the same way.
export async function awaitDataGate(loop: DataGateLoop): Promise<DataGateVerdict> {
  const deadline = loop.now() + loop.timeoutMs;
  for (;;) {
    let verdict: DataGateVerdict;
    try {
      const stale = staleDataEntries(loop.local, await loop.fetchRemote());
      verdict = stale.length === 0 ? { state: "current" } : { state: "stale", stale };
    } catch (err) {
      verdict = { state: "unreadable", reason: (err as Error).message };
    }
    if (verdict.state === "current" || loop.now() >= deadline) return verdict;
    loop.log(
      verdict.state === "stale"
        ? `waiting for ${verdict.stale.join(", ")}`
        : `waiting: data unreadable: ${verdict.reason}`,
    );
    await loop.sleep(loop.intervalMs);
  }
}

const USAGE = "usage: release-data-gate.ts --repo <owner/name> --sha <commit> [--wait <seconds>]";

async function main(argv: string[]): Promise<number> {
  let values: { repo?: string; sha?: string; wait?: string };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        repo: { type: "string" },
        sha: { type: "string" },
        wait: { type: "string", default: "600" },
      },
    }));
  } catch {
    console.error(USAGE);
    return 2;
  }
  const { repo, sha } = values;
  const waitSeconds = Number(values.wait);
  if (repo === undefined || sha === undefined || !(waitSeconds >= 0)) {
    console.error(USAGE);
    return 2;
  }
  let local: DataEntry[];
  try {
    local = readLocalDataEntries(sha);
  } catch (err) {
    console.log(`::error::${(err as Error).message}`);
    return 1;
  }
  const verdict = await awaitDataGate({
    local,
    fetchRemote: () => readRemoteDataEntries(repo),
    sleep: (ms) => Bun.sleep(ms),
    now: () => Date.now(),
    timeoutMs: waitSeconds * 1000,
    intervalMs: 30_000,
    log: (line) => console.log(line),
  });
  if (verdict.state === "current") {
    console.log(`${repo}'s data/ holds the library data of ${sha}. Proceeding to publish.`);
    return 0;
  }
  if (verdict.state === "unreadable") {
    console.log(
      `::error::could not read ${repo}'s data/ within ${waitSeconds} seconds; refusing to publish: ${verdict.reason}`,
    );
    return 1;
  }
  console.log(
    `::error::${repo}'s data/ does not hold the library data of ${sha} after ${waitSeconds} seconds; library-data-publish has not written this commit's data, so refusing to publish:`,
  );
  for (const line of verdict.stale) console.log(`  - ${line}`);
  return 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { LIBRARY_DATA_DIR } from "../packages/cli/src/library/package-root.ts";
import {
  awaitDataGate,
  type DataEntry,
  type GhApiResult,
  LIBRARY_DATA,
  readLocalDataEntries,
  readRemoteDataEntries,
  staleDataEntries,
} from "./release-data-gate.ts";

const GIT_TIMEOUT = 60_000;

function gitIn(repo: string, ...args: string[]): string {
  const proc = Bun.spawnSync(
    [
      "git",
      "-c",
      "user.name=release-data-gate",
      "-c",
      "user.email=release-data-gate@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: repo },
  );
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  return proc.stdout.toString().trim();
}

function write(root: string, files: Record<string, string>): void {
  for (const [path, contents] of Object.entries(files)) {
    const out = join(root, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contents);
  }
}

const entry = (name: string, sha: string): DataEntry => ({ name, sha });

describe("staleDataEntries", () => {
  test("names each local entry the remote holds with another sha or lacks", () => {
    const local = [entry("0.54.0", "a1"), entry("0.55.0", "b1"), entry("0.56.0", "c1")];
    const remote = [entry("0.54.0", "a1"), entry("0.55.0", "b0")];
    expect(staleDataEntries(local, remote)).toEqual(["0.55.0: differs", "0.56.0: missing"]);
  });

  test("a remote-only entry is not named, and identical lists give nothing", () => {
    const local = [entry("0.55.0", "b1")];
    expect(staleDataEntries(local, [entry("0.54.0", "a1"), entry("0.55.0", "b1")])).toEqual([]);
    expect(staleDataEntries(local, local)).toEqual([]);
  });
});

describe("readRemoteDataEntries", () => {
  const gh =
    (result: GhApiResult, seen: string[] = []) =>
    async (path: string) => {
      seen.push(path);
      return result;
    };

  test("reads each folder and file under data/ on main as its name and git object id", async () => {
    const listing = [
      { name: "0.55.0", path: "data/0.55.0", sha: "tree55", type: "dir", size: 0 },
      { name: "notes.txt", path: "data/notes.txt", sha: "blob1", type: "file", size: 3 },
    ];
    const seen: string[] = [];
    const entries = await readRemoteDataEntries(
      "owner/data",
      gh({ code: 0, stdout: JSON.stringify(listing), stderr: "" }, seen),
    );
    expect(entries).toEqual([entry("0.55.0", "tree55"), entry("notes.txt", "blob1")]);
    expect(seen).toEqual(["repos/owner/data/contents/data?ref=main"]);
  });

  test("a data repo with no data/ reads as no entries", async () => {
    const notFound: GhApiResult = {
      code: 1,
      stdout: '{"message":"Not Found","status":"404"}',
      stderr: "gh: Not Found (HTTP 404)\n",
    };
    expect(await readRemoteDataEntries("owner/data", gh(notFound))).toEqual([]);
  });

  test("any other failed read throws with gh's message", async () => {
    const serverError: GhApiResult = {
      code: 1,
      stdout: "",
      stderr: "gh: Server Error (HTTP 502)\n",
    };
    await expect(readRemoteDataEntries("owner/data", gh(serverError))).rejects.toThrow("HTTP 502");
  });

  test("a data/ that is a file, not a folder, throws", async () => {
    const file = { name: "data", path: "data", sha: "blob", type: "file" };
    await expect(
      readRemoteDataEntries(
        "owner/data",
        gh({ code: 0, stdout: JSON.stringify(file), stderr: "" }),
      ),
    ).rejects.toThrow("data/");
  });
});

describe("awaitDataGate", () => {
  const MINUTE = 60_000;
  const local = [entry("0.55.0", "b1"), entry("0.56.0", "c1")];

  function polling(pages: Array<DataEntry[] | Error | (() => Promise<DataEntry[]>)>) {
    let time = 0;
    let calls = 0;
    return {
      calls: () => calls,
      local,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
      fetchRemote: async () => {
        const page = pages[Math.min(calls, pages.length - 1)];
        calls += 1;
        if (page instanceof Error) throw page;
        if (typeof page === "function") return page();
        return page ?? [];
      },
      timeoutMs: 10 * MINUTE,
      intervalMs: MINUTE / 2,
      log: () => {},
    };
  }

  test("passes once the remote turns current before the deadline", async () => {
    const loop = polling([[entry("0.55.0", "b0")], [entry("0.55.0", "b1")], local]);
    expect(await awaitDataGate(loop)).toEqual({ state: "current" });
    expect(loop.calls()).toBe(3);
  });

  test("fails naming the stale entries once the deadline passes", async () => {
    const loop = polling([[entry("0.55.0", "b1"), entry("0.56.0", "c0")]]);
    expect(await awaitDataGate(loop)).toEqual({ state: "stale", stale: ["0.56.0: differs"] });
    expect(loop.now()).toBeGreaterThanOrEqual(loop.timeoutMs);
    expect(loop.calls()).toBe(loop.timeoutMs / loop.intervalMs + 1);
  });

  test("a data repo with no data/ fails naming every local entry", async () => {
    const notFound = () =>
      readRemoteDataEntries("owner/data", async () => ({
        code: 1,
        stdout: '{"message":"Not Found"}',
        stderr: "gh: Not Found (HTTP 404)\n",
      }));
    const loop = polling([notFound]);
    expect(await awaitDataGate(loop)).toEqual({
      state: "stale",
      stale: ["0.55.0: missing", "0.56.0: missing"],
    });
  });

  test("retries a failed read, and reports it when the deadline passes", async () => {
    const recovered = polling([new Error("HTTP 502"), local]);
    expect(await awaitDataGate(recovered)).toEqual({ state: "current" });
    expect(recovered.calls()).toBe(2);

    const down = polling([new Error("HTTP 502")]);
    expect(await awaitDataGate(down)).toEqual({ state: "unreadable", reason: "HTTP 502" });
  });

  test("a zero wait reads the remote once", async () => {
    const loop = { ...polling([[]]), timeoutMs: 0 };
    expect((await awaitDataGate(loop)).state).toBe("stale");
    expect(loop.calls()).toBe(1);
  });
});

describe("readLocalDataEntries", () => {
  const repo = mkdtempSync(join(tmpdir(), "release-data-gate-"));
  gitIn(repo, "init", "-q");
  write(repo, {
    [`${LIBRARY_DATA}/0.55.0/a.json`]: "{}\n",
    [`${LIBRARY_DATA}/0.56.0/b.json`]: '{ "b": 1 }\n',
    [`${LIBRARY_DATA}/notes.txt`]: "notes\n",
    [`${LIBRARY_DATA}-old/0.54.0/c.json`]: "{}\n",
    [`${dirname(LIBRARY_DATA)}/NOTICE`]: "notice\n",
  });
  gitIn(repo, "add", "-A");
  gitIn(repo, "commit", "-q", "-m", "data");
  const withData = gitIn(repo, "rev-parse", "HEAD");
  gitIn(repo, "rm", "-q", "-r", LIBRARY_DATA);
  gitIn(repo, "commit", "-q", "-m", "no data");
  const withoutData = gitIn(repo, "rev-parse", "HEAD");

  const expected = (sha: string, root: string, names: string[]): DataEntry[] =>
    names.map((name) => entry(name, gitIn(root, "rev-parse", `${sha}:${LIBRARY_DATA}/${name}`)));

  test(
    "lists every child of the commit's library data with the object id git holds for it",
    () => {
      expect(readLocalDataEntries(withData, repo)).toEqual(
        expected(withData, repo, ["0.55.0", "0.56.0", "notes.txt"]),
      );
    },
    GIT_TIMEOUT,
  );

  test(
    "throws for a commit that holds no library data",
    () => {
      expect(() => readLocalDataEntries(withoutData, repo)).toThrow(withoutData);
    },
    GIT_TIMEOUT,
  );

  test(
    "reads this repo's own library data by default, including the folder the CLI reads",
    () => {
      const head = readLocalDataEntries("HEAD");
      expect(head.map((e) => e.name)).toContain(basename(LIBRARY_DATA_DIR));
      const root = join(import.meta.dir, "..");
      expect(head).toEqual(
        expected(
          "HEAD",
          root,
          head.map((e) => e.name),
        ),
      );
    },
    GIT_TIMEOUT,
  );
});

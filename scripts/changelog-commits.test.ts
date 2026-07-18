import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  buildChangelogBlock,
  type Commit,
  formatCommitBlock,
  parseGitLog,
  type RunGit,
} from "./changelog-commits.ts";

describe("parseGitLog", () => {
  test("splits each hash<TAB>subject line into { hash, subject }, newest-first", () => {
    const raw = "a1b2c3\tadd the widget\ndef456\tfix the sprocket";
    expect(parseGitLog(raw)).toEqual([
      { hash: "a1b2c3", subject: "add the widget" },
      { hash: "def456", subject: "fix the sprocket" },
    ]);
  });

  test("extracts a trailing (#123) into pr and trims it; no (#NN) leaves pr undefined", () => {
    const raw = "a1b2c3\twire the export path (#123)\ndef456\ttidy the log output";
    expect(parseGitLog(raw)).toEqual([
      { hash: "a1b2c3", subject: "wire the export path", pr: 123 },
      { hash: "def456", subject: "tidy the log output" },
    ]);
  });

  test("dedupes lines with identical subjects to a single Commit, keeping the first", () => {
    const raw = "a1b2c3\tadd a pure helper\ndef456\tadd a pure helper";
    expect(parseGitLog(raw)).toEqual([{ hash: "a1b2c3", subject: "add a pure helper" }]);
  });

  test("skips blank and whitespace-only lines", () => {
    const raw = "\na1b2c3\tadd the widget\n   \n\t\ndef456\tfix the sprocket\n";
    expect(parseGitLog(raw)).toEqual([
      { hash: "a1b2c3", subject: "add the widget" },
      { hash: "def456", subject: "fix the sprocket" },
    ]);
  });
});

describe("formatCommitBlock", () => {
  test("renders a heading and one bullet per commit, appending (#NN) when pr is set", () => {
    const commits: Commit[] = [
      { hash: "a1b2c3", subject: "wire the export path", pr: 123 },
      { hash: "def456", subject: "tidy the log output" },
    ];
    expect(formatCommitBlock({ to: "v0.20.4", date: "2026-07-10", commits })).toBe(
      "## v0.20.4 - 2026-07-10\n\n- wire the export path (#123)\n- tidy the log output",
    );
  });

  test("with an empty commits array renders the heading and a no-commits note, no stray bullet", () => {
    expect(formatCommitBlock({ to: "v0.20.4", date: "2026-07-10", commits: [] })).toBe(
      "## v0.20.4 - 2026-07-10\n\n_No commits in range._",
    );
  });
});

describe("buildChangelogBlock", () => {
  test("threads the heading date from the tag object, not the commit's %ad", () => {
    const seen: string[][] = [];
    const run: RunGit = (args) => {
      seen.push(args);
      if (args[0] === "log") {
        return { status: 0, stdout: "a1b2c3\twire the export path (#123)\n" };
      }
      return { status: 0, stdout: "2026-07-14\n" };
    };
    const block = buildChangelogBlock("v0.19.0", "v0.20.0", run);
    expect(block).toBe("## v0.20.0 - 2026-07-14\n\n- wire the export path (#123)");
    const dateArgs = seen.find((a) => a[0] === "for-each-ref");
    expect(dateArgs).toBeDefined();
    expect(dateArgs?.join(" ")).toContain("%(creatordate:short)");
    expect(dateArgs?.join(" ")).toContain("refs/tags/v0.20.0");
    expect(seen.flat().join(" ")).not.toContain("%ad");
  });

  test("a non-zero git log throws and names the failing ref range", () => {
    const run: RunGit = (args) =>
      args[0] === "log" ? { status: 128, stdout: "" } : { status: 0, stdout: "2026-07-14\n" };
    expect(() => buildChangelogBlock("vNOPE", "v0.20.0", run)).toThrow(/vNOPE\.\.v0\.20\.0/);
  });

  test("an empty tag date throws instead of emitting an empty-dated heading", () => {
    const run: RunGit = (args) =>
      args[0] === "log" ? { status: 0, stdout: "" } : { status: 0, stdout: "\n" };
    expect(() => buildChangelogBlock("v0.19.0", "v0.20.0", run)).toThrow();
  });

  test("real git resolves the annotated-tag date, not the commit author date", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "changelog-tag-"));
    const baseEnv = {
      ...process.env,
      GIT_AUTHOR_DATE: "2020-01-01T00:00:00",
      GIT_COMMITTER_DATE: "2020-01-01T00:00:00",
    };
    const git = (args: string[], extraEnv?: Record<string, string>) =>
      spawnSync("git", args, { cwd: dir, encoding: "utf8", env: { ...baseEnv, ...extraEnv } });
    git(["init", "-q"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.com"]);
    writeFileSync(path.join(dir, "f.txt"), "hi");
    git(["add", "."]);
    git(["commit", "-q", "-m", "seed"]);
    git(["tag", "-a", "v9.9.9", "-m", "release"], { GIT_COMMITTER_DATE: "2020-01-02T00:00:00" });
    const root = spawnSync("git", ["rev-list", "--max-parents=0", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).stdout.trim();
    const run: RunGit = (args) => {
      const p = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
      return { status: p.status, stdout: p.stdout ?? "", error: p.error };
    };
    const block = buildChangelogBlock(root, "v9.9.9", run);
    expect(block).toContain("## v9.9.9 - 2020-01-02");
    expect(block).not.toContain("2020-01-01");
  });

  test("an unknown ref makes the real-git resolver fail, not emit an empty-dated heading", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "changelog-bad-"));
    const git = (args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    git(["init", "-q"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.com"]);
    writeFileSync(path.join(dir, "f.txt"), "hi");
    git(["add", "."]);
    git(["commit", "-q", "-m", "seed"]);
    const run: RunGit = (args) => {
      const p = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
      return { status: p.status, stdout: p.stdout ?? "", error: p.error };
    };
    expect(() => buildChangelogBlock("HEAD", "vNOPE", run)).toThrow();
  });
});

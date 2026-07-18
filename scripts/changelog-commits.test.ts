import { describe, expect, test } from "bun:test";
import { type Commit, formatCommitBlock, parseGitLog } from "./changelog-commits.ts";

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

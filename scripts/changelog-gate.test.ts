import { describe, expect, test } from "bun:test";
import type { RunGit } from "./changelog-gate.ts";
import { CHANGELOG_PATH, evaluateChangelogGate, resolveGateInputs } from "./changelog-gate.ts";
import { latestReleaseTag } from "./release.ts";

describe("evaluateChangelogGate", () => {
  test("ok when the staged paths include the changelog", () => {
    const result = evaluateChangelogGate({
      stagedPaths: ["scripts/changelog-gate.ts", CHANGELOG_PATH],
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("not ok, with a reason naming the file and --no-verify, when the changelog is absent", () => {
    const result = evaluateChangelogGate({
      stagedPaths: ["scripts/changelog-gate.ts", "lefthook.yml"],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(CHANGELOG_PATH);
    expect(result.reason).toContain("git commit --no-verify");
  });

  test("not ok on an empty staged-paths list", () => {
    const result = evaluateChangelogGate({ stagedPaths: [] });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test("honors a caller-supplied changelogPath override", () => {
    const changelogPath = "docs/CHANGES.md";
    expect(evaluateChangelogGate({ stagedPaths: [changelogPath], changelogPath }).ok).toBe(true);
    expect(evaluateChangelogGate({ stagedPaths: [CHANGELOG_PATH], changelogPath }).ok).toBe(false);
  });

  test("back-compat: no changelogBody/latestReleaseTag behaves as the touch-only gate", () => {
    expect(evaluateChangelogGate({ stagedPaths: [CHANGELOG_PATH] }).ok).toBe(true);
    const absent = evaluateChangelogGate({ stagedPaths: ["lefthook.yml"] });
    expect(absent.ok).toBe(false);
    expect(absent.reason).toContain(CHANGELOG_PATH);
  });

  test("ok when the staged top heading is above the latest release tag", () => {
    const result = evaluateChangelogGate({
      stagedPaths: [CHANGELOG_PATH],
      changelogBody: "## v0.20.8\n\n### Added\n\n- new thing\n",
      latestReleaseTag: "v0.20.7",
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("fails when the staged top heading equals the latest release tag", () => {
    const result = evaluateChangelogGate({
      stagedPaths: [CHANGELOG_PATH],
      changelogBody: "## v0.20.7\n\n### Fixed\n\n- late entry under a shipped heading\n",
      latestReleaseTag: "v0.20.7",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("v0.20.7");
    expect(result.reason).toContain("already released");
    expect(result.reason).toContain("new");
  });

  test("fails when the staged top heading is below the latest release tag", () => {
    const result = evaluateChangelogGate({
      stagedPaths: [CHANGELOG_PATH],
      changelogBody: "## v0.20.6\n\n### Fixed\n\n- stale\n",
      latestReleaseTag: "v0.20.7",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already released");
  });

  test("fails when the staged body has no version heading", () => {
    const result = evaluateChangelogGate({
      stagedPaths: [CHANGELOG_PATH],
      changelogBody: "# Changelog\n\nno versioned headings here\n",
      latestReleaseTag: "v0.20.7",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("## vX.Y.Z");
  });

  test("ok on a tagless repo (v0.0.0) when the top heading is any real version", () => {
    const result = evaluateChangelogGate({
      stagedPaths: [CHANGELOG_PATH],
      changelogBody: "## v0.1.0\n\n### Added\n\n- first entry\n",
      latestReleaseTag: "v0.0.0",
    });
    expect(result.ok).toBe(true);
  });

  test("touch check short-circuits: not staged fails even with a valid body/tag", () => {
    const result = evaluateChangelogGate({
      stagedPaths: ["lefthook.yml"],
      changelogBody: "## v0.20.8\n\n### Added\n\n- unrelated\n",
      latestReleaseTag: "v0.20.7",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(CHANGELOG_PATH);
  });
});

describe("resolveGateInputs", () => {
  type Key = "diff" | "show" | "tag";
  type Responses = Partial<Record<Key, { exitCode: number; stdout: string }>>;

  function fakeRunGit(responses: Responses, calls?: Key[]): RunGit {
    return (args) => {
      const key = args[0] as Key;
      calls?.push(key);
      const response = responses[key];
      if (!response) throw new Error(`unexpected git ${key} call`);
      return response;
    };
  }

  test("staged deletion cannot pass: git show fails, no inputs handed on for a touch-only pass", () => {
    const result = resolveGateInputs(
      fakeRunGit({
        diff: { exitCode: 0, stdout: `scripts/changelog-gate.ts\n${CHANGELOG_PATH}\n` },
        show: { exitCode: 128, stdout: "" },
      }),
      latestReleaseTag,
    );
    if (result.ok) throw new Error("expected a failing gate");
    expect(result.reason).toContain(CHANGELOG_PATH);
    expect(result.reason).toMatch(/delet/i);
  });

  test("tag-read failure cannot degrade to v0.0.0", () => {
    const result = resolveGateInputs(
      fakeRunGit({
        diff: { exitCode: 0, stdout: `${CHANGELOG_PATH}\n` },
        show: { exitCode: 0, stdout: "## v0.20.7\n\n### Fixed\n\n- late entry\n" },
        tag: { exitCode: 1, stdout: "" },
      }),
      latestReleaseTag,
    );
    if (result.ok) throw new Error("expected a failing gate");
    expect(result.reason).toMatch(/tag/i);
    expect(result.reason).toContain("v0.0.0");
  });

  test("happy path: staged changelog, readable body, readable tags", () => {
    const body = "## v0.20.8\n\n### Added\n\n- new thing\n";
    const result = resolveGateInputs(
      fakeRunGit({
        diff: { exitCode: 0, stdout: `${CHANGELOG_PATH}\n` },
        show: { exitCode: 0, stdout: body },
        tag: { exitCode: 0, stdout: "v0.20.6\nv0.20.7\n" },
      }),
      latestReleaseTag,
    );
    if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
    expect(result.inputs.stagedPaths).toContain(CHANGELOG_PATH);
    expect(result.inputs.changelogBody).toBe(body);
    expect(result.inputs.latestReleaseTag).toBe("v0.20.7");
    expect(evaluateChangelogGate(result.inputs).ok).toBe(true);
  });

  test("not staged short-circuits: show/tag never consulted, evaluate fails touch-only", () => {
    const calls: Key[] = [];
    const result = resolveGateInputs(
      fakeRunGit(
        { diff: { exitCode: 0, stdout: "scripts/changelog-gate.ts\nlefthook.yml\n" } },
        calls,
      ),
      latestReleaseTag,
    );
    if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
    expect(result.inputs).toEqual({ stagedPaths: ["scripts/changelog-gate.ts", "lefthook.yml"] });
    expect(calls).toEqual(["diff"]);
    const gate = evaluateChangelogGate(result.inputs);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain(CHANGELOG_PATH);
  });

  test("staged-paths read failure: git diff fails, cannot verify the commit", () => {
    const result = resolveGateInputs(
      fakeRunGit({ diff: { exitCode: 128, stdout: "" } }),
      latestReleaseTag,
    );
    if (result.ok) throw new Error("expected a failing gate");
    expect(result.reason).toMatch(/staged path/i);
  });
});

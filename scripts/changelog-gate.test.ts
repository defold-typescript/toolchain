import { describe, expect, test } from "bun:test";
import { CHANGELOG_PATH, evaluateChangelogGate } from "./changelog-gate.ts";

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

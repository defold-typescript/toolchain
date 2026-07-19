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
});

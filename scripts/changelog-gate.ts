// Pre-commit gate decision: a commit must touch the curated changelog so it
// never drifts behind the work that lands. Pure and offline — the caller passes
// the staged path list; no git, no fs in `evaluateChangelogGate`, so it is
// unit-testable and a future CI backstop can reuse it. The `import.meta.main`
// wrapper below is the thin git-backed CLI (untested, same as sync-readme.ts).

export const CHANGELOG_PATH = "packages/docs/guide/changelog.md";

export function evaluateChangelogGate({
  stagedPaths,
  changelogPath = CHANGELOG_PATH,
}: {
  stagedPaths: string[];
  changelogPath?: string;
}): { ok: boolean; reason?: string } {
  if (stagedPaths.includes(changelogPath)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `no change to ${changelogPath} is staged. Record this work by rewording ` +
      `or adding a bullet under the pending \`## vX.Y.Z\` section (open a new ` +
      `heading above the last release if this is the first change since it), or ` +
      `bypass a genuine exception with \`git commit --no-verify\`.`,
  };
}

if (import.meta.main) {
  const proc = Bun.spawnSync(["git", "diff", "--cached", "--name-only"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stagedPaths = proc.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const result = evaluateChangelogGate({ stagedPaths });
  if (!result.ok) {
    console.error(`changelog gate: ${result.reason}`);
    process.exit(1);
  }
  process.exit(0);
}

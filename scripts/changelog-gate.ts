// Pre-commit gate decision: a commit must touch the curated changelog so it
// never drifts behind the work that lands. Pure and offline — the caller passes
// the staged path list; no git, no fs in `evaluateChangelogGate`, so it is
// unit-testable and a future CI backstop can reuse it. The `import.meta.main`
// wrapper below is the thin git-backed CLI (untested, same as sync-readme.ts).

import { compareSemver, parseTopChangelogVersion } from "./changelog-version.ts";

export const CHANGELOG_PATH = "packages/docs/guide/changelog.md";

export function evaluateChangelogGate({
  stagedPaths,
  changelogPath = CHANGELOG_PATH,
  changelogBody,
  latestReleaseTag,
}: {
  stagedPaths: string[];
  changelogPath?: string;
  changelogBody?: string;
  latestReleaseTag?: string;
}): { ok: boolean; reason?: string } {
  if (!stagedPaths.includes(changelogPath)) {
    return {
      ok: false,
      reason:
        `no change to ${changelogPath} is staged. Record this work by rewording ` +
        `or adding a bullet under the pending \`## vX.Y.Z\` section (open a new ` +
        `heading above the last release if this is the first change since it), or ` +
        `bypass a genuine exception with \`git commit --no-verify\`.`,
    };
  }
  if (changelogBody !== undefined && latestReleaseTag !== undefined) {
    const top = parseTopChangelogVersion(changelogBody);
    if (top === null) {
      return {
        ok: false,
        reason:
          `the staged changelog has no \`## vX.Y.Z\` heading — open one above your ` +
          `entries so the release version is derivable, or bypass with ` +
          `\`git commit --no-verify\`.`,
      };
    }
    const latest = latestReleaseTag.startsWith("v") ? latestReleaseTag.slice(1) : latestReleaseTag;
    if (compareSemver(top, latest) <= 0) {
      return {
        ok: false,
        reason:
          `the changelog's top heading \`## v${top}\` is already released (tag ` +
          `v${latest} exists) — open a new \`## v<next>\` heading above it for this ` +
          `in-flight work (raise minor/major by intent), or bypass with ` +
          `\`git commit --no-verify\`.`,
      };
    }
  }
  return { ok: true };
}

if (import.meta.main) {
  const { latestReleaseTag } = await import("./release.ts");

  const proc = Bun.spawnSync(["git", "diff", "--cached", "--name-only"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stagedPaths = proc.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let changelogBody: string | undefined;
  let tag: string | undefined;
  if (stagedPaths.includes(CHANGELOG_PATH)) {
    const staged = Bun.spawnSync(["git", "show", `:${CHANGELOG_PATH}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (staged.exitCode === 0) {
      changelogBody = staged.stdout.toString();
      const tags = Bun.spawnSync(["git", "tag"], { stdout: "pipe", stderr: "pipe" });
      tag = latestReleaseTag(tags.stdout.toString().split("\n"));
    }
  }

  const result = evaluateChangelogGate({
    stagedPaths,
    ...(changelogBody !== undefined ? { changelogBody } : {}),
    ...(tag !== undefined ? { latestReleaseTag: tag } : {}),
  });
  if (!result.ok) {
    console.error(`changelog gate: ${result.reason}`);
    process.exit(1);
  }
  process.exit(0);
}

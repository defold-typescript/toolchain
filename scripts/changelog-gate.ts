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

// A single git invocation, reduced to what the resolver needs. Injected so the
// resolver stays pure and testable — the CLI wires it to `Bun.spawnSync`.
export type RunGit = (args: string[]) => { exitCode: number; stdout: string };

// Feed `evaluateChangelogGate` from git, failing LOUD when a required git command
// fails instead of silently downgrading to the touch-only gate. Absent inputs
// (`inputs` without `changelogBody`/`latestReleaseTag`) still mean the legitimate
// touch-only mode — but only when the changelog is not staged, never as the
// fallout of a git error. Pure: the runner and tag mapper are injected.
export function resolveGateInputs(
  runGit: RunGit,
  toLatestReleaseTag: (tags: string[]) => string,
  changelogPath = CHANGELOG_PATH,
):
  | {
      ok: true;
      inputs: { stagedPaths: string[]; changelogBody?: string; latestReleaseTag?: string };
    }
  | { ok: false; reason: string } {
  const diff = runGit(["diff", "--cached", "--name-only"]);
  if (diff.exitCode !== 0) {
    return {
      ok: false,
      reason:
        "cannot read the staged paths (`git diff --cached --name-only` failed), so the " +
        "commit cannot be verified; fix git or bypass with `git commit --no-verify`.",
    };
  }
  const stagedPaths = diff.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!stagedPaths.includes(changelogPath)) {
    return { ok: true, inputs: { stagedPaths } };
  }

  const show = runGit(["show", `:${changelogPath}`]);
  if (show.exitCode !== 0) {
    return {
      ok: false,
      reason:
        `the staged \`${changelogPath}\` content is unreadable (\`git show :${changelogPath}\` ` +
        "failed — a staged deletion or type change); keep a readable changelog entry, or bypass " +
        "with `git commit --no-verify`.",
    };
  }

  const tag = runGit(["tag"]);
  if (tag.exitCode !== 0) {
    return {
      ok: false,
      reason:
        "cannot read git tags (`git tag` failed); refusing to fall back to v0.0.0 and pass " +
        "anything — fix git or bypass with `git commit --no-verify`.",
    };
  }

  return {
    ok: true,
    inputs: {
      stagedPaths,
      changelogBody: show.stdout,
      latestReleaseTag: toLatestReleaseTag(tag.stdout.split("\n")),
    },
  };
}

if (import.meta.main) {
  const { latestReleaseTag } = await import("./release.ts");

  const runGit: RunGit = (args) => {
    const proc = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
    return { exitCode: proc.exitCode, stdout: proc.stdout.toString() };
  };

  const resolved = resolveGateInputs(runGit, latestReleaseTag);
  if (!resolved.ok) {
    console.error(`changelog gate: ${resolved.reason}`);
    process.exit(1);
  }

  const result = evaluateChangelogGate(resolved.inputs);
  if (!result.ok) {
    console.error(`changelog gate: ${result.reason}`);
    process.exit(1);
  }
  process.exit(0);
}

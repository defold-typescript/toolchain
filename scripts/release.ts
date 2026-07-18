// Cut a release: tag the version the changelog projects, and push it.
//
// Publishing happens in CI (release.yml, OIDC trusted publishing), so this
// command does NOT publish — it reads the projected next version from the top
// `## vX.Y.Z` heading in packages/docs/guide/changelog.md, verifies it is strictly
// greater than the latest release tag, then creates and pushes that v<version>
// tag. Pushing the tag triggers the Release workflow, which stamps the manifests
// from the tag and publishes all packages. The repo manifests stay pinned at
// 0.0.0; the tag drives the version.
//
// Author each change under the projected version heading as work lands: the top
// `## vX.Y.Z` heading in packages/docs/guide/changelog.md is the next version, and
// its untagged section renders as `- Unreleased` until the tag exists. Raise the
// heading by semver intent (patch < minor < major) when a change warrants it; run
// `bun run changelog:commits <prevTag> v<version>` for raw material and curate it
// into an `Added`/`Improved`/`Fixed` section (advisory; no CI gate enforces this).
//
// Usage:
//   mise run release            (tags the changelog-projected version)
//   bun scripts/release.ts

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { projectedReleaseVersion } from "./changelog-version.ts";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export interface Args {
  readonly help: boolean;
  readonly skipCiCheck: boolean;
}

export const HELP = `Cut a release: tag the version the changelog projects, and push it.

Usage:
  mise run release
  bun scripts/release.ts

Takes no version argument. Reads the projected next version from the top
\`## vX.Y.Z\` heading in packages/docs/guide/changelog.md, verifies it is strictly
greater than the latest release tag, waits for the commit's CI run to pass, then
creates and pushes that v<version> tag. The Release workflow publishes from the
tag via OIDC; nothing is published locally.

Flags:
  --skip-ci-check         tag without waiting for the commit's CI run to pass
  -h, --help              show this help`;

export function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let help = false;
  let skipCiCheck = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--skip-ci-check") {
      skipCiCheck = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 0) {
    throw new Error(`expected no arguments, got: ${positional.join(", ")}`);
  }
  return { help, skipCiCheck };
}

function parseSemver(v: string): [number, number, number] {
  const m = SEMVER.exec(v);
  if (!m) throw new Error(`not a plain x.y.z version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemver(a);
  const [bMajor, bMinor, bPatch] = parseSemver(b);
  return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch;
}

export function maxVersion(versions: readonly string[]): string {
  return versions
    .filter((v) => SEMVER.test(v))
    .reduce((hi, v) => (compareVersions(v, hi) > 0 ? v : hi), "0.0.0");
}

const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

export function releaseTagsAt(tags: readonly string[]): string[] {
  return tags.map((t) => t.trim()).filter((t) => RELEASE_TAG.test(t));
}

export function latestReleaseTag(tags: readonly string[]): string {
  const stripped = releaseTagsAt(tags).map((t) => t.slice(1));
  return `v${maxVersion(stripped)}`;
}

export function resolveReleaseTarget(changelogBody: string, tags: readonly string[]): string {
  return projectedReleaseVersion(changelogBody, latestReleaseTag(tags));
}

function run(cmd: string[], opts: { inherit?: boolean } = {}): { code: number; output: string } {
  const [bin, ...rest] = cmd;
  if (!bin) throw new Error("run() called with an empty command");
  const proc = spawnSync(bin, rest, { stdio: opts.inherit ? "inherit" : "pipe", encoding: "utf8" });
  return {
    code: proc.status ?? 1,
    output: opts.inherit ? "" : `${proc.stdout ?? ""}${proc.stderr ?? ""}`,
  };
}

function die(message: string): never {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
}

function defaultRemoteRef(): string {
  const head = run(["git", "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  return head.code === 0 && head.output.trim() ? head.output.trim() : "origin/main";
}

// Block the current thread for `ms` milliseconds with no child process —
// `Atomics.wait` on a SharedArrayBuffer-backed lock is the binary-free
// synchronous sleep, so the release flow needs no `sleep` binary on Windows.
export function sleepSync(ms: number): void {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Wait for the commit's CI run (ci.yml) to finish and require success before
// tagging — a tag whose CI is still running or red would publish unvalidated
// code. `gh run watch` blocks until the run concludes; --exit-status makes it
// non-zero unless the conclusion was success.
function waitForGreenCI(sha: string): void {
  let runId = "";
  for (let attempt = 0; attempt < 6 && !runId; attempt++) {
    const probe = run([
      "gh",
      "run",
      "list",
      "--commit",
      sha,
      "--workflow",
      "ci.yml",
      "--json",
      "databaseId",
      "--limit",
      "10",
    ]);
    if (probe.code !== 0) {
      die(
        `could not query CI via gh (${probe.output.trim() || "command failed"}); ` +
          "is gh installed and authenticated? (or pass --skip-ci-check)",
      );
    }
    try {
      const runs = JSON.parse(probe.output) as Array<{ databaseId: number }>;
      if (runs[0]) runId = String(runs[0].databaseId);
    } catch {
      // not yet queued; retry below
    }
    if (!runId) sleepSync(10_000);
  }
  if (!runId) {
    die(
      `no ci.yml run found for ${sha.slice(0, 9)}; wait for CI to start, then re-run (or --skip-ci-check)`,
    );
  }
  process.stdout.write(`waiting for CI run ${runId} on ${sha.slice(0, 9)} to finish...\n`);
  const watch = run(["gh", "run", "watch", runId, "--exit-status", "--interval", "20"], {
    inherit: true,
  });
  if (watch.code !== 0) {
    die(`CI run ${runId} did not pass; fix CI before releasing (or --skip-ci-check)`);
  }
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`release: ${(err as Error).message}\n\n${HELP}\n`);
    process.exit(1);
  }

  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (run(["git", "status", "--porcelain"]).output.trim() !== "") {
    die("working tree is not clean; commit before tagging a release");
  }

  // The tag must point to a commit that is on the pushed default branch, so the
  // Release workflow runs against published code (a fresh clone has the release).
  run(["git", "fetch", "origin", "--quiet"]);
  const remoteRef = defaultRemoteRef();
  const head = run(["git", "rev-parse", "HEAD"]).output.trim();
  if (run(["git", "merge-base", "--is-ancestor", head, remoteRef]).code !== 0) {
    die(`HEAD ${head.slice(0, 9)} is not on ${remoteRef}; push it first (git push), then re-run`);
  }

  // A release tag already on HEAD means this exact commit shipped; recovering a
  // partial publish means re-running the Release workflow on that tag (publish
  // is idempotent), never cutting a fresh version off the same tree.
  const releasedTags = releaseTagsAt(run(["git", "tag", "--points-at", "HEAD"]).output.split("\n"));
  if (releasedTags.length > 0) {
    die(
      `HEAD ${head.slice(0, 9)} already carries ${releasedTags.join(", ")}; ` +
        "re-run the Release workflow on that tag instead of cutting a new version off the same commit",
    );
  }

  const tags = run(["git", "tag"]).output.split("\n");
  const latestTag = latestReleaseTag(tags);
  let target: string;
  try {
    target = resolveReleaseTarget(
      readFileSync(new URL("../packages/docs/guide/changelog.md", import.meta.url), "utf8"),
      tags,
    );
  } catch (err) {
    die((err as Error).message);
  }
  const tag = `v${target}`;

  process.stdout.write(
    `latest tag:     ${latestTag}\ntarget version: ${target}\ntag:            ${tag}\n\n`,
  );

  if (args.skipCiCheck) {
    process.stdout.write("warning: --skip-ci-check set; tagging without waiting for CI\n");
  } else {
    waitForGreenCI(head);
  }

  if (run(["git", "rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).code === 0) {
    die(
      `tag ${tag} already exists locally; ${target} was already cut — delete the tag or pick another version`,
    );
  }
  // Double-run guard: a tag already on origin means this version was released
  // (or its publish is still in flight, before npm — and thus the computed bump
  // base — has updated). Refuse here, before creating a local tag.
  if (run(["git", "ls-remote", "--tags", "origin", tag]).output.trim() !== "") {
    die(
      `tag ${tag} already exists on origin; ${target} was already released (or its publish is in flight)`,
    );
  }
  if (run(["git", "tag", "-a", tag, "-m", `Release ${tag}`], { inherit: true }).code !== 0) {
    die(`could not create tag ${tag}`);
  }
  if (run(["git", "push", "origin", tag], { inherit: true }).code !== 0) {
    die(`created ${tag} locally but the push failed; push it manually: git push origin ${tag}`);
  }

  process.stdout.write(
    `\npushed ${tag} — the Release workflow publishes ${target} via OIDC ` +
      "(if trusted publishers + ENABLE_NPM_PUBLISH are configured).\n" +
      "Watch: gh run watch\n",
  );
}

if (import.meta.main) {
  main();
}

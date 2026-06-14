// Local, coordinated npm publish for the four workspace packages.
//
// The repo's manifests and lockfile stay pinned at 0.0.0 with `workspace:*`
// inter-package deps for the dev loop. Publishing is a transient stamp: this
// script bumps all five manifests to the target version, REGENERATES the
// lockfile (delete bun.lock + `bun install`) so the snapshot carries the
// stamped versions, packs to verify the inter-package deps resolved to concrete
// coordinated versions, then publishes types -> transpiler -> tstl-plugin -> cli in dependency
// order. On a successful --publish it tags and pushes v<version> (non-fatal —
// the packages are already live). The working tree is always restored to 0.0.0
// afterward (including on failure and Ctrl-C).
//
// Regenerating the lockfile is the step the parked `release.yml` omitted, and a
// plain `bun install` is NOT enough: `bun pm pack` rewrites `workspace:*` from
// the lockfile snapshot, which a non-destructive install leaves at 0.0.0. The
// lockfile must be deleted so the install re-resolves at the stamped version.
//
// Usage:
//   bun scripts/publish.ts [<version>|patch|minor|major] [--publish]
//
// Default bump is `patch`; default mode is a dry-run. Pass `--publish` to cut a
// real release (bun prompts for the npm OTP under 2FA).

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

// Publish order: a dependency is published before its dependents.
const PACKAGES = ["types", "transpiler", "tstl-plugin", "cli"] as const;
const SCOPED = PACKAGES.map((p) => `@defold-typescript/${p}`);

const MANIFESTS = [
  "package.json",
  ...PACKAGES.map((p) => path.join("packages", p, "package.json")),
];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export type Bump = "patch" | "minor" | "major";

export interface Args {
  readonly spec: string;
  readonly doPublish: boolean;
  readonly help: boolean;
  readonly skipCiCheck: boolean;
}

export const HELP = `Coordinated local npm publish for the four @defold-typescript packages.

Usage:
  mise run publish [<version>|patch|minor|major] [--publish]
  bun scripts/publish.ts [<version>|patch|minor|major] [--publish]

Bumps every workspace manifest to one coordinated version, regenerates the
lockfile so packed inter-package deps resolve to that version, runs the full
gate, then publishes types -> transpiler -> tstl-plugin -> cli. On a successful --publish it
also tags and pushes v<version>. The working tree is restored to its committed
0.0.0 state afterward. Dry-run by default.

Arguments:
  patch | minor | major   bump from the highest published version (default: patch)
  <x.y.z>                  explicit version; must be greater than current

Flags:
  --publish               cut a real release (bun prompts for the npm OTP under 2FA)
  --skip-ci-check         publish even if HEAD is not on origin's default branch
                          with a green CI run (emergency escape hatch)
  -h, --help              show this help

Examples:
  mise run publish                    # dry-run a patch bump
  mise run publish minor              # dry-run, e.g. 0.1.0 -> 0.2.0
  mise run publish minor --publish    # publish 0.2.0 and push tag v0.2.0
  mise run publish 0.3.0 --publish    # publish an explicit version
  mise run current-version            # show what is live on npm now
  mise run push-tag 0.2.0             # fallback: tag a version published earlier`;

export function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let doPublish = false;
  let help = false;
  let skipCiCheck = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--publish") {
      doPublish = true;
    } else if (arg === "--skip-ci-check") {
      skipCiCheck = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    throw new Error(`expected one version/bump argument, got: ${positional.join(", ")}`);
  }
  return { spec: positional[0] ?? "patch", doPublish, help, skipCiCheck };
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

export function bumpVersion(base: string, kind: Bump): string {
  const [major, minor, patch] = parseSemver(base);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function resolveTarget(base: string, spec: string): string {
  if (spec === "patch" || spec === "minor" || spec === "major") {
    return bumpVersion(base, spec);
  }
  if (!SEMVER.test(spec)) {
    throw new Error(`"${spec}" is not a bump keyword or an x.y.z version`);
  }
  if (compareVersions(spec, base) <= 0) {
    throw new Error(`target ${spec} is not greater than the current published version ${base}`);
  }
  return spec;
}

function parseSemver(v: string): [number, number, number] {
  const m = SEMVER.exec(v);
  if (!m) {
    throw new Error(`not a plain x.y.z version: ${v}`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function run(
  cmd: string[],
  opts: { cwd?: string; inherit?: boolean } = {},
): { code: number; output: string } {
  const [bin, ...rest] = cmd;
  if (!bin) {
    throw new Error("run() called with an empty command");
  }
  const proc = spawnSync(bin, rest, {
    cwd: opts.cwd ?? REPO_ROOT,
    stdio: opts.inherit ? "inherit" : "pipe",
    encoding: "utf8",
  });
  const output = opts.inherit ? "" : `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  return { code: proc.status ?? 1, output };
}

function die(message: string): never {
  process.stderr.write(`publish: ${message}\n`);
  process.exit(1);
}

// Fail fast on a missing/expired npm token before mutating the tree or running
// the gate. npm masks an unauthorized scoped publish as a 404 ("does not exist
// in this registry"), so without this an expired token only surfaces after a
// full build/typecheck/lint/test gate, mid-publish. `bun pm whoami` exits 0
// even on a 401, printing the HTTP status line instead of a username — so judge
// by output, treating an empty result or any line with an HTTP error / the word
// "Unauthorized" as not authenticated.
function requireAuth(): void {
  const { output } = run(["bun", "pm", "whoami"]);
  const who = output.trim();
  if (who === "" || /unauthorized/i.test(who) || /^\d{3}\b/.test(who)) {
    die(
      `not authenticated to npm (\`bun pm whoami\` -> ${who || "no output"}). ` +
        "Refresh your token: `npm login`, or replace the _authToken in ~/.npmrc, then retry.",
    );
  }
  process.stdout.write(`npm user: ${who}\n`);
}

// Refuse to publish a commit that has not landed on origin's default branch
// with a green CI matrix. Without this, a local `--publish` ships npm artifacts
// (and a release tag) cut from commits that never reached the remote mainline,
// so a fresh clone of the default branch does not contain the published code.
// `bun publish` has no OIDC/trusted-publishing path, so this commit-provenance
// gate is the available substitute for publishing from CI itself. The CI matrix
// spans three OSes; the local gate runs one, so this also catches an
// OS-specific failure that the local build/typecheck/lint/test would miss.
// Escape with --skip-ci-check when CI infra is down and a release can't wait.
function requireGreenCI(): void {
  const headRef = run(["git", "rev-parse", "--abbrev-ref", "origin/HEAD"]);
  const remoteBranch = headRef.code === 0 ? headRef.output.trim() : "origin/main";

  run(["git", "fetch", "origin", "--quiet"]);

  const head = run(["git", "rev-parse", "HEAD"]).output.trim();
  if (run(["git", "merge-base", "--is-ancestor", head, remoteBranch]).code !== 0) {
    die(
      `HEAD ${head.slice(0, 9)} is not on ${remoteBranch}; push it and let CI finish ` +
        "before publishing (or --skip-ci-check to override)",
    );
  }

  const probe = run([
    "gh",
    "run",
    "list",
    "--commit",
    head,
    "--workflow",
    "ci.yml",
    "--json",
    "status,conclusion,url",
    "--limit",
    "20",
  ]);
  if (probe.code !== 0) {
    die(
      `could not query CI status via gh (${probe.output.trim() || "command failed"}); ` +
        "is gh installed and authenticated? (or --skip-ci-check to override)",
    );
  }

  let runs: Array<{ status: string; conclusion: string | null; url: string }>;
  try {
    runs = JSON.parse(probe.output);
  } catch {
    die(`could not parse gh run list output:\n${probe.output}`);
  }
  if (runs.length === 0) {
    die(
      `no CI run found for HEAD ${head.slice(0, 9)}; wait for CI to start and finish ` +
        "before publishing (or --skip-ci-check to override)",
    );
  }

  // gh returns newest first; the most recent run for the commit is authoritative
  // (a re-run supersedes earlier attempts).
  const latest = runs[0];
  if (latest.status !== "completed") {
    die(`CI for HEAD ${head.slice(0, 9)} is still ${latest.status}; wait for it (${latest.url})`);
  }
  if (latest.conclusion !== "success") {
    die(
      `CI for HEAD ${head.slice(0, 9)} concluded ${latest.conclusion}, not success; ` +
        `fix CI before publishing (${latest.url})`,
    );
  }
  process.stdout.write(`CI green for HEAD ${head.slice(0, 9)} on ${remoteBranch}\n`);
}

function publishedVersions(): string[] {
  return SCOPED.map((pkg) => {
    const { code, output } = run(["bun", "pm", "view", pkg, "version"]);
    return code === 0 ? output.trim() : "";
  });
}

function stamp(version: string): void {
  for (const rel of MANIFESTS) {
    const file = path.join(REPO_ROOT, rel);
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.version = version;
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function restoreTree(): void {
  run(["git", "checkout", "--", ...MANIFESTS, "bun.lock"]);
}

// Tag the release after a fully-successful real publish. Non-fatal: the
// packages are already on npm, so a tag/push hiccup must not read as a failed
// publish — it just leaves the manual `mise run push-tag <version>` fallback.
function tagRelease(version: string): void {
  const tag = `v${version}`;
  if (run(["git", "tag", "-a", tag, "-m", `Release ${tag}`], { inherit: true }).code !== 0) {
    process.stderr.write(
      `\nwarning: could not create tag ${tag} (already exists?). Tag manually: mise run push-tag ${version}\n`,
    );
    return;
  }
  if (run(["git", "push", "origin", tag], { inherit: true }).code !== 0) {
    process.stderr.write(
      `\nwarning: created ${tag} locally but the push failed. Push manually: git push origin ${tag}\n`,
    );
    return;
  }
  process.stdout.write(`\ntagged and pushed ${tag}\n`);
}

function verifyCoordinated(version: string): void {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "publish-verify-"));
  try {
    for (const pkg of PACKAGES) {
      const pkgDir = path.join(REPO_ROOT, "packages", pkg);
      const pack = run(["bun", "pm", "pack", "--destination", tmp], { cwd: pkgDir });
      if (pack.code !== 0) {
        throw new Error(`pack failed for ${pkg}:\n${pack.output}`);
      }
      const tgz = pack.output
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.endsWith(".tgz"));
      if (!tgz) {
        throw new Error(`could not locate packed tarball for ${pkg}:\n${pack.output}`);
      }
      const tarballPath = path.isAbsolute(tgz) ? tgz : path.join(pkgDir, tgz);
      const extract = run(["tar", "-xzOf", tarballPath, "package/package.json"]);
      if (extract.code !== 0) {
        throw new Error(`could not read manifest from ${pkg} tarball:\n${extract.output}`);
      }
      const manifest = JSON.parse(extract.output);
      const deps: Record<string, string> = manifest.dependencies ?? {};
      for (const [name, spec] of Object.entries(deps)) {
        if (!name.startsWith("@defold-typescript/")) continue;
        if (spec.startsWith("workspace:")) {
          throw new Error(`${pkg} tarball still carries an unresolved ${name}: ${spec}`);
        }
        if (spec !== version) {
          throw new Error(`${pkg} tarball depends on ${name}@${spec}, expected ${version}`);
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(`  inter-package deps resolve to ${version} (no workspace: specs)\n`);
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`publish: ${(err as Error).message}\n\n${HELP}\n`);
    process.exit(1);
  }

  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (run(["git", "status", "--porcelain"]).output.trim() !== "") {
    die("working tree is not clean; commit or stash before publishing");
  }

  // Only a real publish needs registry write auth; the dry-run never uploads.
  if (args.doPublish) {
    requireAuth();
    if (args.skipCiCheck) {
      process.stdout.write("warning: --skip-ci-check set; publishing without the CI-green gate\n");
    } else {
      requireGreenCI();
    }
  }

  const published = publishedVersions();
  const base = maxVersion(published);
  let target: string;
  try {
    target = resolveTarget(base, args.spec);
  } catch (err) {
    die((err as Error).message);
  }

  process.stdout.write(`current published: ${base}\n`);
  process.stdout.write(`target version:    ${target}\n`);
  process.stdout.write(`mode:              ${args.doPublish ? "PUBLISH (real)" : "dry-run"}\n\n`);

  // build first: cli's typecheck resolves @defold-typescript/transpiler through
  // its built dist/ (declarations only exist post-build), and the publish-pack /
  // release-bin-smoke tests build the cli the same way. typecheck/lint/test all
  // assume dist/ is present, so the build gate must precede them.
  for (const step of ["build", "typecheck", "lint", "test"]) {
    process.stdout.write(`gate: bun run ${step}\n`);
    if (run(["bun", "run", step], { inherit: true }).code !== 0) {
      die(`gate failed at \`bun run ${step}\``);
    }
  }

  // From here the tree is mutated (stamped manifests + regenerated lockfile),
  // so every failure path must restore before exiting. die() calls
  // process.exit(), which skips `finally` — so throw inside, capture, restore
  // in `finally`, and only die() after the tree is clean again.
  let failure: Error | null = null;
  // Ctrl-C during the stamped window kills the process before `finally` runs,
  // so restore on the signal too before exiting.
  let treeDirty = false;
  const restoreOnSignal = () => {
    if (treeDirty) {
      restoreTree();
      process.stderr.write("\ninterrupted — restored working tree\n");
    }
    process.exit(130);
  };
  process.once("SIGINT", restoreOnSignal);
  process.once("SIGTERM", restoreOnSignal);
  try {
    stamp(target);
    treeDirty = true;
    // A plain `bun install` leaves the lockfile's workspace version mapping at
    // the committed 0.0.0, so `bun pm pack` would rewrite workspace:* to 0.0.0.
    // Deleting the lockfile first forces a full re-resolution at the stamped
    // version. This is the step the parked release.yml omitted.
    process.stdout.write(`\nstamped manifests to ${target}; regenerating lockfile\n`);
    rmSync(path.join(REPO_ROOT, "bun.lock"), { force: true });
    if (run(["bun", "install"], { inherit: true }).code !== 0) {
      throw new Error("`bun install` failed while regenerating the lockfile");
    }
    verifyCoordinated(target);

    const publishCmd = args.doPublish
      ? ["bun", "publish", "--access", "public"]
      : ["bun", "publish", "--dry-run", "--access", "public"];
    for (const pkg of PACKAGES) {
      process.stdout.write(
        `\n${args.doPublish ? "publishing" : "dry-run"} @defold-typescript/${pkg}@${target}\n`,
      );
      const code = run(publishCmd, {
        cwd: path.join(REPO_ROOT, "packages", pkg),
        inherit: true,
      }).code;
      if (code !== 0) {
        throw new Error(`publish failed for ${pkg}; remaining packages NOT published`);
      }
    }
  } catch (err) {
    failure = err as Error;
  } finally {
    restoreTree();
    treeDirty = false;
    process.stdout.write("\nrestored working tree to the committed 0.0.0 state\n");
  }
  process.removeListener("SIGINT", restoreOnSignal);
  process.removeListener("SIGTERM", restoreOnSignal);

  if (failure) {
    die(failure.message);
  }

  if (args.doPublish) {
    process.stdout.write(`\npublished ${target}\n`);
    tagRelease(target);
  } else {
    process.stdout.write(`\ndry-run complete. Re-run with --publish to cut ${target} for real.\n`);
  }
}

if (import.meta.main) {
  await main();
}

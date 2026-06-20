// Cut a release: bump the version and push the v<version> tag.
//
// Publishing now happens in CI (release.yml, OIDC trusted publishing), so this
// command does NOT publish — it computes the next version from what is live on
// npm, then creates and pushes the v<version> tag. Pushing the tag triggers the
// Release workflow, which stamps the manifests from the tag and publishes all
// packages. The repo manifests stay pinned at 0.0.0; the tag drives the version.
//
// Usage:
//   mise run release [<version>|patch|minor|major]   (default: patch)
//   bun scripts/release.ts [<version>|patch|minor|major]

import { spawnSync } from "node:child_process";
import { PACKAGES } from "./release-pack-proof.ts";

const SCOPED = PACKAGES.map((p) => `@defold-typescript/${p}`);
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export type Bump = "patch" | "minor" | "major";

export interface Args {
  readonly spec: string;
  readonly help: boolean;
}

export const HELP = `Cut a release: bump the version and push the v<version> tag.

Usage:
  mise run release [<version>|patch|minor|major]
  bun scripts/release.ts [<version>|patch|minor|major]

Reads the highest version live on npm, resolves the target, then creates and
pushes the v<target> tag. The Release workflow publishes from the tag via OIDC;
nothing is published locally.

Arguments:
  patch | minor | major   bump from the highest published version (default: patch)
  <x.y.z>                  explicit version; must be greater than current

Flags:
  -h, --help              show this help`;

export function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let help = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    throw new Error(`expected one version/bump argument, got: ${positional.join(", ")}`);
  }
  return { spec: positional[0] ?? "patch", help };
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

function publishedBase(): string {
  const versions = SCOPED.map((pkg) => {
    const { code, output } = run(["bun", "pm", "view", pkg, "version"]);
    return code === 0 ? output.trim() : "";
  });
  return maxVersion(versions);
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

  const base = publishedBase();
  let target: string;
  try {
    target = resolveTarget(base, args.spec);
  } catch (err) {
    die((err as Error).message);
  }
  const tag = `v${target}`;

  process.stdout.write(
    `current published: ${base}\ntarget version:    ${target}\ntag:               ${tag}\n\n`,
  );

  if (run(["git", "rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).code === 0) {
    die(`tag ${tag} already exists locally; delete it or pick another version`);
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

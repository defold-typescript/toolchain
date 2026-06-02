// Local, coordinated npm publish for the three workspace packages.
//
// The repo's manifests and lockfile stay pinned at 0.0.0 with `workspace:*`
// inter-package deps for the dev loop. Publishing is a transient stamp: this
// script bumps all four manifests to the target version, REGENERATES the
// lockfile (`bun install`) so the snapshot carries the stamped versions, packs
// to verify the inter-package deps resolved to concrete coordinated versions,
// then publishes types -> transpiler -> cli in dependency order. The working
// tree is always restored to its committed 0.0.0 state afterward.
//
// Regenerating the lockfile is the step the parked `release.yml` omitted: `bun
// pm pack` rewrites `workspace:*` from the lockfile snapshot, so a stale 0.0.0
// lockfile would ship deps pointing at a nonexistent 0.0.0.
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
const PACKAGES = ["types", "transpiler", "cli"] as const;
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
}

export function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let doPublish = false;
  for (const arg of argv) {
    if (arg === "--publish") {
      doPublish = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    throw new Error(`expected one version/bump argument, got: ${positional.join(", ")}`);
  }
  return { spec: positional[0] ?? "patch", doPublish };
}

export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
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
  const proc = spawnSync(cmd[0], cmd.slice(1), {
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

function verifyCoordinated(version: string): void {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "publish-verify-"));
  try {
    for (const pkg of PACKAGES) {
      const pkgDir = path.join(REPO_ROOT, "packages", pkg);
      const pack = run(["bun", "pm", "pack", "--destination", tmp], { cwd: pkgDir });
      if (pack.code !== 0) {
        die(`pack failed for ${pkg}:\n${pack.output}`);
      }
      const tgz = pack.output
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.endsWith(".tgz"));
      if (!tgz) {
        die(`could not locate packed tarball for ${pkg}:\n${pack.output}`);
      }
      const tarballPath = path.isAbsolute(tgz) ? tgz : path.join(pkgDir, tgz);
      const extract = run(["tar", "-xzOf", tarballPath, "package/package.json"]);
      if (extract.code !== 0) {
        die(`could not read manifest from ${pkg} tarball:\n${extract.output}`);
      }
      const manifest = JSON.parse(extract.output);
      const deps: Record<string, string> = manifest.dependencies ?? {};
      for (const [name, spec] of Object.entries(deps)) {
        if (!name.startsWith("@defold-typescript/")) continue;
        if (spec.startsWith("workspace:")) {
          die(`${pkg} tarball still carries an unresolved ${name}: ${spec}`);
        }
        if (spec !== version) {
          die(`${pkg} tarball depends on ${name}@${spec}, expected ${version}`);
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
    die((err as Error).message);
  }

  if (run(["git", "status", "--porcelain"]).output.trim() !== "") {
    die("working tree is not clean; commit or stash before publishing");
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

  for (const step of ["typecheck", "lint", "test", "build"]) {
    process.stdout.write(`gate: bun run ${step}\n`);
    if (run(["bun", "run", step], { inherit: true }).code !== 0) {
      die(`gate failed at \`bun run ${step}\``);
    }
  }

  try {
    stamp(target);
    process.stdout.write(`\nstamped manifests to ${target}; regenerating lockfile\n`);
    if (run(["bun", "install"], { inherit: true }).code !== 0) {
      die("`bun install` failed while regenerating the lockfile");
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
        die(`publish failed for ${pkg}; remaining packages NOT published`);
      }
    }
  } finally {
    restoreTree();
    process.stdout.write("\nrestored working tree to the committed 0.0.0 state\n");
  }

  if (args.doPublish) {
    process.stdout.write(
      `\npublished ${target}. Tag the release commit: mise run release ${target}\n`,
    );
  } else {
    process.stdout.write(`\ndry-run complete. Re-run with --publish to cut ${target} for real.\n`);
  }
}

if (import.meta.main) {
  await main();
}

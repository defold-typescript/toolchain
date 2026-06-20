// One-time npm OIDC trusted-publisher setup for the workspace packages.
//
// `npm trust github` (npm CLI >= 11.10.0) is the CLI equivalent of the npm
// website's per-package Trusted Publisher form; looping over the coordinated
// PACKAGES configures all of them in one authenticated session. After this,
// release.yml publishes from CI via OIDC with no token.
//
// The publish set and the repo slug are both derived (PACKAGES from
// release-pack-proof.ts, owner/repo from `git remote get-url origin`), so this
// never drifts from the workspace or hard-codes the repo.
//
// Usage:
//   mise run trust-publishers           # configure trusted publishers for all packages
//   mise run trust-publishers --list    # show the current trust config for each
//
// Requires an authenticated npm session (`npm login`); --yes then rides npm's
// ~5-minute 2FA skip window across the loop.

import { spawnSync } from "node:child_process";
import { PACKAGES } from "./release-pack-proof.ts";

// npm trust wants the bare workflow filename, not the .github/workflows/ path
// ("GitHub Actions workflow must be just a file not a path").
const WORKFLOW_FILE = "release.yml";
const SCOPE = "@defold-typescript";

export function parseRepoSlug(remoteUrl: string): string {
  const m = remoteUrl.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) {
    throw new Error(`could not parse owner/repo from remote URL: ${remoteUrl}`);
  }
  return `${m[1]}/${m[2]}`;
}

export function trustCommand(pkg: string, repo: string): string[] {
  return [
    "npm",
    "trust",
    "github",
    `${SCOPE}/${pkg}`,
    "--file",
    WORKFLOW_FILE,
    "--repo",
    repo,
    "--allow-publish",
    "--yes",
  ];
}

export function listCommand(pkg: string): string[] {
  return ["npm", "trust", "list", `${SCOPE}/${pkg}`];
}

function run(cmd: string[], opts: { inherit?: boolean } = {}): { code: number; output: string } {
  const [bin, ...rest] = cmd;
  if (!bin) throw new Error("run() called with an empty command");
  const proc = spawnSync(bin, rest, {
    stdio: opts.inherit ? "inherit" : "pipe",
    encoding: "utf8",
  });
  return {
    code: proc.status ?? 1,
    output: opts.inherit ? "" : `${proc.stdout ?? ""}${proc.stderr ?? ""}`,
  };
}

function die(message: string): never {
  process.stderr.write(`trust-publishers: ${message}\n`);
  process.exit(1);
}

function requireNpmVersion(): void {
  const { code, output } = run(["npm", "-v"]);
  if (code !== 0) die("npm not found on PATH");
  const v = output.trim();
  const [major = 0, minor = 0] = v.split(".").map(Number);
  if (major < 11 || (major === 11 && minor < 10)) {
    die(`npm ${v} is too old for \`npm trust\` (need >= 11.10.0). Run: npm install -g npm@latest`);
  }
}

function main(): void {
  const list = process.argv.slice(2).includes("--list");

  if (!list) requireNpmVersion();

  const remote = run(["git", "remote", "get-url", "origin"]);
  if (remote.code !== 0) die("could not read `git remote get-url origin`");
  const repo = parseRepoSlug(remote.output);

  process.stdout.write(
    `${list ? "listing" : "configuring"} trusted publishers for ${PACKAGES.length} packages ` +
      `(repo ${repo}, workflow ${WORKFLOW_FILE})\n\n`,
  );

  let failed = 0;
  for (const pkg of PACKAGES) {
    const cmd = list ? listCommand(pkg) : trustCommand(pkg, repo);
    process.stdout.write(`\n> ${cmd.join(" ")}\n`);
    // Inherit stdio so npm can run its interactive 2FA/web-auth prompt; the
    // first package completes the OTP, the rest ride npm's ~5-min 2FA window.
    const { code } = run(cmd, { inherit: true });
    if (code !== 0) failed++;
  }

  if (failed > 0) {
    die(`${failed}/${PACKAGES.length} package(s) failed; see output above`);
  }
  process.stdout.write(`\nall ${PACKAGES.length} packages ${list ? "listed" : "configured"}\n`);
}

if (import.meta.main) {
  main();
}

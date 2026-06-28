// Advisory live stamped-pack proof — NOT a CI gate.
//
// Runs the real release stamp->regen->pack chain at a *synthetic* non-`0.0.0`
// version inside throwaway `git worktree`s, proving `bun pm pack` emits
// coordinated `@defold-typescript/*` sibling versions — plus a no-regen control
// proving the lockfile regen is load-bearing (without it the pack carries the
// stale `0.0.0`). A *passing* control is a proof failure: it means the regen is
// not load-bearing and the whole proof is meaningless.
//
// This is the load-bearing proof to run deliberately before flipping the
// `ENABLE_NPM_PUBLISH` gate. The cheap, deterministic CI stand-in it backs is
// the ordering invariant in `test/release-workflow.test.ts`; this script touches
// the real toolchain (two worktrees, a `bun install`, three packs) and is far
// too slow/brittle for the green path, so it is never a `bun test` gate. The
// offline guarantees (the verdict helper and harness discoverability) live in
// `scripts/release-pack-proof.test.ts`.
//
// Usage: bun scripts/release-pack-proof.ts [--version <x.y.z>]

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
export const PACKAGES = ["types", "transpiler", "tstl-plugin", "docs", "cli"] as const;
const DEFAULT_VERSION = "9.9.9";

// Extracted from `publish.ts`'s `verifyCoordinated` inner loop so both the
// advisory `main` and the offline test drive every branch: a `@defold-typescript/*`
// dep must resolve to a concrete spec equal to the stamped version, never a
// `workspace:` placeholder and never the stale committed `0.0.0`.
export function checkCoordinatedDeps(
  manifest: unknown,
  expectedVersion: string,
): { ok: boolean; detail: string } {
  const deps =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { dependencies?: Record<string, unknown> }).dependencies
      : undefined;
  const entries = deps && typeof deps === "object" ? Object.entries(deps) : [];
  for (const [name, spec] of entries) {
    if (!name.startsWith("@defold-typescript/")) continue;
    if (typeof spec !== "string") {
      return { ok: false, detail: `${name} has a non-string spec: ${String(spec)}` };
    }
    if (spec.startsWith("workspace:")) {
      return { ok: false, detail: `${name} still carries an unresolved spec: ${spec}` };
    }
    if (spec !== expectedVersion) {
      return { ok: false, detail: `found ${name}@${spec}, expected ${expectedVersion}` };
    }
  }
  return { ok: true, detail: `all @defold-typescript/* deps resolve to ${expectedVersion}` };
}

function run(cmd: string[], opts: { cwd?: string } = {}): { code: number; output: string } {
  const [bin, ...rest] = cmd;
  if (!bin) {
    throw new Error("run() called with an empty command");
  }
  const proc = spawnSync(bin, rest, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf8",
  });
  return { code: proc.status ?? 1, output: `${proc.stdout ?? ""}${proc.stderr ?? ""}` };
}

function parseVersion(argv: readonly string[]): string {
  const i = argv.indexOf("--version");
  if (i === -1) return DEFAULT_VERSION;
  const v = argv[i + 1];
  if (!v || !/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(`--version expects an x.y.z value, got: ${v ?? "(missing)"}`);
  }
  return v;
}

// Pure version stamp: return a copy with `.version` set, every other field
// (name, dependencies) preserved and the input left unmutated.
export function stampVersion<T extends object>(
  manifest: T,
  version: string,
): T & { version: string } {
  return { ...manifest, version };
}

function stampManifest(file: string, version: string): void {
  const stamped = stampVersion(JSON.parse(readFileSync(file, "utf8")), version);
  writeFileSync(file, `${JSON.stringify(stamped, null, 2)}\n`);
}

function stamp(worktree: string, version: string): void {
  // Mirror release.yml's stamp loop: rewrite `.version` across the root and
  // every package manifest, in-process (no bash/jq).
  stampManifest(path.join(worktree, "package.json"), version);
  const packagesDir = path.join(worktree, "packages");
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      stampManifest(path.join(packagesDir, entry.name, "package.json"), version);
    }
  }
}

// Read one entry out of an uncompressed (already-gunzipped) tar by walking its
// 512-byte ustar headers. `package/package.json` is short, so the 100-byte name
// field suffices — no prefix/long-name handling. Returns null when absent.
export function readTarEntry(tar: Uint8Array, name: string): string | null {
  const decoder = new TextDecoder();
  const trimNul = (s: string): string => {
    const i = s.indexOf("\0");
    return i === -1 ? s : s.slice(0, i);
  };
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const entryName = trimNul(decoder.decode(header.subarray(0, 100)));
    if (entryName === "") break; // trailing all-zero block
    const size = Number.parseInt(trimNul(decoder.decode(header.subarray(124, 136))).trim(), 8);
    const dataStart = offset + 512;
    if (entryName === name) {
      return decoder.decode(tar.subarray(dataStart, dataStart + size));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

function packedManifest(worktree: string, pkg: string, dest: string): unknown {
  const pkgDir = path.join(worktree, "packages", pkg);
  const pack = run(["bun", "pm", "pack", "--destination", dest], { cwd: pkgDir });
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
  const tar = Bun.gunzipSync(new Uint8Array(readFileSync(tarballPath)));
  const manifest = readTarEntry(tar, "package/package.json");
  if (manifest === null) {
    throw new Error(`could not read manifest from ${pkg} tarball: package/package.json not found`);
  }
  return JSON.parse(manifest);
}

interface RunResult {
  readonly regen: boolean;
  readonly verdicts: Array<{ pkg: string; ok: boolean; detail: string }>;
}

function packProof(version: string, regen: boolean): RunResult {
  const worktree = mkdtempSync(
    path.join(os.tmpdir(), `pack-proof-${regen ? "regen" : "control"}-`),
  );
  const dest = mkdtempSync(path.join(os.tmpdir(), "pack-proof-tgz-"));
  // git worktree add refuses a pre-existing non-empty dir, so add into a fresh
  // child path and clean up the mkdtemp parent in `finally`.
  const checkout = path.join(worktree, "tree");
  try {
    const add = run(["git", "worktree", "add", "--detach", checkout, "HEAD"]);
    if (add.code !== 0) {
      throw new Error(`git worktree add failed:\n${add.output}`);
    }
    stamp(checkout, version);
    if (regen) {
      rmSync(path.join(checkout, "bun.lock"), { force: true });
      const install = run(["bun", "install"], { cwd: checkout });
      if (install.code !== 0) {
        throw new Error(`bun install failed in worktree:\n${install.output}`);
      }
    }
    const verdicts = PACKAGES.map((pkg) => {
      const manifest = packedManifest(checkout, pkg, dest);
      const v = checkCoordinatedDeps(manifest, version);
      return { pkg, ok: v.ok, detail: v.detail };
    });
    return { regen, verdicts };
  } finally {
    run(["git", "worktree", "remove", "--force", checkout]);
    rmSync(worktree, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
}

function main(): void {
  const version = parseVersion(process.argv.slice(2));
  process.stdout.write(
    `live stamped-pack proof (advisory, real packs in throwaway worktrees) — synthetic version ${version}\n\n`,
  );

  const regen = packProof(version, true);
  process.stdout.write(`regen run (stamp -> rm bun.lock -> bun install -> pack):\n`);
  for (const v of regen.verdicts) {
    process.stdout.write(`  ${v.ok ? "PASS" : "FAIL"}  ${v.pkg} — ${v.detail}\n`);
  }
  const regenOk = regen.verdicts.every((v) => v.ok);

  const control = packProof(version, false);
  process.stdout.write(`\nno-regen control (stamp -> pack, lockfile NOT regenerated):\n`);
  for (const v of control.verdicts) {
    process.stdout.write(
      `  ${v.ok ? "(unexpectedly coordinated)" : "stale, as expected"}  ${v.pkg} — ${v.detail}\n`,
    );
  }
  // The control must FAIL: a stamp without the regen has to pack the stale
  // committed version. If it comes out coordinated, the regen step is not
  // load-bearing and the whole proof is meaningless — surface that loudly.
  const controlFails = control.verdicts.some((v) => !v.ok);

  process.stdout.write("\n");
  if (regenOk && controlFails) {
    process.stdout.write(
      `proof OK: regen pack is coordinated at ${version}; no-regen control packs the stale version (regen is load-bearing)\n`,
    );
    process.exit(0);
  }
  if (!regenOk) {
    process.stdout.write(`proof FAILED: regen pack did not emit coordinated ${version} deps\n`);
  }
  if (!controlFails) {
    process.stdout.write(
      "proof FAILED: no-regen control came out coordinated — the lockfile regen is NOT load-bearing\n",
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}

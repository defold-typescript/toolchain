// Re-sync the committed platformer example to the working-tree library — NOT a
// CI gate, a manual pre-publish refresh.
//
// The local-source twin of the example's own `defold-typescript:upgrade` task,
// which refreshes from the *published* `@defold-typescript/cli@latest`. This
// drives the **working-tree** bin (`packages/cli/src/bin.ts`) through
// `init --force` then `build` against `docs/examples/platformer`, so an
// unpublished change to the scaffold or the pinned stable Defold version is
// reflected in the example before a release instead of silently diverging until
// one. Run with `mise run example:update` (or `bun scripts/example-update.ts`).
//
// The example has no committed `package.json` — it resolves the library through
// `tsconfig` `paths`. `init --force` may synthesize one with a dev-version pin
// (`0.0.0` / `workspace:*`); committing that is wrong, so the synthesized
// manifest is stripped before it can drift into the committed example.

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { CURRENT_STABLE_DEFOLD_VERSION } from "../packages/cli/src/defold-version.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
export const EXAMPLE_DIR = "docs/examples/platformer";
const BIN_PATH = "packages/cli/src/bin.ts";

export function buildUpdateSteps(exampleDir: string, binPath: string): string[][] {
  return [
    ["bun", binPath, "init", "--force", exampleDir],
    ["bun", binPath, "build", exampleDir],
  ];
}

export function expectedFreshArtifacts(exampleDir: string): string[] {
  return [
    path.posix.join(exampleDir, "src", "player.ts.script"),
    path.posix.join(exampleDir, ".defold-types", `defold-${CURRENT_STABLE_DEFOLD_VERSION}`),
  ];
}

function devVersionSpec(spec: unknown): string | null {
  if (typeof spec !== "string") {
    return null;
  }
  if (spec.startsWith("workspace:")) {
    return spec;
  }
  // `typesVersionSpec()` emits `^<version>`; in the dev tree that is the
  // unpublished `0.0.0`. Strip any leading range operator before comparing so a
  // caret/tilde dev range (`^0.0.0`) is caught alongside a bare `0.0.0`.
  const bare = spec.replace(/^[\^~>=<\s]+/, "");
  return bare === "0.0.0" ? spec : null;
}

export function verifyNoDevVersionPin(manifest: unknown): { ok: boolean; detail: string } {
  if (manifest === null || typeof manifest !== "object") {
    return { ok: true, detail: "no package.json" };
  }
  const record = manifest as Record<string, unknown>;
  for (const field of ["dependencies", "devDependencies"] as const) {
    const deps = record[field];
    if (typeof deps !== "object" || deps === null) {
      continue;
    }
    for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
      if (!name.startsWith("@defold-typescript/")) {
        continue;
      }
      const offending = devVersionSpec(spec);
      if (offending !== null) {
        return { ok: false, detail: `${name} pinned to ${offending} in ${field}` };
      }
    }
  }
  return { ok: true, detail: "no dev-version pin" };
}

function run(step: string[]): void {
  process.stdout.write(`$ ${step.join(" ")}\n`);
  const proc = Bun.spawnSync(step, { cwd: REPO_ROOT, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    process.stderr.write(
      `\nexample:update failed: \`${step.join(" ")}\` exited ${proc.exitCode}\n`,
    );
    process.exit(proc.exitCode || 1);
  }
}

function git(args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
  return proc.stdout.toString();
}

// The platformer is a curated, paths-based consumer: `tsconfig.json` resolves
// `@defold-typescript/*` to the working-tree source, and the example commits no
// `package.json`/`biome.json`/`src/main.ts`. A blanket `init --force` clobbers
// the tsconfig and the `mise.toml` tasks and scaffolds those files, so the
// refresh restores the hand-kept `tsconfig.json` and `mise.toml` and drops the
// scaffold files the example deliberately omits, keeping only the legitimate
// managed refreshes (`.gitignore`) and the regenerated gitignored artifacts.
//
// `mise.toml` is restored, not kept as scaffolded: `init` writes
// `bunx @defold-typescript/cli <cmd>` tasks (the published-release consumer
// form), but this in-repo example is pinned to working-tree source and must run
// the working-tree bin, so its committed `mise.toml` points at
// `packages/cli/src/bin.ts` instead.
export function preserveExampleIdentity(): void {
  git(["checkout", "--", path.join(EXAMPLE_DIR, "tsconfig.json")]);
  git(["checkout", "--", path.join(EXAMPLE_DIR, "mise.toml")]);

  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", EXAMPLE_DIR])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const rel of untracked) {
    if (path.basename(rel) === "package.json") {
      const pin = verifyNoDevVersionPin(
        JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf8")),
      );
      process.stdout.write(`stripped synthesized package.json (${pin.detail})\n`);
    } else {
      process.stdout.write(`stripped scaffolded ${rel} (example commits none)\n`);
    }
    rmSync(path.join(REPO_ROOT, rel), { force: true });
  }

  // The dropped `src/main.ts` leaves its gitignored emit behind; remove any
  // emitted `.ts.script` whose source `.ts` no longer exists.
  const srcDir = path.join(REPO_ROOT, EXAMPLE_DIR, "src");
  for (const name of readdirSync(srcDir)) {
    const emit = name.match(/^(.+)\.ts\.script(\.map)?$/);
    if (emit !== null && !existsSync(path.join(srcDir, `${emit[1]}.ts`))) {
      rmSync(path.join(srcDir, name), { force: true });
      process.stdout.write(`removed orphaned emit src/${name}\n`);
    }
  }
}

function main(): void {
  process.stdout.write("example:update — re-syncing the platformer to working-tree source\n");
  for (const step of buildUpdateSteps(EXAMPLE_DIR, BIN_PATH)) {
    run(step);
  }

  preserveExampleIdentity();

  const missing = expectedFreshArtifacts(EXAMPLE_DIR).filter(
    (rel) => !existsSync(path.join(REPO_ROOT, rel)),
  );
  if (missing.length > 0) {
    process.stderr.write(`\nexpected refreshed artifacts missing:\n  ${missing.join("\n  ")}\n`);
    process.exit(1);
  }

  process.stdout.write(`\ngit status ${EXAMPLE_DIR}:\n`);
  Bun.spawnSync(["git", "status", "--porcelain", EXAMPLE_DIR], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
}

if (import.meta.main) {
  main();
}

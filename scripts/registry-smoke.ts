// Advisory, network-touching registry smoke check — NOT a CI gate.
//
// The registry-sourced twin of `scripts/release-smoke.ts`. Where the packed
// smoke installs locally built `.tgz` tarballs, this pulls the **published**
// `@defold-typescript/cli@<version>` (default `latest`, optional positional
// version arg) and its real dependency graph straight from the public npm
// registry into a throwaway project outside the monorepo, then drives the
// installed `defold-typescript` bin under BOTH node and bun through
// init (both modes) -> build -> `tsc --noEmit` clean. It confirms the goal's
// headline criterion — a clean-room install from the registry scaffolds and
// compiles with no local checkout. It touches the network and is
// version-dependent, so it is deliberately kept out of the deterministic test
// suite; the offline guarantees (this harness is wired and discoverable) live
// in `packages/cli/src/registry-smoke.test.ts`. Run manually with
// `bun run registry-smoke [<version>]`.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const RUNTIMES = ["node", "bun"] as const;
export const STARTER_ARTIFACT_REL = "src/main.ts.script";

interface StepResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

const results: StepResult[] = [];

function record(name: string, ok: boolean, detail = ""): boolean {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
  return ok;
}

function spawn(cmd: string[], cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

function seedConsumer(dir: string): void {
  writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "registry-smoke-consumer", private: true }, null, 2)}\n`,
  );
}

function install(runtime: string, dir: string, spec: string): boolean {
  // bun resolves the published graph itself; for node we go through npm. Both
  // pull `@defold-typescript/{types,transpiler}` transitively from the registry.
  const cmd =
    runtime === "bun" ? ["bun", "add", spec, "typescript"] : ["npm", "install", spec, "typescript"];
  const { code, output } = spawn(cmd, dir);
  return code === 0 ? true : record(`${runtime} install`, false, output.slice(-400));
}

function binPath(dir: string): string {
  return path.join(dir, "node_modules", "@defold-typescript", "cli", "dist", "bin.js");
}

function installedVersion(dir: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(
        path.join(dir, "node_modules", "@defold-typescript", "cli", "package.json"),
        "utf8",
      ),
    );
    return typeof pkg.version === "string" ? pkg.version : "(unknown)";
  } catch {
    return "(unknown)";
  }
}

// The published artifact's scaffolded pin is invisible to the init -> build ->
// tsc flow above: a wrong `@defold-typescript/types` spec in the emitted
// manifest (or `types` not co-published at the CLI's version) still installs
// and compiles via the upward resolution, so a real drift would pass silently.
// `init.test.ts` asserts the same `^${version}` rule against the *source* tree;
// this checks it on the *published* manifest. Pure so the colocated test drives
// every branch offline.
export function checkScaffoldedTypesPin(
  manifest: unknown,
  installedVersion: string,
): { ok: boolean; detail: string } {
  if (installedVersion === "(unknown)") {
    return {
      ok: false,
      detail: "installed cli version is (unknown); cannot derive the expected types pin",
    };
  }
  const expected = `^${installedVersion}`;
  const devDeps =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { devDependencies?: Record<string, unknown> }).devDependencies
      : undefined;
  const found = devDeps?.["@defold-typescript/types"];
  if (typeof found !== "string") {
    return { ok: false, detail: `@defold-typescript/types devDep absent; expected ${expected}` };
  }
  if (found !== expected) {
    return { ok: false, detail: `found ${found}, expected ${expected}` };
  }
  return { ok: true, detail: found };
}

function runtimeFlow(runtime: string, spec: string): void {
  // New-project mode: the published CLI installs into `proj`; the new project
  // synthesizes into an empty `app` subdir (new-project mode refuses a
  // non-empty dir) and resolves `@defold-typescript/*` upward.
  const proj = mkdtempSync(path.join(os.tmpdir(), `registry-smoke-${runtime}-new-`));
  try {
    seedConsumer(proj);
    if (!install(runtime, proj, spec)) {
      return;
    }
    record(`${runtime} installed`, true, `@defold-typescript/cli@${installedVersion(proj)}`);

    const bin = binPath(proj);
    const app = path.join(proj, "app");
    mkdirSync(app);

    const init = spawn([runtime, bin, "init", app], app);
    if (
      !record(
        `${runtime} new init`,
        init.code === 0 &&
          existsSync(path.join(app, "game.project")) &&
          existsSync(path.join(app, "src", "main.ts")),
        init.code === 0 ? "" : init.output.slice(-300),
      )
    ) {
      return;
    }

    let manifest: unknown;
    try {
      manifest = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
    } catch (err) {
      manifest = undefined;
      record(`${runtime} scaffolds types ^${installedVersion(proj)}`, false, String(err));
    }
    if (manifest !== undefined) {
      const pin = checkScaffoldedTypesPin(manifest, installedVersion(proj));
      record(`${runtime} scaffolds types ^${installedVersion(proj)}`, pin.ok, pin.detail);
    }

    const build = spawn([runtime, bin, "build", app], app);
    record(
      `${runtime} build emits starter script`,
      build.code === 0 && existsSync(path.join(app, STARTER_ARTIFACT_REL)),
      build.code === 0 ? "" : build.output.slice(-300),
    );

    const tsc = spawn(
      [runtime, path.join(proj, "node_modules", ".bin", "tsc"), "--noEmit", "-p", "tsconfig.json"],
      app,
    );
    record(
      `${runtime} tsc --noEmit clean`,
      tsc.code === 0,
      tsc.code === 0 ? "" : tsc.output.slice(-300),
    );
  } finally {
    rmSync(proj, { recursive: true, force: true });
  }

  // Add-TS mode: seed a minimal game.project, init must scaffold the TS surface.
  const addProj = mkdtempSync(path.join(os.tmpdir(), `registry-smoke-${runtime}-add-`));
  try {
    seedConsumer(addProj);
    if (!install(runtime, addProj, spec)) {
      return;
    }
    writeFileSync(path.join(addProj, "game.project"), "[project]\ntitle = smoke\n");
    const bin = binPath(addProj);
    const init = spawn([runtime, bin, "init", addProj], addProj);
    record(
      `${runtime} add-TS init`,
      init.code === 0 &&
        existsSync(path.join(addProj, "src", "main.ts")) &&
        existsSync(path.join(addProj, "tsconfig.json")),
      init.code === 0 ? "" : init.output.slice(-300),
    );
  } finally {
    rmSync(addProj, { recursive: true, force: true });
  }
}

function main(): void {
  const version = process.argv[2] ?? "latest";
  const spec = `@defold-typescript/cli@${version}`;
  process.stdout.write(
    `registry smoke (advisory, network-touching) — published-install consumer flow\nspec: ${spec}\n`,
  );
  for (const runtime of RUNTIMES) {
    runtimeFlow(runtime, spec);
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} steps passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

if (import.meta.main) {
  main();
}

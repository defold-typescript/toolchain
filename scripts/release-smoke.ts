// Advisory, network-touching release smoke check — NOT a CI gate.
//
// Packs the three workspace tarballs, installs them into a throwaway project
// outside the monorepo (so the `workspace:*` specs are exercised exactly as a
// real consumer would hit them), and drives the installed `defold-typescript`
// bin under BOTH node and bun through the full scaffold/build/typecheck/watch
// flow. Run manually with `bun run smoke`. It touches the network (`bun add`
// may hit the registry for transitive deps) and the filesystem outside the
// repo, so it is deliberately kept out of the deterministic test suite; the
// offline guarantees live in `packages/cli/src/release-bin-smoke.test.ts`.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PACKAGES } from "./release-pack-proof";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
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

function buildWorkspace(): boolean {
  const { code, output } = spawn(["bun", "run", "build"], REPO_ROOT);
  // The types package ships `src`/`generated` (not `dist`), but its `build`
  // emits a `dist/` that includes compiled `*.test.js` — which root `bun test`
  // would then discover and run with broken relative paths. Drop it so a
  // `bun run smoke` does not leave the test suite red.
  rmSync(path.join(REPO_ROOT, "packages", "types", "dist"), { recursive: true, force: true });
  return record("workspace build", code === 0, code === 0 ? "" : output.slice(-400));
}

function packAll(dest: string): string[] | null {
  const tgz: string[] = [];
  for (const pkg of PACKAGES) {
    const cwd = path.join(REPO_ROOT, "packages", pkg);
    const { code, output } = spawn(["bun", "pm", "pack", "--destination", dest], cwd);
    if (code !== 0) {
      record(`pack ${pkg}`, false, output.slice(-400));
      return null;
    }
  }
  for (const name of readdirSync(dest)) {
    if (name.endsWith(".tgz")) {
      tgz.push(path.join(dest, name));
    }
  }
  const ok = tgz.length === PACKAGES.length;
  record(
    "pack all packages",
    ok,
    ok ? "" : `expected ${PACKAGES.length} tarballs, got ${tgz.length}`,
  );
  return ok ? tgz : null;
}

export function internalCliDeps(cliManifest: unknown): string[] {
  const deps =
    typeof cliManifest === "object" && cliManifest !== null
      ? (cliManifest as { dependencies?: Record<string, unknown> }).dependencies
      : undefined;
  const names = deps && typeof deps === "object" ? Object.keys(deps) : [];
  return names.filter((name) => name.startsWith("@defold-typescript/")).sort();
}

export function pinnedTypeScriptSpec(rootManifest: unknown): string {
  const dev =
    typeof rootManifest === "object" && rootManifest !== null
      ? (rootManifest as { devDependencies?: Record<string, unknown> }).devDependencies
      : undefined;
  const spec = dev && typeof dev === "object" ? dev.typescript : undefined;
  if (typeof spec !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(spec)) {
    throw new Error(`root devDependencies.typescript is missing or unpinned: ${String(spec)}`);
  }
  return `typescript@${spec}`;
}

export function tarballForExact(tarballs: string[], pkg: string): string {
  const prefix = `defold-typescript-${pkg}-`;
  const match = tarballs.find((t) => path.basename(t).startsWith(prefix));
  if (match === undefined) {
    throw new Error(`no packed tarball for ${pkg}`);
  }
  return match;
}

export function overridesFor(internalDeps: string[], tarballs: string[]): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const dep of internalDeps) {
    const pkg = dep.slice("@defold-typescript/".length);
    overrides[dep] = `file:${tarballForExact(tarballs, pkg)}`;
  }
  return overrides;
}

function installConsumer(dir: string, tarballs: string[]): boolean {
  const cliManifest = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "packages", "cli", "package.json"), "utf8"),
  );
  const rootManifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const cli = tarballForExact(tarballs, "cli");
  // The packed cli tarball pins every internal `@defold-typescript/*` sibling to
  // the concrete `0.0.0`, which would resolve against the (unpublished)
  // registry. Deriving `file:` overrides from the CLI manifest forces each
  // transitive internal dep onto its local tarball, so the install resolves
  // entirely offline — no dep can silently drift out of the override set.
  writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "release-smoke-consumer",
        private: true,
        overrides: overridesFor(internalCliDeps(cliManifest), tarballs),
      },
      null,
      2,
    )}\n`,
  );
  const add = spawn(["bun", "add", pinnedTypeScriptSpec(rootManifest), cli], dir);
  return add.code === 0 ? true : record(`install (${dir})`, false, add.output.slice(-400));
}

function binPath(dir: string): string {
  return path.join(dir, "node_modules", "@defold-typescript", "cli", "dist", "bin.js");
}

async function runtimeFlow(runtime: string, tarballs: string[]): Promise<void> {
  // New-project mode: init -> build -> tsc --noEmit -> bounded watch. The
  // tarballs install into `proj`; the new project synthesizes into an empty
  // `app` subdir (new-project mode refuses a non-empty dir) and resolves
  // `@defold-typescript/*` upward through `proj/node_modules`.
  const proj = mkdtempSync(path.join(os.tmpdir(), `release-smoke-${runtime}-new-`));
  try {
    if (!installConsumer(proj, tarballs)) {
      return;
    }
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

    await boundedWatch(runtime, bin, app);
  } finally {
    rmSync(proj, { recursive: true, force: true });
  }

  // Add-TS mode: seed a minimal game.project, init must scaffold the TS surface.
  const addProj = mkdtempSync(path.join(os.tmpdir(), `release-smoke-${runtime}-add-`));
  try {
    if (!installConsumer(addProj, tarballs)) {
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

async function boundedWatch(runtime: string, bin: string, proj: string): Promise<void> {
  const artifact = path.join(proj, STARTER_ARTIFACT_REL);
  rmSync(artifact, { force: true });
  const proc = Bun.spawn([runtime, bin, "watch", proj], {
    cwd: proj,
    stdout: "pipe",
    stderr: "pipe",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && !existsSync(artifact)) {
    await Bun.sleep(100);
  }
  const sawArtifact = existsSync(artifact);
  proc.kill("SIGINT");
  const code = await proc.exited;
  const cleanExit = code === 0 || code === null;
  record(
    `${runtime} bounded watch`,
    sawArtifact && cleanExit,
    sawArtifact ? (cleanExit ? "" : `watch exited ${code}`) : "no rebuild artifact within 10s",
  );
}

async function main(): Promise<void> {
  process.stdout.write(
    "release smoke (advisory, network-touching) — packed-install consumer flow\n",
  );
  if (!buildWorkspace()) {
    process.exit(1);
  }
  const packDir = mkdtempSync(path.join(os.tmpdir(), "release-smoke-pack-"));
  try {
    const tarballs = packAll(packDir);
    if (tarballs === null) {
      process.exit(1);
    }
    for (const runtime of RUNTIMES) {
      await runtimeFlow(runtime, tarballs);
    }
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} steps passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

if (import.meta.main) {
  await main();
}

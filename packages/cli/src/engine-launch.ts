import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  type EngineTarget,
  nativeExtensionRuntimeWarnings,
  targetPlatform,
} from "./debug-launcher";

export const ENGINE_MARKER_REL = "build/.defold-typescript-engine";

export interface Runnable {
  readonly enginePath: string;
  readonly projectcPath: string;
  readonly target: EngineTarget;
  readonly warnings: string[];
}

export interface ResolveRunnableOptions {
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly probe: (candidate: string) => boolean;
  readonly readEngineMarker?: (cwd: string) => string | null;
}

// Reads the absolute path a prior `bob run` cached its stock engine to; absent
// or blank means "no marker".
export function readEngineMarker(cwd: string): string | null {
  try {
    const marker = readFileSync(path.join(cwd, ENGINE_MARKER_REL), "utf8").trim();
    return marker.length > 0 ? marker : null;
  } catch {
    return null;
  }
}

// Pure resolver shared by `run` and `bob run`: answer which engine + compiled
// project to launch, or throw an actionable error. No spawn, download, or write.
export function resolveRunnable(opts: ResolveRunnableOptions): Runnable {
  const { cwd, platform, arch, probe } = opts;
  const readMarker = opts.readEngineMarker ?? readEngineMarker;

  const projectcPath = path.join(cwd, "build", "default", "game.projectc");
  if (!probe(projectcPath)) {
    throw new Error(
      `defold-typescript run: no compiled project at build/default; run "bob build" (or "bob run") first.`,
    );
  }

  const target = targetPlatform(platform, arch);
  const buildFolder = path.join(cwd, "build", target.buildFolder);
  const buildEnginePath = path.join(buildFolder, target.executable);

  if (probe(buildEnginePath)) {
    const warnings = nativeExtensionRuntimeWarnings({ target, buildFolder, exists: probe });
    return { enginePath: buildEnginePath, projectcPath, target, warnings };
  }

  const marker = readMarker(cwd);
  if (marker && probe(marker)) {
    return { enginePath: marker, projectcPath, target, warnings: [] };
  }

  throw new Error(
    `defold-typescript run: no engine for ${target.enginePlatform}; run "bob run" to download and cache one.`,
  );
}

// A launched engine, controllable while it runs: `kill` forwards a signal, and
// `exited` resolves to the process exit code. Injected in tests; the default
// wraps `child_process`.
export interface EngineProcess {
  readonly kill: (signal: NodeJS.Signals) => void;
  readonly exited: Promise<number>;
}

export type EngineSpawn = (argv: string[]) => EngineProcess;

export interface LaunchEngineOptions {
  readonly platform: NodeJS.Platform;
  readonly spawn: EngineSpawn;
  readonly extraArgs?: readonly string[];
  // macOS-only: a build engine launched in place attaches to the editor
  // process, so it is copied aside first and the returned path is spawned.
  readonly copyAside?: (enginePath: string) => string;
  readonly chmod?: (enginePath: string, mode: number) => void;
}

// Launch the resolved engine in the foreground: mirror the debug launcher's
// runtime steps (macOS copy-aside, non-Windows chmod), forward SIGINT/SIGTERM to
// the child so Ctrl-C reaches the game, and propagate the child's exit code. The
// game streams to the inherited terminal; nothing here captures its output.
export async function launchEngine(runnable: Runnable, opts: LaunchEngineOptions): Promise<number> {
  const extraArgs = opts.extraArgs ?? [];
  let enginePath = runnable.enginePath;
  if (opts.platform === "darwin" && opts.copyAside) {
    enginePath = opts.copyAside(enginePath);
  }
  if (opts.platform !== "win32" && opts.chmod) {
    opts.chmod(enginePath, 0o755);
  }

  const child = opts.spawn([enginePath, runnable.projectcPath, ...extraArgs]);
  const forward = (signal: NodeJS.Signals) => (): void => child.kill(signal);
  const onSigint = forward("SIGINT");
  const onSigterm = forward("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  try {
    return await child.exited;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }
}

// macOS standalone copy: place the engine under `temp/` beside itself so it runs
// detached from the editor, matching the embedded debug launcher.
function copyEngineAside(enginePath: string): string {
  const aside = path.join(path.dirname(enginePath), "temp", path.basename(enginePath));
  mkdirSync(path.dirname(aside), { recursive: true });
  copyFileSync(enginePath, aside);
  return aside;
}

function spawnEngineInherit(argv: string[]): EngineProcess {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    throw new Error("defold-typescript run: cannot launch an empty engine command.");
  }
  const proc = spawn(cmd, args, { stdio: "inherit" });
  const exited = new Promise<number>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? 1));
  });
  return { kill: (signal) => void proc.kill(signal), exited };
}

// The live seams the `run` dispatch branch launches through; tests inject a
// deterministic subset, mirroring `defaultDefoldIo`.
export interface RunEngine {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly probe: (candidate: string) => boolean;
  readonly spawn: EngineSpawn;
  readonly copyAside: (enginePath: string) => string;
  readonly chmod: (enginePath: string, mode: number) => void;
}

export function defaultRunEngine(): RunEngine {
  return {
    platform: process.platform,
    arch: process.arch,
    probe: (candidate) => existsSync(candidate),
    spawn: spawnEngineInherit,
    copyAside: copyEngineAside,
    chmod: (enginePath, mode) => chmodSync(enginePath, mode),
  };
}

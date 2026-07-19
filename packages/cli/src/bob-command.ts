import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { bobCacheDir, bobDownloadUrl, engineCachePath, resolveBobJar, resolveJava } from "./bob";
import { engineDownloadUrl, targetPlatform } from "./debug-launcher";
import type {
  ChannelInfoIo,
  DefoldChannel,
  DefoldTarget,
  ResolvedTargetHead,
} from "./defold-target";
import { resolveTargetHead } from "./defold-target";
import { ENGINE_MARKER_REL, type Runnable, resolveRunnable } from "./engine-launch";
import { detectEditorBundledJava } from "./installed-editor-version";

export const BOB_SUBCOMMANDS = ["resolve", "build", "bundle"] as const;
export type BobSubcommand = (typeof BOB_SUBCOMMANDS)[number];

export function isBobSubcommand(value: string | undefined): value is BobSubcommand {
  return value !== undefined && (BOB_SUBCOMMANDS as readonly string[]).includes(value);
}

// bob takes options before the trailing command verb. `build` uses the debug
// variant so output lands in `build/default`, matching the engine the debug
// launcher runs.
export function composeBobArgv(opts: {
  java: string;
  jar: string;
  subcommand: string;
  buildServer?: string;
}): string[] {
  const base = [opts.java, "-jar", opts.jar];
  const server = opts.buildServer ? ["--build-server", opts.buildServer] : [];
  switch (opts.subcommand) {
    case "resolve":
      return [...base, ...server, "resolve"];
    case "build":
      return [...base, "--variant", "debug", ...server, "build"];
    case "bundle":
      return [...base, ...server, "bundle"];
    default:
      throw new Error(
        `defold-typescript: unknown bob subcommand "${opts.subcommand}"; expected resolve|build|bundle.`,
      );
  }
}

export interface SpawnResult {
  readonly exitCode: number;
  readonly output?: string;
}

export interface DefoldIo {
  readonly cacheDir: string;
  readonly probe: (candidate: string) => boolean;
  readonly javaProbe: (cmd: string) => boolean;
  readonly bundledJava?: () => string | null;
  readonly spawn: (
    argv: string[],
    cwd: string,
    opts?: { capture?: boolean },
  ) => Promise<SpawnResult>;
  readonly download: (url: string, dest: string) => Promise<void>;
}

export interface BobCommandResult {
  readonly ok: boolean;
  readonly subcommand: string;
  readonly exitCode: number;
  readonly argv: string[];
  readonly defoldVersion: string;
  readonly defoldChannel: string | null;
  readonly defoldSha: string;
  readonly output?: string;
}

export async function runBobCommand(opts: {
  cwd: string;
  subcommand: string;
  java?: string;
  buildServer?: string;
  capture?: boolean;
  head: { readonly version: string; readonly channel: string | null; readonly sha: string };
  io: DefoldIo;
}): Promise<BobCommandResult> {
  const { io, head } = opts;
  const { jarPath, cached } = resolveBobJar({
    sha1: head.sha,
    cacheDir: io.cacheDir,
    probe: io.probe,
  });
  if (!cached) {
    await io.download(bobDownloadUrl(head.sha), jarPath);
  }
  const java = resolveJava({
    ...(opts.java !== undefined ? { override: opts.java } : {}),
    probe: io.javaProbe,
    ...(io.bundledJava !== undefined ? { bundledJava: io.bundledJava } : {}),
  });
  const argv = composeBobArgv({
    java,
    jar: jarPath,
    subcommand: opts.subcommand,
    ...(opts.buildServer !== undefined ? { buildServer: opts.buildServer } : {}),
  });
  const { exitCode, output } = await io.spawn(argv, opts.cwd, { capture: opts.capture ?? false });
  return {
    ok: exitCode === 0,
    subcommand: opts.subcommand,
    exitCode,
    argv,
    defoldVersion: head.version,
    defoldChannel: head.channel,
    defoldSha: head.sha,
    ...(output !== undefined ? { output } : {}),
  };
}

export interface PrepareBobRunResult {
  readonly ok: boolean;
  readonly buildExitCode: number;
  readonly runnable?: Runnable;
  readonly error?: string;
}

// Persist the resolved engine path where the `run` resolver reads it, so a later
// top-level `run` finds the same cached engine.
async function writeEngineMarker(cwd: string, enginePath: string): Promise<void> {
  const markerPath = join(cwd, ENGINE_MARKER_REL);
  mkdirSync(dirname(markerPath), { recursive: true });
  await writeFile(markerPath, `${enginePath}\n`);
}

// `bob run` composite (Bob has no native run): debug-build, ensure a
// target-matched engine exists — a native-extension build engine, else the stock
// engine fetched by the resolved sha — and resolve the same Runnable `run`
// launches. A build failure short-circuits with Bob's exit code. No interactive
// spawn here; the dispatch branch drives `launchEngine` so exit-code/signal
// semantics match top-level run.
export async function prepareBobRun(opts: {
  cwd: string;
  head: { readonly version: string; readonly channel: string | null; readonly sha: string };
  java?: string;
  buildServer?: string;
  io: DefoldIo & { readonly platform: NodeJS.Platform; readonly arch: string };
  writeMarker?: (cwd: string, enginePath: string) => Promise<void>;
  readEngineMarker?: (cwd: string) => string | null;
}): Promise<PrepareBobRunResult> {
  const { cwd, head, io } = opts;
  const writeMarker = opts.writeMarker ?? writeEngineMarker;

  const build = await runBobCommand({
    cwd,
    subcommand: "build",
    ...(opts.java !== undefined ? { java: opts.java } : {}),
    ...(opts.buildServer !== undefined ? { buildServer: opts.buildServer } : {}),
    head,
    io,
  });
  if (build.exitCode !== 0) {
    return { ok: false, buildExitCode: build.exitCode };
  }

  const target = targetPlatform(io.platform, io.arch);
  const buildEnginePath = join(cwd, "build", target.buildFolder, target.executable);
  if (!io.probe(buildEnginePath)) {
    // The engine cache is a sibling of the injected bob cacheDir, so tests reach
    // it through the same seam and stay offline.
    const enginePath = engineCachePath({
      sha: head.sha,
      enginePlatform: target.enginePlatform,
      executable: target.executable,
      cacheDir: join(dirname(io.cacheDir), "engine"),
    });
    if (!io.probe(enginePath)) {
      try {
        await io.download(
          engineDownloadUrl(head.sha, target.enginePlatform, target.executable),
          enginePath,
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          buildExitCode: build.exitCode,
          error: `defold-typescript bob run: could not download the Defold engine for ${target.enginePlatform} at ${head.sha}: ${detail}`,
        };
      }
    }
    await writeMarker(cwd, enginePath);
  }

  try {
    const runnable = resolveRunnable({
      cwd,
      platform: io.platform,
      arch: io.arch,
      probe: io.probe,
      ...(opts.readEngineMarker !== undefined ? { readEngineMarker: opts.readEngineMarker } : {}),
    });
    return { ok: true, buildExitCode: build.exitCode, runnable };
  } catch (err) {
    return {
      ok: false,
      buildExitCode: build.exitCode,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface BobStatusIo extends ChannelInfoIo {
  readonly probe: (candidate: string) => boolean;
  readonly javaProbe: (cmd: string) => boolean;
  readonly bundledJava?: () => string | null;
}

export interface BobStatus {
  readonly ok: boolean;
  readonly target: DefoldTarget;
  readonly version: string | null;
  readonly channel: DefoldChannel | null;
  readonly sha: string | null;
  readonly bobJar: { readonly path: string | null; readonly cached: boolean };
  readonly java: string | null;
  readonly error?: string;
}

// resolveJava throws when nothing is found; status reports Java as absent
// rather than failing, so a missing runtime is never fatal here.
function resolveJavaOrNull(io: BobStatusIo, override?: string): string | null {
  try {
    return resolveJava({
      ...(override !== undefined ? { override } : {}),
      probe: io.javaProbe,
      ...(io.bundledJava !== undefined ? { bundledJava: io.bundledJava } : {}),
    });
  } catch {
    return null;
  }
}

// Read-only pre-flight: resolve the target head, locate the sha-keyed jar, and
// report Java, without downloading the jar or running Bob. A channel resolves
// its head via a metadata fetch; offline leaves the sha-dependent fields
// unresolved and marks the report not-ok.
export async function reportBobStatus(opts: {
  target: DefoldTarget;
  cacheDir: string;
  java?: string;
  io: BobStatusIo;
}): Promise<BobStatus> {
  const { target, cacheDir, io } = opts;
  const java = resolveJavaOrNull(io, opts.java);
  const channel = target.kind === "channel" ? target.channel : null;
  let head: ResolvedTargetHead;
  try {
    head = await resolveTargetHead(target, io);
  } catch (err) {
    return {
      ok: false,
      target,
      version: target.kind === "version" ? target.version : null,
      channel,
      sha: null,
      bobJar: { path: null, cached: false },
      java,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const jar = head.sha
    ? resolveBobJar({ sha1: head.sha, cacheDir, probe: io.probe })
    : { jarPath: null, cached: false };
  return {
    ok: true,
    target,
    version: head.version,
    channel: head.channel,
    sha: head.sha,
    bobJar: { path: jar.jarPath, cached: jar.cached },
    java,
  };
}

function javaOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const pathVar = env.PATH ?? env.Path ?? "";
  const exts = process.platform === "win32" ? [".exe", ".bat", ".cmd", ""] : [""];
  for (const dir of pathVar.split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      if (existsSync(join(dir, cmd + ext))) {
        return true;
      }
    }
  }
  return false;
}

// Under --json the CLI keeps stdout to a single JSON line, so bob must not
// share the inherited fd. Cap the diagnostic tail so a chatty build cannot
// bloat the envelope.
const OUTPUT_TAIL_LIMIT = 4000;

function spawnInherit(argv: string[], cwd: string): Promise<SpawnResult> {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    throw new Error("defold-typescript: cannot spawn an empty command.");
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ exitCode: code ?? 1 }));
  });
}

function spawnCapture(argv: string[], cwd: string): Promise<SpawnResult> {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    throw new Error("defold-typescript: cannot spawn an empty command.");
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr?.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      const combined = `${stdout}${stderr}`.trim();
      const output =
        combined.length > OUTPUT_TAIL_LIMIT ? combined.slice(-OUTPUT_TAIL_LIMIT) : combined;
      resolve({ exitCode: code ?? 1, output });
    });
  });
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `defold-typescript: bob.jar download failed (${url} -> ${res.status} ${res.statusText}).`,
    );
  }
  mkdirSync(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

export function defaultDefoldIo(): DefoldIo {
  return {
    cacheDir: bobCacheDir(),
    probe: existsSync,
    javaProbe: (cmd) => javaOnPath(cmd),
    bundledJava: () => detectEditorBundledJava(),
    spawn: (argv, cwd, opts) => (opts?.capture ? spawnCapture(argv, cwd) : spawnInherit(argv, cwd)),
    download: downloadTo,
  };
}

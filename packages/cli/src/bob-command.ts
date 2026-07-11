import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { bobCacheDir, bobDownloadUrl, resolveBobJar, resolveJava } from "./bob";
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

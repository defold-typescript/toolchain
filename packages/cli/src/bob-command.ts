import { existsSync, mkdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { bobCacheDir, bobDownloadUrl, resolveBobJar, resolveJava } from "./bob";
import { ENGINE_INFO_URL } from "./debug-launcher";
import { detectEditorBundledJava } from "./installed-editor-version";

export const DEFOLD_SUBCOMMANDS = ["resolve", "build", "bundle"] as const;
export type DefoldSubcommand = (typeof DEFOLD_SUBCOMMANDS)[number];

export function isDefoldSubcommand(value: string | undefined): value is DefoldSubcommand {
  return value !== undefined && (DEFOLD_SUBCOMMANDS as readonly string[]).includes(value);
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
        `defold-typescript: unknown defold subcommand "${opts.subcommand}"; expected resolve|build|bundle.`,
      );
  }
}

export interface DefoldIo {
  readonly cacheDir: string;
  readonly fetchSha: () => Promise<string>;
  readonly probe: (candidate: string) => boolean;
  readonly javaProbe: (cmd: string) => boolean;
  readonly bundledJava?: () => string | null;
  readonly spawn: (argv: string[], cwd: string) => Promise<number>;
  readonly download: (url: string, dest: string) => Promise<void>;
}

export interface DefoldCommandResult {
  readonly ok: boolean;
  readonly subcommand: string;
  readonly exitCode: number;
  readonly argv: string[];
}

export async function runDefoldCommand(opts: {
  cwd: string;
  subcommand: string;
  java?: string;
  buildServer?: string;
  io: DefoldIo;
}): Promise<DefoldCommandResult> {
  const { io } = opts;
  const sha = await io.fetchSha();
  const { jarPath, cached } = resolveBobJar({
    sha1: sha,
    cacheDir: io.cacheDir,
    probe: io.probe,
  });
  if (!cached) {
    await io.download(bobDownloadUrl(sha), jarPath);
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
  const exitCode = await io.spawn(argv, opts.cwd);
  return { ok: exitCode === 0, subcommand: opts.subcommand, exitCode, argv };
}

async function fetchStableSha(): Promise<string> {
  const res = await fetch(ENGINE_INFO_URL);
  if (!res.ok) {
    throw new Error(
      `defold-typescript: could not resolve the stable Defold sha (${ENGINE_INFO_URL} -> ${res.status} ${res.statusText}).`,
    );
  }
  const info = (await res.json()) as { sha1?: string };
  if (!info.sha1) {
    throw new Error(`defold-typescript: ${ENGINE_INFO_URL} returned no sha1.`);
  }
  return info.sha1;
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

async function spawnInherit(argv: string[], cwd: string): Promise<number> {
  const proc = Bun.spawn(argv, { cwd, stdio: ["inherit", "inherit", "inherit"] });
  return proc.exited;
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `defold-typescript: bob.jar download failed (${url} -> ${res.status} ${res.statusText}).`,
    );
  }
  mkdirSync(dirname(dest), { recursive: true });
  await Bun.write(dest, res);
}

export function defaultDefoldIo(): DefoldIo {
  return {
    cacheDir: bobCacheDir(),
    fetchSha: fetchStableSha,
    probe: existsSync,
    javaProbe: (cmd) => javaOnPath(cmd),
    bundledJava: () => detectEditorBundledJava(),
    spawn: spawnInherit,
    download: downloadTo,
  };
}

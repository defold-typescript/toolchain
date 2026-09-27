import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { engineCacheDir, engineCachePath } from "../../cli/src/bob";
import { defaultDefoldIo, runBobCommand } from "../../cli/src/bob-command";
import { runBuild } from "../../cli/src/build";
import { engineDownloadUrl, targetPlatform } from "../../cli/src/debug-launcher";
import { type EngineProcess, launchEngine } from "../../cli/src/engine-launch";
import type { ApiTarget } from "../../types/scripts/regen";
import { BOX2D_BACKENDS, type Box2DBackend } from "./contexts";
import { type ProbeOutcome, parseProbeLine } from "./outcome";
import { generateProbes, type ProbeCall, probeTarget } from "./witness";

const PROJECT_DIR = resolve(import.meta.dir, "..", "project");
const TYPES_DIR = resolve(import.meta.dir, "..", "..", "types");
const BUILD_SERVER = "https://build.defold.com";
const V3_MANIFEST = "/box2d-v3.appmanifest";

export interface ProbePass {
  readonly backend: Box2DBackend;
  readonly calls: readonly ProbeCall[];
  readonly outcomes: readonly ProbeOutcome[];
  readonly done: boolean;
  readonly log: string;
}

export interface ProbeRun {
  readonly target: string;
  readonly passes: readonly ProbePass[];
}

export interface RunProbeOptions {
  readonly target?: ApiTarget;
  readonly timeoutMs?: number;
  readonly progress?: (line: string) => void;
}

interface EngineHead {
  readonly version: string;
  readonly channel: null;
  readonly sha: string;
}

// The engine a target's declarations were generated from: the Defold tag and
// commit its vendored engine bindings pin.
export function engineHead(target: ApiTarget): EngineHead {
  const manifest = JSON.parse(
    readFileSync(join(TYPES_DIR, target.fixturesDir, "engine-bindings", "manifest.json"), "utf8"),
  ) as { tag: string; commit: string };
  return { version: manifest.tag, channel: null, sha: manifest.commit };
}

// Runs the engine from the temporary project, so a call that writes a relative
// path (`sys.save("probe", ...)`) writes there.
function captureSpawn(
  cwd: string,
  output: string[],
  timeoutMs: number,
  progress?: (line: string) => void,
): (argv: string[]) => EngineProcess {
  return (argv) => {
    const [cmd, ...args] = argv;
    if (cmd === undefined) throw new Error("api-probe: empty engine command");
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let pending = "";
    const onData = (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        output.push(line);
        progress?.(line);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const exited = new Promise<number>((resolveExit, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (pending.length > 0) output.push(pending);
        resolveExit(code ?? 1);
      });
    });
    return { kill: (signal) => void child.kill(signal), exited };
  };
}

// The v2 pass runs the stock engine rather than `dmengine_headless`: the
// headless build links none of the extension-registered modules (`b2d`,
// `camera`, `model`, `font`, `image`, `material`, `compute`, `crash`), so it
// cannot run a third of the surface. Both engines open a window and need a
// display.
async function stockEngine(head: EngineHead): Promise<string> {
  const platform = targetPlatform(process.platform, process.arch);
  const enginePath = engineCachePath({
    sha: head.sha,
    enginePlatform: platform.enginePlatform,
    executable: platform.executable,
    cacheDir: engineCacheDir(),
  });
  if (!existsSync(enginePath)) {
    await defaultDefoldIo().download(
      engineDownloadUrl(head.sha, platform.enginePlatform, platform.executable),
      enginePath,
    );
  }
  return enginePath;
}

// bob writes a custom engine under the host's build folder; on macOS that
// folder is `<arch>-osx`, not the `<arch>-macos` the engine archive uses.
function builtEngine(cwd: string): string {
  const platform = targetPlatform(process.platform, process.arch);
  const folders = [platform.buildFolder, platform.buildFolder.replace(/-macos$/, "-osx")];
  for (const folder of folders) {
    const enginePath = join(cwd, "build", folder, platform.executable);
    if (existsSync(enginePath)) return enginePath;
  }
  throw new Error(
    `api-probe: bob built no engine under ${join(cwd, "build")} (${folders.join(", ")})`,
  );
}

async function runPass(
  target: ApiTarget,
  backend: Box2DBackend,
  opts: RunProbeOptions,
): Promise<ProbePass> {
  const generation = generateProbes(target, backend);
  const head = engineHead(target);

  const cwd = mkdtempSync(join(tmpdir(), `defold-api-probe-${backend}-`));
  cpSync(PROJECT_DIR, cwd, { recursive: true });
  for (const [file, source] of Object.entries(generation.files)) {
    writeFileSync(join(cwd, "main", file), source);
  }
  if (backend === "v3") {
    const project = join(cwd, "game.project");
    writeFileSync(
      project,
      `${readFileSync(project, "utf8")}\n[native_extension]\napp_manifest = ${V3_MANIFEST}\n`,
    );
  }
  runBuild({ cwd });

  const bob = await runBobCommand({
    cwd,
    subcommand: "build",
    capture: true,
    head,
    io: defaultDefoldIo(),
    ...(backend === "v3" ? { buildServer: BUILD_SERVER } : {}),
  });
  if (!bob.ok) {
    throw new Error(`api-probe: bob build failed in ${cwd}\n${bob.output ?? ""}`);
  }

  const enginePath = backend === "v3" ? builtEngine(cwd) : await stockEngine(head);
  const output: string[] = [];
  await launchEngine(
    {
      enginePath,
      projectcPath: join(cwd, "build", "default", "game.projectc"),
      target: targetPlatform(process.platform, process.arch),
      warnings: [],
    },
    {
      platform: process.platform,
      spawn: captureSpawn(cwd, output, opts.timeoutMs ?? 120_000, opts.progress),
      chmod: (path, mode) => chmodSync(path, mode),
    },
  );

  return {
    backend,
    calls: generation.calls,
    outcomes: output.flatMap((line) => parseProbeLine(line) ?? []),
    done: output.some((line) => line.includes("PROBE_DONE")),
    log: output.join("\n"),
  };
}

// Builds the probe project with the generated calls through `runBuild` and bob,
// once per Box2D backend, runs each build in the engine, and returns every
// `PROBE` line it printed.
export async function runProbe(opts: RunProbeOptions = {}): Promise<ProbeRun> {
  const target = opts.target ?? probeTarget();
  const passes: ProbePass[] = [];
  for (const backend of BOX2D_BACKENDS) passes.push(await runPass(target, backend, opts));
  return { target: target.id, passes };
}

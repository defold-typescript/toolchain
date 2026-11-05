import { chmodSync, cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AVAILABILITY_JSON, readSupportedVersions } from "../../../scripts/sync-readme";
import { defaultDefoldIo, runBobCommand } from "../../cli/src/bob-command";
import { runBuild } from "../../cli/src/build";
import { targetPlatform } from "../../cli/src/debug-launcher";
import { launchEngine } from "../../cli/src/engine-launch";
import { captureSpawn, engineHead, stockEngine } from "./run-probe";
import { probeTarget } from "./witness";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const SMOKE_DIR = resolve(import.meta.dir, "..", "ecs-smoke-project");
const TRACE_PREFIX = "ECS\t";
const VERSION_PREFIX = "ECS_VERSION\t";
const DONE_MARKER = "ECS_DONE";

export interface EcsSmokeRun {
  /** The Defold version the project was built and run for. */
  readonly version: string;
  /** What the engine's `sys.get_engine_info().version` returned. */
  readonly reportedVersion: string | undefined;
  /** The text after `ECS\t` on each trace line, in print order. */
  readonly trace: readonly string[];
  readonly done: boolean;
  readonly log: string;
}

/**
 * The Defold versions the toolchain supports, read from the file the guide's
 * supported-versions line is generated from. `PROBE_TARGET` narrows the list to
 * the version its `defold-<version>` id names.
 */
export function smokeVersions(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const versions = readSupportedVersions(
    readFileSync(resolve(REPO_ROOT, AVAILABILITY_JSON), "utf8"),
  );
  const target = env.PROBE_TARGET;
  if (target === undefined) return versions;
  const picked = versions.filter((version) => `defold-${version}` === target);
  if (picked.length === 0) {
    throw new Error(
      `ecs-smoke: PROBE_TARGET ${target} names no supported Defold version (${versions.join(", ")})`,
    );
  }
  return picked;
}

function parseSmokeLog(version: string, output: readonly string[]): EcsSmokeRun {
  const trace: string[] = [];
  let reportedVersion: string | undefined;
  let done = false;
  for (const line of output) {
    const traceAt = line.indexOf(TRACE_PREFIX);
    if (traceAt !== -1) {
      trace.push(line.slice(traceAt + TRACE_PREFIX.length).trimEnd());
      continue;
    }
    const versionAt = line.indexOf(VERSION_PREFIX);
    if (versionAt !== -1) {
      reportedVersion = line.slice(versionAt + VERSION_PREFIX.length).trim();
      continue;
    }
    if (line.includes(DONE_MARKER)) done = true;
  }
  return { version, reportedVersion, trace, done, log: output.join("\n") };
}

// Builds the smoke project through `build` and bob as a user project is built,
// with the bob and stock engine of `version`'s pinned commit, and returns what
// the controller printed. A run that never prints ECS_DONE returns `done: false`
// rather than throwing, so the other versions' results stay readable.
export async function runEcsSmoke(version: string, timeoutMs = 120_000): Promise<EcsSmokeRun> {
  const head = engineHead(probeTarget(`defold-${version}`));
  const io = defaultDefoldIo();
  const cwd = mkdtempSync(join(tmpdir(), "defold-ecs-smoke-"));
  cpSync(SMOKE_DIR, cwd, { recursive: true });

  runBuild({ cwd, defoldVersion: version });
  const bob = await runBobCommand({ cwd, subcommand: "build", capture: true, head, io });
  if (!bob.ok) {
    throw new Error(`ecs-smoke: bob build for ${version} failed in ${cwd}\n${bob.output ?? ""}`);
  }

  const output: string[] = [];
  await launchEngine(
    {
      enginePath: await stockEngine(head),
      projectcPath: join(cwd, "build", "default", "game.projectc"),
      target: targetPlatform(process.platform, process.arch),
      warnings: [],
    },
    {
      platform: process.platform,
      spawn: captureSpawn(cwd, output, timeoutMs),
      chmod: (path, mode) => chmodSync(path, mode),
    },
  );
  return parseSmokeLog(version, output);
}

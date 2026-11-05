import { chmodSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultDefoldIo, runBobCommand } from "../../cli/src/bob-command";
import { runBuild } from "../../cli/src/build";
import { targetPlatform } from "../../cli/src/debug-launcher";
import { launchEngine } from "../../cli/src/engine-launch";
import { captureSpawn, engineHead, stockEngine } from "./run-probe";
import { probeTarget } from "./witness";

const BENCH_DIR = resolve(import.meta.dir, "..", "bench", "ecs");
const BENCH_PREFIX = "BENCH\t";
const DONE_MARKER = "BENCH_DONE";

const SCENARIO_FIELDS = [
  "allocFrames",
  "timedFrames",
  "entities",
  "allocProcessCalls",
  "timedProcessCalls",
  "allocAdds",
  "allocRemoves",
  "timedAdds",
  "timedRemoves",
  "avgMs",
  "maxMs",
  "allocatingFrames",
  "heapKb",
  "timedHeapProbes",
] as const;

/** One scenario's numbers; a field the engine never printed reads as `NaN`. */
export type EcsBenchScenario = Record<(typeof SCENARIO_FIELDS)[number], number>;

export interface EcsBenchRun {
  /** The Defold version the project was built and run for. */
  readonly version: string;
  /** What the engine's `sys.get_engine_info().version` returned. */
  readonly reportedVersion: string | undefined;
  /** What the engine's `sys.get_sys_info().system_name` returned. */
  readonly system: string | undefined;
  readonly steady: EcsBenchScenario;
  readonly churn: EcsBenchScenario;
  readonly done: boolean;
  readonly log: string;
}

function parseBenchLog(version: string, output: readonly string[]): EcsBenchRun {
  const fields = new Map<string, string>();
  let done = false;
  for (const line of output) {
    const at = line.indexOf(BENCH_PREFIX);
    if (at !== -1) {
      const [scenario, field, value] = line.slice(at + BENCH_PREFIX.length).split("\t");
      if (scenario !== undefined && field !== undefined && value !== undefined) {
        fields.set(`${scenario}\t${field}`, value.trim());
      }
      continue;
    }
    if (line.includes(DONE_MARKER)) done = true;
  }
  const scenario = (name: string): EcsBenchScenario => {
    const numbers: Partial<EcsBenchScenario> = {};
    for (const field of SCENARIO_FIELDS) {
      numbers[field] = Number(fields.get(`${name}\t${field}`));
    }
    return numbers as EcsBenchScenario;
  };
  return {
    version,
    reportedVersion: fields.get("run\tengine"),
    system: fields.get("run\tsystem"),
    steady: scenario("steady"),
    churn: scenario("churn"),
    done,
    log: output.join("\n"),
  };
}

// Builds the bench project through `build` and bob as a user project is built,
// with the bob and stock engine of `version`'s pinned commit, and returns what
// the controller printed. A run that never prints BENCH_DONE returns `done:
// false` rather than throwing, so the other versions' results stay readable.
export async function runEcsBench(version: string, timeoutMs = 120_000): Promise<EcsBenchRun> {
  const head = engineHead(probeTarget(`defold-${version}`));
  const io = defaultDefoldIo();
  const cwd = mkdtempSync(join(tmpdir(), "defold-ecs-bench-"));
  cpSync(BENCH_DIR, cwd, { recursive: true });

  runBuild({ cwd, defoldVersion: version });
  const bob = await runBobCommand({ cwd, subcommand: "build", capture: true, head, io });
  if (!bob.ok) {
    throw new Error(`ecs-bench: bob build for ${version} failed in ${cwd}\n${bob.output ?? ""}`);
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
  return parseBenchLog(version, output);
}

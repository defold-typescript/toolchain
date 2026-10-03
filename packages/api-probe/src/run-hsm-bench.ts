import { chmodSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultDefoldIo, runBobCommand } from "../../cli/src/bob-command";
import { runBuild } from "../../cli/src/build";
import { targetPlatform } from "../../cli/src/debug-launcher";
import { launchEngine } from "../../cli/src/engine-launch";
import { runResolve } from "../../cli/src/resolve";
import { captureSpawn, engineHead, stockEngine } from "./run-probe";
import { probeTarget } from "./witness";

const BENCH_DIR = resolve(import.meta.dir, "..", "bench", "hsm");

export interface HsmBenchReport {
  readonly frames: number;
  readonly enemies: number;
  readonly avgMs: number;
  readonly maxMs: number;
  readonly updateKb: number;
  readonly sendKb: number;
  readonly updateAllocs: number;
  readonly sendAllocs: number;
  readonly sends: number;
  readonly fps: number;
  readonly memKb: number;
  readonly engine: string;
  readonly system: string;
}

const NUMBER_FIELDS = [
  "frames",
  "enemies",
  "avgMs",
  "maxMs",
  "updateKb",
  "sendKb",
  "updateAllocs",
  "sendAllocs",
  "sends",
  "fps",
  "memKb",
] as const;

function parseBenchLog(output: readonly string[]): HsmBenchReport {
  const log = output.join("\n");
  if (!output.some((line) => line.includes("BENCH_DONE"))) {
    throw new Error(`hsm-bench: the engine never printed BENCH_DONE\n${log}`);
  }
  const fields = new Map<string, string>();
  for (const line of output) {
    const at = line.indexOf("BENCH\t");
    if (at === -1) continue;
    const [field, value] = line.slice(at + "BENCH\t".length).split("\t");
    if (field !== undefined && value !== undefined) fields.set(field, value.trim());
  }
  const read = (field: string): string => {
    const value = fields.get(field);
    if (value === undefined) throw new Error(`hsm-bench: no BENCH ${field} line\n${log}`);
    return value;
  };
  const numbers = Object.fromEntries(NUMBER_FIELDS.map((field) => [field, Number(read(field))]));
  return {
    ...(numbers as Record<(typeof NUMBER_FIELDS)[number], number>),
    engine: read("engine"),
    system: read("system"),
  };
}

// Builds the bench project through `resolve`, `build` and bob exactly as a user
// project is built, runs it in the stock engine of the default target, and
// returns what the controller printed.
export async function runHsmBench(timeoutMs = 120_000): Promise<HsmBenchReport> {
  const head = engineHead(probeTarget());
  const io = defaultDefoldIo();
  const cwd = mkdtempSync(join(tmpdir(), "defold-hsm-bench-"));
  cpSync(BENCH_DIR, cwd, { recursive: true });

  // bob `build` does not fetch libraries, so `metrics` must be resolved first.
  const fetched = await runBobCommand({ cwd, subcommand: "resolve", capture: true, head, io });
  if (!fetched.ok) {
    throw new Error(`hsm-bench: bob resolve failed in ${cwd}\n${fetched.output ?? ""}`);
  }
  const resolved = await runResolve({ cwd });
  if (!resolved.ok) {
    throw new Error(`hsm-bench: resolve failed in ${cwd}: ${resolved.error ?? ""}`);
  }
  runBuild({ cwd });
  const bob = await runBobCommand({ cwd, subcommand: "build", capture: true, head, io });
  if (!bob.ok) {
    throw new Error(`hsm-bench: bob build failed in ${cwd}\n${bob.output ?? ""}`);
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
  return parseBenchLog(output);
}

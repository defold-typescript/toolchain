import * as path from "node:path";

// Single verb for "regenerate every committed generated artifact". A Defold
// version bump touches four independent generators; running three of four
// leaves the fourth stale, caught only by a drift test. This chains all four
// in dependency order so the bump orchestrator and a human reuse one command.

const REPO_ROOT = path.resolve(import.meta.dir, "..");

export type RegenUnitId = "declarations" | "availability" | "signatures" | "llms";

export interface RegenUnit {
  readonly id: RegenUnitId;
  readonly command: readonly string[];
}

// Declarations regenerate first because the availability and signatures
// artifacts read the emitted `.d.ts` surface; the llms corpus folds in every
// other artifact, so it is written last. The two path-form generators are
// invoked directly (not via `bun --filter`) because argument forwarding through
// a filtered package script is unreliable, and both resolve their output paths
// from `import.meta.dir`, so cwd does not matter.
export const REGEN_UNITS: readonly RegenUnit[] = [
  { id: "declarations", command: ["bun", "--filter", "@defold-typescript/types", "regen"] },
  {
    id: "availability",
    command: ["bun", "packages/types/scripts/generate-api-availability.ts", "--write"],
  },
  {
    id: "signatures",
    command: ["bun", "packages/types/scripts/generate-api-signatures.ts", "--write"],
  },
  { id: "llms", command: ["bun", "--filter", "@defold-typescript/docs-site", "build-llms"] },
];

export interface RegenSummary {
  readonly ok: boolean;
  readonly ran: RegenUnitId[];
  readonly failed?: RegenUnitId;
}

export function plan(): { id: RegenUnitId; command: string }[] {
  return REGEN_UNITS.map((unit) => ({ id: unit.id, command: unit.command.join(" ") }));
}

export function runRegenSequence(run: (unit: RegenUnit) => boolean): RegenSummary {
  const ran: RegenUnitId[] = [];
  for (const unit of REGEN_UNITS) {
    if (!run(unit)) {
      return { ok: false, ran, failed: unit.id };
    }
    ran.push(unit.id);
  }
  return { ok: true, ran };
}

// Stream sinks so the CLI's routing is testable without spawning real
// generators. In `--json` mode the summary object is the only thing on stdout;
// banners and child output are diverted to stderr so a machine consumer can
// `JSON.parse` stdout directly.
export interface RegenIo {
  readonly stdout: (c: string) => void;
  readonly stderr: (c: string) => void;
}

export type ExecUnit = (unit: RegenUnit, json: boolean, io: RegenIo) => boolean;

export function runRegenCli(argv: readonly string[], exec: ExecUnit, io: RegenIo): number {
  const json = argv.includes("--json");
  const banner = json ? io.stderr : io.stdout;

  if (argv.includes("--plan")) {
    const units = plan();
    if (json) {
      io.stdout(`${JSON.stringify({ plan: units })}\n`);
    } else {
      for (const unit of units) {
        io.stdout(`${unit.id}: ${unit.command}\n`);
      }
    }
    return 0;
  }

  const summary = runRegenSequence((unit) => {
    banner(`$ ${unit.command.join(" ")}\n`);
    return exec(unit, json, io);
  });
  if (json) {
    io.stdout(`${JSON.stringify(summary)}\n`);
  } else if (summary.ok) {
    io.stdout(`regen:all — regenerated ${summary.ran.length} artifact set(s)\n`);
  } else {
    io.stderr(`regen:all FAILED at \`${summary.failed}\`\n`);
  }
  return summary.ok ? 0 : 1;
}

export function execUnit(unit: RegenUnit, json: boolean, io: RegenIo): boolean {
  const proc = Bun.spawnSync([...unit.command], {
    cwd: REPO_ROOT,
    // pipe-and-forward in json mode keeps child stdout off the parent's stdout
    // (buffered, not live — fine for machine-consumed json); inherit otherwise.
    stdout: json ? "pipe" : "inherit",
    stderr: "inherit",
  });
  if (json && proc.stdout) {
    io.stderr(new TextDecoder().decode(proc.stdout));
  }
  return proc.exitCode === 0;
}

if (import.meta.main) {
  process.exit(
    runRegenCli(process.argv.slice(2), execUnit, {
      stdout: (c) => process.stdout.write(c),
      stderr: (c) => process.stderr.write(c),
    }),
  );
}

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

function spawn(unit: RegenUnit): boolean {
  process.stdout.write(`$ ${unit.command.join(" ")}\n`);
  const proc = Bun.spawnSync([...unit.command], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exitCode === 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");

  if (args.includes("--plan")) {
    const units = plan();
    if (json) {
      process.stdout.write(`${JSON.stringify({ plan: units })}\n`);
    } else {
      for (const unit of units) {
        process.stdout.write(`${unit.id}: ${unit.command}\n`);
      }
    }
    process.exit(0);
  }

  const summary = runRegenSequence(spawn);
  if (json) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else if (summary.ok) {
    process.stdout.write(`regen:all — regenerated ${summary.ran.length} artifact set(s)\n`);
  } else {
    process.stderr.write(`regen:all FAILED at \`${summary.failed}\`\n`);
  }
  process.exit(summary.ok ? 0 : 1);
}

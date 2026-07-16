import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { runBumpCheck } from "./bump-defold-check.ts";
import {
  classifyTransition,
  fixtureDir,
  RELEASE_MODEL,
  type ReleaseTransition,
  type TargetMeta,
  targetMetaFor,
} from "./release-model.ts";

// One verb for the mechanical half of a Defold version bump: validate the
// target, run the fail-closed release import, sync the ref-doc fixtures, rewrite
// `api-targets.json` metadata (in place for a patch, add-default + demote-prior
// for a minor), and regenerate every committed artifact — then report the
// review points a human still owns. Publication stays separate: this never
// calls `scripts/release.ts`.

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const TARGETS_PATH = path.join(REPO_ROOT, "packages/types/api-targets.json");

export type BumpStageId = "validate" | "import" | "sync" | "target-metadata" | "regen";

// The side-effecting stages the orchestrator drives through the seam, in order.
// `validate` is pure planning (classify + reject no-op/downgrade) and runs
// inside planBump, before any stage touches disk — so it is never in this list.
export const BUMP_STAGES: readonly BumpStageId[] = ["import", "sync", "target-metadata", "regen"];

export type TargetOpKind = "in-place" | "add-default" | "demote";

export interface TargetOp {
  readonly kind: TargetOpKind;
  readonly version: string;
  readonly meta: TargetMeta;
}

export interface BumpPlan {
  readonly to: string;
  readonly from: string;
  readonly transition: ReleaseTransition;
  readonly stages: readonly BumpStageId[];
  readonly targetOps: readonly TargetOp[];
}

export class BumpValidationError extends Error {}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const delta = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

export function planBump(to: string, model = RELEASE_MODEL): BumpPlan {
  if (!/^\d+\.\d+\.\d+$/.test(to)) {
    throw new BumpValidationError(`invalid target version '${to}' — expected major.minor.patch`);
  }
  const from = model.current;
  const order = compareVersions(to, from);
  if (order === 0) {
    throw new BumpValidationError(`'${to}' is already the current default — nothing to bump`);
  }
  if (order < 0) {
    throw new BumpValidationError(`'${to}' is a downgrade from '${from}' — refusing`);
  }
  const transition = classifyTransition(from, to);
  const targetOps: TargetOp[] =
    transition === "patch"
      ? [{ kind: "in-place", version: to, meta: targetMetaFor(to, { isDefault: true }) }]
      : [
          { kind: "add-default", version: to, meta: targetMetaFor(to, { isDefault: true }) },
          { kind: "demote", version: from, meta: targetMetaFor(from, { isDefault: false }) },
        ];
  return { to, from, transition, stages: BUMP_STAGES, targetOps };
}

export interface StageContext {
  readonly to: string;
  readonly from: string;
  readonly transition: ReleaseTransition;
  readonly plan: BumpPlan;
}

export interface StageResult {
  readonly ok: boolean;
  // import only: whether the release import reported `ready`. A blocked import
  // (`ready === false`) aborts the orchestrator before any other stage writes.
  readonly ready?: boolean;
  readonly blockers?: readonly string[];
}

export type RunStage = (stage: BumpStageId, ctx: StageContext) => StageResult;

// The genuinely human review points a bump still owns. The orchestrator reports
// them rather than silently automating (and getting wrong) work a person must
// judge — migration curation, the manifest release tag, the upgrade guide.
export function remainingHumanDecisions(plan: BumpPlan): string[] {
  const decisions = [
    `curate api-migrations.json for the ${plan.from} -> ${plan.to} transition (never auto-edited)`,
    `re-confirm the import-manifest.json release tag matches the intended ${plan.to} build`,
    `author the ${plan.to} upgrade guide`,
  ];
  if (plan.transition === "minor") {
    decisions.push(`review the demoted defold-${plan.from} surface under generated/versions/`);
  }
  return decisions;
}

export interface BumpSummary {
  readonly command: "bump:defold";
  readonly ok: boolean;
  readonly to: string;
  readonly transition?: ReleaseTransition;
  readonly ran: BumpStageId[];
  readonly remainingHumanDecisions: string[];
  readonly failedStage?: BumpStageId;
  readonly blockers?: string[];
  readonly error?: string;
}

export function runBump(opts: {
  to: string;
  runStage: RunStage;
  model?: typeof RELEASE_MODEL;
}): BumpSummary {
  let plan: BumpPlan;
  try {
    plan = planBump(opts.to, opts.model);
  } catch (error) {
    return {
      command: "bump:defold",
      ok: false,
      to: opts.to,
      ran: [],
      remainingHumanDecisions: [],
      failedStage: "validate",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const ctx: StageContext = { to: plan.to, from: plan.from, transition: plan.transition, plan };
  const ran: BumpStageId[] = [];
  for (const stage of plan.stages) {
    const result = opts.runStage(stage, ctx);
    ran.push(stage);
    const blockedImport = stage === "import" && result.ready === false;
    if (!result.ok || blockedImport) {
      return {
        command: "bump:defold",
        ok: false,
        to: plan.to,
        transition: plan.transition,
        ran,
        remainingHumanDecisions: [],
        failedStage: stage,
        ...(result.blockers ? { blockers: [...result.blockers] } : {}),
      };
    }
  }

  return {
    command: "bump:defold",
    ok: true,
    to: plan.to,
    transition: plan.transition,
    ran,
    remainingHumanDecisions: remainingHumanDecisions(plan),
  };
}

interface TargetEntry {
  id: string;
  default: boolean;
  fixturesDir: string;
  generatedDir: string;
  coreTypesImport: string;
  source: unknown;
  modules: unknown[];
  luaStdlib?: unknown[];
}

// Programmatically apply a plan's target operations to `api-targets.json`, never
// by hand. A patch swaps the current default's version in place; a minor inserts
// the new version as default (inheriting the prior default's module surface as a
// starting point a human then curates) and demotes the prior default into
// `generated/versions/`.
export function applyTargetOps(plan: BumpPlan, targetsPath = TARGETS_PATH): void {
  const registry = JSON.parse(readFileSync(targetsPath, "utf8")) as { targets: TargetEntry[] };
  const priorDefault = registry.targets.find((target) => target.default);
  if (!priorDefault) throw new Error("api-targets.json has no default target");

  for (const op of plan.targetOps) {
    if (op.kind === "in-place") {
      priorDefault.id = `defold-${op.version}`;
      priorDefault.fixturesDir = op.meta.fixturesDir;
      priorDefault.generatedDir = op.meta.generatedDir;
      priorDefault.coreTypesImport = op.meta.coreTypesImport;
    } else if (op.kind === "add-default") {
      const newDefault: TargetEntry = {
        id: `defold-${op.version}`,
        default: op.meta.default,
        fixturesDir: op.meta.fixturesDir,
        generatedDir: op.meta.generatedDir,
        coreTypesImport: op.meta.coreTypesImport,
        source: null,
        modules: structuredClone(priorDefault.modules),
        ...(priorDefault.luaStdlib ? { luaStdlib: structuredClone(priorDefault.luaStdlib) } : {}),
      };
      registry.targets.unshift(newDefault);
    } else {
      priorDefault.default = op.meta.default;
      priorDefault.generatedDir = op.meta.generatedDir;
      priorDefault.coreTypesImport = op.meta.coreTypesImport;
    }
  }

  writeFileSync(targetsPath, `${JSON.stringify(registry, null, 2)}\n`);
}

function spawn(command: string[], cwd = REPO_ROOT): number {
  process.stderr.write(`$ ${command.join(" ")}\n`);
  const proc = Bun.spawnSync(command, { cwd, stdout: "inherit", stderr: "inherit" });
  return proc.exitCode ?? 1;
}

// The real stage seam: each stage is an actual child invocation (or a
// programmatic file edit). Tests inject a mock in its place, so this path is
// exercised only by a live bump.
export const defaultRunStage: RunStage = (stage, ctx) => {
  switch (stage) {
    case "import": {
      const code = spawn(["bun", "run", "import-defold-release", ctx.to]);
      return { ok: true, ready: code === 0 };
    }
    case "sync": {
      const code = spawn(["bun", "--cwd", "packages/types", "run", "sync-api-docs"]);
      return { ok: code === 0 };
    }
    case "target-metadata": {
      applyTargetOps(ctx.plan);
      const code = spawn(["bunx", "biome", "format", "--write", TARGETS_PATH]);
      return { ok: code === 0 };
    }
    case "regen": {
      const code = spawn(["bun", "scripts/regen-all.ts"]);
      return { ok: code === 0 };
    }
    default:
      return { ok: false };
  }
};

// `fixtureDir` is part of the release-model contract this orchestrator honors;
// re-export keeps the bump surface importable as one module for the runbook.
export { fixtureDir };

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const check = args.includes("--check");
  const toIndex = args.indexOf("--to");
  const to = toIndex >= 0 ? args[toIndex + 1] : undefined;

  if (check) {
    const result = runBumpCheck(REPO_ROOT);
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ command: "bump:defold", mode: "check", ok: result.ok, problems: result.problems })}\n`,
      );
    } else if (result.ok) {
      process.stdout.write("bump:defold --check: OK — release evidence complete and offline\n");
    } else {
      process.stdout.write(`bump:defold --check: BLOCKED (${result.problems.length} blocker(s))\n`);
      for (const problem of result.problems) {
        process.stdout.write(`  - [${problem.category}] ${problem.message}\n`);
      }
    }
    process.exit(result.ok ? 0 : 1);
  }
  if (!to || to.startsWith("--")) {
    process.stderr.write("usage: bump:defold --to <version> [--json]\n");
    process.exit(2);
  }

  const summary = runBump({ to, runStage: defaultRunStage });
  if (json) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else if (summary.ok) {
    process.stdout.write(`bump:defold — bumped to ${summary.to} (${summary.transition})\n`);
    process.stdout.write("remaining human decisions:\n");
    for (const decision of summary.remainingHumanDecisions) {
      process.stdout.write(`  - ${decision}\n`);
    }
  } else {
    const detail = summary.error ? `: ${summary.error}` : "";
    process.stderr.write(`bump:defold FAILED at \`${summary.failedStage}\`${detail}\n`);
    for (const blocker of summary.blockers ?? []) {
      process.stderr.write(`  blocker: ${blocker}\n`);
    }
  }
  process.exit(summary.ok ? 0 : 1);
}

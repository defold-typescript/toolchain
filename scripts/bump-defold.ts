import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { ReleaseImportManifest } from "../packages/types/scripts/import-defold-release.ts";
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
// The two files that carry the version literals the model is seeded from and the
// sync stage reads: `DEFOLD_VERSIONS` (single source of `RELEASE_MODEL`) and the
// `DEFOLD_VERSION` + fixture-dir templates sync-api-docs resolves against.
const DEFOLD_VERSION_PATH = path.join(REPO_ROOT, "packages/cli/src/defold-version.ts");
const SYNC_API_DOCS_PATH = path.join(REPO_ROOT, "packages/types/scripts/sync-api-docs.ts");

export type BumpStageId = "validate" | "import" | "rotate" | "sync" | "target-metadata" | "regen";

// The side-effecting stages the orchestrator drives through the seam, in order.
// `validate` is pure planning (classify + reject no-op/downgrade) and runs
// inside planBump, before any stage touches disk — so it is never in this list.
// `rotate` runs after a ready import so a blocked import never rewrites literals.
export const BUMP_STAGES: readonly BumpStageId[] = [
  "import",
  "rotate",
  "sync",
  "target-metadata",
  "regen",
];

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
    ran.push(stage);
    let result: StageResult;
    try {
      result = opts.runStage(stage, ctx);
    } catch (error) {
      return {
        command: "bump:defold",
        ok: false,
        to: plan.to,
        transition: plan.transition,
        ran,
        remainingHumanDecisions: [],
        failedStage: stage,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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

// Rewrite the version literals a bump makes stale, programmatically (never by
// hand) and mirroring `applyTargetOps`' path-injectable shape so tests operate
// on temp copies. `DEFOLD_VERSIONS` seeds `RELEASE_MODEL`, so it must hold
// exactly `[newCurrent, newPrevious]`; the sync file's `DEFOLD_VERSION` and both
// `fixtures/defold-<from>/` templates must retarget the new dir so the next sync
// writes core *and* extension fixtures into `fixtures/defold-<to>/`.
export function applyVersionRotation(
  plan: BumpPlan,
  paths: { versionFile?: string; syncFile?: string } = {},
): void {
  const versionFile = paths.versionFile ?? DEFOLD_VERSION_PATH;
  const syncFile = paths.syncFile ?? SYNC_API_DOCS_PATH;

  const versionSrc = readFileSync(versionFile, "utf8");
  const tuple = versionSrc.match(/DEFOLD_VERSIONS = \[[^\]]*\]/);
  if (!tuple) throw new Error(`could not find DEFOLD_VERSIONS tuple in ${versionFile}`);
  const existing = [...tuple[0].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
  // patch keeps the existing previous ([1]); minor demotes the prior current ([0]).
  const prevKept = plan.transition === "patch" ? existing[1] : existing[0];
  const rotated = `DEFOLD_VERSIONS = ["${plan.to}", "${prevKept}"]`;
  writeFileSync(versionFile, versionSrc.replace(tuple[0], rotated));

  const syncSrc = readFileSync(syncFile, "utf8")
    .replace(`DEFOLD_VERSION = "${plan.from}"`, `DEFOLD_VERSION = "${plan.to}"`)
    .split(`fixtures/defold-${plan.from}/`)
    .join(`fixtures/defold-${plan.to}/`);
  writeFileSync(syncFile, syncSrc);
}

// Where a bump routes progress vs. its machine-readable result. In `--json` mode
// only the final summary reaches `stdout`; every child's output and every
// progress banner is human noise routed to `stderr`, so the summary is the sole
// stdout document.
export interface BumpIO {
  stdout(text: string): void;
  stderr(text: string): void;
}

interface SpawnResult {
  readonly exitCode: number;
  readonly stdout: string;
}

// Run a child, forwarding its stderr (and, unless captured, its stdout) to the
// human `io.stderr` sink so `io.stdout` stays reserved for the JSON summary. When
// `capture` is set the child's stdout is returned for structured parsing instead
// of echoed anywhere.
export function spawn(
  command: string[],
  io: BumpIO,
  opts: { capture?: boolean; cwd?: string } = {},
): SpawnResult {
  io.stderr(`$ ${command.join(" ")}\n`);
  const proc = Bun.spawnSync(command, {
    cwd: opts.cwd ?? REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : "";
  const stderr = proc.stderr ? new TextDecoder().decode(proc.stderr) : "";
  if (stderr) io.stderr(stderr);
  if (!opts.capture && stdout) io.stderr(stdout);
  return { exitCode: proc.exitCode ?? 1, stdout };
}

export interface ImportOutcome {
  readonly ok: boolean;
  readonly ready: boolean;
  readonly blockers: string[];
}

// Parse the `import-defold-release --json` manifest into a structural stage
// outcome, flattening both blocker classes into human-named strings so a blocked
// import propagates *why* rather than a bare exit code.
export function importResult(child: SpawnResult): ImportOutcome {
  let manifest: ReleaseImportManifest | undefined;
  try {
    manifest = JSON.parse(child.stdout) as ReleaseImportManifest;
  } catch {
    manifest = undefined;
  }
  if (!manifest?.blockers) {
    return {
      ok: false,
      ready: false,
      blockers: [`import produced no parseable manifest (exit ${child.exitCode})`],
    };
  }
  const blockers = [
    ...manifest.blockers.unknownTypes.map(
      (blocker) => `unknown type ${blocker.namespace}.${blocker.symbol}`,
    ),
    ...manifest.blockers.unmappedFunctionNamespaces.map(
      (blocker) => `unmapped namespace ${blocker.namespace}`,
    ),
  ];
  return { ok: child.exitCode === 0 && manifest.ready, ready: manifest.ready, blockers };
}

// The real stage seam: each stage is an actual child invocation (or a
// programmatic file edit) wired to `io`. Tests inject a mock in its place, so
// this factory's body is exercised only by a live bump.
export function makeDefaultRunStage(io: BumpIO): RunStage {
  return (stage, ctx) => {
    switch (stage) {
      case "import":
        return importResult(
          spawn(["bun", "run", "import-defold-release", ctx.to, "--json"], io, { capture: true }),
        );
      case "rotate":
        applyVersionRotation(ctx.plan);
        return { ok: true };
      case "sync":
        return {
          ok: spawn(["bun", "--cwd", "packages/types", "run", "sync-api-docs"], io).exitCode === 0,
        };
      case "target-metadata": {
        applyTargetOps(ctx.plan);
        return {
          ok: spawn(["bunx", "biome", "format", "--write", TARGETS_PATH], io).exitCode === 0,
        };
      }
      case "regen":
        return { ok: spawn(["bun", "scripts/regen-all.ts"], io).exitCode === 0 };
      default:
        return { ok: false };
    }
  };
}

// `fixtureDir` is part of the release-model contract this orchestrator honors;
// re-export keeps the bump surface importable as one module for the runbook.
export { fixtureDir };

// The injectable CLI entrypoint. In `--json` mode it writes exactly one
// `JSON.stringify` document to `io.stdout`; every human line goes to `io.stderr`.
export function runBumpCli(argv: string[], io: BumpIO, runStage: RunStage): number {
  const json = argv.includes("--json");
  const check = argv.includes("--check");
  const toIndex = argv.indexOf("--to");
  const to = toIndex >= 0 ? argv[toIndex + 1] : undefined;

  if (check) {
    const result = runBumpCheck(
      REPO_ROOT,
      undefined,
      process.env.BUMP_DEFOLD_CHECK_ROOT ?? REPO_ROOT,
    );
    if (json) {
      io.stdout(
        `${JSON.stringify({ command: "bump:defold", mode: "check", ok: result.ok, problems: result.problems })}\n`,
      );
    } else if (result.ok) {
      io.stdout("bump:defold --check: OK — release evidence complete and offline\n");
    } else {
      io.stdout(`bump:defold --check: BLOCKED (${result.problems.length} blocker(s))\n`);
      for (const problem of result.problems) {
        io.stdout(`  - [${problem.category}] ${problem.message}\n`);
      }
    }
    return result.ok ? 0 : 1;
  }
  if (!to || to.startsWith("--")) {
    io.stderr("usage: bump:defold --to <version> [--json]\n");
    return 2;
  }

  const summary = runBump({ to, runStage });
  if (json) {
    io.stdout(`${JSON.stringify(summary)}\n`);
  } else if (summary.ok) {
    io.stdout(`bump:defold — bumped to ${summary.to} (${summary.transition})\n`);
    io.stdout("remaining human decisions:\n");
    for (const decision of summary.remainingHumanDecisions) {
      io.stdout(`  - ${decision}\n`);
    }
  } else {
    const detail = summary.error ? `: ${summary.error}` : "";
    io.stderr(`bump:defold FAILED at \`${summary.failedStage}\`${detail}\n`);
    for (const blocker of summary.blockers ?? []) {
      io.stderr(`  blocker: ${blocker}\n`);
    }
  }
  return summary.ok ? 0 : 1;
}

if (import.meta.main) {
  const io: BumpIO = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
  process.exit(runBumpCli(process.argv.slice(2), io, makeDefaultRunStage(io)));
}

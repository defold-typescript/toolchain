import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { GATED_CHECKS } from "../scripts/release-ci-gate.ts";
import { PACKAGES } from "../scripts/release-pack-proof.ts";
import { admittedScopes } from "./workflow-scopes.ts";

const workflowsDir = join(import.meta.dir, "..", ".github", "workflows");
const workflowPath = join(workflowsDir, "release.yml");

function rawWorkflow(): string {
  return readFileSync(workflowPath, "utf8");
}

function loadWorkflow(): Record<string, unknown> {
  return parse(rawWorkflow()) as Record<string, unknown>;
}

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}

interface Job {
  steps?: Step[];
  permissions?: Record<string, string>;
}

function publishJob(): Job {
  const jobs = loadWorkflow().jobs as Record<string, Job>;
  const job = Object.values(jobs)[0];
  if (!job) throw new Error("release workflow has no jobs");
  return job;
}

function steps(): Step[] {
  return publishJob().steps ?? [];
}

// A step's run with comment-only lines stripped, so a comment that mentions a
// command (e.g. "npm publish" in a rationale) is not mistaken for the command.
function runCmd(s: Step): string {
  return (s.run ?? "")
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

function stepIndex(pred: (s: Step) => boolean): number {
  return steps().findIndex(pred);
}

function publishIndices(): number[] {
  return steps()
    .map((s, i) => ({ cmd: runCmd(s), i }))
    .filter(({ cmd }) => /npm publish/.test(cmd))
    .map(({ i }) => i);
}

const GATE_SCRIPT = /\bbun scripts\/release-ci-gate\.ts\b/;
const DATA_GATE_SCRIPT = /\bbun scripts\/release-data-gate\.ts\b/;

// The repository library-data-publish.yml checks out to push this repo's library
// data to.
function publishedDataRepo(): string {
  const jobs = parse(readFileSync(join(workflowsDir, "library-data-publish.yml"), "utf8")) as {
    jobs: Record<string, Job>;
  };
  const targets = Object.values(jobs.jobs)
    .flatMap((job) => job.steps ?? [])
    .flatMap((s) =>
      /^actions\/checkout@/.test(s.uses ?? "") && s.with?.repository ? [s.with.repository] : [],
    );
  if (targets.length !== 1) throw new Error(`expected one data repo checkout, got ${targets}`);
  return targets[0] as string;
}

interface NamedJob {
  name?: string;
  if?: string;
  strategy?: { matrix?: Record<string, unknown> };
}

function workflowJobs(file: string): Record<string, NamedJob> {
  return (
    parse(readFileSync(join(workflowsDir, file), "utf8")) as { jobs: Record<string, NamedJob> }
  ).jobs;
}

// GitHub names a job's check run after its `name:`, or its job id when it has
// none, and appends a matrix job's values in parentheses.
function checkRunNames(file: string, only?: (id: string, job: NamedJob) => boolean): string[] {
  return Object.entries(workflowJobs(file)).flatMap(([id, job]) => {
    if (only !== undefined && !only(id, job)) return [];
    const base = job.name ?? id;
    const matrix = job.strategy?.matrix;
    if (!matrix) return [base];
    const os = matrix.os;
    if (
      /\$\{\{/.test(base) ||
      Object.keys(matrix).some((key) => key !== "os") ||
      !Array.isArray(os)
    ) {
      throw new Error(`${file} job ${id}: check-run naming for this matrix is not modelled`);
    }
    return os.map((value) => `${base} (${value})`);
  });
}

// Pull the package list out of a `for pkg in <list>; do` loop. Tolerant of list
// tokens that embed keywords (e.g. "docs" contains "do").
function loopPackages(run: string): string[] | null {
  const m = run.match(/for pkg in\s+([a-z0-9 -]+?);\s*do/);
  return m?.[1] ? m[1].trim().split(/\s+/) : null;
}

describe("release workflow publishes via OIDC on tags", () => {
  test("fires on a tag push for v* tags", () => {
    const wf = loadWorkflow();
    // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
    const on = (wf.on ?? wf[true as unknown as string]) as Record<string, unknown>;
    expect(on).toBeDefined();
    expect(Object.keys(on)).toContain("push");
    const push = on.push as { tags?: string[] };
    expect(push.tags).toContain("v*");
  });

  test("requests an OIDC id token and carries no npm token (trusted publishing)", () => {
    expect(publishJob().permissions?.["id-token"]).toBe("write");
    // OIDC trusted publishing uses no long-lived token; classic tokens are dead.
    expect(rawWorkflow()).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/);
  });

  test("publishes with npm, not bun (bun has no OIDC path)", () => {
    const publishing = steps().filter((s) => /npm publish/.test(runCmd(s)));
    expect(publishing.length).toBeGreaterThan(0);
    for (const s of publishing) {
      expect(runCmd(s)).not.toContain("bun publish");
    }
  });

  test("requires CI green on the commit rather than re-running the checks", () => {
    // The publish trusts ci.yml's already-green result for this exact SHA, so it
    // must NOT re-run the typecheck/lint/test gate — that work happened in CI.
    const reran = steps().find((s) => /bun run (typecheck|lint)\b|bun test\b/.test(runCmd(s)));
    expect(reran).toBeUndefined();
    // Instead a step waits for ci.yml's full scope to pass on this commit.
    const requireIdx = stepIndex((s) => GATE_SCRIPT.test(runCmd(s)));
    expect(requireIdx).toBeGreaterThanOrEqual(0);
    expect(requireIdx).toBeGreaterThan(stepIndex((s) => /^actions\/checkout@/.test(s.uses ?? "")));
    // The CI-green guard fences every publish.
    for (const idx of publishIndices()) {
      expect(idx).toBeGreaterThan(requireIdx);
    }
  });

  test("waits for the data repo to hold this commit's library data before any publish", () => {
    const gateIdx = stepIndex((s) => DATA_GATE_SCRIPT.test(runCmd(s)));
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    for (const idx of publishIndices()) {
      expect(idx).toBeGreaterThan(gateIdx);
    }
    const gate = steps()[gateIdx] as Step;
    expect(runCmd(gate)).toContain(`--repo ${publishedDataRepo()}`);
    expect(runCmd(gate)).toContain('--sha "$SHA"');
    expect(gate.env?.SHA).toMatch(/^\$\{\{\s*github\.sha\s*\}\}$/);
    expect(gate.env?.GH_TOKEN).toMatch(/^\$\{\{\s*github\.token\s*\}\}$/);
  });

  test("reads CI check runs with a checks:read token", () => {
    expect(publishJob().permissions?.checks).toBe("read");
  });

  test("the CI gate requires exactly the check runs ci.yml's full scope creates", () => {
    const fullScope = checkRunNames(
      "ci.yml",
      (_, job) =>
        job.if !== undefined && job.if !== "always()" && admittedScopes(job.if).includes("full"),
    );
    expect<string[]>([...GATED_CHECKS].sort()).toEqual(fullScope.sort());

    const foreign = readdirSync(workflowsDir)
      .filter((file) => /\.ya?ml$/.test(file) && file !== "ci.yml")
      .flatMap((file) => checkRunNames(file));
    expect(foreign.length).toBeGreaterThan(0);
    expect(checkRunNames("ci.yml").filter((name) => foreign.includes(name))).toEqual([]);
  });

  test("builds before any publish (stamp + dry-run resolve workspace dist)", () => {
    const buildIdx = stepIndex((s) => /^bun run build\b/.test((s.run ?? "").trim()));
    expect(buildIdx).toBeGreaterThanOrEqual(0);
    for (const idx of publishIndices()) {
      expect(idx).toBeGreaterThan(buildIdx);
    }
  });

  test("stamps the version and rewrites workspace deps before any publish", () => {
    const stampIdx = stepIndex(
      (s) =>
        /jq /.test(s.run ?? "") && /\.version/.test(s.run ?? "") && /workspace:/.test(s.run ?? ""),
    );
    expect(stampIdx).toBeGreaterThanOrEqual(0);
    const indices = publishIndices();
    expect(indices.length).toBeGreaterThan(0);
    for (const idx of indices) {
      expect(idx).toBeGreaterThan(stampIdx);
    }
  });

  test("the real publish stays fenced behind ENABLE_NPM_PUBLISH", () => {
    for (const s of steps()) {
      const cmd = runCmd(s);
      if (cmd.includes("npm publish") && !cmd.includes("--dry-run")) {
        expect(s.if).toContain("vars.ENABLE_NPM_PUBLISH == 'true'");
      }
    }
  });

  test("the dry-run publish is present and unfenced", () => {
    const dryRun = steps().find(
      (s) => runCmd(s).includes("npm publish") && runCmd(s).includes("--dry-run"),
    );
    expect(dryRun).toBeDefined();
    expect(dryRun?.if).toBeUndefined();
  });

  test("both publish loops enumerate the canonical PACKAGES in dependency order", () => {
    const loops = steps().filter((s) => /for pkg in /.test(runCmd(s)));
    expect(loops.length).toBeGreaterThanOrEqual(2);
    for (const s of loops) {
      expect(loopPackages(runCmd(s))).toEqual([...PACKAGES]);
    }
  });

  // Both the dry-run and the real publish must skip versions already on npm.
  // `npm publish --dry-run` still queries the registry and errors on an
  // already-published version, so without this guard a re-run of a
  // partially-published tag dies at the dry-run before the real publish's own
  // idempotency can complete the remaining packages.
  test("both npm-publish loops skip versions already on npm (idempotent re-run)", () => {
    const publishLoops = steps().filter(
      (s) => /for pkg in /.test(runCmd(s)) && /npm publish/.test(runCmd(s)),
    );
    expect(publishLoops.length).toBe(2);
    for (const s of publishLoops) {
      expect(runCmd(s)).toMatch(/npm view "\$name@\$VERSION" version/);
    }
  });

  test("one job dispatches the docs deploy, and only after the publish", () => {
    const jobs = loadWorkflow().jobs as Record<string, Job & { needs?: string | string[] }>;
    const [publishId] = Object.keys(jobs);
    const dispatchers = Object.values(jobs).filter((job) =>
      (job.steps ?? []).some((s) => /gh workflow run deploy-docs\.yml\b/.test(runCmd(s))),
    );
    expect(dispatchers).toHaveLength(1);
    expect([dispatchers[0]?.needs].flat()).toContain(publishId);
  });
});

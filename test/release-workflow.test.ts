import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { PACKAGES } from "../scripts/release-pack-proof.ts";

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

// The release's CI gate filter, run through jq over synthetic check runs.
function gated(checkRuns: object[]): { name: string; conclusion: string }[] {
  const gate = steps().find((s) => /check-runs/.test(runCmd(s)) && /exit 1/.test(runCmd(s)));
  const filter = gate && runCmd(gate).match(/--jq '([^']+)'/)?.[1];
  if (!filter) throw new Error("the CI gate reads check runs with no --jq filter");
  const out = Bun.spawnSync(["jq", "-c", filter], {
    stdin: Buffer.from(JSON.stringify({ check_runs: checkRuns })),
  });
  return JSON.parse(out.stdout.toString()) as { name: string; conclusion: string }[];
}

interface NamedJob {
  name?: string;
  strategy?: { matrix?: Record<string, unknown> };
}

// GitHub names a job's check run after its `name:`, or its job id when it has
// none, and appends a matrix job's values in parentheses.
function checkRunNames(file: string): string[] {
  const wf = parse(readFileSync(join(workflowsDir, file), "utf8")) as {
    jobs: Record<string, NamedJob>;
  };
  return Object.entries(wf.jobs).flatMap(([id, job]) => {
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
    // Instead a step reads the Checks API for this commit and aborts when CI is
    // absent, still running, or red.
    const requireIdx = stepIndex((s) => /check-runs/.test(runCmd(s)) && /exit 1/.test(runCmd(s)));
    expect(requireIdx).toBeGreaterThanOrEqual(0);
    // The CI-green guard fences every publish.
    for (const idx of publishIndices()) {
      expect(idx).toBeGreaterThan(requireIdx);
    }
  });

  test("reads CI check runs with a checks:read token", () => {
    expect(publishJob().permissions?.checks).toBe("read");
  });

  test.skipIf(!Bun.which("jq"))("the CI gate counts only the newest check of each name", () => {
    const names = checkRunNames("ci.yml");
    const [first] = names;
    const run = (firstId: number, conclusion: (name: string) => string) =>
      names.map((name, i) => ({
        id: firstId + i,
        name,
        status: "completed",
        conclusion: conclusion(name),
      }));
    const later = names.length + 1;
    const docsBuild = { id: 1000, name: "build", status: "completed", conclusion: "failure" };

    // A branch push cancelled mid-test, then the main push of the same commit green.
    const cancelledThenGreen = gated([
      ...run(1, (name) => (name === first ? "success" : "cancelled")),
      ...run(later, () => "success"),
      docsBuild,
    ]);
    expect(cancelledThenGreen.map((r) => r.conclusion)).toEqual(names.map(() => "success"));

    // A later red run still blocks an earlier green one.
    const greenThenRed = gated([
      ...run(1, () => "success"),
      ...run(later, (name) => (name === first ? "success" : "failure")),
    ]);
    const blocking = greenThenRed.filter((r) => r.conclusion !== "success").map((r) => r.name);
    expect(blocking.sort()).toEqual(names.filter((name) => name !== first).sort());
  });

  test.skipIf(!Bun.which("jq"))("the CI gate selects exactly the check runs ci.yml creates", () => {
    const ci = checkRunNames("ci.yml");
    const foreign = readdirSync(workflowsDir)
      .filter((file) => /\.ya?ml$/.test(file) && file !== "ci.yml")
      .flatMap(checkRunNames);
    expect(foreign.length).toBeGreaterThan(0);
    expect(ci.filter((name) => foreign.includes(name))).toEqual([]);

    const everyRun = [...ci, ...foreign].map((name, i) => ({
      id: i + 1,
      name,
      status: "completed",
      conclusion: "success",
    }));
    expect(
      gated(everyRun)
        .map((r) => r.name)
        .sort(),
    ).toEqual([...ci].sort());
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
});

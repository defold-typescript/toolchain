import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { PACKAGES } from "../scripts/release-pack-proof.ts";

const workflowPath = join(import.meta.dir, "..", ".github", "workflows", "release.yml");

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
});

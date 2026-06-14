import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const workflowPath = join(import.meta.dir, "..", ".github", "workflows", "release.yml");

function rawWorkflow(): string {
  return readFileSync(workflowPath, "utf8");
}

function loadWorkflow(): Record<string, unknown> {
  return parse(rawWorkflow()) as Record<string, unknown>;
}

interface Step {
  name?: string;
  run?: string;
  if?: string;
}

function publishSteps(): Step[] {
  const wf = loadWorkflow();
  const jobs = wf.jobs as Record<string, { steps?: Step[] }>;
  return Object.values(jobs).flatMap((job) => job.steps ?? []);
}

function indexWhere(steps: Step[], pred: (run: string) => boolean): number {
  return steps.findIndex((step) => pred(step.run ?? ""));
}

describe("release workflow is re-enabled and safe", () => {
  test("fires on a tag push for v* tags", () => {
    const wf = loadWorkflow();
    // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
    const on = (wf.on ?? wf[true as unknown as string]) as Record<string, unknown>;
    expect(on).toBeDefined();
    expect(Object.keys(on)).toContain("push");
    const push = on.push as { tags?: string[] };
    expect(push.tags).toContain("v*");
  });

  test("regenerates the lockfile in a dedicated step", () => {
    const steps = publishSteps();
    const regen = steps.find((step) => {
      const run = step.run ?? "";
      return (
        /rm -f bun\.lock/.test(run) && /bun install/.test(run) && !/--frozen-lockfile/.test(run)
      );
    });
    expect(regen).toBeDefined();
  });

  test("regen lands after the stamp and before any pack/publish", () => {
    const steps = publishSteps();
    const stampIdx = indexWhere(steps, (run) => /jq /.test(run) && /\.version/.test(run));
    const regenIdx = indexWhere(steps, (run) => /rm -f bun\.lock/.test(run));
    expect(stampIdx).toBeGreaterThanOrEqual(0);
    expect(regenIdx).toBeGreaterThan(stampIdx);

    const packPublishIndices = steps
      .map((step, i) => ({ run: step.run ?? "", i }))
      .filter(({ run }) => /bun pm pack/.test(run) || /bun publish/.test(run))
      .map(({ i }) => i);
    expect(packPublishIndices.length).toBeGreaterThan(0);
    for (const idx of packPublishIndices) {
      expect(regenIdx).toBeLessThan(idx);
    }
  });

  test("the real publish stays fenced behind ENABLE_NPM_PUBLISH", () => {
    for (const step of publishSteps()) {
      const run = step.run ?? "";
      if (run.includes("bun publish") && !run.includes("--dry-run")) {
        expect(step.if).toContain("vars.ENABLE_NPM_PUBLISH == 'true'");
      }
    }
  });

  test("the dry-run publish is present and unfenced", () => {
    const dryRun = publishSteps().find(
      (step) => (step.run ?? "").includes("bun publish") && (step.run ?? "").includes("--dry-run"),
    );
    expect(dryRun).toBeDefined();
    expect(dryRun?.if).toBeUndefined();
  });

  test("both publish loops enumerate tstl-plugin in dependency order", () => {
    const loopSteps = publishSteps().filter((step) => /for pkg in /.test(step.run ?? ""));
    expect(loopSteps.length).toBeGreaterThanOrEqual(2);
    for (const step of loopSteps) {
      const list = (step.run ?? "").match(/for pkg in ([^\n;]+?)\s*;?\s*do/)?.[1];
      expect(list).toBeDefined();
      const pkgs = (list ?? "").trim().split(/\s+/);
      expect(pkgs).toContain("tstl-plugin");
      expect(pkgs.indexOf("tstl-plugin")).toBeGreaterThan(pkgs.indexOf("transpiler"));
      expect(pkgs.indexOf("tstl-plugin")).toBeLessThan(pkgs.indexOf("cli"));
    }
  });
});

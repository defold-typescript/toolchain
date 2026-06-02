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

describe("release workflow is parked", () => {
  test("cannot fire on a tag push", () => {
    const wf = loadWorkflow();
    // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
    const on = (wf.on ?? wf[true as unknown as string]) as Record<string, unknown>;
    expect(on).toBeDefined();
    expect(Object.keys(on)).not.toContain("push");
  });

  test("documents the park reason in place", () => {
    const raw = rawWorkflow();
    expect(raw).toContain("# PARKED");
    expect(raw).toContain("lockfile");
    expect(raw).toContain("ENABLE_NPM_PUBLISH");
  });

  test("has no active real publish step", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
    const runs = Object.values(jobs)
      .flatMap((job) => job.steps ?? [])
      .map((step) => step.run ?? "");
    for (const run of runs) {
      if (run.includes("bun publish")) {
        expect(run).toContain("--dry-run");
      }
    }
  });
});

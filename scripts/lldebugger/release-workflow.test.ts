import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const workflowPath = join(
  import.meta.dir,
  "..",
  "..",
  ".github",
  "workflows",
  "lldebugger-release.yml",
);

function rawWorkflow(): string {
  return readFileSync(workflowPath, "utf8");
}

function loadWorkflow(): Record<string, unknown> {
  return parse(rawWorkflow()) as Record<string, unknown>;
}

function stepRuns(): string[] {
  const wf = loadWorkflow();
  const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
  return Object.values(jobs)
    .flatMap((job) => job.steps ?? [])
    .map((step) => step.run ?? "");
}

describe("lldebugger release workflow", () => {
  test("exists and parses", () => {
    expect(existsSync(workflowPath)).toBe(true);
    expect(loadWorkflow()).toBeDefined();
  });

  test("triggers on a lldebugger-v* tag and workflow_dispatch only", () => {
    const wf = loadWorkflow();
    // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
    const on = (wf.on ?? wf[true as unknown as string]) as Record<string, unknown>;
    expect(on).toBeDefined();
    const keys = Object.keys(on);
    expect(keys).toContain("push");
    expect(keys).toContain("workflow_dispatch");
    expect(keys).not.toContain("pull_request");

    const push = on.push as { tags?: string[]; branches?: string[] };
    expect(push.tags).toContain("lldebugger-v*");
    // Must not fire on every push to a branch.
    expect(push.branches).toBeUndefined();
  });

  test("a step runs the lldebugger build entry", () => {
    const runsBuild = stepRuns().some(
      (run) =>
        run.includes("bun run build:lldebugger") ||
        run.includes("bun scripts/build-lldebugger-zip.ts"),
    );
    expect(runsBuild).toBe(true);
  });

  test("a step uploads an asset named lldebugger.zip", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<
      string,
      { steps?: Array<{ run?: string; with?: { files?: string } }> }
    >;
    const uploads = Object.values(jobs)
      .flatMap((job) => job.steps ?? [])
      .some((step) => {
        const run = step.run ?? "";
        const files = step.with?.files ?? "";
        return run.includes("lldebugger.zip") || files.includes("lldebugger.zip");
      });
    expect(uploads).toBe(true);
  });

  test("the gate job runs typecheck, lint, and test", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
    const gate = jobs.gate;
    expect(gate).toBeDefined();
    const runs = (gate?.steps ?? []).map((step) => step.run ?? "");
    expect(runs.some((run) => run.includes("bun run typecheck"))).toBe(true);
    expect(runs.some((run) => run.includes("bun run lint"))).toBe(true);
    expect(runs.some((run) => run.includes("bun test"))).toBe(true);
  });

  test("the gate job builds before it tests", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
    const runs = (jobs.gate?.steps ?? []).map((step) => step.run ?? "");
    const buildIndex = runs.findIndex((run) => run.includes("bun run build"));
    const testIndex = runs.findIndex((run) => run.includes("bun test"));
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(testIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeLessThan(testIndex);
  });

  test("the publish job needs the gate job", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { needs?: string | string[] }>;
    const needs = jobs.publish?.needs;
    const needsGate = needs === "gate" || (Array.isArray(needs) && needs.includes("gate"));
    expect(needsGate).toBe(true);
  });

  test("every bun install across both jobs keeps --frozen-lockfile", () => {
    const installs = stepRuns().filter((run) => run.includes("bun install"));
    expect(installs.length).toBeGreaterThanOrEqual(2);
    for (const run of installs) {
      expect(run).toContain("--frozen-lockfile");
    }
  });
});

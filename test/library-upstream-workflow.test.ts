import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const workflowPath = join(
  import.meta.dir,
  "..",
  ".github",
  "workflows",
  "library-upstream-check.yml",
);

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  "continue-on-error"?: boolean;
};
type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, { steps?: Step[] }>;
};

function loadWorkflow(): Workflow {
  const raw = readFileSync(workflowPath, "utf8");
  const parsed = parse(raw) as Record<string, unknown>;
  // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
  const on = (parsed.on ?? parsed[true as unknown as string]) as Record<string, unknown>;
  return { ...parsed, on } as Workflow;
}

function steps(): Step[] {
  return Object.values(loadWorkflow().jobs ?? {}).flatMap((job) => job.steps ?? []);
}

const CHECKS = ["asset-portal-check", "shipped-types-check"];

function issueSteps(): Step[] {
  return steps().filter((step) => (step.run ?? "").includes("gh issue create"));
}

describe("library upstream check workflow", () => {
  test("is valid YAML", () => {
    expect(() => loadWorkflow()).not.toThrow();
  });

  test("runs on a schedule and stays hand-dispatchable", () => {
    const on = loadWorkflow().on ?? {};
    // A `schedule:` trigger is auto-disabled after 60 days of repository
    // inactivity, so `workflow_dispatch` is the recovery path, not a convenience.
    expect(Object.keys(on)).toContain("schedule");
    expect(Object.keys(on)).toContain("workflow_dispatch");
    const schedule = on.schedule as Array<{ cron?: string }>;
    expect(schedule.length).toBeGreaterThan(0);
    expect(schedule[0]?.cron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
  });

  test("requests issues: write, which `gh issue create` needs", () => {
    expect(loadWorkflow().permissions?.issues).toBe("write");
  });

  test.each(CHECKS)("invokes %s as a file so only the report reaches stdout", (check) => {
    const runs = steps().map((step) => step.run ?? "");
    expect(runs.some((cmd) => cmd.includes(`bun scripts/${check}.ts --json`))).toBe(true);
  });

  test("passes every library tool the data folder it reads", () => {
    const tool = new RegExp(`bun scripts/(${CHECKS.join("|")})\\.ts`);
    const runs = steps()
      .map((step) => step.run ?? "")
      .filter((cmd) => tool.test(cmd));
    expect(runs).toHaveLength(CHECKS.length);
    expect(runs.filter((cmd) => !/ --data \S+/.test(cmd))).toEqual([]);
  });

  test("scans no pins, since the library update bot reports a moved library", () => {
    const runs = steps().map((step) => step.run ?? "");
    expect(runs.filter((cmd) => cmd.includes("library-upstream-check.ts"))).toEqual([]);
  });

  test("creates an issue only for a shipped-types report the script marked actionable", () => {
    const script = issueSteps()
      .map((step) => step.run ?? "")
      .find((cmd) => cmd.includes("shipped.json"));
    expect(script).toBeDefined();
    const body = script ?? "";
    // Assert the guard's polarity, not merely that `actionable` is mentioned:
    // flipping the comparison is exactly the edit that turns a quiet week into
    // weekly issue spam, and it leaves every looser assertion green.
    expect(body).toMatch(/select\(\s*\.actionable\s*\)/);
    expect(body.indexOf("select(.actionable)")).toBeLessThan(body.indexOf("gh issue create"));
  });

  test("looks an open issue up by exact title before creating one", () => {
    const scripts = issueSteps().map((step) => step.run ?? "");
    expect(scripts).not.toHaveLength(0);
    for (const body of scripts) {
      expect(body).toContain("gh issue list");
      expect(body.indexOf("gh issue list")).toBeLessThan(body.indexOf("gh issue create"));
    }
  });

  test("opens issues for the reports that were readable even when a scan step failed", () => {
    const conditions = issueSteps().map((step) => (step.if ?? "").replace(/\s|\$\{\{|\}\}/g, ""));
    expect(conditions).not.toHaveLength(0);
    // A step defaults to `if: success()`, so one unreadable repo would withhold
    // every other report's issue. The condition has to be one that still holds
    // after a failed predecessor; `success()` or a missing key reds.
    for (const condition of conditions) expect(condition).toMatch(/^(!cancelled\(\)|always\(\))$/);
  });

  test.each(
    CHECKS,
  )("keeps the %s step failing the job, so an unreadable source is never a quiet green", (check) => {
    const scanStep = steps().find((step) => (step.run ?? "").includes(`bun scripts/${check}.ts`));
    expect(scanStep).toBeDefined();
    // The tempting wrong fix for the same bug: `continue-on-error` on the scan
    // would isolate the failure by discarding it, turning a renamed or deleted
    // repo into a green week.
    expect(scanStep?.["continue-on-error"]).toBeUndefined();
  });
});

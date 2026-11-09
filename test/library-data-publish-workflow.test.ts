import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const workflowsDir = join(import.meta.dir, "..", ".github", "workflows");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Job {
  name?: string;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  strategy?: { matrix?: unknown };
  steps?: Step[];
}

function workflowJobs(file: string): Record<string, Job> {
  return (parse(readFileSync(join(workflowsDir, file), "utf8")) as { jobs: Record<string, Job> })
    .jobs;
}

const publishJobs = () => workflowJobs("library-data-publish.yml");

// A step's run with comment-only lines stripped, so a comment that mentions a
// command is not mistaken for the command.
function runCmd(step: Step): string {
  return (step.run ?? "")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

const GATE_SCRIPT = /\bbun scripts\/release-ci-gate\.ts\b/;

function gateStep(job: Job): Step | undefined {
  return (job.steps ?? []).find((step) => GATE_SCRIPT.test(runCmd(step)));
}

function gateJobIds(): string[] {
  return Object.entries(publishJobs())
    .filter(([, job]) => gateStep(job) !== undefined)
    .map(([id]) => id);
}

// The values a flag takes in a shell command, quotes stripped and a `$NAME` word
// resolved through the step's env, as the runner's shell would.
function flagValues(step: Step, flag: string): string[] {
  const words = runCmd(step).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const values: string[] = [];
  words.forEach((word, i) => {
    let raw: string | undefined;
    if (word === flag) raw = words[i + 1];
    else if (word.startsWith(`${flag}=`)) raw = word.slice(flag.length + 1);
    if (raw === undefined) return;
    const unquoted = raw.replace(/^(["'])(.*)\1$/, "$2");
    const variable = unquoted.match(/^\$(?:\{(\w+)\}|(\w+))$/);
    const name = variable?.[1] ?? variable?.[2];
    values.push(name === undefined ? unquoted : (step.env?.[name] ?? unquoted));
  });
  return values;
}

// GitHub names a job's check run after its `name:`, or its job id when it has none.
function alwaysRunChecks(): string[] {
  return Object.entries(workflowJobs("ci.yml")).flatMap(([id, job]) => {
    if (job.if !== "always()") return [];
    if (job.strategy?.matrix !== undefined) {
      throw new Error(`ci.yml job ${id}: check-run naming for a matrix is not modelled`);
    }
    return [job.name ?? id];
  });
}

describe("library data publish waits for CI on the commit it publishes", () => {
  test("every job that pushes to the data repo needs the CI gate job", () => {
    const gates = gateJobIds();
    const pushing = Object.entries(publishJobs()).filter(([, job]) =>
      (job.steps ?? []).some((step) => /\bgit push\b/.test(runCmd(step))),
    );
    expect(pushing.length).toBeGreaterThan(0);
    for (const [id, job] of pushing) {
      const needs = [job.needs ?? []].flat();
      expect({ id, gated: needs.some((need) => gates.includes(need)) }).toEqual({
        id,
        gated: true,
      });
    }
  });

  test("the gate requires only checks ci.yml runs on every scope", () => {
    const always = alwaysRunChecks();
    expect(always.length).toBeGreaterThan(0);
    const gates = gateJobIds();
    expect(gates.length).toBeGreaterThan(0);
    for (const id of gates) {
      const checks = flagValues(gateStep(publishJobs()[id] as Job) as Step, "--check");
      expect(checks.length).toBeGreaterThan(0);
      for (const check of checks) expect(always).toContain(check);
    }
  });

  test("the gate reads this commit's check runs with a token that can read them", () => {
    for (const id of gateJobIds()) {
      const job = publishJobs()[id] as Job;
      const step = gateStep(job) as Step;
      expect(flagValues(step, "--sha")).toEqual([
        expect.stringMatching(/^\$\{\{\s*github\.sha\s*\}\}$/),
      ]);
      expect(flagValues(step, "--repo")).toEqual([
        expect.stringMatching(/^\$\{\{\s*github\.repository\s*\}\}$/),
      ]);
      expect(step.env?.GH_TOKEN).toMatch(/^\$\{\{\s*github\.token\s*\}\}$/);
      expect(job.permissions?.checks).toBe("read");
    }
  });
});

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const repoRoot = join(import.meta.dir, "..");
const workflowDir = join(repoRoot, ".github", "workflows");

type Step = { uses?: string; with?: Record<string, unknown> };
type Job = { steps?: Step[] };

function workflowFiles(): string[] {
  return readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

/** Every `oven-sh/setup-bun` step across all workflows, tagged with where it lives. */
function setupBunSteps(): Array<{ id: string; version: string | undefined }> {
  const found: Array<{ id: string; version: string | undefined }> = [];
  for (const file of workflowFiles()) {
    const wf = parse(readFileSync(join(workflowDir, file), "utf8")) as {
      jobs?: Record<string, Job>;
    };
    for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
      (job.steps ?? []).forEach((step, index) => {
        if (!step.uses?.startsWith("oven-sh/setup-bun")) return;
        const version = step.with?.["bun-version"];
        found.push({
          id: `${file}:${jobName}:${index}`,
          version: version === undefined ? undefined : String(version),
        });
      });
    }
  }
  return found;
}

/** First capture group of `pattern` in `text`, or a failure naming `label`. */
function capture(pattern: RegExp, text: string, label: string): string {
  const match = pattern.exec(text);
  const value = match?.[1];
  if (value === undefined) throw new Error(`no ${label} matched by ${pattern}`);
  return value;
}

function majorMinor(version: string, label: string): string {
  return capture(/(\d+\.\d+)/, version, `${label} major.minor in "${version}"`);
}

function guideFloor(): string {
  const guide = readFileSync(
    join(repoRoot, "packages", "docs", "guide", "getting-started.md"),
    "utf8",
  );
  const matches = [...guide.matchAll(/Bun\s+`>=\s*(\d+\.\d+)`/g)];
  expect(matches.length).toBe(1);
  const floor = matches[0]?.[1];
  if (floor === undefined) throw new Error("the guide states no machine-readable Bun floor");
  return floor;
}

describe("bun toolchain pins", () => {
  test("every setup-bun step pins bun-version", () => {
    const steps = setupBunSteps();
    // A parser that silently matches nothing would pass the emptiness assertion below.
    expect(steps.length).toBeGreaterThanOrEqual(6);
    const unpinned = steps.filter((step) => step.version === undefined).map((step) => step.id);
    expect(unpinned).toEqual([]);
  });

  test("the guide states the floor exactly once, machine-readably", () => {
    expect(guideFloor()).toMatch(/^\d+\.\d+$/);
  });

  test("workflows, mise, package.json and the guide name one major.minor", () => {
    const versions = new Set<string>();

    for (const step of setupBunSteps()) {
      if (step.version !== undefined) versions.add(majorMinor(step.version, step.id));
    }

    const mise = readFileSync(join(repoRoot, "mise.toml"), "utf8");
    versions.add(
      majorMinor(capture(/^\s*bun\s*=\s*"([^"]+)"/m, mise, "mise.toml [tools] bun"), "mise.toml"),
    );

    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      engines?: { bun?: string };
    };
    const engines = pkg.engines?.bun;
    expect(engines).toBeDefined();
    versions.add(majorMinor(engines ?? "", "package.json engines.bun"));

    versions.add(guideFloor());

    expect([...versions].sort()).toHaveLength(1);
  });
});

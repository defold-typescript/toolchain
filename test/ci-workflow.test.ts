import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const workflowPath = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");

function loadWorkflow(): Record<string, unknown> {
  const raw = readFileSync(workflowPath, "utf8");
  return parse(raw) as Record<string, unknown>;
}

describe("ci workflow", () => {
  test("is valid YAML", () => {
    expect(() => loadWorkflow()).not.toThrow();
  });

  test("triggers on push and pull_request", () => {
    const wf = loadWorkflow();
    // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
    const on = (wf.on ?? wf[true as unknown as string]) as Record<string, unknown>;
    expect(on).toBeDefined();
    expect(Object.keys(on)).toContain("push");
    expect(Object.keys(on)).toContain("pull_request");
  });

  test("has a job that runs `bun test`", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
    expect(jobs).toBeDefined();
    const runs = Object.values(jobs)
      .flatMap((job) => job.steps ?? [])
      .map((step) => step.run ?? "");
    expect(runs.some((cmd) => cmd.includes("bun test"))).toBe(true);
  });

  test("test job fans out across the three GitHub-hosted OS images", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { strategy?: { matrix?: { os?: unknown } } }>;
    const os = jobs.test?.strategy?.matrix?.os;
    expect(os).toEqual(["ubuntu-latest", "windows-latest", "macos-latest"]);
  });

  test("test job runs-on the matrix os expression", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { "runs-on"?: unknown }>;
    // ${{ matrix.os }} is a GitHub Actions expression, not a JS template literal.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal workflow value under assertion
    expect(jobs.test?.["runs-on"]).toBe("${{ matrix.os }}");
  });

  test("a job runs lint and typecheck so they gate every push", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
    const runs = Object.values(jobs)
      .flatMap((job) => job.steps ?? [])
      .map((step) => step.run ?? "");
    expect(runs.some((cmd) => cmd.includes("bun run lint"))).toBe(true);
    expect(runs.some((cmd) => cmd.includes("bun run typecheck"))).toBe(true);
  });

  test("test job builds before it tests so cross-package dist resolves", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
    const runs = (jobs.test?.steps ?? []).map((step) => step.run ?? "");
    const buildAt = runs.findIndex((cmd) => cmd.includes("bun run build"));
    const testAt = runs.findIndex((cmd) => cmd.includes("bun test"));
    expect(buildAt).toBeGreaterThanOrEqual(0);
    expect(testAt).toBeGreaterThanOrEqual(0);
    expect(buildAt).toBeLessThan(testAt);
  });

  test("every install pins the lockfile so the toolchain cannot drift", () => {
    const wf = loadWorkflow();
    const jobs = wf.jobs as Record<string, { steps?: Array<{ run?: string }> }>;
    const installs = Object.values(jobs)
      .flatMap((job) => job.steps ?? [])
      .map((step) => step.run ?? "")
      .filter((cmd) => cmd.includes("bun install"));
    expect(installs.length).toBeGreaterThan(0);
    for (const cmd of installs) {
      expect(cmd).toContain("--frozen-lockfile");
    }
  });
});

interface Job {
  steps?: Array<{ run?: string }>;
}

interface Manifest {
  name?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
}

const repoRoot = join(import.meta.dir, "..");

function workflowJobs(file: string): Record<string, Job> {
  const raw = readFileSync(join(repoRoot, ".github", "workflows", file), "utf8");
  return (parse(raw) as { jobs: Record<string, Job> }).jobs;
}

function jobRuns(job: Job): string[] {
  return (job.steps ?? []).map((step) => step.run ?? "");
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as Manifest;
}

function workspaceManifests(): Manifest[] {
  return (readManifest("package.json").workspaces ?? [])
    .flatMap((pattern) => [...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: repoRoot })])
    .sort()
    .map(readManifest);
}

// A script with every `bun run <script>` it makes inside the same manifest
// inlined, so a page build reached through another script still shows.
function expandScript(
  scripts: Record<string, string>,
  name: string,
  seen = new Set<string>(),
): string {
  const body = scripts[name];
  if (body === undefined || seen.has(name)) return "";
  seen.add(name);
  return body.replace(/bun run ([\w:.-]+)/g, (call, ref: string) =>
    scripts[ref] === undefined ? call : `${call} (${expandScript(scripts, ref, seen)})`,
  );
}

const SITE_BUILD = /bun run --filter '([^']+)' build:site\b/;

describe("docs site page build", () => {
  test("bun run build, and the CI jobs that test and typecheck, never build the pages", () => {
    expect(readManifest("package.json").scripts?.build).toBe("bun run --filter '*' build");
    const manifests = workspaceManifests();
    expect(manifests.map((m) => m.name)).toContain("@defold-typescript/docs-site");
    const pageBuilds = manifests
      .filter((m) => expandScript(m.scripts ?? {}, "build").includes("vite build"))
      .map((m) => m.name);
    expect(pageBuilds).toEqual([]);

    const checkJobs = Object.entries(workflowJobs("ci.yml")).filter(([, job]) =>
      jobRuns(job).some((cmd) => /\bbun test\b|bun run typecheck\b/.test(cmd)),
    );
    expect(checkJobs.length).toBeGreaterThan(0);
    for (const [, job] of checkJobs) {
      expect(jobRuns(job).filter((cmd) => cmd.includes("build:site"))).toEqual([]);
    }
  });

  test("one CI job builds the pages with the script the docs deploy publishes", () => {
    const ciSiteRuns = Object.values(workflowJobs("ci.yml")).flatMap((job) =>
      jobRuns(job).filter((cmd) => cmd.includes("build:site")),
    );
    expect(ciSiteRuns).toHaveLength(1);
    const deploySiteRuns = Object.values(workflowJobs("deploy-docs.yml")).flatMap((job) =>
      jobRuns(job).filter((cmd) => cmd.includes("build:site")),
    );
    expect(deploySiteRuns).toEqual(ciSiteRuns);

    const docsSite = readManifest("packages/docs-site/package.json");
    expect(ciSiteRuns[0]?.match(SITE_BUILD)?.[1]).toBe(docsSite.name);
    const siteBuild = expandScript(docsSite.scripts ?? {}, "build:site");
    expect(siteBuild).toContain("bun run build-indexes");
    expect(siteBuild).toContain("vite build --mode client");
    expect(siteBuild).toMatch(/vite build(?!\s+--mode)/);
  });
});

describe("lint gate", () => {
  test("the lint script fails on warnings, not only errors", async () => {
    const manifest = await Bun.file(join(import.meta.dir, "..", "package.json")).json();
    expect(manifest.scripts.lint).toContain("--error-on-warnings");
  });
});

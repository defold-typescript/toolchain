import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { parse } from "yaml";
import type { Scope } from "../scripts/ci-scope.ts";
import { LIBRARY_DATA_DIR } from "../scripts/library-check-data.ts";
import { BOT_BRANCH_PREFIX } from "../scripts/library-update-prs.ts";
import { admittedScopes, runsFor } from "./workflow-scopes.ts";

const workflowPath = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");

function loadWorkflow(): Record<string, unknown> {
  const raw = readFileSync(workflowPath, "utf8");
  return parse(raw) as Record<string, unknown>;
}

describe("ci workflow", () => {
  test("is valid YAML", () => {
    expect(() => loadWorkflow()).not.toThrow();
  });

  test("triggers on branch pushes, release tags, pull requests and by hand", () => {
    const wf = loadWorkflow();
    // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
    const on = (wf.on ?? wf[true as unknown as string]) as Record<string, unknown>;
    expect(on).toBeDefined();
    expect(Object.keys(on)).toContain("push");
    expect(Object.keys(on)).toContain("pull_request");
    expect(Object.keys(on)).toContain("workflow_dispatch");
    const push = on.push as { branches?: string[]; tags?: string[] };
    expect(push.branches).toContain("**");
    expect(push.tags).toContain("v*");
  });

  test("leaves the update bot's branches to their PR runs", () => {
    const wf = loadWorkflow();
    const on = (wf.on ?? wf[true as unknown as string]) as Record<string, unknown>;
    const push = on.push as { branches?: string[] };
    expect(push.branches).toContain(`!${BOT_BRANCH_PREFIX}**`);
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

function workflowTriggers(file: string): string[] {
  const raw = readFileSync(join(repoRoot, ".github", "workflows", file), "utf8");
  const wf = parse(raw) as Record<string, unknown>;
  // YAML parses the bare `on:` key as boolean true, so read it back tolerantly.
  return Object.keys((wf.on ?? wf[true as unknown as string]) as Record<string, unknown>);
}

const SITE_BUILD = /bun run --filter '([^']+)' build:site\b/;

describe("docs site page build", () => {
  test("bun run build and CI never build the toolchain docs pages; only the library-docs job builds library pages", () => {
    expect(readManifest("package.json").scripts?.build).toBe("bun run --filter '*' build");
    const manifests = workspaceManifests();
    expect(manifests.map((m) => m.name)).toContain("@defold-typescript/docs-site");
    const pageBuilds = manifests
      .filter((m) => expandScript(m.scripts ?? {}, "build").includes("vite build"))
      .map((m) => m.name);
    expect(pageBuilds).toEqual([]);

    const ciSiteRuns = Object.entries(workflowJobs("ci.yml")).flatMap(([id, job]) =>
      jobRuns(job)
        .filter((cmd) => /build:site|vite build/.test(cmd))
        .map((cmd) => `${id}: ${cmd}`),
    );
    expect(ciSiteRuns).toEqual(["library-docs: bun run --cwd packages/library-docs build:site"]);
  });

  test("the docs deploy builds the pages and runs only when dispatched", () => {
    expect(workflowTriggers("deploy-docs.yml")).toEqual(["workflow_dispatch"]);
    const deploySiteRuns = Object.values(workflowJobs("deploy-docs.yml")).flatMap((job) =>
      jobRuns(job).filter((cmd) => cmd.includes("build:site")),
    );
    expect(deploySiteRuns).toHaveLength(1);

    const docsSite = readManifest("packages/docs-site/package.json");
    expect(deploySiteRuns[0]?.match(SITE_BUILD)?.[1]).toBe(docsSite.name);
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

interface CiStep {
  id?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  run?: string;
}

interface CiJob {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: CiStep[];
}

function ciJobs(): Record<string, CiJob> {
  return loadWorkflow().jobs as Record<string, CiJob>;
}

function ciJob(id: string): CiJob {
  const job = ciJobs()[id];
  if (!job) throw new Error(`ci.yml has no ${id} job`);
  return job;
}

const ALWAYS_RUN = new Set(["scope", "ci-done"]);

// The change scopes each scope-gated job runs for.
function scopeGatedJobs(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(ciJobs())
      .filter(([id]) => !ALWAYS_RUN.has(id))
      .map(([id, job]) => [id, admittedScopes(job.if ?? "")]),
  );
}

// The scope job writes the scopes as one comma-separated `scopes=` line.
function jobsRunFor(scopes: readonly Scope[]): string[] {
  const output = scopes.join(",");
  return Object.entries(scopeGatedJobs())
    .filter(([, admitted]) => runsFor(admitted, output))
    .map(([id]) => id)
    .sort();
}

// The workflow's shell steps run on ubuntu-latest only. On Windows `bash` can
// resolve to the WSL launcher instead of Git Bash, so they run where bash is real.
const posixBash = process.platform !== "win32" && Bun.which("bash") !== null;

const HEAD_SHA = "f".repeat(40);

// A step `env:` value that is exactly one `${{ github.<path> }}` lookup, resolved
// against a synthetic github context. A missing property renders empty, as on GitHub.
function githubValue(expression: string, github: Record<string, unknown>): string {
  const path = expression.match(/^\$\{\{\s*github\.([\w.]+)\s*\}\}$/)?.[1];
  if (path === undefined) throw new Error(`step env expression is not modelled: ${expression}`);
  let value: unknown = github;
  for (const key of path.split(".")) {
    value =
      value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : undefined;
  }
  return value === undefined || value === null ? "" : String(value);
}

const BUN_STUB = ["#!/bin/sh", `printf '%s\\n' "$@" > "$BUN_ARGS"`, "echo scopes=data", ""].join(
  "\n",
);

// Runs the step behind the scope job's `scopes` output with `bun` stubbed to record
// its arguments and report a data-only change. Returns what the step wrote to
// GITHUB_OUTPUT, and the stub's arguments, or null when it never ran.
function runScopeStep(github: Record<string, unknown>): {
  output: string;
  bunArgs: string[] | null;
} {
  const job = ciJob("scope");
  const id = job.outputs?.scopes?.match(/steps\.([\w-]+)\.outputs\.scopes/)?.[1];
  const step = job.steps?.find((s) => id !== undefined && s.id === id);
  if (step?.run === undefined) throw new Error("the scope job's output names no step that runs");
  if (step.if !== undefined) throw new Error("a conditional scope step is not modelled");
  const dir = mkdtempSync(join(tmpdir(), "ci-scope-step-"));
  try {
    const outputFile = join(dir, "github-output");
    const argsFile = join(dir, "bun-args");
    writeFileSync(outputFile, "");
    writeFileSync(join(dir, "bun"), BUN_STUB, { mode: 0o755 });
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(step.env ?? {}))
      env[key] = githubValue(value, github);
    const result = Bun.spawnSync(["bash", "-e", "-c", step.run], {
      cwd: repoRoot,
      env: {
        ...env,
        PATH: `${dir}${delimiter}${process.env.PATH ?? ""}`,
        GITHUB_SHA: HEAD_SHA,
        GITHUB_OUTPUT: outputFile,
        BUN_ARGS: argsFile,
      },
      stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error(`the scope step failed: ${result.stderr}`);
    const bunArgs = existsSync(argsFile)
      ? readFileSync(argsFile, "utf8").split("\n").filter(Boolean)
      : null;
    return { output: readFileSync(outputFile, "utf8"), bunArgs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("change scopes", () => {
  test("every job but scope waits for the scope job", () => {
    for (const [id, job] of Object.entries(ciJobs())) {
      if (id === "scope") expect(job.needs).toBeUndefined();
      else expect([job.needs].flat()).toContain("scope");
    }
  });

  test("the full suite runs only in the full scope, each library job in its own", () => {
    expect(jobsRunFor(["full"])).toEqual(["library-data", "lint-typecheck", "test"]);
    expect(jobsRunFor(["data"])).toEqual(["library-data", "library-docs"]);
    expect(jobsRunFor(["library-docs"])).toEqual(["library-docs"]);
    expect(jobsRunFor(["data", "library-docs"])).toEqual(["library-data", "library-docs"]);
  });

  test("no scope runs no job", () => {
    expect(jobsRunFor([])).toEqual([]);
  });

  test("the scope job can read the commit's check runs", () => {
    const job = ciJob("scope");
    expect(job.permissions).toEqual({ contents: "read", checks: "read" });
    const step = job.steps?.find((s) => s.id === "scope");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal workflow value under assertion
    expect(step?.env?.GH_TOKEN).toBe("${{ github.token }}");
  });

  test("the scope job checks out the whole history so the diff reaches its base", () => {
    const checkout = ciJob("scope").steps?.find((s) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
  });

  test.skipIf(!posixBash)("a release tag asks the tagged commit's check runs for its scope", () => {
    const { output, bunArgs } = runScopeStep({
      event_name: "push",
      ref_type: "tag",
      repository: "owner/name",
      token: "a-token",
      event: { before: "a".repeat(40) },
    });
    expect(bunArgs).toEqual([
      "scripts/ci-scope.ts",
      "--tag",
      "--repo",
      "owner/name",
      "--sha",
      HEAD_SHA,
    ]);
    expect(output.trim()).toBe("scopes=data");
  });

  test.skipIf(!posixBash)("a manual run runs everything without diffing", () => {
    const { output, bunArgs } = runScopeStep({
      event_name: "workflow_dispatch",
      ref_type: "branch",
      event: {},
    });
    expect(output.trim()).toBe("scopes=full");
    expect(bunArgs).toBeNull();
  });

  test.skipIf(!posixBash)("a branch push diffs from the branch's previous head", () => {
    const before = "b".repeat(40);
    const { output, bunArgs } = runScopeStep({
      event_name: "push",
      ref_type: "branch",
      event: { before },
    });
    expect(bunArgs).toEqual(["scripts/ci-scope.ts", "--base", before, "--head", HEAD_SHA]);
    expect(output.trim()).toBe("scopes=data");
  });

  test.skipIf(!posixBash)("a pull request diffs from its base", () => {
    const base = "c".repeat(40);
    const { bunArgs } = runScopeStep({
      event_name: "pull_request",
      ref_type: "branch",
      event: { before: "d".repeat(40), pull_request: { base: { sha: base } } },
    });
    expect(bunArgs).toEqual(["scripts/ci-scope.ts", "--base", base, "--head", HEAD_SHA]);
  });
});

const PUBLISHED_CLI_DISCOVERY = "bun scripts/cli-range.ts --ends";

// Runs library-data's published-CLI step with `bun` stubbed to print `versions`
// and exit `discoveryExit`, and `bunx` stubbed to record each call and reject the
// `rejected` package. Returns the step's exit code and the recorded `bunx` calls.
function runPublishedCliStep(options: {
  versions: string[];
  discoveryExit: number;
  rejected?: string;
}): { exitCode: number; bunxCalls: string[] } {
  const step = ciJob("library-data").steps?.find((s) => s.run?.includes(PUBLISHED_CLI_DISCOVERY));
  if (step?.run === undefined) throw new Error("library-data has no published-CLI step");
  if (step.if !== undefined) throw new Error("a conditional published-CLI step is not modelled");
  if (step.env !== undefined) throw new Error("published-CLI step env is not modelled");
  const dir = mkdtempSync(join(tmpdir(), "ci-published-cli-step-"));
  try {
    const callsFile = join(dir, "bunx-calls");
    const bun = [
      "#!/bin/sh",
      ...options.versions.map((version) => `echo ${version}`),
      `exit ${options.discoveryExit}`,
      "",
    ];
    const bunx = ["#!/bin/sh", 'echo "$*" >> "$BUNX_CALLS"', '[ "$1" != "$BUNX_REJECTS" ]', ""];
    writeFileSync(join(dir, "bun"), bun.join("\n"), { mode: 0o755 });
    writeFileSync(join(dir, "bunx"), bunx.join("\n"), { mode: 0o755 });
    const result = Bun.spawnSync(["bash", "-e", "-c", step.run], {
      cwd: repoRoot,
      env: {
        PATH: `${dir}${delimiter}${process.env.PATH ?? ""}`,
        BUNX_CALLS: callsFile,
        BUNX_REJECTS: options.rejected ?? "",
      },
      stdout: "ignore",
      stderr: "ignore",
    });
    const bunxCalls = existsSync(callsFile)
      ? readFileSync(callsFile, "utf8").split("\n").filter(Boolean)
      : [];
    return { exitCode: result.exitCode, bunxCalls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("library jobs", () => {
  test("library-data checks the data with this repo's CLI and the oldest and newest published readers", () => {
    const runs = jobRuns(ciJob("library-data"));
    expect(runs).toContain("bun run library:check");
    const released = runs.find((cmd) => cmd.includes("bun scripts/cli-range.ts --ends"));
    expect(released).toContain('bunx "@defold-typescript/cli@$version" library check --data ');

    // The same folder the nightly run checks with every published reader.
    const dataFolder = (cmd: string | undefined) => cmd?.match(/library check --data (\S+)/)?.[1];
    const nightly = Object.values(workflowJobs("library-check-nightly.yml"))
      .flatMap(jobRuns)
      .find((cmd) => cmd.includes("bun scripts/cli-range.ts"));
    expect(dataFolder(nightly)).toBeDefined();
    expect(dataFolder(released)).toBe(dataFolder(nightly));
  });

  test("library-data runs the tests that read real library data, after the build they need", () => {
    const runs = jobRuns(ciJob("library-data"));
    const buildAt = runs.findIndex((cmd) => cmd.includes("bun run build"));
    const testAt = runs.findIndex(
      (cmd) =>
        /\bbun test\b/.test(cmd) && cmd.includes("bun scripts/ci-scope.ts --real-data-tests"),
    );
    expect(buildAt).toBeGreaterThanOrEqual(0);
    expect(testAt).toBeGreaterThan(buildAt);
  });

  test("library-docs runs that package's tests and builds its site", () => {
    const runs = jobRuns(ciJob("library-docs"));
    expect(runs.some((cmd) => /\bbun test\b.*\.\/packages\/library-docs\b/.test(cmd))).toBe(true);
    expect(runs).toContain("bun run --cwd packages/library-docs build:site");
  });

  test.skipIf(!posixBash)(
    "the published-CLI check fails when it cannot list the published versions",
    () => {
      const { exitCode, bunxCalls } = runPublishedCliStep({ versions: [], discoveryExit: 1 });
      expect(exitCode).not.toBe(0);
      expect(bunxCalls).toEqual([]);
    },
  );

  test.skipIf(!posixBash)("the published-CLI check runs every version it lists", () => {
    const data = relative(repoRoot, LIBRARY_DATA_DIR).replaceAll("\\", "/");
    const { exitCode, bunxCalls } = runPublishedCliStep({
      versions: ["0.40.0", "0.41.2"],
      discoveryExit: 0,
    });
    expect(exitCode).toBe(0);
    expect(bunxCalls).toEqual([
      `@defold-typescript/cli@0.40.0 library check --data ${data}`,
      `@defold-typescript/cli@0.41.2 library check --data ${data}`,
    ]);
  });

  test.skipIf(!posixBash)(
    "the published-CLI check fails when a listed CLI rejects the data",
    () => {
      const { exitCode } = runPublishedCliStep({
        versions: ["0.40.0", "0.41.2"],
        discoveryExit: 0,
        rejected: "@defold-typescript/cli@0.41.2",
      });
      expect(exitCode).not.toBe(0);
    },
  );
});

const NEEDS_JSON = /^\$\{\{\s*toJSON\(needs\)\s*\}\}$/;

// Runs ci-done's steps as GitHub would for the given results of the jobs it needs,
// and returns whether the job fails.
function ciDoneFails(results: Record<string, string>): boolean {
  const needs = Object.fromEntries(
    Object.entries(results).map(([id, result]) => [id, { result, outputs: {} }]),
  );
  for (const step of ciJob("ci-done").steps ?? []) {
    if (step.run === undefined) continue;
    if (step.if !== undefined) throw new Error("a conditional ci-done step is not modelled");
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(step.env ?? {})) {
      if (!NEEDS_JSON.test(value)) throw new Error(`ci-done step env is not modelled: ${value}`);
      env[key] = JSON.stringify(needs, null, 2);
    }
    const result = Bun.spawnSync(["bash", "-e", "-c", step.run], {
      env: { ...env, PATH: process.env.PATH ?? "" },
      stdout: "ignore",
      stderr: "ignore",
    });
    if (result.exitCode !== 0) return true;
  }
  return false;
}

describe("ci-done", () => {
  const neededJobs = () => Object.keys(ciJobs()).filter((id) => id !== "ci-done");
  const results = (result: (id: string) => string) =>
    Object.fromEntries(neededJobs().map((id) => [id, result(id)]));

  test("needs every other job and runs whatever they concluded", () => {
    const job = ciJob("ci-done");
    expect([job.needs].flat().sort()).toEqual(neededJobs().sort());
    expect(job.if).toBe("always()");
  });

  test.skipIf(!posixBash || !Bun.which("jq"))(
    "passes when every job passed or its scope skipped it",
    () => {
      expect(ciDoneFails(results(() => "success"))).toBe(false);
      expect(
        ciDoneFails(
          results((id) => (id === "scope" || id === "library-docs" ? "success" : "skipped")),
        ),
      ).toBe(false);
      expect(ciDoneFails(results((id) => (id === "scope" ? "success" : "skipped")))).toBe(false);
    },
  );

  test.skipIf(!posixBash || !Bun.which("jq"))("fails when any job failed or was cancelled", () => {
    for (const bad of ["failure", "cancelled"]) {
      for (const id of neededJobs()) {
        expect(ciDoneFails(results((other) => (other === id ? bad : "success")))).toBe(true);
      }
    }
  });
});

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { parse } from "yaml";
import { PORTAL_DRIFT_ISSUE_TITLE, type PortalDriftReport } from "../scripts/asset-portal-check.ts";
import {
  issueTitleFor,
  type ShippedTypesReport,
  type ShippedTypesRun,
} from "../scripts/shipped-types-check.ts";

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

const REPORT_FILES = ["portal.json", "shipped.json"] as const;
type ReportFile = (typeof REPORT_FILES)[number];

// The workflow's shell steps run on ubuntu-latest only. On Windows `bash` can
// resolve to the WSL launcher instead of Git Bash, so they run where bash is real.
const posixBash = process.platform !== "win32" && Bun.which("bash") !== null;
const canRunIssueSteps = posixBash && Bun.which("jq") !== null;

// Models `gh`'s own contract, not the workflow's script: `issue list` hands the
// open issues to the caller's `--jq` filter on real `jq`, so the step's own title
// match decides; `issue create` records what it was given; any other call fails.
const GH_STUB = [
  "#!/bin/sh",
  'case "$1 $2" in',
  '  "issue list"|"issue create") ;;',
  '  *) echo "gh stub: unmodelled call: gh $*" >&2; exit 1 ;;',
  "esac",
  'command="$2"',
  "shift 2",
  'json=""; filter=""; title=""; body_file=""',
  "while [ $# -gt 0 ]; do",
  '  [ $# -ge 2 ] || { echo "gh stub: flag without a value: $1" >&2; exit 1; }',
  '  case "$1" in',
  '    --json) json="$2" ;;',
  '    --jq) filter="$2" ;;',
  '    --title) title="$2" ;;',
  '    --body-file) body_file="$2" ;;',
  "  esac",
  "  shift 2",
  "done",
  'if [ "$command" = list ]; then',
  '  if [ -z "$filter" ]; then cat "$GH_STUB_OPEN"; exit 0; fi',
  '  [ -n "$json" ] || { echo "gh stub: --jq needs --json" >&2; exit 1; }',
  '  exec jq -r "$filter" "$GH_STUB_OPEN"',
  "fi",
  '[ -n "$title" ] && [ -n "$body_file" ] || { echo "gh stub: create needs --title and --body-file" >&2; exit 1; }',
  `jq -n -c --arg title "$title" --rawfile body "$body_file" '{title: $title, body: $body}' >> "$GH_STUB_CREATED"`,
  "",
].join("\n");

type OpenIssue = { number: number; title: string };
type CreatedIssue = { title: string; body: string };

// Runs the one issue step that reads `reportFile` against `report`, in a fresh
// directory, with `gh` stubbed to list `openIssues` as the open issues.
function runIssueStep(
  reportFile: ReportFile,
  report: PortalDriftReport | ShippedTypesRun,
  openIssues: readonly OpenIssue[],
): { exitCode: number; created: CreatedIssue[]; stderr: string } {
  const matching = issueSteps().filter((step) => (step.run ?? "").includes(reportFile));
  const run = matching[0]?.run;
  if (matching.length !== 1 || run === undefined) {
    throw new Error(`expected one issue step reading ${reportFile}, found ${matching.length}`);
  }
  const dir = mkdtempSync(join(tmpdir(), "library-upstream-issue-step-"));
  try {
    const stub = join(dir, "stub");
    const work = join(dir, "work");
    mkdirSync(stub);
    mkdirSync(work);
    const openFile = join(stub, "open-issues.json");
    const createdFile = join(stub, "created.jsonl");
    writeFileSync(join(stub, "gh"), GH_STUB, { mode: 0o755 });
    writeFileSync(openFile, JSON.stringify(openIssues));
    writeFileSync(join(work, reportFile), JSON.stringify(report));
    const result = Bun.spawnSync(["bash", "-e", "-o", "pipefail", "-c", run], {
      cwd: work,
      env: {
        PATH: `${stub}${delimiter}${process.env.PATH ?? ""}`,
        GH_STUB_OPEN: openFile,
        GH_STUB_CREATED: createdFile,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const created = existsSync(createdFile)
      ? readFileSync(createdFile, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as CreatedIssue)
      : [];
    return { exitCode: result.exitCode, created, stderr: result.stderr.toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function openIssues(...titles: string[]): OpenIssue[] {
  return titles.map((title, index) => ({ number: 100 + index, title }));
}

// Open issues that are not `title` but come close: one has it as a prefix, the
// other is a sibling title of the same family. Only an exact match skips them.
function decoys(title: string, sibling: string): string[] {
  return [`${title} (follow-up)`, sibling];
}

const portalDrift = {
  command: "asset-portal:check",
  pinnedCommit: "a".repeat(40),
  headCommit: "b".repeat(40),
  added: [{ id: "example-lib", projectUrl: "https://github.com/example/example-lib" }],
  removed: [],
  actionable: true,
  issueTitle: PORTAL_DRIFT_ISSUE_TITLE,
  issueBody: "1 portal entry is not in asset-portal.json.",
} satisfies PortalDriftReport;

const portalInSync = {
  command: "asset-portal:check",
  pinnedCommit: "a".repeat(40),
  headCommit: "a".repeat(40),
  added: [],
  removed: [],
  actionable: false,
} satisfies PortalDriftReport;

const portalDecoys = decoys(PORTAL_DRIFT_ISSUE_TITLE, issueTitleFor("example/a-lib", "v2.0.0"));

function shippedReport(
  slug: string,
  ref: string,
): ShippedTypesReport & { issueTitle: string; issueBody: string } {
  return {
    command: "upstream:shipped-types-check",
    repo: slug,
    ref,
    actionable: true,
    reason: "accepted",
    retire: [{ lane: "authored", id: slug, source: `${slug}.d.ts` }],
    files: ["index.d.ts"],
    issueTitle: issueTitleFor(slug, ref),
    issueBody: `${slug} ${ref} ships types.`,
  };
}

const shippedTracked = shippedReport("example/a-lib", "v2.0.0");
const shippedUntracked = shippedReport("example/b-lib", "v3.1.0");
const shippedNothing = {
  command: "upstream:shipped-types-check",
  repo: "example/c-lib",
  ref: "v1.0.0",
  actionable: false,
  reason: "none",
  retire: [{ lane: "authored", id: "example/c-lib", source: "example/c-lib.d.ts" }],
} satisfies ShippedTypesReport;

const shippedRun = {
  command: "upstream:shipped-types-check",
  actionable: true,
  reports: [shippedTracked, shippedUntracked, shippedNothing],
} satisfies ShippedTypesRun;

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

  test("gives every issue step a report file only it reads, so each runs a scenario below", () => {
    const runs = issueSteps().map((step) => step.run ?? "");
    expect(runs).not.toHaveLength(0);
    for (const run of runs)
      expect(REPORT_FILES.filter((file) => run.includes(file))).toHaveLength(1);
    for (const file of REPORT_FILES)
      expect(runs.filter((run) => run.includes(file))).toHaveLength(1);
  });

  test.skipIf(!canRunIssueSteps)(
    "files no portal issue while one with its exact title is open",
    () => {
      const result = runIssueStep(
        "portal.json",
        portalDrift,
        openIssues(...portalDecoys, PORTAL_DRIFT_ISSUE_TITLE),
      );
      expect(result).toEqual({ exitCode: 0, created: [], stderr: expect.any(String) });
    },
  );

  test.skipIf(!canRunIssueSteps)(
    "files the portal issue when only near-miss titles are open",
    () => {
      const result = runIssueStep("portal.json", portalDrift, openIssues(...portalDecoys));
      expect(result).toEqual({
        exitCode: 0,
        created: [{ title: PORTAL_DRIFT_ISSUE_TITLE, body: `${portalDrift.issueBody}\n` }],
        stderr: expect.any(String),
      });
    },
  );

  test.skipIf(!canRunIssueSteps)("files no portal issue for a report with no drift", () => {
    const result = runIssueStep("portal.json", portalInSync, openIssues(...portalDecoys));
    expect(result).toEqual({ exitCode: 0, created: [], stderr: expect.any(String) });
  });

  test.skipIf(!canRunIssueSteps)(
    "files one shipped-types issue per actionable report whose exact title is not open",
    () => {
      const result = runIssueStep(
        "shipped.json",
        shippedRun,
        openIssues(
          shippedTracked.issueTitle,
          ...decoys(shippedUntracked.issueTitle, issueTitleFor(shippedUntracked.repo, "v3.0.0")),
        ),
      );
      expect(result).toEqual({
        exitCode: 0,
        created: [{ title: shippedUntracked.issueTitle, body: `${shippedUntracked.issueBody}\n` }],
        stderr: expect.any(String),
      });
    },
  );

  test("opens issues for the reports that were readable even when a scan step failed", () => {
    const conditions = issueSteps().map((step) => (step.if ?? "").replace(/\s|\$\{\{|\}\}/g, ""));
    expect(conditions).not.toHaveLength(0);
    // A step defaults to `if: success()`, so one unreadable repo would withhold
    // every other report's issue. The condition has to be one that still holds
    // after a failed predecessor; `success()` or a missing key reds.
    for (const condition of conditions) expect(condition).toMatch(/^(!cancelled\(\)|always\(\))$/);
  });

  test.each(CHECKS)(
    "keeps the %s step failing the job, so an unreadable source is never a quiet green",
    (check) => {
      const scanStep = steps().find((step) => (step.run ?? "").includes(`bun scripts/${check}.ts`));
      expect(scanStep).toBeDefined();
      // The tempting wrong fix for the same bug: `continue-on-error` on the scan
      // would isolate the failure by discarding it, turning a renamed or deleted
      // repo into a green week.
      expect(scanStep?.["continue-on-error"]).toBeUndefined();
    },
  );
});

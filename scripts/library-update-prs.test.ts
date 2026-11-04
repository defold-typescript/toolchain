import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { parse } from "yaml";
import { PORTAL_DRIFT_ISSUE_TITLE } from "./asset-portal-check.ts";
import { issueTitleFor as releaseIssueTitle } from "./defold-upstream-check.ts";
import {
  type Check,
  checksState,
  main,
  mayAutoMerge,
  type Run,
  type UpdateEntry,
} from "./library-update-prs.ts";
import { issueTitleFor as movedIssueTitle } from "./library-upstream-issue.ts";
import { issueTitleFor as retireIssueTitle } from "./shipped-types-check.ts";

const DATA = "packages/library-types/data/0.55.0";
const IDENTITY = [
  "-c",
  "user.name=test",
  "-c",
  "user.email=test@example.invalid",
  "-c",
  "commit.gpgsign=false",
];

function regenerated(library: string, change: "kept" | "added" | "changed"): UpdateEntry {
  return {
    library,
    status: "regenerated",
    recorded: [],
    differs: ["c2"],
    written: [`source/${library}.lua`, "reviewed.json"],
    ref: "v2",
    change,
    members: { added: [], removed: [], changed: [] },
  };
}

function recordedOnly(library: string): UpdateEntry {
  return { library, status: "recorded", recorded: ["c2"], differs: [], written: ["reviewed.json"] };
}

function unchanged(library: string, status: "current" | "held"): UpdateEntry {
  return { library, status, recorded: [], differs: [], written: [] };
}

// Rollup entries in the shape `gh pr list --json statusCheckRollup` prints them.
function checkRun(conclusion: string, status = "COMPLETED"): Check {
  return { __typename: "CheckRun", name: "ci-done", status, conclusion };
}

function statusContext(state: string): Check {
  return { __typename: "StatusContext", context: "ci", state };
}

const RED = [checkRun("SUCCESS"), checkRun("FAILURE")];
const GREEN = [checkRun("SUCCESS"), checkRun("SKIPPED")];
const PENDING = [checkRun("SUCCESS"), checkRun("", "IN_PROGRESS")];

describe("checksState", () => {
  test("a failed check run beside passing ones is red", () => {
    expect(checksState(RED)).toBe("red");
  });

  test("an errored status context is red", () => {
    expect(checksState([checkRun("SUCCESS"), statusContext("ERROR")])).toBe("red");
  });

  test("check runs that all passed or were skipped are green", () => {
    expect(checksState(GREEN)).toBe("green");
  });

  test("a check still in progress is pending", () => {
    expect(checksState(PENDING)).toBe("pending");
  });

  test("no checks at all is pending", () => {
    expect(checksState([])).toBe("pending");
  });
});

function ownFiles(entry: UpdateEntry, dataFolder: string): string[] {
  return entry.written.map((path) => `${dataFolder}/${entry.library}/${path}`);
}

describe("mayAutoMerge", () => {
  const generated = [`${DATA}/alpha/reviewed.json`, `${DATA}/alpha/source/alpha.lua`];

  test.each([
    "kept",
    "added",
  ] as const)("a %s change inside reviewed.json and source/ may merge", (change) => {
    expect(mayAutoMerge(regenerated("alpha", change), generated, DATA)).toBe(true);
  });

  test("a changed change may not merge", () => {
    expect(mayAutoMerge(regenerated("alpha", "changed"), generated, DATA)).toBe(false);
  });

  test.each([
    `${DATA}/alpha/fork/alpha.d.ts`,
    `${DATA}/alpha/usage/alpha.test-d.ts`,
    `${DATA}/alpha/library.json`,
    `${DATA}/beta/source/beta.lua`,
    `${DATA}/alphabet/source/alphabet.lua`,
    "packages/library-types/data/0.54.0/alpha/source/alpha.lua",
    "packages/library-types/NOTICE",
    "packages/library-docs/package.json",
    ".github/workflows/library-update.yml",
    "README.md",
  ])("a kept change that also touches %s may not merge", (path) => {
    expect(mayAutoMerge(regenerated("alpha", "kept"), [...generated, path], DATA)).toBe(false);
  });

  test("an entry that only recorded commits may merge its reviewed.json", () => {
    expect(mayAutoMerge(recordedOnly("alpha"), [`${DATA}/alpha/reviewed.json`], DATA)).toBe(true);
  });

  test("a regenerated entry that names no change may not merge", () => {
    const { change: _, ...unnamed } = regenerated("alpha", "kept");
    expect(mayAutoMerge(unnamed, generated, DATA)).toBe(false);
  });

  test("an entry with no changed paths may not merge", () => {
    expect(mayAutoMerge(regenerated("alpha", "kept"), [], DATA)).toBe(false);
  });

  // Only a PR the CI scope rule reads as all library data may merge without a
  // human, so a data folder outside library data keeps even an entry's own
  // generated files a human PR.
  describe.each([
    ["kept", regenerated("alpha", "kept")],
    ["added", regenerated("alpha", "added")],
    ["recording-only", recordedOnly("alpha")],
  ] as const)("the %s entry", (_, entry) => {
    test("whose own files are library data may merge", () => {
      expect(mayAutoMerge(entry, ownFiles(entry, DATA), DATA)).toBe(true);
    });

    test.each([
      "data/0.55.0",
      "packages/library-types/0.55.0",
      "packages/library-docs/data/0.55.0",
    ])("whose own files sit in %s, outside library data, may not merge", (dataFolder) => {
      expect(mayAutoMerge(entry, ownFiles(entry, dataFolder), dataFolder)).toBe(false);
    });
  });
});

// The step a `git push`, `gh pr` or `gh issue` call takes, so the fake can fail one
// and a test can read the order they ran in.
function operation(args: string[]): string {
  if (args[0] === "git") return args[1] ?? "";
  if (args[1] === "issue") return `issue-${args[2] ?? ""}`;
  if (args[2] === "list") return args.includes("--head") ? "list" : "list-all";
  if (args[2] !== "merge") return args[2] ?? "";
  return args.includes("--disable-auto") ? "disable-auto" : "enable";
}

interface Pull {
  readonly number: number;
  readonly headRefName: string;
  readonly statusCheckRollup: Check[];
}

describe("main", () => {
  let root: string;
  let repo: string;
  let remote: string;
  let seed: string;
  // Every `git push` and `gh` call, in the order `main` made them.
  let log: string[][];
  let failing: Set<string>;
  // The open PRs and issues, as GitHub would list them.
  let pulls: Pull[];
  let issues: { number: number; title: string }[];
  let nextIssue: number;
  // Branches whose PR has auto-merge on, as GitHub would hold it.
  let autoMerge: Set<string>;
  // Runs on `pr create` and `pr edit`, standing in for another run's push.
  let hook: ((args: string[]) => void) | undefined;

  function childEnv(): Record<string, string> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    for (const key of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"]) delete env[key];
    return env;
  }

  function git(cwd: string, ...args: string[]): string {
    const result = Bun.spawnSync(["git", ...IDENTITY, ...args], { cwd, env: childEnv() });
    if (result.exitCode !== 0)
      throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
    return result.stdout.toString();
  }

  function write(path: string, content: string): void {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  function regenerate(library: string): void {
    write(`${DATA}/${library}/reviewed.json`, '{ "ref": "v2" }\n');
    write(`${DATA}/${library}/source/${library}.lua`, "-- v2\n");
  }

  function flag(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  }

  function remoteHead(branch: string): string {
    return git(remote, "rev-parse", `refs/heads/${branch}`).trim();
  }

  function openPull(
    library: string,
    {
      autoMerging,
      number = 7,
      rollup = [],
    }: { autoMerging: boolean; number?: number; rollup?: Check[] },
  ): void {
    const branch = `library-update/${library}`;
    git(repo, "push", "--quiet", "origin", `main:refs/heads/${branch}`);
    pulls.push({ number, headRefName: branch, statusCheckRollup: rollup });
    if (autoMerging) autoMerge.add(branch);
  }

  function respond(stdout: unknown = ""): { code: number; stdout: string; stderr: string } {
    return {
      code: 0,
      stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
      stderr: "",
    };
  }

  function issueCommand(args: string[]): { code: number; stdout: string; stderr: string } {
    const step = operation(args);
    if (step === "issue-list") return respond(issues);
    if (step === "issue-create")
      issues.push({ number: nextIssue++, title: flag(args, "--title") ?? "" });
    if (step === "issue-close") issues = issues.filter(({ number }) => String(number) !== args[3]);
    return respond();
  }

  const run: Run = (args) => {
    if (args[0] === "git") {
      if (operation(args) === "push") log.push(args);
      const result = Bun.spawnSync(["git", ...IDENTITY, ...args.slice(1)], {
        cwd: repo,
        env: childEnv(),
      });
      return {
        code: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    }
    log.push(args);
    const step = operation(args);
    if (failing.has(step)) return { code: 1, stdout: "", stderr: `${step} refused` };
    if (args[1] === "issue") return issueCommand(args);
    if (step === "list-all") return respond(pulls);
    if (step === "list") {
      const branch = flag(args, "--head") ?? "";
      return respond(
        pulls
          .filter(({ headRefName }) => headRefName === branch)
          .map(({ number }) => ({
            number,
            autoMergeRequest: autoMerge.has(branch) ? { mergeMethod: "SQUASH" } : null,
          })),
      );
    }
    if (step === "create" || step === "edit") hook?.(args);
    const branch = args[3] ?? "";
    if (step === "close") pulls = pulls.filter(({ headRefName }) => headRefName !== branch);
    if (step === "disable-auto") autoMerge.delete(branch);
    if (step === "enable") {
      // GitHub's `expectedHeadOid`: auto-merge goes on only while the branch still
      // holds the commit the caller names.
      const expected = flag(args, "--match-head-commit");
      if (expected !== undefined && expected !== remoteHead(branch)) {
        return { code: 1, stdout: "", stderr: "head moved" };
      }
      autoMerge.add(branch);
    }
    return { code: 0, stdout: "", stderr: "" };
  };

  function report(
    updated: UpdateEntry[],
    failed: { library: string; message: string }[] = [],
  ): string {
    const path = join(root, "report.json");
    const dataFolder = join(repo, DATA).split("\\").join("/");
    writeFileSync(
      path,
      JSON.stringify({ command: "library", subcommand: "update", dataFolder, updated, failed }),
    );
    return path;
  }

  function branchFiles(library: string): string[] {
    return git(remote, "diff", "--name-only", "main", `library-update/${library}`)
      .split("\n")
      .filter(Boolean)
      .sort();
  }

  function gh(subcommand: string): string[][] {
    return log.filter((args) => args[0] === "gh" && args[1] === "pr" && args[2] === subcommand);
  }

  function issueCalls(subcommand: string): string[][] {
    return log.filter((args) => args[0] === "gh" && args[1] === "issue" && args[2] === subcommand);
  }

  function order(...steps: string[]): string[] {
    return log.map(operation).filter((step) => steps.includes(step));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "library-update-prs-"));
    repo = join(root, "repo");
    remote = join(root, "remote.git");
    git(root, "init", "--quiet", "--bare", remote);
    mkdirSync(repo);
    git(repo, "init", "--quiet", "-b", "main");
    for (const library of ["alpha", "beta"]) {
      write(`${DATA}/${library}/reviewed.json`, '{ "ref": "v1" }\n');
      write(`${DATA}/${library}/source/${library}.lua`, "-- v1\n");
      write(`${DATA}/${library}/fork/${library}.d.ts`, "// v1\n");
    }
    git(repo, "add", "-A");
    git(repo, "commit", "--quiet", "-m", "seed");
    git(repo, "remote", "add", "origin", remote);
    git(repo, "push", "--quiet", "origin", "main");
    seed = git(repo, "rev-parse", "HEAD").trim();
    log = [];
    failing = new Set();
    pulls = [];
    issues = [];
    nextIssue = 20;
    autoMerge = new Set();
    hook = undefined;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("each library gets one branch holding only its own folder", () => {
    regenerate("alpha");
    regenerate("beta");
    const current: UpdateEntry = {
      library: "gamma",
      status: "current",
      recorded: [],
      differs: [],
      written: [],
    };
    const code = main(
      report([regenerated("alpha", "kept"), regenerated("beta", "changed"), current]),
      {
        cwd: repo,
        run,
      },
    );
    expect(code).toBe(0);
    expect(branchFiles("alpha")).toEqual([
      `${DATA}/alpha/reviewed.json`,
      `${DATA}/alpha/source/alpha.lua`,
    ]);
    expect(branchFiles("beta")).toEqual([
      `${DATA}/beta/reviewed.json`,
      `${DATA}/beta/source/beta.lua`,
    ]);
    expect(gh("create").map((args) => flag(args, "--head"))).toEqual([
      "library-update/alpha",
      "library-update/beta",
    ]);
  });

  test("a kept change turns on auto-merge and a changed one does not", () => {
    regenerate("alpha");
    regenerate("beta");
    main(report([regenerated("alpha", "kept"), regenerated("beta", "changed")]), {
      cwd: repo,
      run,
    });
    expect(gh("merge")).toEqual([
      [
        "gh",
        "pr",
        "merge",
        "library-update/alpha",
        "--auto",
        "--squash",
        "--match-head-commit",
        remoteHead("library-update/alpha"),
      ],
    ]);
  });

  test("an open PR whose change may not merge has auto-merge turned off and none turned on", () => {
    regenerate("beta");
    openPull("beta", { autoMerging: true });
    main(report([regenerated("beta", "changed")]), { cwd: repo, run });
    expect(gh("create")).toEqual([]);
    expect(gh("merge")).toEqual([["gh", "pr", "merge", "library-update/beta", "--disable-auto"]]);
    expect(autoMerge.has("library-update/beta")).toBe(false);
  });

  test("a run that cannot retitle an auto-merging PR has turned its auto-merge off first", () => {
    regenerate("beta");
    openPull("beta", { autoMerging: true });
    failing.add("edit");
    expect(() => main(report([regenerated("beta", "changed")]), { cwd: repo, run })).toThrow(
      "edit refused",
    );
    expect(remoteHead("library-update/beta")).not.toBe(seed);
    expect(branchFiles("beta")).toEqual([
      `${DATA}/beta/reviewed.json`,
      `${DATA}/beta/source/beta.lua`,
    ]);
    expect(autoMerge.has("library-update/beta")).toBe(false);
    expect(order("disable-auto", "push")).toEqual(["disable-auto", "push"]);
  });

  test.each([
    "list",
    "disable-auto",
  ])("a failed %s leaves an auto-merging PR's branch where it was", (step) => {
    regenerate("beta");
    openPull("beta", { autoMerging: true });
    failing.add(step);
    expect(() => main(report([regenerated("beta", "changed")]), { cwd: repo, run })).toThrow(
      `${step} refused`,
    );
    expect(remoteHead("library-update/beta")).toBe(seed);
  });

  test("an auto-merging PR whose change may merge gets auto-merge back for the pushed commit", () => {
    regenerate("alpha");
    openPull("alpha", { autoMerging: true });
    main(report([regenerated("alpha", "kept")]), { cwd: repo, run });
    const head = remoteHead("library-update/alpha");
    expect(head).not.toBe(seed);
    expect(order("disable-auto", "push", "enable")).toEqual(["disable-auto", "push", "enable"]);
    expect(gh("merge").at(-1)).toEqual([
      "gh",
      "pr",
      "merge",
      "library-update/alpha",
      "--auto",
      "--squash",
      "--match-head-commit",
      head,
    ]);
    expect(autoMerge.has("library-update/alpha")).toBe(true);
  });

  test("a branch another run moves before auto-merge goes on keeps auto-merge off", () => {
    regenerate("alpha");
    hook = (args) => {
      if (operation(args) === "create")
        git(remote, "update-ref", "refs/heads/library-update/alpha", seed);
    };
    expect(() => main(report([regenerated("alpha", "kept")]), { cwd: repo, run })).toThrow(
      "head moved",
    );
    expect(autoMerge.has("library-update/alpha")).toBe(false);
  });

  test("an open PR takes the new title", () => {
    regenerate("beta");
    openPull("beta", { autoMerging: false });
    main(report([regenerated("beta", "changed")]), { cwd: repo, run });
    const [edit = []] = gh("edit");
    expect(flag(edit, "--title")).toBe("update beta to v2");
  });

  test("a library folder holding a file the report does not name stays a human PR", () => {
    regenerate("alpha");
    write(`${DATA}/alpha/fork/alpha.d.ts`, "// edited\n");
    main(report([regenerated("alpha", "kept")]), { cwd: repo, run });
    expect(branchFiles("alpha")).toContain(`${DATA}/alpha/fork/alpha.d.ts`);
    expect(gh("merge")).toEqual([]);
  });

  test("a failed library leaves the others their PR and exits 1", () => {
    regenerate("alpha");
    const code = main(
      report([regenerated("alpha", "kept")], [{ library: "beta", message: "404" }]),
      {
        cwd: repo,
        run,
      },
    );
    expect(code).toBe(1);
    expect(gh("create")).toHaveLength(1);
  });

  test("a bot PR for a current or held library is closed and its branch left alone", () => {
    openPull("alpha", { autoMerging: false, number: 7 });
    openPull("beta", { autoMerging: false, number: 8 });
    pulls.push({ number: 9, headRefName: "fix/alpha", statusCheckRollup: RED });
    const code = main(
      report([
        unchanged("alpha", "current"),
        unchanged("beta", "held"),
        unchanged("gamma", "current"),
      ]),
      { cwd: repo, run },
    );
    expect(code).toBe(0);
    const closes = gh("close");
    expect(closes.map((args) => args[3])).toEqual(["library-update/alpha", "library-update/beta"]);
    expect(closes.every((args) => args.includes("--delete-branch"))).toBe(true);
    expect(flag(closes[0] ?? [], "--comment")).toContain("current");
    expect(flag(closes[1] ?? [], "--comment")).toContain("held");
    expect(issueCalls("create")).toEqual([]);
    expect(order("push")).toEqual([]);
    expect(remoteHead("library-update/alpha")).toBe(seed);
    expect(remoteHead("library-update/beta")).toBe(seed);
  });

  test("a failed library gets one issue naming the failure, which a later run edits", () => {
    const failedBeta = () => report([], [{ library: "beta", message: "upstream answered 404" }]);
    expect(main(failedBeta(), { cwd: repo, run })).toBe(1);
    expect(main(failedBeta(), { cwd: repo, run })).toBe(1);
    const creates = issueCalls("create");
    expect(creates.map((args) => flag(args, "--title"))).toEqual([
      "library update cannot land beta",
    ]);
    expect(flag(creates[0] ?? [], "--body")).toContain("upstream answered 404");
    const edits = issueCalls("edit");
    expect(edits.map((args) => args[3])).toEqual(["20"]);
    expect(flag(edits[0] ?? [], "--body")).toContain("upstream answered 404");
  });

  test("a library whose PR's checks are red gets an issue linking it, read before the push", () => {
    regenerate("alpha");
    openPull("alpha", { autoMerging: false, number: 7, rollup: RED });
    main(report([regenerated("alpha", "kept")]), { cwd: repo, run });
    const creates = issueCalls("create");
    expect(creates.map((args) => flag(args, "--title"))).toEqual([
      "library update cannot land alpha",
    ]);
    expect(flag(creates[0] ?? [], "--body")).toContain("#7");
    expect(order("list-all", "push")).toEqual(["list-all", "push"]);
    expect(remoteHead("library-update/alpha")).not.toBe(seed);
  });

  test("a bot issue closes once its library is current or its PR is green, and waits on a pending PR", () => {
    regenerate("beta");
    regenerate("gamma");
    openPull("alpha", { autoMerging: false, number: 7, rollup: RED });
    openPull("beta", { autoMerging: false, number: 8, rollup: GREEN });
    openPull("gamma", { autoMerging: false, number: 9, rollup: PENDING });
    issues = ["alpha", "beta", "gamma"].map((library, index) => ({
      number: 30 + index,
      title: `library update cannot land ${library}`,
    }));
    main(
      report([
        unchanged("alpha", "current"),
        regenerated("beta", "changed"),
        regenerated("gamma", "changed"),
      ]),
      { cwd: repo, run },
    );
    const closes = issueCalls("close");
    expect(closes.map((args) => args[3])).toEqual(["30", "31"]);
    expect(flag(closes[0] ?? [], "--comment")).toContain("current");
    expect(flag(closes[1] ?? [], "--comment")).toContain("#8");
    expect(issueCalls("edit")).toEqual([]);
    expect(issueCalls("create")).toEqual([]);
  });

  test("the weekly pin check's issues are closed and other issues stay open", () => {
    issues = [
      { number: 40, title: movedIssueTitle("acme/widget", "2", false) },
      { number: 41, title: movedIssueTitle("acme/gadget", "main", true) },
      { number: 42, title: PORTAL_DRIFT_ISSUE_TITLE },
      { number: 43, title: retireIssueTitle("acme/widget", "v3") },
      { number: 44, title: releaseIssueTitle("1.13.1") },
    ];
    main(report([]), { cwd: repo, run });
    const closes = issueCalls("close");
    expect(closes.map((args) => args[3])).toEqual(["40", "41"]);
    expect(closes.every((args) => (flag(args, "--comment") ?? "") !== "")).toBe(true);
  });
});

// The bare specifiers a script reaches through its relative imports: what has to
// be installed before `bun` can run it.
function packagesImportedBy(entry: string): string[] {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string): void => {
    const key = file.split(sep).join("/");
    if (seen.has(key)) return;
    seen.add(key);
    for (const { path, kind } of transpiler.scan(readFileSync(file, "utf8")).imports) {
      if (kind === "dynamic-import") continue;
      if (path.startsWith(".")) visit(resolve(dirname(file), path));
      else if (!path.startsWith("node:") && path !== "bun" && !path.startsWith("bun:"))
        packages.add(path);
    }
  };
  visit(entry);
  return [...packages].sort();
}

describe("library update workflow", () => {
  const path = join(import.meta.dir, "..", ".github", "workflows", "library-update.yml");

  test("runs the PR script with no install, so the script imports no package", () => {
    const workflow = parse(readFileSync(path, "utf8")) as {
      jobs?: Record<string, { steps?: { run?: string }[] }>;
    };
    const runs = Object.values(workflow.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).map((step) => step.run ?? ""),
    );
    expect(runs.some((cmd) => cmd.includes("bun scripts/library-update-prs.ts"))).toBe(true);
    const installs = runs.some((cmd) => /\bbun install\b/.test(cmd));
    const script = join(import.meta.dir, "library-update-prs.ts");
    expect(installs ? [] : packagesImportedBy(script)).toEqual([]);
  });

  test("every run joins one concurrency group and waits for the run before it", () => {
    const workflow = parse(readFileSync(path, "utf8")) as {
      concurrency?: { group?: unknown; "cancel-in-progress"?: unknown };
    };
    const group = workflow.concurrency?.group;
    expect(typeof group).toBe("string");
    expect(group).not.toBe("");
    expect(String(group)).not.toContain("${{");
    expect(workflow.concurrency?.["cancel-in-progress"]).not.toBe(true);
  });
});

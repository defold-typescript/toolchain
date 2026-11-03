import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { main, mayAutoMerge, type Run, type UpdateEntry } from "./library-update-prs.ts";

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

// The step a `git push` or `gh pr` call takes, so the fake can fail one and a test
// can read the order they ran in.
function operation(args: string[]): string {
  if (args[0] === "git") return args[1] ?? "";
  if (args[2] !== "merge") return args[2] ?? "";
  return args.includes("--disable-auto") ? "disable-auto" : "enable";
}

describe("main", () => {
  let root: string;
  let repo: string;
  let remote: string;
  let seed: string;
  // Every `git push` and `gh` call, in the order `main` made them.
  let log: string[][];
  let failing: Set<string>;
  let openBranches: Set<string>;
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

  function openPull(library: string, { autoMerging }: { autoMerging: boolean }): void {
    const branch = `library-update/${library}`;
    git(repo, "push", "--quiet", "origin", `main:refs/heads/${branch}`);
    openBranches.add(branch);
    if (autoMerging) autoMerge.add(branch);
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
    if (step === "list") {
      const branch = flag(args, "--head") ?? "";
      const pulls = openBranches.has(branch)
        ? [
            {
              number: 7,
              autoMergeRequest: autoMerge.has(branch) ? { mergeMethod: "SQUASH" } : null,
            },
          ]
        : [];
      return { code: 0, stdout: JSON.stringify(pulls), stderr: "" };
    }
    if (step === "create" || step === "edit") hook?.(args);
    const branch = args[3] ?? "";
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
    return log.filter((args) => args[0] === "gh" && args[2] === subcommand);
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
    openBranches = new Set();
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
});

describe("library update workflow", () => {
  test("every run joins one concurrency group and waits for the run before it", () => {
    const path = join(import.meta.dir, "..", ".github", "workflows", "library-update.yml");
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

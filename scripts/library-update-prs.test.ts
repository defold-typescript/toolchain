import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

describe("main", () => {
  let root: string;
  let repo: string;
  let remote: string;
  let ghCalls: string[][];
  let openPulls: Record<string, unknown[]>;

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

  const run: Run = (args) => {
    if (args[0] === "git") {
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
    ghCalls.push(args);
    if (args[1] === "pr" && args[2] === "list") {
      const branch = flag(args, "--head") ?? "";
      return { code: 0, stdout: JSON.stringify(openPulls[branch] ?? []), stderr: "" };
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
    return ghCalls.filter((args) => args[1] === "pr" && args[2] === subcommand);
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
    ghCalls = [];
    openPulls = {};
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
      ["gh", "pr", "merge", "library-update/alpha", "--auto", "--squash"],
    ]);
  });

  test("an open PR whose change may not merge has auto-merge turned off and none turned on", () => {
    regenerate("beta");
    openPulls["library-update/beta"] = [
      { number: 7, autoMergeRequest: { enabledAt: "2026-11-01T00:00:00Z" } },
    ];
    main(report([regenerated("beta", "changed")]), { cwd: repo, run });
    expect(gh("create")).toEqual([]);
    expect(gh("merge")).toEqual([["gh", "pr", "merge", "library-update/beta", "--disable-auto"]]);
  });

  test("an open PR takes the new title", () => {
    regenerate("beta");
    openPulls["library-update/beta"] = [{ number: 7, autoMergeRequest: null }];
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

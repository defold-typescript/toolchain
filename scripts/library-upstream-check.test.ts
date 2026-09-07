import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readAuthoredTargets } from "../packages/library-types/scripts/sync-authored-types.ts";
import { readLualsTargets } from "../packages/library-types/scripts/sync-luals-types.ts";
import { readMarkdownTargets } from "../packages/library-types/scripts/sync-markdown-types.ts";
import { readOpenApiTargets } from "../packages/library-types/scripts/sync-openapi-types.ts";
import { readScriptApiTargets } from "../packages/library-types/scripts/sync-script-api-types.ts";
import {
  collectPinnedTargets,
  evaluateLibraryDrift,
  groupPinnedTargets,
  issueTitleFor,
  type LibraryCheckIo,
  type LibraryUpstreamRun,
  type PinnedGroup,
  runLibraryCheckCli,
} from "./library-upstream-check.ts";

const PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");

function group(overrides: Partial<PinnedGroup> = {}): PinnedGroup {
  return {
    repo: "https://github.com/acme/widget",
    slug: "acme/widget",
    ref: "1.0.0",
    pinKind: "tag",
    dependents: ["luals:widget.widget"],
    consumedPaths: ["widget/widget.lua"],
    ...overrides,
  };
}

/** An IO whose every seam throws unless the test overrides it. */
function io(overrides: Partial<LibraryCheckIo> = {}): LibraryCheckIo & {
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    listTags: async () => {
      throw new Error("listTags not stubbed");
    },
    readCommit: async () => {
      throw new Error("readCommit not stubbed");
    },
    readRepo: async () => {
      throw new Error("readRepo not stubbed");
    },
    compareRefs: async () => {
      throw new Error("compareRefs not stubbed");
    },
    ...overrides,
  };
}

// Ordered *against* their commit dates on purpose: `2` is the newest tag but is
// listed last, and the pinned `1.0.0` sits first. An implementation that reads
// recency off the listing order calls this pin current.
const MISORDERED_TAGS = [
  { name: "1.0.0", sha: "aaa" },
  { name: "1.1.0", sha: "bbb" },
  { name: "2", sha: "ccc" },
];
const TAG_DATES: Record<string, string> = {
  aaa: "2024-01-01T00:00:00Z",
  bbb: "2025-06-01T00:00:00Z",
  ccc: "2026-02-01T00:00:00Z",
};

function taggedIo(tags = MISORDERED_TAGS) {
  return io({
    listTags: async () => tags,
    readCommit: async (_slug, sha) => {
      const date = TAG_DATES[sha];
      if (date === undefined) throw new Error(`no commit ${sha}`);
      return { sha, date };
    },
  });
}

describe("evaluateLibraryDrift — tag pins", () => {
  test("a newer-dated tag is actionable and names every intervening tag", async () => {
    const report = await evaluateLibraryDrift(group(), taggedIo());
    expect(report.actionable).toBe(true);
    expect(report.reason).toBe("newer-tag");
    expect(report.upstream).toBe("2");
    expect(report.intervening).toEqual(["1.1.0", "2"]);
  });

  test("the newest-dated tag is current even when the listing buries it", async () => {
    const report = await evaluateLibraryDrift(group({ ref: "2" }), taggedIo());
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("current");
    expect(report.issueTitle).toBeUndefined();
  });

  test("a pin the listing no longer carries degrades to unknown, not current", async () => {
    const report = await evaluateLibraryDrift(group({ ref: "0.9.0" }), taggedIo());
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("unknown");
  });

  // `Insality/panthera` ships a `runtime.*` series beside an unrelated
  // `editor.*` one, and the editor series is both larger-numbered and newer.
  // Taking the newest tag in the repo would ask a maintainer to bump
  // `runtime.8` to `editor.1247`.
  test("a repo carrying two tag series compares the pin against its own series", async () => {
    const seam = io({
      listTags: async () => [
        { name: "runtime.8", sha: "r8" },
        { name: "runtime.10", sha: "r10" },
        { name: "editor.1247", sha: "e" },
      ],
      readCommit: async (_slug, sha) =>
        ({
          r8: { sha, date: "2024-01-01T00:00:00Z" },
          r10: { sha, date: "2025-01-01T00:00:00Z" },
          e: { sha, date: "2026-01-01T00:00:00Z" },
        })[sha] ?? { sha, date: "" },
    });
    const report = await evaluateLibraryDrift(group({ ref: "runtime.8" }), seam);
    expect(report.upstream).toBe("runtime.10");
    expect(report.intervening).toEqual(["runtime.10"]);
  });

  test("a pin already at its series head is current though another series moved", async () => {
    const seam = io({
      listTags: async () => [
        { name: "runtime.8", sha: "r8" },
        { name: "editor.1247", sha: "e" },
      ],
      readCommit: async (_slug, sha) =>
        sha === "r8"
          ? { sha, date: "2024-01-01T00:00:00Z" }
          : { sha, date: "2026-01-01T00:00:00Z" },
    });
    const report = await evaluateLibraryDrift(group({ ref: "runtime.8" }), seam);
    expect(report.reason).toBe("current");
    expect(report.actionable).toBe(false);
  });
});

describe("evaluateLibraryDrift — SHA pins", () => {
  const sha = group({
    ref: "b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3",
    pinKind: "sha",
    consumedPaths: ["rendy/rendy.lua"],
  });

  function shaIo(files: string[], aheadBy = 1) {
    return io({
      readRepo: async () => ({ defaultBranch: "main" }),
      compareRefs: async () => ({ aheadBy, files }),
    });
  }

  test("a delta touching a consumed path is actionable and names the commit count", async () => {
    const report = await evaluateLibraryDrift(sha, shaIo(["rendy/rendy.lua", "README.md"], 3));
    expect(report.actionable).toBe(true);
    expect(report.reason).toBe("behind-head");
    expect(report.commitsBehind).toBe(3);
    expect(report.upstream).toBe("main");
  });

  test("a delta touching no consumed path is behind-head but not actionable", async () => {
    const report = await evaluateLibraryDrift(sha, shaIo(["README.md"]));
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("behind-head");
    expect(report.issueTitle).toBeUndefined();
  });

  test("a SHA pin level with its default branch is current", async () => {
    const report = await evaluateLibraryDrift(sha, shaIo([], 0));
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("current");
  });
});

describe("evaluateLibraryDrift — unreadable upstream", () => {
  test("a comparison that throws is unknown and not actionable", async () => {
    const report = await evaluateLibraryDrift(group({ pinKind: "sha", ref: "deadbeef" }), io());
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("unknown");
    expect(report.error).toContain("readRepo not stubbed");
  });

  test("a tag listing that throws is unknown, so a renamed repo is not reported current", async () => {
    const report = await evaluateLibraryDrift(group(), io());
    expect(report.reason).toBe("unknown");
    expect(report.actionable).toBe(false);
  });
});

describe("issue identity", () => {
  test("the title is a function of the repo slug and the upstream version alone", async () => {
    const report = await evaluateLibraryDrift(group(), taggedIo());
    expect(report.issueTitle).toBe(issueTitleFor("acme/widget", "2"));
    // A rerun from a different pin of the same repo reproduces the same title,
    // which is what makes the workflow's `gh issue list --json title` lookup a
    // no-op until the bump lands.
    const other = await evaluateLibraryDrift(group({ ref: "1.1.0" }), taggedIo());
    expect(other.issueTitle).toBe(report.issueTitle);
  });

  test("the body names the pin, the upstream version, the dependents and the playbook", async () => {
    const report = await evaluateLibraryDrift(
      group({ dependents: ["luals:widget.widget", "markdown:widget.widget"] }),
      taggedIo(),
    );
    expect(report.issueBody).toContain("1.0.0");
    expect(report.issueBody).toContain("2");
    expect(report.issueBody).toContain("luals:widget.widget");
    expect(report.issueBody).toContain("refreshing-library-pins");
  });
});

describe("groupPinnedTargets", () => {
  test("one repo pinned at two refs stays two groups", () => {
    const groups = groupPinnedTargets([
      { lane: "luals", repo: "https://github.com/acme/widget", ref: "1", moduleId: "a", paths: [] },
      {
        lane: "authored",
        repo: "https://github.com/acme/widget",
        ref: "2",
        moduleId: "b",
        paths: [],
      },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.ref).sort()).toEqual(["1", "2"]);
  });

  test("one repo+ref backing several modules stays one group carrying every dependent", () => {
    const groups = groupPinnedTargets([
      {
        lane: "authored",
        repo: "https://github.com/acme/widget",
        ref: "1",
        moduleId: "a",
        paths: ["a.lua"],
      },
      {
        lane: "authored",
        repo: "https://github.com/acme/widget",
        ref: "1",
        moduleId: "b",
        paths: ["b.lua"],
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.dependents).toEqual(["authored:a", "authored:b"]);
    expect(groups[0]?.consumedPaths).toEqual(["a.lua", "b.lua"]);
  });

  test("a 40-hex ref is a SHA pin and anything else is a tag pin", () => {
    const groups = groupPinnedTargets([
      {
        lane: "authored",
        repo: "https://github.com/acme/a",
        ref: "b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3",
        moduleId: "a",
        paths: [],
      },
      {
        lane: "luals",
        repo: "https://github.com/acme/b",
        ref: "runtime.8",
        moduleId: "b",
        paths: [],
      },
    ]);
    expect(groups.map((g) => g.pinKind).sort()).toEqual(["sha", "tag"]);
  });
});

describe("collectPinnedTargets over the committed registries", () => {
  // The expectation is rebuilt from the same five exported readers production
  // composes, so adding a target cannot red this — only dropping a lane from the
  // composition, or regrouping, can.
  const lanes = [
    ["authored", readAuthoredTargets(PACKAGE_ROOT)],
    ["luals", readLualsTargets(PACKAGE_ROOT)],
    ["markdown", readMarkdownTargets(PACKAGE_ROOT)],
    ["openapi", readOpenApiTargets(PACKAGE_ROOT)],
    ["scriptApi", readScriptApiTargets(PACKAGE_ROOT)],
  ] as const;
  const expected = new Map<string, string[]>();
  for (const [lane, targets] of lanes) {
    for (const target of targets) {
      const key = `${target.repo}@${target.ref}`;
      expected.set(key, [...(expected.get(key) ?? []), `${lane}:${target.moduleId}`]);
    }
  }

  const groups = collectPinnedTargets(PACKAGE_ROOT);

  test("every repo+ref the five readers yield appears in exactly one group", () => {
    const keys = groups.map((g) => `${g.repo}@${g.ref}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...expected.keys()].sort());
  });

  test("each group carries every dependent of its pin, lane-qualified and unique", () => {
    for (const g of groups) {
      const key = `${g.repo}@${g.ref}`;
      expect([...g.dependents].sort()).toEqual([...(expected.get(key) ?? [])].sort());
      expect(new Set(g.dependents).size).toBe(g.dependents.length);
    }
  });

  test("a repo backing many modules is one unit of work, not one per module", () => {
    const fanned = groups.filter((g) => g.dependents.length > 1);
    // Grouping by module would leave every group at size one.
    expect(fanned.length).toBeGreaterThan(0);
    const biggest = Math.max(...groups.map((g) => g.dependents.length));
    expect(biggest).toBeGreaterThan(2);
  });

  test("a repo consumed by two lanes carries both, so one bump answers both", () => {
    const multiLane = groups.filter(
      (g) => new Set(g.dependents.map((d) => d.split(":")[0])).size > 1,
    );
    expect(multiLane.length).toBeGreaterThan(0);
  });

  test("the drained ts-defold lane contributes nothing", () => {
    expect(groups.every((g) => g.dependents.length > 0)).toBe(true);
  });

  test("every SHA-pinned group resolves its consumed paths to upstream-relative ones", () => {
    const shaGroups = groups.filter((g) => g.pinKind === "sha");
    expect(shaGroups.length).toBeGreaterThan(0);
    for (const g of shaGroups) {
      expect(g.consumedPaths.length).toBeGreaterThan(0);
      // A vendored fixture path would make every compare miss and silence the
      // whole SHA arm.
      expect(g.consumedPaths.some((p) => p.startsWith("fixtures/"))).toBe(false);
    }
  });
});

describe("runLibraryCheckCli", () => {
  const oneGroup = [group()];

  test("drift is a finding: exit 0, report on stdout", async () => {
    const seam = taggedIo();
    const code = await runLibraryCheckCli([], seam, oneGroup);
    expect(code).toBe(0);
    expect(seam.out.join("")).toContain("acme/widget");
    expect(seam.err).toHaveLength(0);
  });

  test("an IO seam that throws exits 1 and says so on stderr", async () => {
    const seam = io();
    const code = await runLibraryCheckCli([], seam, oneGroup);
    expect(code).toBe(1);
    expect(seam.err.join("")).toContain("acme/widget");
  });

  test("--json emits one parseable object and no prose", async () => {
    const seam = taggedIo();
    const code = await runLibraryCheckCli(["--json"], seam, oneGroup);
    expect(code).toBe(0);
    const run = JSON.parse(seam.out.join("")) as LibraryUpstreamRun;
    expect(run.command).toBe("upstream:library-check");
    expect(run.actionable).toBe(true);
    expect(run.reports).toHaveLength(1);
    expect(run.reports[0]?.issueTitle).toBe(issueTitleFor("acme/widget", "2"));
  });

  test("a quiet corpus exits 0 with nothing actionable", async () => {
    const seam = taggedIo();
    const code = await runLibraryCheckCli(["--json"], seam, [group({ ref: "2" })]);
    expect(code).toBe(0);
    expect((JSON.parse(seam.out.join("")) as LibraryUpstreamRun).actionable).toBe(false);
  });
});

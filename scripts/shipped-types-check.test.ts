import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSourceId } from "../packages/cli/src/library-match.ts";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
} from "../packages/cli/src/library-registry.ts";
import { checkShippedDeclarations } from "../packages/cli/src/shipped-declarations.ts";
import {
  readCuratedRepos,
  runShippedTypesCheck,
  type ShippedTypesIo,
  type ShippedTypesReport,
  type ShippedTypesRun,
  type TypesFolderFile,
} from "./shipped-types-check.ts";

const PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");
const TYPES_ROOT = join(import.meta.dir, "..", "packages", "types");

const WIDGET = "https://github.com/acme/widget";
const GADGET = "https://codeberg.org/acme/gadget";
const GIZMO = "https://github.com/acme/gizmo";

// `Vector3` exists only in the engine surface, so this compiles only when the
// check runs against `@defold-typescript/types`.
const OK_MODULE = `declare module "widget.widget" {
  export function position(): Vector3;
}
`;

const BAD_MODULE = `declare module "widget.widget" {
  export const h: hash;
  export const m: not_a_type;
}
`;

// Repo A backs two lanes, so the sweep must still read it once.
const root = mkdtempSync(join(tmpdir(), "shipped-types-check-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const write = (file: string, targets: unknown[]) =>
  writeFileSync(join(root, file), JSON.stringify({ targets }));
write("authored-targets.json", [
  {
    repo: GADGET,
    ref: "3",
    authored: "fixtures/authored/gadget.gadget.d.ts",
    moduleId: "gadget.gadget",
    namespace: "gadget",
    generated: "generated/gadget.d.ts",
    apiDoc: "api-doc/gadget.json",
    parityVerdict: { reason: "no-module-file", note: "fixture" },
  },
]);
write("luals-targets.json", [
  {
    repo: WIDGET,
    ref: "1.0.0",
    sourceGlobs: ["widget/*.lua"],
    moduleId: "widget.widget",
    namespace: "widget",
  },
]);
write("script-api-targets.json", [
  {
    repo: GIZMO,
    ref: "v1",
    scriptApi: "gizmo/gizmo.script_api",
    moduleId: "gizmo",
    namespace: "gizmo",
    generated: "generated/gizmo.d.ts",
    apiDoc: "api-doc/gizmo.json",
  },
]);
write("native-targets.json", [
  {
    repo: WIDGET,
    ref: "1.0.0",
    license: "MIT",
    namespace: "widgetnative",
    manifestDir: "widgetnative",
    declaration: "native/widgetnative.d.ts",
    upstreamSource: "fixtures/upstream-native/widget/widget.cpp",
  },
]);

interface FakeRepo {
  readonly tags?: ReadonlyArray<{ name: string; sha: string; date: string }>;
  readonly defaultBranch?: string;
  readonly types?: Readonly<Record<string, readonly TypesFolderFile[]>>;
  readonly fail?: string;
}

function fakeIo(repos: Readonly<Record<string, FakeRepo>>) {
  const out: string[] = [];
  const err: string[] = [];
  const tagReads: string[] = [];
  const repoOf = (repo: string): FakeRepo => {
    const fake = repos[repo];
    if (fake === undefined) throw new Error(`no fake for ${repo}`);
    if (fake.fail !== undefined) throw new Error(fake.fail);
    return fake;
  };
  const io: ShippedTypesIo = {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    listTags: async (repo) => {
      tagReads.push(repo);
      return (repoOf(repo).tags ?? []).map(({ name, sha }) => ({ name, sha }));
    },
    readCommit: async (repo, sha) => {
      const tag = (repoOf(repo).tags ?? []).find((t) => t.sha === sha);
      if (tag === undefined) throw new Error(`no commit ${sha}`);
      return { sha, date: tag.date };
    },
    readRepo: async (repo) => ({ defaultBranch: repoOf(repo).defaultBranch ?? "main" }),
    listTypesFolder: async (repo, ref) => {
      const files = repoOf(repo).types?.[ref];
      return files === undefined ? null : [...files];
    },
  };
  return { io, out, err, tagReads };
}

// The newest tag by commit date is listed second; the older tags carry a
// folder that fails the check, so reading any other tag reports `rejected`.
const MISORDERED_TAGS = [
  { name: "1.0.0", sha: "aaa", date: "2024-01-01T00:00:00Z" },
  { name: "2.0.0", sha: "ccc", date: "2026-02-01T00:00:00Z" },
  { name: "1.5.0", sha: "bbb", date: "2025-06-01T00:00:00Z" },
];
const QUIET = {
  [GADGET]: { tags: [{ name: "3", sha: "g3", date: "2025-01-01T00:00:00Z" }] },
  [GIZMO]: { tags: [{ name: "v1", sha: "z1", date: "2025-01-01T00:00:00Z" }] },
};

async function sweep(widget: FakeRepo, others: Record<string, FakeRepo> = QUIET) {
  const fake = fakeIo({ ...others, [WIDGET]: widget });
  const code = await runShippedTypesCheck(["--json"], fake.io, readCuratedRepos(root), TYPES_ROOT);
  const run = JSON.parse(fake.out.join("")) as ShippedTypesRun;
  const reportFor = (slug: string): ShippedTypesReport => {
    const report = run.reports.find((r) => r.repo === slug);
    if (report === undefined) throw new Error(`no report for ${slug}`);
    return report;
  };
  return { ...fake, code, run, widget: reportFor("acme/widget"), reportFor };
}

describe("runShippedTypesCheck verdicts", () => {
  test("types `resolve` accepts at the newest-dated tag are actionable and name every entry to retire", async () => {
    const rejected = [{ name: "a.d.ts", contents: BAD_MODULE }];
    const { code, run, widget, tagReads } = await sweep({
      tags: MISORDERED_TAGS,
      types: {
        "1.0.0": rejected,
        "1.5.0": rejected,
        "2.0.0": [{ name: "a.d.ts", contents: OK_MODULE }],
      },
    });
    expect(widget).toMatchObject({
      command: "upstream:shipped-types-check",
      reason: "accepted",
      actionable: true,
      ref: "2.0.0",
      files: ["a.d.ts"],
      retire: [
        { lane: "luals", id: "widget.widget", declaration: "generated/widget.d.ts" },
        { lane: "native", id: "widgetnative", declaration: "native/widgetnative.d.ts" },
      ],
    });
    expect(run.actionable).toBe(true);
    expect(code).toBe(0);
    expect(tagReads.filter((repo) => repo === WIDGET)).toHaveLength(1);
  });

  test("the issue is titled by slug and ref and names the entries and the shipped files", async () => {
    const { widget } = await sweep({
      tags: MISORDERED_TAGS,
      types: { "2.0.0": [{ name: "a.d.ts", contents: OK_MODULE }] },
    });
    expect(widget.issueTitle).toBe("retire curated types for acme/widget: 2.0.0 ships types");
    for (const fragment of [
      "widget.widget",
      "generated/widget.d.ts",
      "widgetnative",
      "native/widgetnative.d.ts",
      "a.d.ts",
    ]) {
      expect(widget.issueBody).toContain(fragment);
    }
  });

  test("a file that fails the check is rejected with the check's first message", async () => {
    const { widget, run } = await sweep({
      tags: MISORDERED_TAGS,
      types: { "2.0.0": [{ name: "a.d.ts", contents: BAD_MODULE }] },
    });
    const messages =
      checkShippedDeclarations([{ entry: "types/a.d.ts", contents: BAD_MODULE }], TYPES_ROOT).get(
        "types/a.d.ts",
      ) ?? [];
    expect(messages.length).toBeGreaterThan(1);
    expect(widget.reason).toBe("rejected");
    expect(widget.actionable).toBe(false);
    expect(widget.message).toBe(messages[0]);
    expect(widget.issueTitle).toBeUndefined();
    expect(run.actionable).toBe(false);
  });

  test("no types folder reports none", async () => {
    const { widget } = await sweep({ tags: MISORDERED_TAGS, types: {} });
    expect(widget.reason).toBe("none");
    expect(widget.actionable).toBe(false);
    expect(widget.ref).toBe("2.0.0");
  });

  test("a folder holding only a nested or non-declaration file reports none", async () => {
    const { widget } = await sweep({
      tags: MISORDERED_TAGS,
      types: {
        "2.0.0": [
          { name: "sub/x.d.ts", contents: OK_MODULE },
          { name: "README.md", contents: "# types" },
        ],
      },
    });
    expect(widget.reason).toBe("none");
    expect(widget.actionable).toBe(false);
  });

  test("a repo with no tags is read at its default branch head", async () => {
    const { widget } = await sweep({
      tags: [],
      defaultBranch: "trunk",
      types: { trunk: [{ name: "a.d.ts", contents: OK_MODULE }] },
    });
    expect(widget.reason).toBe("accepted");
    expect(widget.ref).toBe("trunk");
  });

  test("a read that throws is unknown, the rest still report, and the run exits 1", async () => {
    const { widget, reportFor, code, err } = await sweep(
      { tags: MISORDERED_TAGS, types: { "2.0.0": [{ name: "a.d.ts", contents: OK_MODULE }] } },
      { ...QUIET, [GADGET]: { fail: "GET gadget responded 500" } },
    );
    expect(reportFor("acme/gadget")).toMatchObject({
      reason: "unknown",
      actionable: false,
      error: "GET gadget responded 500",
    });
    expect(widget.reason).toBe("accepted");
    expect(reportFor("acme/gizmo").reason).toBe("none");
    expect(code).toBe(1);
    expect(err.join("")).toContain("acme/gadget");
  });
});

describe("readCuratedRepos over the committed corpus", () => {
  test("sweeps exactly the sources `resolve` can install curated types for, each once", () => {
    const swept = readCuratedRepos().map(({ repo }) => normalizeSourceId(repo));
    const installable = new Set([
      ...loadVendoredLibraryRegistry(PACKAGE_ROOT).registry.map(({ sourceId }) => sourceId),
      ...loadVendoredNativeRegistry(PACKAGE_ROOT).map(({ sourceId }) => sourceId),
    ]);
    expect(installable.size).toBeGreaterThan(0);
    expect(swept.length).toBe(new Set(swept).size);
    expect(new Set(swept)).toEqual(installable);
  });
});

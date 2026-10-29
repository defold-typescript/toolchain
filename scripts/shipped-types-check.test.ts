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
import { type ForgeFetch, forgeReadsFor } from "./library-upstream-check.ts";
import {
  evaluateShippedTypes,
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

interface PagedForge {
  readonly name: string;
  readonly repo: string;
  readonly pageSize: number;
  readonly origin: string;
  /** GitHub's `Link` points at a second route for the same tag pages. */
  readonly tagPaths: readonly string[];
  readonly pageUrl: (page: number) => string;
  /** What the forge puts between the `rel="next"` and `rel="last"` entries. */
  readonly linkSeparator: string;
  readonly commitPath: (sha: string) => string;
  readonly repoPath: string;
  readonly downloadUrl: string;
}

const PAGED_FORGES: readonly PagedForge[] = [
  {
    name: "GitHub",
    repo: WIDGET,
    pageSize: 100,
    origin: "https://api.github.com",
    tagPaths: ["/repos/acme/widget/tags", "/repositories/4242/tags"],
    pageUrl: (page) => `https://api.github.com/repositories/4242/tags?per_page=100&page=${page}`,
    linkSeparator: ", ",
    commitPath: (sha) => `/repos/acme/widget/commits/${sha}`,
    repoPath: "/repos/acme/widget",
    downloadUrl: "https://raw.githubusercontent.com/acme/widget/v9/types/a.d.ts",
  },
  {
    name: "Codeberg",
    repo: GADGET,
    pageSize: 50,
    origin: "https://codeberg.org",
    tagPaths: ["/api/v1/repos/acme/gadget/tags"],
    pageUrl: (page) => `https://codeberg.org/api/v1/repos/acme/gadget/tags?limit=50&page=${page}`,
    linkSeparator: ",",
    commitPath: (sha) => `/api/v1/repos/acme/gadget/git/commits/${sha}`,
    repoPath: "/api/v1/repos/acme/gadget",
    downloadUrl: "https://codeberg.org/acme/gadget/raw/tag/v9/types/a.d.ts",
  },
];

interface PagedTag {
  readonly name: string;
  readonly sha: string;
  readonly date: string;
}

interface PagedScenario {
  readonly pages: ReadonlyArray<readonly PagedTag[]>;
  /** The one ref whose `types/` folder holds `a.d.ts`. */
  readonly typesAt?: string;
  readonly failPage?: number;
  readonly nextUrl?: (page: number) => string;
}

// Page 1 is full and predates `v9`, which sits between older tags on page 2, so
// neither page 1 alone nor any listing position finds it.
function pagedTags(pageSize: number): PagedTag[][] {
  const day = (offset: number) => new Date(Date.UTC(2024, 0, 1 + offset)).toISOString();
  const first = Array.from({ length: pageSize }, (_, i) => ({
    name: `0.${i}`,
    sha: `a${i}`,
    date: day(i),
  }));
  const second = [
    { name: "1.0", sha: "b0", date: day(pageSize + 1) },
    { name: "v9", sha: "b1", date: day(pageSize + 30) },
    { name: "1.1", sha: "b2", date: day(pageSize + 2) },
  ];
  return [first, second];
}

function pagedFetch(forge: PagedForge, scenario: PagedScenario) {
  const requested: string[] = [];
  const nextUrl = scenario.nextUrl ?? forge.pageUrl;
  const tags = scenario.pages.flat();
  const fetchImpl: ForgeFetch = async (url) => {
    requested.push(url);
    if (url === forge.downloadUrl) return new Response(OK_MODULE);
    const { origin, pathname, searchParams } = new URL(url);
    if (origin !== forge.origin) return new Response(null, { status: 404 });
    if (forge.tagPaths.includes(pathname)) {
      const page = Number(searchParams.get("page") ?? "1");
      if (page === scenario.failPage) return new Response(null, { status: 500 });
      const last = scenario.pages.length;
      const headers: Record<string, string> =
        page < last
          ? {
              link: `<${nextUrl(page + 1)}>; rel="next"${forge.linkSeparator}<${nextUrl(last)}>; rel="last"`,
            }
          : {};
      const body = (scenario.pages[page - 1] ?? []).map(({ name, sha }) => ({
        name,
        commit: { sha },
      }));
      return Response.json(body, { headers });
    }
    const tag = tags.find(({ sha }) => pathname === forge.commitPath(sha));
    if (tag !== undefined) {
      return Response.json({ sha: tag.sha, commit: { committer: { date: tag.date } } });
    }
    if (pathname === forge.repoPath) return Response.json({ default_branch: "main" });
    if (
      pathname === `${forge.repoPath}/contents/types` &&
      searchParams.get("ref") === scenario.typesAt
    ) {
      return Response.json([{ name: "a.d.ts", type: "file", download_url: forge.downloadUrl }]);
    }
    return new Response(null, { status: 404 });
  };
  return { fetchImpl, requested };
}

describe("evaluateShippedTypes over every forge tag page", () => {
  for (const forge of PAGED_FORGES) {
    const evaluate = async (scenario: PagedScenario) => {
      const fake = pagedFetch(forge, scenario);
      const curated = readCuratedRepos(root).find(({ repo }) => repo === forge.repo);
      if (curated === undefined) throw new Error(`no curated repo ${forge.repo}`);
      const io = {
        ...forgeReadsFor(forge.repo, fake.fetchImpl),
        stdout: () => {},
        stderr: () => {},
      };
      return { report: await evaluateShippedTypes(curated, io, TYPES_ROOT), ...fake };
    };

    test(`${forge.name}: the newest-dated tag on a later page is the release read`, async () => {
      const { report } = await evaluate({ pages: pagedTags(forge.pageSize), typesAt: "v9" });
      expect(report).toMatchObject({ reason: "accepted", ref: "v9", files: ["a.d.ts"] });
    });

    test(`${forge.name}: an empty first tag page is read at the default branch`, async () => {
      const { report } = await evaluate({ pages: [[]] });
      expect(report.ref).toBe("main");
    });

    test(`${forge.name}: a failed later page is unknown and names that page`, async () => {
      const { report } = await evaluate({
        pages: pagedTags(forge.pageSize),
        typesAt: "v9",
        failPage: 2,
      });
      expect(report).toMatchObject({
        reason: "unknown",
        actionable: false,
        error: `GET ${forge.pageUrl(2)} responded 500`,
      });
      expect(report.ref).toBeUndefined();
    });

    test(`${forge.name}: a next page on another origin is refused, never requested`, async () => {
      const elsewhere = (page: number) => `https://elsewhere.example/tags?page=${page}`;
      const { report, requested } = await evaluate({
        pages: pagedTags(forge.pageSize),
        typesAt: "v9",
        nextUrl: elsewhere,
      });
      expect(report.reason).toBe("unknown");
      expect(report.error).toContain(elsewhere(2));
      expect(requested.filter((url) => url.startsWith("https://elsewhere.example"))).toEqual([]);
    });
  }
});

describe("readCuratedRepos over the committed corpus", () => {
  test("sweeps exactly the sources `resolve` can install curated types for, each once", () => {
    const swept = readCuratedRepos().map(({ repo }) => normalizeSourceId(repo));
    const installable = new Set([
      ...loadVendoredLibraryRegistry(PACKAGE_ROOT).map(({ sourceId }) => sourceId),
      ...loadVendoredNativeRegistry(PACKAGE_ROOT).map(({ sourceId }) => sourceId),
    ]);
    expect(installable.size).toBeGreaterThan(0);
    expect(swept.length).toBe(new Set(swept).size);
    expect(new Set(swept)).toEqual(installable);
  });
});

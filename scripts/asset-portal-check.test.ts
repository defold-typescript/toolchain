import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newestDataFolder } from "../packages/cli/src/library/data-folder.ts";
import type {
  AssetPortalManifest,
  PortalAsset,
  PortalEntry,
  PortalHead,
} from "../packages/cli/src/library/sync-asset-portal.ts";
import {
  type AssetPortalCheckIo,
  type CoverageLane,
  type CoverageRegistries,
  candidateSlots,
  coverageReport,
  describeCoverageReport,
  PORTAL_DRIFT_ISSUE_TITLE,
  type PortalDriftReport,
  type PortalVerdicts,
  parseAssetPortalManifest,
  portalCoverage,
  portalDrift,
  readAssetPortalManifest,
  readCoverageRegistries,
  readPortalAliases,
  readPortalVerdicts,
  runAssetPortalCheckCli,
} from "./asset-portal-check.ts";

const SYNCED_AT = "2026-10-21T00:00:00.000Z";
const DAY_MS = 86_400_000;

function daysBeforeSync(days: number): string {
  return new Date(Date.parse(SYNCED_AT) - days * DAY_MS).toISOString();
}

function entry(overrides: Partial<PortalEntry> & { id: string }): PortalEntry {
  return {
    name: overrides.id,
    description: "",
    tags: [],
    portalLibrary: true,
    repo: `https://github.com/acme/${overrides.id}`,
    archived: false,
    fork: false,
    pushedAt: daysBeforeSync(1),
    stars: 1,
    ref: "1.0.0",
    refKind: "release",
    includeDirs: ["lib"],
    scriptApi: 0,
    extManifest: 0,
    lua: 1,
    luaSampled: 1,
    luaAnnotated: 0,
    kind: "pure-lua",
    ...overrides,
  };
}

const NO_SOURCE = {
  archived: null,
  fork: null,
  pushedAt: null,
  stars: null,
  ref: null,
  refKind: null,
  includeDirs: [],
  lua: 0,
  luaSampled: 0,
  kind: "no-source",
} as const satisfies Partial<PortalEntry>;

function manifest(entries: PortalEntry[]): AssetPortalManifest {
  return {
    source: {
      repo: "https://github.com/defold/asset-portal",
      commit: "a".repeat(40),
      syncedAt: SYNCED_AT,
    },
    entries,
  };
}

function registries(overrides: Partial<CoverageRegistries> = {}): CoverageRegistries {
  return { pinned: [], native: [], defold: [], portal: [], ...overrides };
}

function coverageOf(
  entries: PortalEntry[],
  regs: CoverageRegistries = registries(),
  aliases: Record<string, string> = {},
  verdicts: PortalVerdicts = {},
) {
  return portalCoverage(manifest(entries), regs, aliases, verdicts);
}

describe("portalCoverage — lane join", () => {
  const PINNED_ONLY_BY = {
    authored: (repo) => registries({ pinned: [{ lane: "authored", repo }] }),
    luals: (repo) => registries({ pinned: [{ lane: "luals", repo }] }),
    markdown: (repo) => registries({ pinned: [{ lane: "markdown", repo }] }),
    openapi: (repo) => registries({ pinned: [{ lane: "openapi", repo }] }),
    scriptApi: (repo) => registries({ pinned: [{ lane: "scriptApi", repo }] }),
    native: (repo) => registries({ native: [{ repo }] }),
    defold: (repo) => registries({ defold: [{ repo }] }),
    portal: (repo) => registries({ portal: [{ repo }] }),
  } satisfies Record<CoverageLane, (repo: string) => CoverageRegistries>;

  test.each(
    Object.keys(PINNED_ONLY_BY) as CoverageLane[],
  )("a repo only the %s lane pins is tracked under it and is no candidate", (lane) => {
    const [widget] = coverageOf(
      [entry({ id: "widget" })],
      PINNED_ONLY_BY[lane]("https://github.com/acme/widget"),
    );
    expect(widget?.lanes).toEqual([lane]);
    expect(widget?.candidate).toBe(false);
  });

  test("a repo two lanes pin reports both, as defold-orthographic does", () => {
    const repo = "https://github.com/britzl/defold-orthographic";
    const [ortho] = coverageOf(
      [entry({ id: "orthographic", repo })],
      registries({
        pinned: [
          { lane: "markdown", repo },
          { lane: "authored", repo },
        ],
      }),
    );
    expect(ortho?.lanes).toEqual(["authored", "markdown"]);
  });

  test("matching folds case and ignores a trailing .git or /", () => {
    const [widget] = coverageOf(
      [entry({ id: "widget", repo: "https://github.com/Acme/Widget" })],
      registries({
        pinned: [{ lane: "luals", repo: "https://github.com/acme/widget.git" }],
        native: [{ repo: "https://github.com/ACME/widget/" }],
      }),
    );
    expect(widget?.lanes).toEqual(["luals", "native"]);
  });

  test("the same owner/repo on another forge is a different repo", () => {
    const [widget] = coverageOf(
      [entry({ id: "widget" })],
      registries({ pinned: [{ lane: "authored", repo: "https://codeberg.org/acme/widget" }] }),
    );
    expect(widget?.lanes).toEqual([]);
  });
});

describe("readCoverageRegistries — the portal lane", () => {
  const REAL_PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");
  const REAL_DATA_DIR = newestDataFolder(REAL_PACKAGE_ROOT);

  function packageRootCopy(): string {
    const root = mkdtempSync(join(tmpdir(), "coverage-registries-"));
    for (const file of readdirSync(REAL_PACKAGE_ROOT)) {
      if (file.endsWith(".json") && file !== "asset-portal-script-api.json") {
        copyFileSync(join(REAL_PACKAGE_ROOT, file), join(root, file));
      }
    }
    return root;
  }

  test("a package root without asset-portal-script-api.json pins nothing on the portal lane", () => {
    expect(readCoverageRegistries(packageRootCopy(), REAL_DATA_DIR).portal).toEqual([]);
  });

  test("each library asset-portal-script-api.json lists is pinned on the portal lane", () => {
    const root = packageRootCopy();
    writeFileSync(
      join(root, "asset-portal-script-api.json"),
      JSON.stringify({ libraries: [{ id: "defos", repo: "https://github.com/subsoap/defos" }] }),
    );
    expect(
      readCoverageRegistries(root, REAL_DATA_DIR).portal.map((library) => library.repo),
    ).toEqual(["https://github.com/subsoap/defos"]);
  });
});

describe("portalCoverage — aliases", () => {
  const checkpoint = entry({
    id: "library-defold-checkpoint",
    repo: "https://github.com/Klaleus/library-defold-checkpoint",
    reason: "not-found",
    ...NO_SOURCE,
  });
  const codeberg = "https://codeberg.org/Klaleus/defold-checkpoint";
  const authored = registries({ pinned: [{ lane: "authored", repo: codeberg }] });

  test("an alias joins a no-source entry to the repo a lane pins", () => {
    const [coverage] = coverageOf([checkpoint], authored, {
      "library-defold-checkpoint": codeberg,
    });
    expect(coverage?.lanes).toEqual(["authored"]);
    expect(coverage?.kind).toBe("no-source");
  });

  test("an alias for an id the manifest does not list throws naming the id", () => {
    expect(() => coverageOf([checkpoint], authored, { "library-defold-gone": codeberg })).toThrow(
      "library-defold-gone",
    );
  });

  test("an alias whose target no registry pins throws naming the target", () => {
    const stray = "https://codeberg.org/Klaleus/defold-elsewhere";
    expect(() =>
      coverageOf([checkpoint], authored, { "library-defold-checkpoint": stray }),
    ).toThrow(stray);
  });

  test("the committed alias file validates against the committed manifest and registries", () => {
    expect(() =>
      portalCoverage(
        readAssetPortalManifest(),
        readCoverageRegistries(),
        readPortalAliases(),
        readPortalVerdicts(),
      ),
    ).not.toThrow();
  });
});

describe("portalCoverage — verdicts", () => {
  test("a verdict takes an untracked, maintained entry off the candidate list with its reason", () => {
    const [declined, open] = coverageOf(
      [entry({ id: "editor-tool" }), entry({ id: "widget" })],
      registries(),
      {},
      { "editor-tool": "editor script only" },
    );
    expect(declined?.declined).toBe("editor script only");
    expect(declined?.candidate).toBe(false);
    expect(open?.declined).toBeNull();
    expect(open?.candidate).toBe(true);
  });

  test("a verdict for an id the manifest does not list throws naming the id", () => {
    expect(() =>
      coverageOf([entry({ id: "widget" })], registries(), {}, { gone: "editor script only" }),
    ).toThrow("asset-portal-verdicts.json: gone is not an asset-portal.json entry");
  });

  test("a verdict for an entry a lane pins directly throws naming the id and the lane", () => {
    expect(() =>
      coverageOf(
        [entry({ id: "widget" })],
        registries({ pinned: [{ lane: "luals", repo: "https://github.com/acme/widget" }] }),
        {},
        { widget: "editor script only" },
      ),
    ).toThrow("asset-portal-verdicts.json: widget is pinned by luals");
  });

  test("a verdict for an entry a lane pins through an alias throws naming the first lane", () => {
    const codeberg = "https://codeberg.org/Klaleus/defold-checkpoint";
    const checkpoint = entry({
      id: "library-defold-checkpoint",
      repo: "https://github.com/Klaleus/library-defold-checkpoint",
      reason: "not-found",
      ...NO_SOURCE,
    });
    expect(() =>
      coverageOf(
        [checkpoint],
        registries({
          pinned: [
            { lane: "markdown", repo: codeberg },
            { lane: "authored", repo: codeberg },
          ],
        }),
        { "library-defold-checkpoint": codeberg },
        { "library-defold-checkpoint": "project template" },
      ),
    ).toThrow("asset-portal-verdicts.json: library-defold-checkpoint is pinned by authored");
  });

  test("the committed verdicts file validates against the committed manifest, registries and aliases", () => {
    expect(() =>
      portalCoverage(
        readAssetPortalManifest(),
        readCoverageRegistries(),
        readPortalAliases(),
        readPortalVerdicts(),
      ),
    ).not.toThrow();
  });
});

describe("portalCoverage — candidacy", () => {
  test.each([
    "script-api",
    "native-untyped",
    "pure-lua-annotated",
    "pure-lua",
  ] as const)("an untracked %s entry pushed exactly 730 days before the sync is a candidate", (kind) => {
    const [coverage] = coverageOf([entry({ id: "x", kind, pushedAt: daysBeforeSync(730) })]);
    expect(coverage?.candidate).toBe(true);
  });

  test("an entry pushed 731 days before the sync is not a candidate", () => {
    const [coverage] = coverageOf([entry({ id: "x", pushedAt: daysBeforeSync(731) })]);
    expect(coverage?.candidate).toBe(false);
  });

  test("an archived or forked entry is not a candidate", () => {
    const coverage = coverageOf([
      entry({ id: "archived", archived: true }),
      entry({ id: "fork", fork: true }),
    ]);
    expect(coverage.map((c) => c.candidate)).toEqual([false, false]);
  });

  test.each([
    "no-lua-api",
    "not-a-dependency",
    "no-source",
  ] as const)("a %s entry is never a candidate", (kind) => {
    const [coverage] = coverageOf([entry({ id: "x", kind })]);
    expect(coverage?.candidate).toBe(false);
  });
});

describe("coverageReport", () => {
  test("candidates rank by stars descending, then id", () => {
    const report = coverageReport(
      coverageOf([
        entry({ id: "c", stars: 5 }),
        entry({ id: "a", stars: 5 }),
        entry({ id: "b", stars: 9 }),
      ]),
    );
    expect(report.candidates["pure-lua"]?.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  test("a tracked no-lua-api entry files under its lane, never under nothing-to-type", () => {
    const report = coverageReport(
      coverageOf(
        [
          entry({
            id: "defold-pbr",
            repo: "https://github.com/defold/asset-pbr",
            kind: "no-lua-api",
          }),
        ],
        registries({ defold: [{ repo: "https://github.com/defold/asset-pbr" }] }),
      ),
    );
    expect(report.tracked.defold?.map((c) => c.id)).toEqual(["defold-pbr"]);
    expect(report.nothingToType).toEqual({});
  });

  test("an untracked entry with a Lua API outside the maintenance window is neither a candidate nor nothing-to-type", () => {
    const report = coverageReport(
      coverageOf([
        entry({ id: "stale", pushedAt: daysBeforeSync(900) }),
        entry({ id: "shaders", kind: "no-lua-api" }),
      ]),
    );
    expect(report.candidates).toEqual({});
    expect(report.inactive.map((c) => c.id)).toEqual(["stale"]);
    expect(report.nothingToType["no-lua-api"]?.map((c) => c.id)).toEqual(["shaders"]);
  });

  test("a declined entry files under declined by id, never under candidates, inactive or nothing-to-type", () => {
    const report = coverageReport(
      coverageOf(
        [
          entry({ id: "template", pushedAt: daysBeforeSync(900) }),
          entry({ id: "editor-tool" }),
          entry({ id: "widget" }),
        ],
        registries(),
        {},
        { template: "project template", "editor-tool": "editor script only" },
      ),
    );
    expect(report.declined.map((c) => c.id)).toEqual(["editor-tool", "template"]);
    expect(report.candidates["pure-lua"]?.map((c) => c.id)).toEqual(["widget"]);
    expect(report.inactive).toEqual([]);
    expect(report.nothingToType).toEqual({});
  });

  test("the printed report lists declined entries after the candidates and excludes them from the count", () => {
    const text = describeCoverageReport(
      coverageReport(
        coverageOf(
          [entry({ id: "a-tool" }), entry({ id: "x" }), entry({ id: "widget" })],
          registries(),
          {},
          { "a-tool": "editor script only", x: "project template" },
        ),
      ),
    );
    expect(text).toContain(
      "\nDeclined: 2 untracked entries the project does not type\n  a-tool  editor script only\n  x       project template\n",
    );
    expect(text).toMatch(/^Candidates: 1 /m);
    expect(text.indexOf("Declined:")).toBeGreaterThan(text.indexOf("Candidates:"));
    expect(text.indexOf("Declined:")).toBeLessThan(text.indexOf("Not maintained:"));
  });

  test("the printed report counts each lane and lists each candidate with its stars and repo", () => {
    const text = describeCoverageReport(
      coverageReport(
        coverageOf(
          [entry({ id: "tracked" }), entry({ id: "rising", stars: 42 })],
          registries({ pinned: [{ lane: "luals", repo: "https://github.com/acme/tracked" }] }),
        ),
      ),
    );
    expect(text).toMatch(/^\s+luals\s+1$/m);
    expect(text).toMatch(/^\s+42\s+rising\s+https:\/\/github\.com\/acme\/rising$/m);
  });

  test("the printed report counts portal-paged entries under Tracked, not as script-api candidates", () => {
    const text = describeCoverageReport(
      coverageReport(
        coverageOf(
          [entry({ id: "defos", kind: "script-api" }), entry({ id: "rising", kind: "script-api" })],
          registries({ portal: [{ repo: "https://github.com/acme/defos" }] }),
        ),
      ),
    );
    expect(text).toMatch(/^Tracked: 1 entries/m);
    expect(text).toMatch(/^\s+portal\s+1$/m);
    expect(text).toContain("  script-api (1)\n");
    expect(text).not.toMatch(/^\s+\d+\s+defos\s/m);
  });
});

describe("candidateSlots — the ratchet probe's line grammar", () => {
  test("one line per candidate, by kind order, stars descending, then id, prefixed with the manifest", () => {
    const lines = candidateSlots(
      "asset-portal.json",
      coverageOf(
        [
          entry({ id: "lua-b", stars: 5 }),
          entry({ id: "lua-a", stars: 5 }),
          entry({ id: "lua-top", stars: 9 }),
          entry({ id: "ext", kind: "native-untyped", stars: 1 }),
          entry({ id: "docs", kind: "script-api", stars: 0 }),
          entry({ id: "tracked" }),
          entry({ id: "declined" }),
          entry({ id: "stale", pushedAt: daysBeforeSync(900) }),
          entry({ id: "shaders", kind: "no-lua-api" }),
        ],
        registries({ pinned: [{ lane: "luals", repo: "https://github.com/acme/tracked" }] }),
        {},
        { declined: "editor script only" },
      ),
    );
    expect(lines).toEqual([
      "asset-portal.json: script-api:docs:https://github.com/acme/docs",
      "asset-portal.json: native-untyped:ext:https://github.com/acme/ext",
      "asset-portal.json: pure-lua:lua-top:https://github.com/acme/lua-top",
      "asset-portal.json: pure-lua:lua-a:https://github.com/acme/lua-a",
      "asset-portal.json: pure-lua:lua-b:https://github.com/acme/lua-b",
    ]);
  });

  test("no candidate left yields no lines", () => {
    expect(
      candidateSlots(
        "asset-portal.json",
        coverageOf([entry({ id: "shaders", kind: "no-lua-api" })]),
      ),
    ).toEqual([]);
  });
});

describe("parseAssetPortalManifest", () => {
  test("a manifest with an entries array and a syncedAt passes through", () => {
    const parsed = manifest([entry({ id: "widget" })]);
    expect(parseAssetPortalManifest(parsed, "asset-portal.json")).toBe(parsed);
  });

  test.each([
    ["no entries array", { source: { syncedAt: SYNCED_AT } }],
    ["entries that are not an array", { source: { syncedAt: SYNCED_AT }, entries: {} }],
    ["no source.syncedAt", { source: {}, entries: [] }],
    ["a non-object", null],
  ])("a manifest with %s throws naming the file rather than reading as drained", (_label, raw) => {
    expect(() => parseAssetPortalManifest(raw, "asset-portal.json")).toThrow(
      "asset-portal.json: expected an asset-portal manifest",
    );
  });
});

function asset(id: string): PortalAsset {
  return {
    name: id,
    description: "",
    tags: [],
    project_url: `https://github.com/acme/${id}`,
    library_url: `https://github.com/acme/${id}/archive/main.zip`,
    isDefoldLibrary: true,
  };
}

const HEAD_SHA = "b".repeat(40);

function portalHead(files: Record<string, PortalAsset>): PortalHead & { entryCalls: string[] } {
  const entryCalls: string[] = [];
  return {
    entryCalls,
    head: async () => HEAD_SHA,
    entryFiles: async () => Object.keys(files),
    entry: async (_sha, file) => {
      entryCalls.push(file);
      const json = files[file];
      if (json === undefined) throw new Error(`no portal entry ${file}`);
      return json;
    },
  };
}

describe("portalDrift", () => {
  const pinned = manifest([entry({ id: "kept" }), entry({ id: "dropped" })]);

  test("an id the head adds is actionable and named with its project_url", async () => {
    const head = portalHead({
      "kept.json": asset("kept"),
      "dropped.json": asset("dropped"),
      "fresh.json": asset("fresh"),
    });
    const report = await portalDrift(pinned, head);
    expect(report.actionable).toBe(true);
    expect(report.added).toEqual([{ id: "fresh", projectUrl: "https://github.com/acme/fresh" }]);
    expect(report.removed).toEqual([]);
    expect(report.headCommit).toBe(HEAD_SHA);
    expect(report.issueTitle).toBe(PORTAL_DRIFT_ISSUE_TITLE);
    expect(PORTAL_DRIFT_ISSUE_TITLE).toBe("Asset portal entries differ from asset-portal.json");
    expect(report.issueBody).toContain("https://github.com/acme/fresh");
    expect(report.issueBody).toContain("bun run --cwd packages/library-types asset-portal:sync");
    expect(head.entryCalls).toEqual(["fresh.json"]);
  });

  test("an id the head no longer lists is actionable and named as removed", async () => {
    const report = await portalDrift(pinned, portalHead({ "kept.json": asset("kept") }));
    expect(report.actionable).toBe(true);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual(["dropped"]);
    expect(report.issueTitle).toBe(PORTAL_DRIFT_ISSUE_TITLE);
    expect(report.issueBody).toContain("`dropped`");
    expect(report.issueBody).toContain("bun run --cwd packages/library-types asset-portal:sync");
  });

  test("changed content under the same ids is not actionable and reads no entry", async () => {
    const rewritten = { ...asset("kept"), description: "refreshed release metadata" };
    const head = portalHead({ "kept.json": rewritten, "dropped.json": asset("dropped") });
    const report = await portalDrift(pinned, head);
    expect(report.actionable).toBe(false);
    expect(report.issueTitle).toBeUndefined();
    expect(head.entryCalls).toEqual([]);
  });

  test("a head that cannot be read yields an unreadable report", async () => {
    const report = await portalDrift(pinned, {
      ...portalHead({}),
      head: async () => {
        throw new Error("GitHub API responded 503");
      },
    });
    expect(report.actionable).toBe(false);
    expect(report.error).toContain("503");
  });
});

function cliIo(head: PortalHead): AssetPortalCheckIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    head,
  };
}

describe("runAssetPortalCheckCli", () => {
  test("an unreadable head exits 1 with the error on stderr", async () => {
    const seam = cliIo({
      ...portalHead({}),
      head: async () => {
        throw new Error("network down");
      },
    });
    const code = await runAssetPortalCheckCli(["--json"], seam);
    expect(code).toBe(1);
    const report = JSON.parse(seam.out.join("")) as PortalDriftReport;
    expect(report.command).toBe("asset-portal:check");
    expect(report.error).toContain("network down");
    expect(seam.err.join("")).toContain("network down");
  });

  test("drift is a finding: exit 0 with the report on stdout", async () => {
    const committed = readAssetPortalManifest();
    const files = Object.fromEntries(committed.entries.map((e) => [`${e.id}.json`, asset(e.id)]));
    const seam = cliIo(portalHead({ ...files, "brand-new.json": asset("brand-new") }));
    const code = await runAssetPortalCheckCli(["--json"], seam);
    expect(code).toBe(0);
    const report = JSON.parse(seam.out.join("")) as PortalDriftReport;
    expect(report.pinnedCommit).toBe(committed.source.commit);
    expect(report.added.map((a) => a.id)).toEqual(["brand-new"]);
  });
});

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { includedEvidence, portalEntryKind } from "./library-evidence";
import {
  type AssetPortalManifest,
  fetchAssetPortal,
  type PortalAsset,
  type PortalEntry,
  type PortalRepo,
  type PortalSource,
  syncAssetPortal,
  syncAssetPortalDates,
} from "./sync-asset-portal";
import type { PinDating } from "./sync-defold-extensions";

describe("includedEvidence", () => {
  test("counts only files under an include_dirs prefix", () => {
    const evidence = includedEvidence(
      [
        "example/x.script_api",
        "lib/api/lib.script_api",
        "lib/ext.manifest",
        "lib/core.lua",
        "libx/ext.manifest",
        "libx/other.lua",
        "main/main.lua",
      ],
      ["lib"],
    );
    expect(evidence).toEqual({ scriptApi: 1, extManifest: 1, lua: 1, luaSample: ["lib/core.lua"] });
  });

  test("a .script_api outside include_dirs counts zero", () => {
    expect(includedEvidence(["example/x.script_api"], ["lib"]).scriptApi).toBe(0);
  });

  test("a sibling dir sharing the prefix is not under it", () => {
    expect(includedEvidence(["libx/a.lua", "libx/ext.manifest"], ["lib"])).toEqual({
      scriptApi: 0,
      extManifest: 0,
      lua: 0,
      luaSample: [],
    });
  });

  test("samples the first four sorted .lua paths, skipping example, test, demo and sample segments", () => {
    const evidence = includedEvidence(
      [
        "lib/z.lua",
        "lib/examples/a.lua",
        "lib/example/a.lua",
        "lib/tests/a.lua",
        "lib/test/a.lua",
        "lib/demo/a.lua",
        "lib/samples/a.lua",
        "lib/sample/a.lua",
        "lib/c.lua",
        "lib/b.lua",
        "lib/a.lua",
        "lib/d.lua",
      ],
      ["lib"],
    );
    expect(evidence.lua).toBe(12);
    expect(evidence.luaSample).toEqual(["lib/a.lua", "lib/b.lua", "lib/c.lua", "lib/d.lua"]);
  });
});

describe("portalEntryKind", () => {
  const evidence = {
    readable: true,
    includeDirs: ["lib"],
    scriptApi: 0,
    extManifest: 0,
    lua: 0,
    luaAnnotated: 0,
  };

  test("no readable repo is no-source", () => {
    expect(portalEntryKind({ ...evidence, readable: false, scriptApi: 1 })).toBe("no-source");
  });

  test("empty include_dirs is not-a-dependency even with a .script_api elsewhere", () => {
    expect(portalEntryKind({ ...evidence, includeDirs: [], scriptApi: 1 })).toBe(
      "not-a-dependency",
    );
  });

  test("a .script_api wins over an ext.manifest", () => {
    expect(portalEntryKind({ ...evidence, scriptApi: 1, extManifest: 1, lua: 3 })).toBe(
      "script-api",
    );
  });

  test("an ext.manifest alone is native-untyped", () => {
    expect(portalEntryKind({ ...evidence, extManifest: 1, lua: 2 })).toBe("native-untyped");
  });

  test("Lua splits on whether any sample is annotated, and no Lua is no-lua-api", () => {
    expect(portalEntryKind({ ...evidence, lua: 5, luaAnnotated: 1 })).toBe("pure-lua-annotated");
    expect(portalEntryKind({ ...evidence, lua: 5 })).toBe("pure-lua");
    expect(portalEntryKind(evidence)).toBe("no-lua-api");
  });
});

function asset(projectUrl: string, overrides: Partial<PortalAsset> = {}): PortalAsset {
  return {
    name: "Name",
    description: "Description.",
    tags: ["GUI"],
    project_url: projectUrl,
    library_url: `${projectUrl}/archive/master.zip`,
    isDefoldLibrary: true,
    ...overrides,
  };
}

function repoMeta(fullName: string, overrides: Partial<PortalRepo> = {}): PortalRepo {
  return {
    full_name: fullName,
    archived: false,
    fork: false,
    pushed_at: "2026-09-01T00:00:00Z",
    stargazers_count: 10,
    default_branch: "master",
    license: null,
    ...overrides,
  };
}

const ANNOTATED_LUA = "local M = {}\n\n---@param id string\nfunction M.show(id) end\n\nreturn M\n";

function fakePortal(): PortalSource {
  const repos: Record<string, PortalRepo> = {
    "britzl/extension-imgui": repoMeta("defold/extension-imgui", { stargazers_count: 120 }),
    "britzl/monarch": repoMeta("britzl/monarch", { default_branch: "main", stargazers_count: 300 }),
    "defold/extension-spine": repoMeta("defold/extension-spine"),
  };
  const releases: Record<string, string> = { "britzl/monarch": "v2" };
  const tags: Record<string, string[]> = { "defold/extension-imgui": ["1.4.0"] };
  const trees: Record<string, string[]> = {
    "defold/extension-imgui@1.4.0": [
      "game.project",
      "imgui/api/imgui.script_api",
      "imgui/ext.manifest",
      "main/main.script",
    ],
    "britzl/monarch@main": ["game.project", "main-only/main.script_api"],
    "britzl/monarch@v2": ["game.project", "monarch/monarch.lua", "example/example.lua"],
    "defold/extension-spine@spine-sha": ["README.md"],
  };
  const files: Record<string, string> = {
    "https://raw.githubusercontent.com/defold/extension-imgui/1.4.0/game.project":
      "[library]\ninclude_dirs = imgui\n",
    "https://raw.githubusercontent.com/britzl/monarch/main/game.project":
      "[library]\ninclude_dirs = main-only\n",
    "https://raw.githubusercontent.com/britzl/monarch/v2/game.project":
      "[project]\ntitle = Monarch\n\n[library]\ninclude_dirs = monarch\n",
    "https://raw.githubusercontent.com/britzl/monarch/v2/monarch/monarch.lua": ANNOTATED_LUA,
  };
  return {
    head: async () => "portal-sha",
    entries: async (sha) => {
      if (sha !== "portal-sha") throw new Error(`entries read at ${sha}`);
      return [
        { file: "monarch.json", json: asset("https://github.com/britzl/monarch") },
        { file: "imgui.json", json: asset("https://github.com/britzl/extension-imgui") },
        {
          file: "library-defold-checkpoint.json",
          json: asset("https://github.com/Klaleus/library-defold-checkpoint"),
        },
        {
          file: "gunit.json",
          json: asset("https://gitlab.com/mattpwest/gunit-defold", { isDefoldLibrary: false }),
        },
        {
          file: "spine.json",
          json: asset("https://github.com/defold/extension-spine", { id: "extension-spine" }),
        },
      ];
    },
    repo: async (ownerRepo) => repos[ownerRepo] ?? null,
    latestRelease: async (fullName) => {
      const tag = releases[fullName];
      return tag ? { tag_name: tag } : null;
    },
    tags: async (fullName) => (tags[fullName] ?? []).map((name) => ({ name })),
    headSha: async (fullName) => `${fullName.split("/")[1]?.replace("extension-", "")}-sha`,
    tree: async (fullName, ref) => {
      const tree = trees[`${fullName}@${ref}`];
      if (!tree) throw new Error(`no tree for ${fullName}@${ref}`);
      return tree;
    },
    fetchText: async (url) => {
      const text = files[url];
      if (text === undefined) throw new Error(`fetch failed: ${url} -> 404`);
      return text;
    },
    releaseByTag: async (fullName, tag) =>
      releases[fullName] === tag ? { published_at: "2026-08-01T00:00:00Z" } : null,
    commitDate: async () => "2026-07-01T00:00:00Z",
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
  scriptApi: 0,
  extManifest: 0,
  lua: 0,
  luaSampled: 0,
  luaAnnotated: 0,
  kind: "no-source",
};

const PORTAL_FIELDS = {
  name: "Name",
  description: "Description.",
  tags: ["GUI"],
};

describe("syncAssetPortal", () => {
  test("writes every portal entry, sorted by id, with evidence read at each repo's pin", async () => {
    const root = mkdtempSync(join(tmpdir(), "asset-portal-"));
    await syncAssetPortal(root, fakePortal(), "2026-10-21T00:00:00.000Z");
    const manifest = JSON.parse(readFileSync(join(root, "asset-portal.json"), "utf8"));

    expect(manifest).toEqual({
      source: {
        repo: "https://github.com/defold/asset-portal",
        commit: "portal-sha",
        syncedAt: "2026-10-21T00:00:00.000Z",
      },
      entries: [
        {
          id: "gunit",
          ...PORTAL_FIELDS,
          portalLibrary: false,
          repo: null,
          reason: "no-github-url",
          ...NO_SOURCE,
        },
        {
          id: "imgui",
          ...PORTAL_FIELDS,
          portalLibrary: true,
          repo: "https://github.com/defold/extension-imgui",
          archived: false,
          fork: false,
          pushedAt: "2026-09-01T00:00:00Z",
          stars: 120,
          ref: "1.4.0",
          refKind: "tag",
          includeDirs: ["imgui"],
          scriptApi: 1,
          extManifest: 1,
          lua: 0,
          luaSampled: 0,
          luaAnnotated: 0,
          kind: "script-api",
        },
        {
          id: "library-defold-checkpoint",
          ...PORTAL_FIELDS,
          portalLibrary: true,
          repo: "https://github.com/Klaleus/library-defold-checkpoint",
          reason: "not-found",
          ...NO_SOURCE,
        },
        {
          id: "monarch",
          ...PORTAL_FIELDS,
          portalLibrary: true,
          repo: "https://github.com/britzl/monarch",
          archived: false,
          fork: false,
          pushedAt: "2026-09-01T00:00:00Z",
          stars: 300,
          ref: "v2",
          refKind: "release",
          includeDirs: ["monarch"],
          scriptApi: 0,
          extManifest: 0,
          lua: 1,
          luaSampled: 1,
          luaAnnotated: 1,
          kind: "pure-lua-annotated",
        },
        {
          id: "spine",
          ...PORTAL_FIELDS,
          portalLibrary: true,
          repo: "https://github.com/defold/extension-spine",
          archived: false,
          fork: false,
          pushedAt: "2026-09-01T00:00:00Z",
          stars: 10,
          ref: "spine-sha",
          refKind: "commit",
          includeDirs: [],
          scriptApi: 0,
          extManifest: 0,
          lua: 0,
          luaSampled: 0,
          luaAnnotated: 0,
          kind: "not-a-dependency",
        },
      ],
    });
  });
});

function pinned(
  id: string,
  ownerRepo: string | null,
  ref: string | null,
  refKind: PortalEntry["refKind"],
): PortalEntry {
  return {
    id,
    ...PORTAL_FIELDS,
    portalLibrary: true,
    repo: ownerRepo === null ? null : `https://github.com/${ownerRepo}`,
    archived: false,
    fork: false,
    pushedAt: "2026-09-01T00:00:00Z",
    stars: 1,
    ref,
    refKind,
    includeDirs: ["lib"],
    scriptApi: 0,
    extManifest: 0,
    lua: 1,
    luaSampled: 1,
    luaAnnotated: 0,
    kind: "pure-lua",
  };
}

const SEEDED: AssetPortalManifest = {
  source: {
    repo: "https://github.com/defold/asset-portal",
    commit: "portal-sha",
    syncedAt: "2026-10-21T00:00:00.000Z",
  },
  entries: [
    pinned("early-release", "acme/lib-early", "v1", "release"),
    pinned("late-release", "acme/lib-late", "v2", "release"),
    pinned("tagged", "acme/lib-tagged", "1.0", "tag"),
    pinned("committed", "acme/lib-committed", "abc123", "commit"),
    { ...pinned("gone", null, null, null), reason: "no-github-url", kind: "no-source" },
  ],
};

interface RecordingDating extends PinDating {
  calls: string[];
}

function fakeDating(failing: string | null = null): RecordingDating {
  const published: Record<string, string> = {
    "acme/lib-early@v1": "2024-01-01T00:00:00Z",
    "acme/lib-late@v2": "2024-05-01T00:00:00Z",
    "acme/lib-tagged@1.0": "2020-01-01T00:00:00Z",
  };
  const committed: Record<string, string> = {
    "acme/lib-early@v1": "2024-02-01T00:00:00Z",
    "acme/lib-late@v2": "2024-04-01T00:00:00Z",
    "acme/lib-tagged@1.0": "2023-03-03T00:00:00Z",
    "acme/lib-committed@abc123": "2022-02-02T00:00:00Z",
  };
  const calls: string[] = [];
  return {
    calls,
    async releaseByTag(name, tag) {
      calls.push(`release ${name}@${tag}`);
      const date = published[`${name}@${tag}`];
      return date ? { published_at: date } : null;
    },
    async commitDate(name, ref) {
      calls.push(`commit ${name}@${ref}`);
      const key = `${name}@${ref}`;
      if (key === failing) throw new Error("404 Not Found");
      const date = committed[key];
      if (!date) throw new Error(`no commit ${key}`);
      return date;
    },
  };
}

function seededRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "asset-portal-dates-"));
  writeFileSync(join(root, "asset-portal.json"), `${JSON.stringify(SEEDED, null, 2)}\n`);
  return root;
}

function readManifest(root: string): AssetPortalManifest {
  return JSON.parse(readFileSync(join(root, "asset-portal.json"), "utf8"));
}

describe("syncAssetPortalDates", () => {
  test("a release pin takes the earlier of its publish and commit dates", async () => {
    const root = seededRoot();
    await syncAssetPortalDates(root, fakeDating());
    const byId = new Map(readManifest(root).entries.map((entry) => [entry.id, entry]));
    expect(byId.get("early-release")?.refDate).toBe("2024-01-01T00:00:00Z");
    expect(byId.get("late-release")?.refDate).toBe("2024-04-01T00:00:00Z");
  });

  test("a tag pin takes its tagged commit's date without a release lookup", async () => {
    const root = seededRoot();
    const dating = fakeDating();
    await syncAssetPortalDates(root, dating);
    const tagged = readManifest(root).entries.find((entry) => entry.id === "tagged");
    expect(tagged?.refDate).toBe("2023-03-03T00:00:00Z");
    expect(dating.calls).toContain("commit acme/lib-tagged@1.0");
    expect(dating.calls).not.toContain("release acme/lib-tagged@1.0");
  });

  test("commit and unpinned entries get no refDate and no lookup; lookups name the repo URL's owner/repo", async () => {
    const root = seededRoot();
    const dating = fakeDating();
    const { pins } = await syncAssetPortalDates(root, dating);
    const byId = new Map(readManifest(root).entries.map((entry) => [entry.id, entry]));
    expect("refDate" in (byId.get("committed") ?? {})).toBe(false);
    expect("refDate" in (byId.get("gone") ?? {})).toBe(false);
    expect(pins).toBe(3);
    expect([...dating.calls].sort()).toEqual([
      "commit acme/lib-early@v1",
      "commit acme/lib-late@v2",
      "commit acme/lib-tagged@1.0",
      "release acme/lib-early@v1",
      "release acme/lib-late@v2",
    ]);
  });

  test("refDate sits after refKind and nothing else in the manifest changes", async () => {
    const root = seededRoot();
    await syncAssetPortalDates(root, fakeDating());
    const written = readManifest(root);
    for (const entry of written.entries) {
      if (!("refDate" in entry)) continue;
      const keys = Object.keys(entry);
      expect(keys.indexOf("refDate")).toBe(keys.indexOf("refKind") + 1);
    }
    expect({
      ...written,
      entries: written.entries.map(({ refDate: _date, ...entry }) => entry),
    }).toEqual(SEEDED);
    expect(readFileSync(join(root, "asset-portal.json"), "utf8")).toBe(
      `${JSON.stringify(written, null, 2)}\n`,
    );
  });

  test("a pin that cannot be dated throws naming its entry and leaves the manifest untouched", async () => {
    const root = seededRoot();
    const before = readFileSync(join(root, "asset-portal.json"), "utf8");
    await expect(syncAssetPortalDates(root, fakeDating("acme/lib-tagged@1.0"))).rejects.toThrow(
      "asset-portal: cannot date tagged at acme/lib-tagged@1.0 (404 Not Found); re-sync with --fetch",
    );
    expect(readFileSync(join(root, "asset-portal.json"), "utf8")).toBe(before);
  });
});

describe("fetchAssetPortal", () => {
  test("classifies the portal, then dates every release and tag pin", async () => {
    const root = mkdtempSync(join(tmpdir(), "asset-portal-fetch-"));
    await fetchAssetPortal(root, fakePortal(), "2026-10-21T00:00:00.000Z");
    const pinnedEntries = readManifest(root).entries.filter(
      (entry) => entry.refKind === "release" || entry.refKind === "tag",
    );
    expect(pinnedEntries.map((entry) => [entry.id, entry.refDate])).toEqual([
      ["imgui", "2026-07-01T00:00:00Z"],
      ["monarch", "2026-07-01T00:00:00Z"],
    ]);
  });
});

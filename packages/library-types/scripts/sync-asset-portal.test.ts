import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  includedEvidence,
  type PortalAsset,
  type PortalRepo,
  type PortalSource,
  portalEntryKind,
  syncAssetPortal,
} from "./sync-asset-portal";

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

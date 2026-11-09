import { describe, expect, test } from "bun:test";
import {
  type AuthoredRegistryTargets,
  buildAuthoredRegistryEntries,
  buildLualsRegistryEntries,
  buildScriptApiRegistryEntries,
  type LualsTargets,
  libraryName,
  matchLibraryName,
  matchVendoredLibrary,
  mergeVendoredLibrariesBySourceId,
  normalizeSourceId,
  type ScriptApiRegistryTargets,
  type VendoredLibrary,
} from "./library-match";

// `library-match.ts` is a pure, IO-free module, and this file tests it as one:
// every registry below is synthetic. The one assertion that needed the real
// committed corpus lives in `library-registry.test.ts`, where the composed
// multi-lane registry it depends on is already loaded.
const registry: VendoredLibrary[] = [
  { sourceId: "whiteboxdev/boom", modules: ["boom.boom"] },
  { sourceId: "britzl/gooey", modules: ["gooey.gooey"] },
];

describe("libraryName", () => {
  test("names a library by its lowercased owner/repo, whatever the URL shape", () => {
    expect(libraryName("https://github.com/Britzl/Boom/archive/refs/tags/v1.0.zip")).toBe(
      "britzl/boom",
    );
    expect(libraryName("https://github.com/britzl/boom.git")).toBe("britzl/boom");
    expect(libraryName("britzl/boom")).toBe("britzl/boom");
    expect(libraryName("https://codeberg.org/Klaleus/defold-checkpoint")).toBe(
      "klaleus/defold-checkpoint",
    );
  });

  test("keeps the bare repo for a URL with no owner segment", () => {
    expect(libraryName("https://example.com/lib.zip")).toBe("lib");
  });
});

describe("matchLibraryName", () => {
  const names = ["britzl/boom", "insality/druid"];

  test("an owner/repo a library holds is exact", () => {
    expect(
      matchLibraryName("https://github.com/britzl/boom/archive/refs/tags/v1.0.zip", names),
    ).toEqual({ kind: "exact", name: "britzl/boom" });
  });

  test("another owner's repo of the same name falls back to that library as a fork", () => {
    expect(matchLibraryName("https://github.com/someone/boom/archive/main.zip", names)).toEqual({
      kind: "fork",
      name: "britzl/boom",
    });
  });

  test("a repo no library holds matches nothing", () => {
    expect(matchLibraryName("https://github.com/someone/other/archive/main.zip", names)).toBe(null);
  });

  test("a repo name two libraries share matches neither, unless the owner is exact", () => {
    const admob = ["defold/extension-admob", "lerg/extension-admob"];
    expect(
      matchLibraryName("https://github.com/defold/extension-admob/archive/main.zip", admob),
    ).toEqual({ kind: "exact", name: "defold/extension-admob" });
    expect(
      matchLibraryName("https://github.com/someone/extension-admob/archive/main.zip", admob),
    ).toEqual({ kind: "shared", names: ["defold/extension-admob", "lerg/extension-admob"] });
  });

  test("a name with no owner takes no part in the repo-name fallback", () => {
    expect(
      matchLibraryName("https://github.com/someone/boom/archive/main.zip", ["boom", "britzl/boom"]),
    ).toEqual({ kind: "fork", name: "britzl/boom" });
  });
});

describe("matchVendoredLibrary", () => {
  test("matches a declared archive URL to its vendored module list", () => {
    const match = matchVendoredLibrary(
      "https://github.com/whiteboxdev/boom/archive/main.zip",
      registry,
    );
    expect(match).toEqual({ library: registry[0] as VendoredLibrary, kind: "exact" });
  });

  test("returns null for a repo name two libraries share", () => {
    const shared: VendoredLibrary[] = [
      { sourceId: "defold/extension-admob", modules: ["admob.a"] },
      { sourceId: "lerg/extension-admob", modules: ["admob.b"] },
    ];
    expect(
      matchVendoredLibrary("https://github.com/someone/extension-admob/archive/main.zip", shared),
    ).toBe(null);
  });

  test("returns null for a native or unknown library without throwing", () => {
    // `applovin` is a native (bare-global) extension, not a vendored pure-Lua lib.
    expect(matchVendoredLibrary("https://github.com/AppLovin/AppLovin-MAX-Defold", registry)).toBe(
      null,
    );
    expect(
      matchVendoredLibrary(
        "https://github.com/nobody/not-a-real-library/archive/main.zip",
        registry,
      ),
    ).toBe(null);
  });

  test("normalizes across archive-ref variants and query strings of one repo", () => {
    const variants = [
      "https://github.com/whiteboxdev/boom/archive/main.zip",
      "https://github.com/whiteboxdev/boom/archive/v1.2.3.zip",
      "https://github.com/whiteboxdev/boom/archive/refs/heads/main.zip?token=abc",
      "https://GitHub.com/whiteboxdev/boom",
    ];
    for (const url of variants) {
      expect(matchVendoredLibrary(url, registry)?.library.modules).toEqual(["boom.boom"]);
    }
  });
});

describe("normalizeSourceId", () => {
  test("reduces an archive URL to its lowercased repo identity", () => {
    expect(normalizeSourceId("https://github.com/paulomrpp/dicebag/archive/main.zip")).toBe(
      "dicebag",
    );
    expect(
      normalizeSourceId("https://github.com/paulomrpp/dicebag/archive/refs/tags/v1.0.0.zip"),
    ).toBe("dicebag");
    expect(normalizeSourceId("https://GitHub.com/Insality/defold-event.git")).toBe("defold-event");
    expect(normalizeSourceId("https://github.com/owner/repo/archive/main.zip?token=x")).toBe(
      "repo",
    );
  });
});

describe("buildLualsRegistryEntries", () => {
  const druidTargets: LualsTargets = {
    targets: [
      { repo: "https://github.com/Insality/druid", moduleId: "druid.druid", namespace: "druid" },
    ],
  };

  test("maps a LuaLS target to an entry keyed by normalized repo, verifying on moduleId with a generated stem", () => {
    expect(buildLualsRegistryEntries(druidTargets)).toEqual([
      {
        sourceId: "insality/druid",
        modules: ["druid.druid"],
        namespaces: { "druid.druid": "druid" },
      },
    ]);
  });

  test("normalizes the repo the same way declared archive URLs are", () => {
    const [entry] = buildLualsRegistryEntries({
      targets: [
        {
          repo: "https://GitHub.com/Insality/druid.git",
          moduleId: "druid.druid",
          namespace: "druid",
        },
      ],
    });
    expect(entry?.sourceId).toBe("insality/druid");
  });

  test("returns no entries for an empty target list", () => {
    expect(buildLualsRegistryEntries({ targets: [] })).toEqual([]);
  });

  test("groups two same-repo targets into one entry with every module and merged namespaces", () => {
    const saverTargets: LualsTargets = {
      targets: [
        {
          repo: "https://github.com/Insality/defold-saver",
          moduleId: "saver.saver",
          namespace: "saver.saver",
        },
        {
          repo: "https://github.com/Insality/defold-saver",
          moduleId: "saver.storage",
          namespace: "saver.storage",
        },
      ],
    };
    expect(buildLualsRegistryEntries(saverTargets)).toEqual([
      {
        sourceId: "insality/defold-saver",
        modules: ["saver.saver", "saver.storage"],
        namespaces: { "saver.saver": "saver.saver", "saver.storage": "saver.storage" },
      },
    ]);
  });

  test("keeps two different repos as separate entries in first-seen order", () => {
    const twoRepos: LualsTargets = {
      targets: [
        { repo: "https://github.com/Insality/druid", moduleId: "druid.druid", namespace: "druid" },
        {
          repo: "https://github.com/Insality/defold-saver",
          moduleId: "saver.saver",
          namespace: "saver.saver",
        },
      ],
    };
    expect(buildLualsRegistryEntries(twoRepos)).toEqual([
      {
        sourceId: "insality/druid",
        modules: ["druid.druid"],
        namespaces: { "druid.druid": "druid" },
      },
      {
        sourceId: "insality/defold-saver",
        modules: ["saver.saver"],
        namespaces: { "saver.saver": "saver.saver" },
      },
    ]);
  });
});

describe("buildScriptApiRegistryEntries", () => {
  const bridgeTargets: ScriptApiRegistryTargets = {
    targets: [
      {
        repo: "https://github.com/Playgama/bridge-defold",
        moduleId: "bridge.bridge",
        namespace: "bridge",
      },
    ],
  };

  test("maps a script_api target to an entry keyed by normalized repo, verifying on moduleId with a generated stem", () => {
    expect(buildScriptApiRegistryEntries(bridgeTargets)).toEqual([
      {
        sourceId: "playgama/bridge-defold",
        modules: ["bridge.bridge"],
        namespaces: { "bridge.bridge": "bridge" },
      },
    ]);
  });

  test("returns no entries for an empty target list", () => {
    expect(buildScriptApiRegistryEntries({ targets: [] })).toEqual([]);
  });

  test("groups two same-repo targets into one entry the same way (symmetry with LuaLS)", () => {
    const sameRepo: ScriptApiRegistryTargets = {
      targets: [
        { repo: "https://github.com/acme/thing", moduleId: "thing.a", namespace: "thing.a" },
        { repo: "https://github.com/acme/thing", moduleId: "thing.b", namespace: "thing.b" },
      ],
    };
    expect(buildScriptApiRegistryEntries(sameRepo)).toEqual([
      {
        sourceId: "acme/thing",
        modules: ["thing.a", "thing.b"],
        namespaces: { "thing.a": "thing.a", "thing.b": "thing.b" },
      },
    ]);
  });
});

describe("buildAuthoredRegistryEntries", () => {
  const defconTargets: AuthoredRegistryTargets = {
    targets: [
      {
        repo: "https://github.com/britzl/defcon",
        moduleId: "defcon.console",
        namespace: "defcon",
      },
    ],
  };

  test("maps an authored target to an entry keyed by normalized repo, verifying on moduleId with a generated stem", () => {
    expect(buildAuthoredRegistryEntries(defconTargets)).toEqual([
      {
        sourceId: "britzl/defcon",
        modules: ["defcon.console"],
        namespaces: { "defcon.console": "defcon" },
      },
    ]);
  });

  test("returns no entries for an empty target list", () => {
    expect(buildAuthoredRegistryEntries({ targets: [] })).toEqual([]);
  });
});

describe("matchVendoredLibrary against a LuaLS entry", () => {
  const druidEntry: VendoredLibrary = {
    sourceId: "insality/druid",
    modules: ["druid.druid"],
    namespaces: { "druid.druid": "druid" },
  };

  test("matches druid's declared archive URL and its moving refs exactly, and a fork as one", () => {
    for (const url of [
      "https://github.com/Insality/druid/archive/1.2.5.zip",
      "https://github.com/Insality/druid/archive/main.zip",
    ]) {
      expect(matchVendoredLibrary(url, [druidEntry])).toEqual({
        library: druidEntry,
        kind: "exact",
      });
    }
    expect(
      matchVendoredLibrary("https://github.com/someone/druid/archive/refs/heads/main.zip?token=x", [
        druidEntry,
      ]),
    ).toEqual({ library: druidEntry, kind: "fork" });
  });

  test("returns null for an unrelated URL", () => {
    expect(
      matchVendoredLibrary("https://github.com/nobody/other/archive/main.zip", [druidEntry]),
    ).toBe(null);
  });
});

describe("VendoredLibrary namespaces is optional", () => {
  test("a pure-Lua entry round-trips unchanged without namespaces", () => {
    const pureLua: VendoredLibrary = {
      sourceId: "paulomrpp/dicebag",
      modules: ["dicebag.dicebag"],
    };
    expect(pureLua.namespaces).toBeUndefined();
    expect(
      matchVendoredLibrary("https://github.com/paulomrpp/dicebag/archive/main.zip", [pureLua])
        ?.library,
    ).toEqual(pureLua);
  });
});

describe("mergeVendoredLibrariesBySourceId", () => {
  test("folds a stemless and a stemmed entry sharing a sourceId into one, stems only for the stemmed module", () => {
    const merged = mergeVendoredLibrariesBySourceId([
      { sourceId: "o/r", modules: ["a"] },
      { sourceId: "o/r", modules: ["b"], namespaces: { b: "ns" } },
    ]);
    expect(merged).toEqual([{ sourceId: "o/r", modules: ["a", "b"], namespaces: { b: "ns" } }]);
  });

  test("passes disjoint sourceIds through unchanged in first-seen order", () => {
    const entries: VendoredLibrary[] = [
      { sourceId: "o/second", modules: ["b.b"], namespaces: { "b.b": "b" } },
      { sourceId: "o/first", modules: ["a.a"] },
    ];
    expect(mergeVendoredLibrariesBySourceId(entries)).toEqual([
      { sourceId: "o/second", modules: ["b.b"], namespaces: { "b.b": "b" } },
      { sourceId: "o/first", modules: ["a.a"] },
    ]);
  });

  test("merges two entries without namespaces into one with no namespaces key on the result", () => {
    const merged = mergeVendoredLibrariesBySourceId([
      { sourceId: "o/r", modules: ["a"] },
      { sourceId: "o/r", modules: ["b"] },
    ]);
    expect(merged).toEqual([{ sourceId: "o/r", modules: ["a", "b"] }]);
    expect(merged[0]?.namespaces).toBeUndefined();
  });

  test("dedupes a module id shared across the two entries and sorts the merged modules", () => {
    const merged = mergeVendoredLibrariesBySourceId([
      { sourceId: "o/r", modules: ["c", "a"] },
      { sourceId: "o/r", modules: ["a", "b"] },
    ]);
    expect(merged).toEqual([{ sourceId: "o/r", modules: ["a", "b", "c"] }]);
  });
});

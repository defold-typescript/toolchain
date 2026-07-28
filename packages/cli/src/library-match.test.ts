import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AuthoredRegistryTargets,
  buildAuthoredRegistryEntries,
  buildLibraryRegistry,
  buildLualsRegistryEntries,
  buildScriptApiRegistryEntries,
  type LibraryClassification,
  type LibraryTargets,
  type LualsTargets,
  matchVendoredLibrary,
  normalizeSourceId,
  type ScriptApiRegistryTargets,
  type VendoredLibrary,
} from "./library-match";

const libraryTypesRoot = join(import.meta.dir, "..", "..", "library-types");

function readRegistryFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(libraryTypesRoot, name), "utf8")) as T;
}

const realClassification = readRegistryFixture<LibraryClassification>(
  "library-classification.json",
);
const realTargets = readRegistryFixture<LibraryTargets>("library-targets.json");

describe("matchVendoredLibrary", () => {
  test("matches a declared archive URL to its vendored module list", () => {
    const registry = buildLibraryRegistry(realClassification, realTargets);
    const match = matchVendoredLibrary(
      "https://github.com/paulomrpp/dicebag/archive/main.zip",
      registry,
    );
    expect(match?.modules).toEqual(["dicebag.dicebag"]);
  });

  test("returns null for a native or unknown library without throwing", () => {
    const registry = buildLibraryRegistry(realClassification, realTargets);
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
    const registry = buildLibraryRegistry(realClassification, realTargets);
    const variants = [
      "https://github.com/paulomrpp/dicebag/archive/main.zip",
      "https://github.com/paulomrpp/dicebag/archive/v1.2.3.zip",
      "https://github.com/paulomrpp/dicebag/archive/refs/heads/main.zip?token=abc",
      "https://GitHub.com/paulomrpp/dicebag",
    ];
    for (const url of variants) {
      expect(matchVendoredLibrary(url, registry)?.modules).toEqual(["dicebag.dicebag"]);
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

describe("buildLibraryRegistry", () => {
  const classification: LibraryClassification = {
    dirs: [
      { dir: "boom", classification: "already-vendored", modules: ["boom.boom"] },
      { dir: "starly", classification: "pure-lua", modules: ["starly.starly"] },
      { dir: "AppLovin-MAX-Defold", classification: "native", modules: ["applovin"] },
      { dir: "future-lib", classification: "covered-by-goal", modules: ["future.future"] },
    ],
  };
  const targets: LibraryTargets = {
    targets: [
      { module: "boom.boom", path: "packages/boom/boom.boom.d.ts" },
      { module: "starly.starly", path: "packages/starly/starly.starly.d.ts" },
      { module: "applovin", path: "packages/AppLovin-MAX-Defold/applovin.d.ts" },
      { module: "future.future", path: "packages/future-lib/future.future.d.ts" },
    ],
  };

  test("includes pure-lua and already-vendored dirs, excludes native and covered-by-goal", () => {
    const registry = buildLibraryRegistry(classification, targets);
    expect(registry).toEqual([
      { sourceId: "boom", modules: ["boom.boom"] },
      { sourceId: "starly", modules: ["starly.starly"] },
    ]);
  });

  test("skips modules with no pinned vendored target", () => {
    const registry = buildLibraryRegistry(
      { dirs: [{ dir: "bzAnim", classification: "already-vendored", modules: ["bzAnim.bzAnim"] }] },
      { targets: [] },
    );
    expect(registry).toEqual([]);
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
      { sourceId: "druid", modules: ["druid.druid"], generatedStems: { "druid.druid": "druid" } },
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
    expect(entry?.sourceId).toBe("druid");
  });

  test("returns no entries for an empty target list", () => {
    expect(buildLualsRegistryEntries({ targets: [] })).toEqual([]);
  });

  test("groups two same-repo targets into one entry with every module and a merged generatedStems", () => {
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
        sourceId: "defold-saver",
        modules: ["saver.saver", "saver.storage"],
        generatedStems: { "saver.saver": "saver.saver", "saver.storage": "saver.storage" },
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
      { sourceId: "druid", modules: ["druid.druid"], generatedStems: { "druid.druid": "druid" } },
      {
        sourceId: "defold-saver",
        modules: ["saver.saver"],
        generatedStems: { "saver.saver": "saver.saver" },
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
        sourceId: "bridge-defold",
        modules: ["bridge.bridge"],
        generatedStems: { "bridge.bridge": "bridge" },
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
        sourceId: "thing",
        modules: ["thing.a", "thing.b"],
        generatedStems: { "thing.a": "thing.a", "thing.b": "thing.b" },
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
        sourceId: "defcon",
        modules: ["defcon.console"],
        generatedStems: { "defcon.console": "defcon" },
      },
    ]);
  });

  test("returns no entries for an empty target list", () => {
    expect(buildAuthoredRegistryEntries({ targets: [] })).toEqual([]);
  });
});

describe("matchVendoredLibrary against a LuaLS entry", () => {
  const druidEntry: VendoredLibrary = {
    sourceId: "druid",
    modules: ["druid.druid"],
    generatedStems: { "druid.druid": "druid" },
  };

  test("matches druid's declared archive URL and its moving/forked refs", () => {
    for (const url of [
      "https://github.com/Insality/druid/archive/1.2.5.zip",
      "https://github.com/Insality/druid/archive/main.zip",
      "https://github.com/someone/druid/archive/refs/heads/main.zip?token=x",
    ]) {
      expect(matchVendoredLibrary(url, [druidEntry])).toEqual(druidEntry);
    }
  });

  test("returns null for an unrelated URL", () => {
    expect(
      matchVendoredLibrary("https://github.com/nobody/other/archive/main.zip", [druidEntry]),
    ).toBe(null);
  });
});

describe("VendoredLibrary generatedStems is optional", () => {
  test("a pure-Lua entry round-trips unchanged without generatedStems", () => {
    const pureLua: VendoredLibrary = { sourceId: "dicebag", modules: ["dicebag.dicebag"] };
    expect(pureLua.generatedStems).toBeUndefined();
    expect(
      matchVendoredLibrary("https://github.com/paulomrpp/dicebag/archive/main.zip", [pureLua]),
    ).toEqual(pureLua);
  });
});

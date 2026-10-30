import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNativeExpectations } from "./library/target-expectations";
import { matchVendoredLibrary } from "./library-match";
import {
  loadLibraryIndexSlotClassifications,
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  resolveLibraryTypesPackageRoot,
} from "./library-registry";

describe("resolveLibraryTypesPackageRoot", () => {
  test("resolves the installed @defold-typescript/library-types root in this workspace", () => {
    const root = resolveLibraryTypesPackageRoot();
    expect(root).not.toBeNull();
    expect(existsSync(join(root as string, "package.json"))).toBe(true);
    expect(existsSync(join(root as string, "luals-targets.json"))).toBe(true);
  });
});

describe("loadVendoredLibraryRegistry", () => {
  test("builds a non-empty registry from the real corpus", () => {
    const registry = loadVendoredLibraryRegistry();
    expect(registry.length).toBeGreaterThan(0);
    for (const library of registry) {
      expect(typeof library.sourceId).toBe("string");
      expect(library.sourceId.length).toBeGreaterThan(0);
      expect(library.modules.length).toBeGreaterThan(0);
    }
  });

  test("returns the empty fallback when the package root cannot be resolved", () => {
    expect(loadVendoredLibraryRegistry(null)).toEqual([]);
  });

  test("returns the empty fallback when the registry JSONs are absent under the given root", () => {
    expect(loadVendoredLibraryRegistry("/nonexistent/library-types-root")).toEqual([]);
  });

  test("includes the druid LuaLS target alongside the pure-Lua entries", () => {
    const registry = loadVendoredLibraryRegistry();
    const druid = registry.find((library) => library.sourceId === "druid");
    expect(druid).toBeDefined();
    expect(druid?.modules).toEqual(["druid.druid"]);
    expect(druid?.namespaces?.["druid.druid"]).toBe("druid");
    // the pure-Lua corpus is still present, so the LuaLS append is additive.
    expect(registry.length).toBeGreaterThan(1);
  });

  test("includes the bridge script_api target so resolve still materializes it", () => {
    const registry = loadVendoredLibraryRegistry();
    const bridge = registry.find((library) => library.sourceId === "bridge-defold");
    expect(bridge).toBeDefined();
    expect(bridge?.modules).toEqual(["bridge.bridge"]);
    expect(bridge?.namespaces?.["bridge.bridge"]).toBe("bridge");
  });

  test("includes the defcon authored target so resolve materializes its dotted module", () => {
    const registry = loadVendoredLibraryRegistry();
    const defcon = registry.find((library) => library.sourceId === "defcon");
    expect(defcon).toBeDefined();
    expect(defcon?.modules).toEqual(["defcon.console"]);
    expect(defcon?.namespaces?.["defcon.console"]).toBe("defcon");
  });

  test("groups defold-saver's two modules into a single entry with both generated stems", () => {
    const registry = loadVendoredLibraryRegistry();
    const saver = registry.filter((library) => library.sourceId === "defold-saver");
    expect(saver).toHaveLength(1);
    expect(saver[0]?.modules).toEqual(["saver.saver", "saver.storage"]);
    expect(saver[0]?.namespaces?.["saver.saver"]).toBe("saver.saver");
    expect(saver[0]?.namespaces?.["saver.storage"]).toBe("saver.storage");
  });

  test("keeps nakama-defold's five modules in one entry now that all come from the authored lane", () => {
    const registry = loadVendoredLibraryRegistry();
    const nakama = registry.filter((library) => library.sourceId === "nakama-defold");
    expect(nakama).toHaveLength(1);
    expect(nakama[0]?.modules).toEqual([
      "nakama.engine.defold",
      "nakama.nakama",
      "nakama.session",
      "nakama.socket",
      "nakama.util.log",
    ]);
    expect(nakama[0]?.namespaces?.["nakama.engine.defold"]).toBe("nakama.engine.defold");
    expect(nakama[0]?.namespaces?.["nakama.session"]).toBe("nakama.session");
    expect(nakama[0]?.namespaces?.["nakama.socket"]).toBe("nakama.socket");
    expect(nakama[0]?.namespaces?.["nakama.util.log"]).toBe("nakama.util.log");
    // The core module severed onto the bare namespace, so its golden stem is
    // `nakama` while its module id stays dotted — the one entry in the corpus
    // where the two differ.
    expect(nakama[0]?.namespaces?.["nakama.nakama"]).toBe("nakama");
  });

  // The entry module's fields are `typeof import` of the 32 module ids, so `resolve`
  // has to install all 33 goldens together for any of them to compile.
  test("keeps defold-gamepush's entry module and its 32 typed modules in one entry", () => {
    const registry = loadVendoredLibraryRegistry();
    const gamepush = registry.filter((library) => library.sourceId === "defold-gamepush");
    expect(gamepush).toHaveLength(1);
    const core = [
      "achievements",
      "ads",
      "analytics",
      "app",
      "channels",
      "documents",
      "events",
      "experiments",
      "feedbacks",
      "files",
      "fullscreen",
      "games_collections",
      "images",
      "leaderboard",
      "logger",
      "multiplayer",
      "payments",
      "platform",
      "player",
      "player_stats",
      "players",
      "reactions",
      "rewards",
      "schedulers",
      "segments",
      "socials",
      "sounds",
      "storage",
      "triggers",
      "uniques",
      "variables",
      "windows",
    ].map((name) => `gamepush.core.${name}`);
    expect(core).toHaveLength(32);
    expect([...(gamepush[0]?.modules ?? [])].sort()).toEqual([...core, "gamepush.gamepush"].sort());
    expect(gamepush[0]?.namespaces?.["gamepush.gamepush"]).toBe("gamepush");
    expect(gamepush[0]?.namespaces?.["gamepush.core.player"]).toBe("gamepush.core.player");
  });
});

describe("loadVendoredNativeRegistry", () => {
  function withRoot(nativeTargets: string | null, run: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), "native-registry-"));
    try {
      if (nativeTargets !== null) {
        writeFileSync(join(root, "native-targets.json"), nativeTargets);
      }
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("projects each native-targets.json entry to its source id, namespace, manifest dir and declaration", () => {
    const targets = {
      targets: [
        {
          repo: "https://github.com/selimanac/defold-daabbcc",
          ref: "v3.0.8",
          license: "MIT",
          namespace: "daabbcc",
          manifestDir: "daabbcc",
          declaration: "native/daabbcc.d.ts",
        },
      ],
    };
    withRoot(JSON.stringify(targets), (root) => {
      expect(loadVendoredNativeRegistry(root)).toEqual([
        {
          sourceId: "defold-daabbcc",
          namespace: "daabbcc",
          manifestDir: "daabbcc",
          declarationPath: join(root, "native/daabbcc.d.ts"),
        },
      ]);
    });
  });

  test("an entry carrying fields the CLI does not read is still projected", () => {
    const targets = {
      targets: [
        {
          repo: "https://github.com/britzl/defold-sharing",
          ref: "4.7.0",
          license: "MIT",
          namespace: "share",
          manifestDir: "share",
          declaration: "native/share.d.ts",
          upstreamSource: "fixtures/upstream-native/defold-sharing/share/src/share.cpp",
        },
      ],
    };
    withRoot(JSON.stringify(targets), (root) => {
      expect(loadVendoredNativeRegistry(root)).toEqual([
        {
          sourceId: "defold-sharing",
          namespace: "share",
          manifestDir: "share",
          declarationPath: join(root, "native/share.d.ts"),
        },
      ]);
    });
  });

  test("returns an empty registry for a missing or unparseable native-targets.json", () => {
    withRoot(null, (root) => {
      expect(loadVendoredNativeRegistry(root)).toEqual([]);
    });
    withRoot("{ not json", (root) => {
      expect(loadVendoredNativeRegistry(root)).toEqual([]);
    });
    expect(loadVendoredNativeRegistry(null)).toEqual([]);
  });

  test("the shipped list carries every curated native target with a declaration file on disk", () => {
    const registry = loadVendoredNativeRegistry();
    const expectations = readNativeExpectations();
    expect(registry.map((entry) => entry.namespace).sort()).toEqual(
      [...expectations.keys()].sort(),
    );
    for (const entry of registry) {
      expect(expectations.get(entry.namespace)?.registry).toEqual({
        sourceId: entry.sourceId,
        manifestDir: entry.manifestDir,
      });
      expect(existsSync(entry.declarationPath)).toBe(true);
    }
  });
});

describe("loadLibraryIndexSlotClassifications", () => {
  test("reads the shipped classifications from the package root", () => {
    expect(loadLibraryIndexSlotClassifications().get("gooey/set_focus:param:index")?.class).toBe(
      "native-1",
    );
  });

  test("returns an empty map for a null root or a root without the file", () => {
    expect(loadLibraryIndexSlotClassifications(null).size).toBe(0);
    const root = mkdtempSync(join(tmpdir(), "index-slot-classifications-"));
    try {
      expect(loadLibraryIndexSlotClassifications(root).size).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// The real-corpus coupling for `matchVendoredLibrary` lives here rather than in
// the pure matcher's own test file. `buildLibraryRegistry`'s ts-defold arm is
// being emptied library by library by the Bucket-C severance series, so a
// declared-URL assertion pinned to a `library-targets.json` row has to be
// re-pointed every cycle and eventually has nothing left to point at. Composed
// through `loadVendoredLibraryRegistry`, dicebag stays matchable through the
// authored lane no matter which lane owns it, and `library-match.ts` goes back
// to being tested as the IO-free matcher its module header promises.
describe("matchVendoredLibrary over the composed real registry", () => {
  const registry = loadVendoredLibraryRegistry();

  test("resolves dicebag's declared archive URL to its module and generated stem", () => {
    const match = matchVendoredLibrary(
      "https://github.com/paulomrpp/dicebag/archive/main.zip",
      registry,
    );
    expect(match?.modules).toEqual(["dicebag.dicebag"]);
    // The authored entry is keyed on `8bitskull/dicebag` and the declared URL is
    // a fork, so a match here also proves the identity is owner-independent.
    expect(match?.namespaces?.["dicebag.dicebag"]).toBe("dicebag");
  });

  test("normalizes across archive-ref variants and query strings of one repo", () => {
    for (const url of [
      "https://github.com/paulomrpp/dicebag/archive/main.zip",
      "https://github.com/paulomrpp/dicebag/archive/v1.2.3.zip",
      "https://github.com/paulomrpp/dicebag/archive/refs/heads/main.zip?token=abc",
      "https://GitHub.com/paulomrpp/dicebag",
    ]) {
      expect(matchVendoredLibrary(url, registry)?.modules).toEqual(["dicebag.dicebag"]);
    }
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
});

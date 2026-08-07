import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { matchVendoredLibrary } from "./library-match";
import { loadVendoredLibraryRegistry, resolveLibraryTypesPackageRoot } from "./library-registry";

describe("resolveLibraryTypesPackageRoot", () => {
  test("resolves the installed @defold-typescript/library-types root in this workspace", () => {
    const root = resolveLibraryTypesPackageRoot();
    expect(root).not.toBeNull();
    expect(existsSync(join(root as string, "package.json"))).toBe(true);
    expect(existsSync(join(root as string, "generated"))).toBe(true);
  });
});

describe("loadVendoredLibraryRegistry", () => {
  test("builds a non-empty registry from the real corpus and points generatedDir at generated/", () => {
    const { registry, generatedDir } = loadVendoredLibraryRegistry();
    expect(registry.length).toBeGreaterThan(0);
    for (const library of registry) {
      expect(typeof library.sourceId).toBe("string");
      expect(library.sourceId.length).toBeGreaterThan(0);
      expect(library.modules.length).toBeGreaterThan(0);
    }
    expect(generatedDir).not.toBeNull();
    expect(generatedDir as string).toEndWith("generated");
    expect(existsSync(generatedDir as string)).toBe(true);
  });

  test("returns the empty fallback when the package root cannot be resolved", () => {
    expect(loadVendoredLibraryRegistry(null)).toEqual({ registry: [], generatedDir: null });
  });

  test("returns the empty fallback when the registry JSONs are absent under the given root", () => {
    expect(loadVendoredLibraryRegistry("/nonexistent/library-types-root")).toEqual({
      registry: [],
      generatedDir: null,
    });
  });

  test("includes the druid LuaLS target alongside the pure-Lua entries", () => {
    const { registry } = loadVendoredLibraryRegistry();
    const druid = registry.find((library) => library.sourceId === "druid");
    expect(druid).toBeDefined();
    expect(druid?.modules).toEqual(["druid.druid"]);
    expect(druid?.generatedStems?.["druid.druid"]).toBe("druid");
    // the pure-Lua corpus is still present, so the LuaLS append is additive.
    expect(registry.length).toBeGreaterThan(1);
  });

  test("includes the bridge script_api target so resolve still materializes it", () => {
    const { registry } = loadVendoredLibraryRegistry();
    const bridge = registry.find((library) => library.sourceId === "bridge-defold");
    expect(bridge).toBeDefined();
    expect(bridge?.modules).toEqual(["bridge.bridge"]);
    expect(bridge?.generatedStems?.["bridge.bridge"]).toBe("bridge");
  });

  test("includes the defcon authored target so resolve materializes its dotted module", () => {
    const { registry } = loadVendoredLibraryRegistry();
    const defcon = registry.find((library) => library.sourceId === "defcon");
    expect(defcon).toBeDefined();
    expect(defcon?.modules).toEqual(["defcon.console"]);
    expect(defcon?.generatedStems?.["defcon.console"]).toBe("defcon");
  });

  test("groups defold-saver's two modules into a single entry with both generated stems", () => {
    const { registry } = loadVendoredLibraryRegistry();
    const saver = registry.filter((library) => library.sourceId === "defold-saver");
    expect(saver).toHaveLength(1);
    expect(saver[0]?.modules).toEqual(["saver.saver", "saver.storage"]);
    expect(saver[0]?.generatedStems?.["saver.saver"]).toBe("saver.saver");
    expect(saver[0]?.generatedStems?.["saver.storage"]).toBe("saver.storage");
  });

  test("keeps nakama-defold's three modules in one entry now that all come from the authored lane", () => {
    const { registry } = loadVendoredLibraryRegistry();
    const nakama = registry.filter((library) => library.sourceId === "nakama-defold");
    expect(nakama).toHaveLength(1);
    expect(nakama[0]?.modules).toEqual([
      "nakama.engine.defold",
      "nakama.nakama",
      "nakama.util.log",
    ]);
    expect(nakama[0]?.generatedStems?.["nakama.engine.defold"]).toBe("nakama.engine.defold");
    expect(nakama[0]?.generatedStems?.["nakama.util.log"]).toBe("nakama.util.log");
    // The core module severed onto the bare namespace, so its golden stem is
    // `nakama` while its module id stays dotted — the one entry in the corpus
    // where the two differ.
    expect(nakama[0]?.generatedStems?.["nakama.nakama"]).toBe("nakama");
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
  const { registry } = loadVendoredLibraryRegistry();

  test("resolves dicebag's declared archive URL to its module and generated stem", () => {
    const match = matchVendoredLibrary(
      "https://github.com/paulomrpp/dicebag/archive/main.zip",
      registry,
    );
    expect(match?.modules).toEqual(["dicebag.dicebag"]);
    // The authored entry is keyed on `8bitskull/dicebag` and the declared URL is
    // a fork, so a match here also proves the identity is owner-independent.
    expect(match?.generatedStems?.["dicebag.dicebag"]).toBe("dicebag");
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

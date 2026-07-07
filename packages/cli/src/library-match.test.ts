import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildLibraryRegistry,
  type LibraryClassification,
  type LibraryTargets,
  matchVendoredLibrary,
  normalizeSourceId,
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

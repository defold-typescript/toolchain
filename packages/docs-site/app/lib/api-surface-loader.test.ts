import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCRIPT_HOOK_NAMES } from "@defold-typescript/types";
import {
  readLibraryExpectations,
  readNativeExpectations,
} from "../../../cli/src/library/target-expectations";
import { untypedListings } from "./api-content";
import { apiModuleSymbols, type LibraryMeta } from "./api-surface";
import {
  defoldListingsFromManifest,
  githubOwner,
  libraryDataDir,
  libraryDisplayName,
  libraryModuleDirs,
  libraryOriginByNamespace,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  loadLibraryProvenance,
  loadVersionIndependentPages,
  portalListingsFromManifest,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";
import { type LibraryListing, libraryOwnerGroups } from "./nav";

const ENGINE_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const LIBRARY_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/library-display");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");
const REAL_LIBRARY_DATA_DIR = libraryDataDir(REAL_LIBRARY_TYPES_DIR) as string;
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

describe("githubOwner", () => {
  test("returns the first path segment of a GitHub author URL", () => {
    expect(githubOwner("https://github.com/paweljarosz/squid")).toBe("paweljarosz");
    expect(githubOwner("https://github.com/britzl/defcon")).toBe("britzl");
  });

  test("returns an empty string for an empty URL", () => {
    expect(githubOwner("")).toBe("");
  });
});

describe("libraryOriginByNamespace", () => {
  test("maps each namespace to the owner and repo its manifest records", () => {
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    expect(origins.get("monarch.monarch")).toEqual({ owner: "britzl", repo: "monarch" });
    expect(origins.get("squid")).toEqual({ owner: "paweljarosz", repo: "squid" });
    expect(origins.get("event")).toEqual({ owner: "Insality", repo: "defold-event" });
  });

  // The repo name is what a user installs, and it routinely differs from the
  // namespace the module imports as — the whole reason lineage reads the origin
  // URL rather than the namespace shape.
  test("keeps a repo name that differs from the namespace it publishes", () => {
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    expect(origins.get("persist")).toEqual({
      owner: "whiteboxdev",
      repo: "library-defold-persist",
    });
    expect(origins.get("zzfx")).toEqual({ owner: "thejustinwalsh", repo: "defold-zzfx" });
  });

  test("resolves LuaLS- and script_api-sourced libraries from their own manifests", () => {
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    expect(origins.get("druid")).toEqual({ owner: "Insality", repo: "druid" });
    expect(origins.get("decore")).toEqual({ owner: "Insality", repo: "decore" });
    expect(origins.get("bridge")).toEqual({ owner: "Playgama", repo: "bridge-defold" });
  });

  test("keys a multi-module same-repo library per namespace, not on a shared prefix", () => {
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    const saver = { owner: "Insality", repo: "defold-saver" };
    expect(origins.get("saver.saver")).toEqual(saver);
    expect(origins.get("saver.storage")).toEqual(saver);
    expect(origins.has("saver")).toBe(false);
  });
});

describe("libraryDisplayName", () => {
  test("single-module dir drops the leaf: `<owner> / <dir>`", () => {
    expect(libraryDisplayName("squid.squid", "squid", "paweljarosz", 1)).toBe(
      "paweljarosz / squid",
    );
    expect(libraryDisplayName("defcon.console", "defcon", "britzl", 1)).toBe("britzl / defcon");
  });

  test("multi-module dir whose leaf equals the dir drops the leaf", () => {
    expect(libraryDisplayName("monarch.monarch", "monarch", "britzl", 3)).toBe("britzl / monarch");
  });

  test("multi-module dir keeps ` · <leaf>` when the leaf differs from the dir", () => {
    expect(libraryDisplayName("monarch.transitions.easings", "monarch", "britzl", 3)).toBe(
      "britzl / monarch · easings",
    );
    expect(libraryDisplayName("in.button", "defold-input", "britzl", 10)).toBe(
      "britzl / defold-input · button",
    );
  });

  test("missing owner falls back to the dir with no owner prefix", () => {
    expect(libraryDisplayName("orphan.orphan", "orphan", "", 1)).toBe("orphan");
    expect(libraryDisplayName("multi.child", "multi", "", 2)).toBe("multi · child");
  });
});

describe("loadApiSurfaceForVersion — engine + globals only, always prefixed", () => {
  test("the default target's engine pages take the version prefix, with no version-independent page", () => {
    const pages = loadApiSurfaceForVersion(ENGINE_FIXTURE_DIR, "cur");
    for (const page of pages) {
      expect(page.category).toBe("engine");
      expect(page.route).toBe(`/api/cur/${page.namespace}`);
    }
    expect(pages.some((p) => p.category === "lua-stdlib")).toBe(false);
    expect(pages.some((p) => p.category === "global-type")).toBe(false);
    expect(pages.some((p) => p.category === "library")).toBe(false);
    expect(pages.some((p) => p.namespace === "camera")).toBe(true);
    expect(pages.some((p) => p.namespace === "globals")).toBe(true);
  });

  test("a non-default target emits no lua-stdlib copy", () => {
    const pages = loadApiSurfaceForVersion(ENGINE_FIXTURE_DIR, "old");
    expect(pages.some((p) => p.category === "lua-stdlib")).toBe(false);
    expect(pages.find((p) => p.namespace === "wmath")?.route).toBe("/api/old/wmath");
  });
});

describe("loadVersionIndependentPages", () => {
  test("emits the default target's lua-stdlib at canonical /api/<ns>, no engine page", () => {
    const pages = loadVersionIndependentPages(ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR);
    const lua = pages.filter((p) => p.category === "lua-stdlib");
    expect(lua.map((p) => p.namespace).sort()).toEqual(["base", "bit"]);
    expect(lua.find((p) => p.namespace === "base")?.route).toBe("/api/base");
    expect(pages.some((p) => p.category === "engine")).toBe(false);
  });

  test("includes the vendored library pages at canonical /api/<ns>", () => {
    const pages = loadVersionIndependentPages(ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR);
    const library = pages.filter((p) => p.category === "library");
    expect(library.length).toBeGreaterThan(0);
    for (const page of library) expect(page.route).toBe(`/api/${page.namespace}`);
  });
});

describe("loadApiSurface library displayName", () => {
  function libraryPages() {
    return loadApiSurface(ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR).filter(
      (p) => p.category === "library",
    );
  }

  test("derives an author-first displayName for a library page without an override", () => {
    const two = libraryPages().find((p) => p.namespace === "demo.two");
    expect(two?.displayName).toBe("someone / demolib · two");
  });

  test("a library-display-overrides.json entry wins over the derived label", () => {
    const one = libraryPages().find((p) => p.namespace === "demo.one");
    expect(one?.displayName).toBe("Custom / one");
  });

  test("the alias never touches the route or namespace", () => {
    const one = libraryPages().find((p) => p.namespace === "demo.one");
    expect(one?.namespace).toBe("demo.one");
    expect(one?.route).toBe("/api/demo.one");
  });

  test("library targets map declared modules whose path stem differs from the module name", () => {
    expect(libraryModuleDirs(LIBRARY_FIXTURE_DIR).get("alias.actual")).toBe("aliased");
    const page = libraryPages().find((p) => p.namespace === "alias.actual");
    expect(page?.displayName).toBe("alias / aliased");
    expect(page?.module.description).toBe("Aliased module description.");
  });
});

describe("loadLibraryProvenance — LuaLS, authored and script_api lanes", () => {
  for (const lane of ["luals", "authored", "script-api"] as const) {
    test(`attributes each ${lane} expectation's library with the provenance it records`, () => {
      const expectations = readLibraryExpectations(REAL_LIBRARY_TYPES_DIR, lane);
      expect(expectations.size).toBeGreaterThan(0);
      const metaFor = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
      for (const [namespace, { provenance }] of expectations) {
        const meta = metaFor(namespace);
        const loaded = Object.fromEntries(
          Object.keys(provenance).map((field) => [field, meta[field as keyof LibraryMeta]]),
        );
        expect({ namespace, ...loaded }).toEqual({ namespace, ...provenance });
      }
    });
  }
});

describe("loadLibraryProvenance — vendored libraries", () => {
  test("a genuinely vendored ts-defold namespace still reports authoredHere false", () => {
    // Read from the fixture corpus, whose `library-targets.json` still holds a
    // synthetic vendored row: the real corpus reached zero rows, so the vendored
    // branch has no shipping subject left, but it is still live production code
    // and a returning row would take it.
    const meta = loadLibraryProvenance(LIBRARY_FIXTURE_DIR);
    const alias = meta("alias.actual");
    expect(alias.authoredHere).toBe(false);
    // Pins the subject as really vendored: an unknown namespace would take the
    // same branch but carry no ts-defold source link.
    expect(alias.sourceUrl).toContain("ts-defold/library");
    expect(alias.sourceUrl).toContain("0000000000000000000000000000000000000000");
  });
});

describe("loadLibraryProvenance — curated native extensions", () => {
  const { targets } = JSON.parse(
    readFileSync(join(REAL_LIBRARY_DATA_DIR, "native-targets.json"), "utf8"),
  ) as { targets: { repo: string; ref: string; license: string; namespace: string }[] };
  const nativeExpectations = readNativeExpectations();

  test("attributes each native namespace to its upstream repo at the pin, as an import", () => {
    expect(targets.map((t) => t.namespace).sort()).toEqual([...nativeExpectations.keys()].sort());
    const metaFor = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    for (const target of targets) {
      const meta = metaFor(target.namespace);
      expect(meta.authorUrl).toBe(target.repo);
      expect(meta.commit).toBe(target.ref);
      expect(meta.sourceUrl).toBe(`${target.repo}/tree/${target.ref}`);
      expect(meta.license).toBe(target.license);
      expect(meta.authoredHere).toBe(true);
      expect(meta.importString).toBe(`import * as ${target.namespace} from "${target.namespace}"`);
      expect(meta.usage).toBe("import");
      expect(meta.globalNamespace).toBeUndefined();
    }
  });

  test("carries a commit pin as the page's pin kind, and no pin kind for a release", () => {
    const dir = mkdtempSync(join(tmpdir(), "native-pin-kind-"));
    cpSync(LIBRARY_FIXTURE_DIR, dir, { recursive: true });
    writeFileSync(
      join(libraryDataDir(dir) as string, "native-targets.json"),
      JSON.stringify({
        targets: [
          {
            repo: "https://github.com/someone/native-pinned",
            ref: "0123456789abcdef0123456789abcdef01234567",
            refKind: "commit",
            license: "MIT",
            namespace: "pinned",
          },
          {
            repo: "https://github.com/someone/native-released",
            ref: "v1.0.0",
            license: "MIT",
            namespace: "released",
          },
        ],
      }),
    );
    const fixtureMeta = loadLibraryProvenance(dir);
    expect(fixtureMeta("pinned").pinKind).toBe("commit");
    expect(fixtureMeta("released").pinKind).toBeUndefined();

    const metaFor = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    for (const [namespace, { pinKind }] of nativeExpectations) {
      expect({ namespace, pinKind: metaFor(namespace).pinKind }).toEqual({ namespace, pinKind });
    }
  });

  test("groups each native namespace under its upstream owner and repo", () => {
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    expect(origins.get("daabbcc")).toEqual({ owner: "selimanac", repo: "defold-daabbcc" });
    expect(origins.get("share")).toEqual({ owner: "britzl", repo: "defold-sharing" });
  });
});

describe("loadApiSurface — druid library page", () => {
  test("includes a druid page tagged category library", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const druid = pages.find((p) => p.namespace === "druid");
    expect(druid?.category).toBe("library");
  });

  test("surfaces emitter-equivalent signatures for new, get_widget, and druid_button.set_enabled", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const druid = pages.find((p) => p.namespace === "druid");
    if (!druid) throw new Error("druid page missing");
    const byName = new Map(apiModuleSymbols(druid).map((s) => [s.name, s.signature]));
    expect(byName.get("new")).toBe(
      "new(context: LuaTable, style?: LuaTable | undefined): druid_instance",
    );
    expect(byName.get("get_widget")).toBe(
      "get_widget<T extends druid_widget>(widget_class: T, gui_url: Url | string, params?: unknown | undefined, template?: string | undefined): T",
    );
    expect(byName.get("druid_button.set_enabled")).toBe(
      "druid_button.set_enabled(state?: boolean | undefined): druid_button",
    );
  });

  test("surfaces emitter-equivalent varargs and multi-returns for lang_text and text", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const druid = pages.find((p) => p.namespace === "druid");
    if (!druid) throw new Error("druid page missing");
    const byName = new Map(apiModuleSymbols(druid).map((s) => [s.name, s.signature]));
    expect(byName.get("druid_lang_text.translate")).toBe(
      "druid_lang_text.translate(locale_id: string, ...args: string[]): druid_lang_text",
    );
    expect(byName.get("druid_lang_text.format")).toBe(
      "druid_lang_text.format(...args: string[]): druid_lang_text",
    );
    expect(byName.get("druid_text.get_text_size")).toBe(
      "druid_text.get_text_size(text?: string | undefined): LuaMultiReturn<[number, number]>",
    );
  });
});

describe("loadApiSurface — multi-module same-repo library grouping (real corpus)", () => {
  function libraryGroups() {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR)
      .filter((p) => p.category === "library")
      .map((p) => ({ namespace: p.namespace, route: p.route }));
    return libraryOwnerGroups(pages, libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR), []);
  }

  test("groups defold-saver's two modules into exactly one authored-here library under Insality", () => {
    const groups = libraryGroups();
    const insality = groups.find((group) => group.owner === "Insality");
    const saver = insality?.libraries.filter((lib) => lib.repo === "defold-saver") ?? [];
    expect(saver).toHaveLength(1);
    expect(saver[0]?.label).toBe("defold-saver");
    expect(saver[0]?.modules.map((m) => m.label)).toEqual(["saver.saver", "saver.storage"]);
  });

  test("keeps the · <leaf> distinguisher on a shared-repo saver page whose leaf differs from the repo", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    expect(pages.find((p) => p.namespace === "saver.storage")?.displayName).toBe(
      "Insality / defold-saver · storage",
    );
  });

  test("merges all five nakama modules into one heroiclabs card once the split lane is gone", () => {
    // All five nakama modules record the same `heroiclabs/nakama-defold` origin,
    // so they group as one library rather than splitting on namespace shape.
    const groups = libraryGroups();
    const heroiclabs = groups.find((group) => group.owner === "heroiclabs");
    expect(heroiclabs).toBeDefined();
    expect(heroiclabs?.libraries.map((lib) => lib.repo)).toEqual(["nakama-defold"]);
    const nakama = heroiclabs?.libraries.find((lib) => lib.repo === "nakama-defold");
    // The core module is listed under its bare namespace now, not the dotted
    // module id the retired ts-defold row carried.
    expect(nakama?.modules.map((m) => m.label)).toEqual([
      "nakama",
      "nakama.engine.defold",
      "nakama.session",
      "nakama.socket",
      "nakama.util.log",
    ]);
  });

  test("the merged card distinguishes each of the five pages by its own leaf", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    expect(pages.find((p) => p.namespace === "nakama.engine.defold")?.displayName).toBe(
      "heroiclabs / nakama-defold · defold",
    );
    expect(pages.find((p) => p.namespace === "nakama.util.log")?.displayName).toBe(
      "heroiclabs / nakama-defold · log",
    );
    expect(pages.find((p) => p.namespace === "nakama.session")?.displayName).toBe(
      "heroiclabs / nakama-defold · session",
    );
    expect(pages.find((p) => p.namespace === "nakama.socket")?.displayName).toBe(
      "heroiclabs / nakama-defold · socket",
    );
    // The core page's leaf is its namespace, which the repo name does not repeat,
    // so it keeps a suffix too.
    expect(pages.find((p) => p.namespace === "nakama")?.displayName).toBe(
      "heroiclabs / nakama-defold · nakama",
    );
  });
});

interface PinDating {
  refDate?: string;
  engineReleases?: { version: string; date: string }[];
}

function writeEngineReleases(dir: string, dating: PinDating): void {
  if (!dating.engineReleases) return;
  writeFileSync(
    join(dir, "defold-engine-releases.json"),
    JSON.stringify({ releases: dating.engineReleases }),
  );
}

const ENGINE_RELEASES = [
  { version: "1.9.1", date: "2024-07-22T08:00:00Z" },
  { version: "1.9.0", date: "2024-06-25T11:35:28Z" },
];

describe("Defold extensions under Libraries", () => {
  const MOVED = ["iac", "iap", "push", "webview"];

  test("each Defold doc is a library page owned by defold", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    for (const route of ["/api/iap", "/api/spine.gui"]) {
      const page = pages.find((p) => p.route === route);
      expect(page?.category).toBe("library");
    }
    const origins = libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR);
    expect(origins.get("iap")).toEqual({ owner: "defold", repo: "extension-iap", official: true });
    expect(origins.get("spine.gui")).toEqual({
      owner: "defold",
      repo: "extension-spine",
      official: true,
    });
  });

  test("the four extension namespaces leave every engine surface", () => {
    for (const { id } of versionsWithDiskFixtures(REAL_TYPES_DIR)) {
      const engine = loadApiSurfaceForVersion(REAL_TYPES_DIR, id).map((p) => p.namespace);
      for (const namespace of MOVED) expect(engine).not.toContain(namespace);
    }
    const combined = loadCombinedSurface(REAL_TYPES_DIR).namespaces.map((ns) => ns.namespace);
    for (const namespace of MOVED) expect(combined).not.toContain(namespace);
  });

  test("the engine camera page survives beside the extension-camera library page", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const defaultEngine = pages.filter((p) => p.category === "engine").map((p) => p.namespace);
    expect(defaultEngine).toContain("camera");
    const combined = loadCombinedSurface(REAL_TYPES_DIR).namespaces.map((ns) => ns.namespace);
    expect(combined).toContain("camera");
    expect(pages.find((p) => p.route === "/api/extension-camera")?.category).toBe("library");
  });

  function libraryTypesWithDefoldPages(pages: string[], dating: PinDating = {}): string {
    const dir = mkdtempSync(join(tmpdir(), "defold-extensions-loader-"));
    cpSync(LIBRARY_FIXTURE_DIR, dir, { recursive: true });
    mkdirSync(join(dir, "defold-extensions", "api-doc"), { recursive: true });
    for (const page of pages) {
      writeFileSync(
        join(dir, "defold-extensions", "api-doc", `${page}.json`),
        JSON.stringify({ info: { namespace: page, brief: "", description: "" }, elements: [] }),
      );
    }
    writeFileSync(
      join(dir, "defold-extensions.json"),
      JSON.stringify({
        libraries: pages.map((page, index) => ({
          repo: `https://github.com/defold/extension-${index}`,
          ref: "1.0.0",
          refKind: "release",
          ...(dating.refDate ? { refDate: dating.refDate } : {}),
          license: "MIT",
          description: "",
          docs: [{ path: `api/${page}.script_api`, namespace: page, page }],
        })),
      }),
    );
    writeEngineReleases(dir, dating);
    return dir;
  }

  test("every untyped Defold library yields a listing with its page route, api kind, lead and steps", () => {
    const manifest = JSON.parse(
      readFileSync(join(REAL_LIBRARY_TYPES_DIR, "defold-extensions.json"), "utf8"),
    ) as { libraries: { repo: string; refKind: string; docs: unknown[] }[] };
    const untyped = manifest.libraries.filter((entry) => entry.docs.length === 0);
    const listings = defoldListingsFromManifest(REAL_LIBRARY_TYPES_DIR);
    expect(untyped.length).toBeGreaterThan(0);
    expect(listings.map((listing) => listing.url).sort()).toEqual(
      untyped.map((entry) => entry.repo).sort(),
    );
    for (const listing of listings) {
      const repo = listing.url.split("/").pop() ?? "";
      const entry = untyped.find((candidate) => candidate.repo === listing.url);
      expect(listing.route).toBe(`/libraries/defold/${repo}`);
      expect(["none", "untyped"]).toContain(listing.api);
      expect(listing.ships).not.toBe("");
      expect(listing.ships).not.toContain("api:");
      expect(listing.steps.length).toBeGreaterThan(0);
      expect(listing.pinKind).toBe(entry?.refKind as LibraryListing["pinKind"]);
      expect(["standard", "fork", "unavailable"]).toContain(listing.adoption);
    }
    expect([...new Set(listings.map((listing) => listing.adoption))].sort()).toEqual([
      "fork",
      "standard",
      "unavailable",
    ]);
  });

  const structuredSummary = [
    "---",
    "api: untyped",
    "---",
    "",
    "## What it ships",
    "",
    "A module that tunes performance.",
    "",
    "## Using it",
    "",
    "1. Require `tuner` from a script.",
    "2. Call `tuner.start` in `init` and",
    "   `tuner.stop` in `final`.",
    "",
    "## Engine APIs",
    "",
    "Reads [`sys`](/api/sys) settings.",
    "",
  ].join("\n");

  function libraryTypesWithListings(
    repos: string[],
    summaries: Record<string, string>,
    dating: PinDating & { refKind?: "release" | "tag" | "commit" } = {},
  ): string {
    const dir = mkdtempSync(join(tmpdir(), "defold-listings-loader-"));
    mkdirSync(join(dir, "defold-extensions", "summaries"), { recursive: true });
    writeEngineReleases(dir, dating);
    writeFileSync(
      join(dir, "defold-extensions.json"),
      JSON.stringify({
        libraries: repos.map((repo) => ({
          repo: `https://github.com/defold/${repo}`,
          ref: "1.0.0",
          refKind: dating.refKind ?? "release",
          ...(dating.refDate ? { refDate: dating.refDate } : {}),
          license: "MIT",
          description: "",
          docs: [],
        })),
      }),
    );
    for (const [repo, body] of Object.entries(summaries)) {
      writeFileSync(join(dir, "defold-extensions", "summaries", `${repo}.md`), body);
    }
    return dir;
  }

  test("a listing with no summary file throws naming the repo", () => {
    const dir = libraryTypesWithListings(["extension-described", "extension-bare"], {
      "extension-described": structuredSummary,
    });
    expect(() => defoldListingsFromManifest(dir)).toThrow(/extension-bare/);
  });

  test("a summary file for a repo that is not an untyped entry throws naming the file", () => {
    const dir = libraryTypesWithListings(["extension-described"], {
      "extension-described": structuredSummary,
      "extension-orphan": structuredSummary,
    });
    expect(() => defoldListingsFromManifest(dir)).toThrow(/extension-orphan\.md/);
  });

  test("a summary whose api kind is neither none nor untyped throws naming the file", () => {
    const dir = libraryTypesWithListings(["extension-described"], {
      "extension-described": structuredSummary.replace("api: untyped", "api: typed"),
    });
    expect(() => defoldListingsFromManifest(dir)).toThrow(/extension-described\.md/);
  });

  test("a summary's adoption frontmatter becomes the listing's adoption mode, standard when absent", () => {
    const dir = libraryTypesWithListings(
      ["extension-plain", "extension-forked", "extension-empty"],
      {
        "extension-plain": structuredSummary,
        "extension-forked": structuredSummary.replace(
          "api: untyped",
          "api: untyped\nadoption: fork",
        ),
        "extension-empty": structuredSummary.replace(
          "api: untyped",
          "api: none\nadoption: unavailable",
        ),
      },
    );
    const adoption = Object.fromEntries(
      defoldListingsFromManifest(dir).map((listing) => [listing.repo, listing.adoption]),
    );
    expect(adoption).toEqual({
      "extension-plain": "standard",
      "extension-forked": "fork",
      "extension-empty": "unavailable",
    });
  });

  test("an adoption mode outside standard, fork and unavailable throws naming the file and the key", () => {
    const dir = libraryTypesWithListings(["extension-described"], {
      "extension-described": structuredSummary.replace(
        "api: untyped",
        "api: untyped\nadoption: official",
      ),
    });
    expect(() => defoldListingsFromManifest(dir)).toThrow(
      /summaries\/extension-described\.md.*adoption/,
    );
  });

  test("an unavailable listing that claims an untyped api throws naming the file", () => {
    const dir = libraryTypesWithListings(["extension-described"], {
      "extension-described": structuredSummary.replace(
        "api: untyped",
        "api: untyped\nadoption: unavailable",
      ),
    });
    expect(() => defoldListingsFromManifest(dir)).toThrow(/summaries\/extension-described\.md/);
  });

  test("a summary's sections become the listing's lead, numbered steps and engine APIs", () => {
    const dir = libraryTypesWithListings(["extension-tuner"], {
      "extension-tuner": structuredSummary,
    });
    const [listing] = defoldListingsFromManifest(dir);
    expect(listing?.ships).toBe("A module that tunes performance.");
    expect(listing?.steps).toEqual([
      "Require `tuner` from a script.",
      "Call `tuner.start` in `init` and `tuner.stop` in `final`.",
    ]);
    expect(listing?.engineApis).toBe("Reads [`sys`](/api/sys) settings.");
    expect(listing?.pinKind).toBe("release");
  });

  test("a summary without an Engine APIs section leaves engineApis undefined", () => {
    const dir = libraryTypesWithListings(["extension-tuner"], {
      "extension-tuner": structuredSummary.slice(0, structuredSummary.indexOf("## Engine APIs")),
    });
    const [listing] = defoldListingsFromManifest(dir);
    expect(listing?.steps).toHaveLength(2);
    expect(listing?.engineApis).toBeUndefined();
  });

  test("a Using it section written as prose throws naming the file and the section", () => {
    const dir = libraryTypesWithListings(["extension-tuner"], {
      "extension-tuner": structuredSummary.replace(
        "1. Require `tuner` from a script.",
        "Require `tuner` from a script.",
      ),
    });
    expect(() => defoldListingsFromManifest(dir)).toThrow(
      /summaries\/extension-tuner\.md.*Using it/,
    );
  });

  test("a missing What it ships, a missing or empty Using it, or an unknown section throws naming the file", () => {
    const usingStart = structuredSummary.indexOf("## Using it");
    const enginesStart = structuredSummary.indexOf("## Engine APIs");
    const variants = [
      structuredSummary.replace("## What it ships", "## Overview"),
      structuredSummary.replace("## What it ships\n\nA module that tunes performance.\n\n", ""),
      `${structuredSummary.slice(0, usingStart)}${structuredSummary.slice(enginesStart)}`,
      `${structuredSummary.slice(0, usingStart)}## Using it\n\n${structuredSummary.slice(enginesStart)}`,
      `${structuredSummary}\n## Notes\n\nMore.\n`,
    ];
    for (const body of variants) {
      const dir = libraryTypesWithListings(["extension-tuner"], { "extension-tuner": body });
      expect(() => defoldListingsFromManifest(dir)).toThrow(/summaries\/extension-tuner\.md/);
    }
  });

  test("a dated release pin's page names the Defold version current when it was cut", () => {
    const dated = libraryTypesWithDefoldPages(["fresh"], {
      refDate: "2024-07-01T00:00:00Z",
      engineReleases: ENGINE_RELEASES,
    });
    expect(loadLibraryProvenance(dated)("fresh").releaseEra).toBe("1.9.0");
  });

  test("a page without a pin date, or beside no engine releases list, names no era", () => {
    const undated = libraryTypesWithDefoldPages(["fresh"], { engineReleases: ENGINE_RELEASES });
    expect(loadLibraryProvenance(undated)("fresh")).not.toHaveProperty("releaseEra");
    const noReleases = libraryTypesWithDefoldPages(["fresh"], { refDate: "2024-07-01T00:00:00Z" });
    expect(loadLibraryProvenance(noReleases)("fresh")).not.toHaveProperty("releaseEra");
  });

  test("a dated tag-pinned listing names the Defold version current when it was cut", () => {
    const summaries = { "extension-tuner": structuredSummary };
    const [dated] = defoldListingsFromManifest(
      libraryTypesWithListings(["extension-tuner"], summaries, {
        refKind: "tag",
        refDate: "2024-08-01T00:00:00Z",
        engineReleases: ENGINE_RELEASES,
      }),
    );
    expect(dated?.releaseEra).toBe("1.9.1");
    const [undated] = defoldListingsFromManifest(
      libraryTypesWithListings(["extension-tuner"], summaries, {
        refKind: "tag",
        engineReleases: ENGINE_RELEASES,
      }),
    );
    expect(undated).not.toHaveProperty("releaseEra");
    const [noReleases] = defoldListingsFromManifest(
      libraryTypesWithListings(["extension-tuner"], summaries, {
        refKind: "tag",
        refDate: "2024-08-01T00:00:00Z",
      }),
    );
    expect(noReleases).not.toHaveProperty("releaseEra");
  });

  test("the committed manifest dates every release and tag pin and no commit pin", () => {
    const { libraries } = JSON.parse(
      readFileSync(join(REAL_LIBRARY_TYPES_DIR, "defold-extensions.json"), "utf8"),
    ) as { libraries: { repo: string; refKind: string; refDate?: string }[] };
    for (const entry of libraries) {
      if (entry.refKind === "commit") expect(entry).not.toHaveProperty("refDate");
      else expect(Number.isNaN(Date.parse(entry.refDate ?? ""))).toBe(false);
    }
    expect(loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("iap").releaseEra).toMatch(
      /^\d+\.\d+\.\d+$/,
    );
  });

  test("a Defold page key equal to a vendored library namespace or another Defold key throws", () => {
    expect(() =>
      loadVersionIndependentPages(ENGINE_FIXTURE_DIR, libraryTypesWithDefoldPages(["fresh"])),
    ).not.toThrow();
    expect(() =>
      loadVersionIndependentPages(ENGINE_FIXTURE_DIR, libraryTypesWithDefoldPages(["demo.one"])),
    ).toThrow(/demo\.one/);
    expect(() =>
      loadVersionIndependentPages(
        ENGINE_FIXTURE_DIR,
        libraryTypesWithDefoldPages(["twice", "twice"]),
      ),
    ).toThrow(/twice/);
  });
});

describe("Asset Portal libraries that ship no Lua API under Libraries", () => {
  interface PortalEntryFixture {
    id: string;
    repo: string;
    kind: string;
    description?: string;
    ref?: string;
    refKind?: string;
    refDate?: string;
  }

  function libraryTypesWithPortal(
    entries: PortalEntryFixture[],
    options: { base?: string; defoldRepos?: string[] } & Pick<PinDating, "engineReleases"> = {},
  ): string {
    const dir = mkdtempSync(join(tmpdir(), "asset-portal-listings-"));
    if (options.base) cpSync(options.base, dir, { recursive: true });
    writeEngineReleases(dir, options);
    writeFileSync(
      join(dir, "asset-portal.json"),
      JSON.stringify({
        source: {
          repo: "https://github.com/defold/asset-portal",
          commit: "0".repeat(40),
          syncedAt: "2026-10-21T00:00:00.000Z",
        },
        entries: entries.map((entry) => ({
          name: entry.id,
          description: "A library.",
          tags: [],
          portalLibrary: true,
          archived: false,
          fork: false,
          pushedAt: "2026-01-01T00:00:00Z",
          stars: 0,
          ref: "1.0.0",
          refKind: "release",
          includeDirs: ["assets"],
          scriptApi: 0,
          extManifest: 0,
          lua: 0,
          luaSampled: 0,
          luaAnnotated: 0,
          ...entry,
        })),
      }),
    );
    if (options.defoldRepos) {
      writeFileSync(
        join(dir, "defold-extensions.json"),
        JSON.stringify({
          libraries: options.defoldRepos.map((repo) => ({
            repo,
            ref: "1.0.0",
            refKind: "release",
            license: "MIT",
            description: "",
            docs: [],
          })),
        }),
      );
    }
    return dir;
  }

  const control: PortalEntryFixture = {
    id: "control",
    repo: "https://github.com/someone-else/control",
    kind: "no-lua-api",
  };

  test("a no-lua-api entry becomes a listing built from the manifest alone", () => {
    const dir = libraryTypesWithPortal([
      {
        id: "sharpsprite",
        repo: "https://github.com/indiesoftby/defold-sharp-sprite",
        kind: "no-lua-api",
        description: "Rotated Grid Super-Sampling (RGSS) for the Defold engine.",
        ref: "1.0.0",
        refKind: "tag",
      },
    ]);
    const listings = portalListingsFromManifest(dir);
    expect(listings).toEqual([
      {
        owner: "indiesoftby",
        repo: "defold-sharp-sprite",
        url: "https://github.com/indiesoftby/defold-sharp-sprite",
        ref: "1.0.0",
        pinKind: "tag",
        description: "Rotated Grid Super-Sampling (RGSS) for the Defold engine.",
        route: "/libraries/indiesoftby/defold-sharp-sprite",
        api: "none",
        adoption: "standard",
        ships: "Rotated Grid Super-Sampling (RGSS) for the Defold engine.",
        steps: [],
        portal: { id: "sharpsprite", url: "https://defold.com/assets/sharpsprite/" },
      },
    ]);
    expect("official" in (listings[0] ?? {})).toBe(false);
  });

  test("an entry of any other kind yields no listing", () => {
    const kinds = [
      "not-a-dependency",
      "no-source",
      "pure-lua",
      "pure-lua-annotated",
      "script-api",
      "native-untyped",
    ];
    const dir = libraryTypesWithPortal(
      kinds.map((kind) => ({ id: kind, repo: `https://github.com/someone/${kind}`, kind })),
    );
    expect(portalListingsFromManifest(dir)).toEqual([]);
  });

  test("a repo that already has a Defold listing, compared case-folded, yields no portal listing", () => {
    const dir = libraryTypesWithPortal(
      [
        { id: "defold-pbr", repo: "https://github.com/Defold/Asset-PBR", kind: "no-lua-api" },
        control,
      ],
      { defoldRepos: ["https://github.com/defold/asset-pbr"] },
    );
    expect(portalListingsFromManifest(dir).map((listing) => listing.route)).toEqual([
      "/libraries/someone-else/control",
    ]);
  });

  test("a repo that already has a typed library origin, compared case-folded, yields no portal listing", () => {
    const dir = libraryTypesWithPortal(
      [{ id: "demolib", repo: "https://github.com/SomeOne/DemoLib", kind: "no-lua-api" }, control],
      { base: LIBRARY_FIXTURE_DIR },
    );
    expect(portalListingsFromManifest(dir).map((listing) => listing.route)).toEqual([
      "/libraries/someone-else/control",
    ]);
  });

  test("a qualifying entry with an empty or whitespace description throws naming the manifest and the id", () => {
    for (const description of ["", "  \n "]) {
      const dir = libraryTypesWithPortal([
        control,
        {
          id: "blank-lead",
          repo: "https://github.com/someone/blank",
          kind: "no-lua-api",
          description,
        },
      ]);
      expect(() => portalListingsFromManifest(dir)).toThrow(/asset-portal\.json.*blank-lead/);
    }
  });

  test("a dated tag-pinned listing names the Defold version current when it was cut", () => {
    const sharp: PortalEntryFixture = {
      id: "sharpsprite",
      repo: "https://github.com/indiesoftby/defold-sharp-sprite",
      kind: "no-lua-api",
      ref: "1.0.0",
      refKind: "tag",
    };
    const dated = { ...sharp, refDate: "2024-08-01T00:00:00Z" };
    const [listing] = portalListingsFromManifest(
      libraryTypesWithPortal([dated], { engineReleases: ENGINE_RELEASES }),
    );
    expect(listing?.releaseEra).toBe("1.9.1");
    const [undated] = portalListingsFromManifest(
      libraryTypesWithPortal([sharp], { engineReleases: ENGINE_RELEASES }),
    );
    expect(undated).not.toHaveProperty("releaseEra");
    const [noReleases] = portalListingsFromManifest(libraryTypesWithPortal([dated]));
    expect(noReleases).not.toHaveProperty("releaseEra");
  });

  test("an absent manifest yields no portal listings", () => {
    expect(portalListingsFromManifest(mkdtempSync(join(tmpdir(), "no-asset-portal-")))).toEqual([]);
  });

  test("over the committed manifests, untyped listing routes are unique and keep every Defold listing", () => {
    const routes = untypedListings(REAL_LIBRARY_TYPES_DIR).map((listing) => listing.route);
    expect(routes.length).toBe(new Set(routes).size);
    for (const listing of defoldListingsFromManifest(REAL_LIBRARY_TYPES_DIR)) {
      expect(routes).toContain(listing.route);
    }
    expect(routes).toContain("/libraries/indiesoftby/defold-sharp-sprite");
  });
});

describe("Asset Portal script_api libraries under Libraries", () => {
  interface PortalDocFixture {
    page: string;
    namespace?: string;
    description?: string;
    refDate?: string;
  }

  // A library-types dir beside a `types` dir whose one engine target declares
  // `gui`, holding one portal library per doc (`someone/defold-lib-<index>`).
  function libraryTypesWithPortalPages(
    docs: PortalDocFixture[],
    options: { defoldPages?: string[]; nativeNamespaces?: string[] } & Pick<
      PinDating,
      "engineReleases"
    > = {},
  ): string {
    const base = mkdtempSync(join(tmpdir(), "asset-portal-pages-"));
    const dir = join(base, "library-types");
    cpSync(LIBRARY_FIXTURE_DIR, dir, { recursive: true });
    writeEngineReleases(dir, options);
    mkdirSync(join(base, "types"), { recursive: true });
    writeFileSync(
      join(base, "types", "api-targets.json"),
      JSON.stringify({
        targets: [{ id: "1.0.0", fixturesDir: "", modules: [{ namespace: "gui", fixture: "" }] }],
      }),
    );
    const emptyDoc = (namespace: string, description = "") =>
      JSON.stringify({ info: { namespace, brief: "", description }, elements: [] });
    const portalApiDoc = join(dir, "asset-portal-script-api", "api-doc");
    mkdirSync(portalApiDoc, { recursive: true });
    for (const doc of docs) {
      writeFileSync(
        join(portalApiDoc, `${doc.page}.json`),
        emptyDoc(doc.namespace ?? doc.page, doc.description),
      );
    }
    writeFileSync(
      join(dir, "asset-portal-script-api.json"),
      JSON.stringify({
        libraries: docs.map((doc, index) => ({
          id: `portal-${index}`,
          repo: `https://github.com/someone/defold-lib-${index}`,
          ref: "v1.0.0",
          refKind: "tag",
          ...(doc.refDate ? { refDate: doc.refDate } : {}),
          license: "MIT",
          description: `Portal description ${index}.`,
          docs: [
            {
              path: `lib/api/${doc.page}.script_api`,
              namespace: doc.namespace ?? doc.page,
              page: doc.page,
            },
          ],
        })),
      }),
    );
    if (options.defoldPages) {
      mkdirSync(join(dir, "defold-extensions", "api-doc"), { recursive: true });
      for (const page of options.defoldPages) {
        writeFileSync(join(dir, "defold-extensions", "api-doc", `${page}.json`), emptyDoc(page));
      }
      writeFileSync(
        join(dir, "defold-extensions.json"),
        JSON.stringify({
          libraries: options.defoldPages.map((page) => ({
            repo: `https://github.com/defold/extension-${page}`,
            ref: "1.0.0",
            refKind: "release",
            license: "MIT",
            description: "",
            docs: [{ path: `api/${page}.script_api`, namespace: page, page }],
          })),
        }),
      );
    }
    if (options.nativeNamespaces) {
      mkdirSync(join(dir, "api-doc", "native"), { recursive: true });
      for (const namespace of options.nativeNamespaces) {
        writeFileSync(join(dir, "api-doc", "native", `${namespace}.json`), emptyDoc(namespace));
      }
      const dataDir = join(dir, "data", "0.55.0");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        join(dataDir, "native-targets.json"),
        JSON.stringify({
          targets: options.nativeNamespaces.map((namespace) => ({
            repo: `https://github.com/someone/native-${namespace}`,
            ref: "1.0.0",
            license: "MIT",
            namespace,
          })),
        }),
      );
    }
    return dir;
  }

  const pageAt = (dir: string, route: string) =>
    loadVersionIndependentPages(ENGINE_FIXTURE_DIR, dir).find((page) => page.route === route);

  test("each portal doc is a library page under its GitHub owner, imported by its namespace", () => {
    const dir = libraryTypesWithPortalPages([{ page: "astar" }]);
    const page = pageAt(dir, "/api/astar");
    expect(page?.category).toBe("library");
    expect(libraryOriginByNamespace(dir).get("astar")).toEqual({
      owner: "someone",
      repo: "defold-lib-0",
    });
    expect(page?.libraryMeta).toEqual({
      author: "",
      authorUrl: "https://github.com/someone/defold-lib-0",
      commit: "v1.0.0",
      sourceUrl: "https://github.com/someone/defold-lib-0/blob/v1.0.0/lib/api/astar.script_api",
      importString: 'import * as astar from "astar"',
      license: "MIT",
      authoredHere: true,
      usage: "import",
      pinKind: "tag",
      portal: { id: "portal-0", url: "https://defold.com/assets/portal-0/" },
    });
  });

  test("a dated portal page names the Defold version current when it was cut; an undated one names none", () => {
    const dir = libraryTypesWithPortalPages(
      [{ page: "dated", refDate: "2024-07-01T00:00:00Z" }, { page: "undated" }],
      { engineReleases: ENGINE_RELEASES },
    );
    expect(pageAt(dir, "/api/dated")?.libraryMeta?.releaseEra).toBe("1.9.0");
    expect(pageAt(dir, "/api/undated")?.libraryMeta).not.toHaveProperty("releaseEra");
  });

  test("the committed portal manifests date every release and tag pin and no commit pin", () => {
    for (const file of ["asset-portal.json", "asset-portal-script-api.json"]) {
      const manifest = JSON.parse(readFileSync(join(REAL_LIBRARY_TYPES_DIR, file), "utf8")) as {
        entries?: { refKind: string | null; refDate?: string }[];
        libraries?: { refKind: string; refDate?: string }[];
      };
      for (const entry of manifest.entries ?? manifest.libraries ?? []) {
        if (entry.refKind === "release" || entry.refKind === "tag") {
          expect(Number.isNaN(Date.parse(entry.refDate ?? ""))).toBe(false);
        } else {
          expect(entry).not.toHaveProperty("refDate");
        }
      }
    }
    const era = /^\d+\.\d+\.\d+$/;
    expect(loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("astar").releaseEra).toMatch(era);
    const pinned = portalListingsFromManifest(REAL_LIBRARY_TYPES_DIR).filter(
      (listing) => listing.pinKind !== "commit",
    );
    expect(pinned.length).toBeGreaterThan(0);
    for (const listing of pinned) expect(listing.releaseEra).toMatch(era);
  });

  test("a portal doc declaring an engine namespace says it extends that namespace", () => {
    const dir = libraryTypesWithPortalPages([{ page: "lib.gui", namespace: "gui" }]);
    const meta = pageAt(dir, "/api/lib.gui")?.libraryMeta;
    expect(meta?.usage).toBe("ambient");
    expect(meta?.importString).toBe("");
    expect(meta?.globalNamespace).toBe("gui");
    expect(meta?.extendsNamespace).toBe("gui");
  });

  test("a doc with no description leads with the portal description; one with its own keeps it", () => {
    const dir = libraryTypesWithPortalPages([
      { page: "blank" },
      { page: "described", description: "Its own description." },
    ]);
    expect(pageAt(dir, "/api/blank")?.module.description).toBe("Portal description 0.");
    expect(pageAt(dir, "/api/described")?.module.description).toBe("Its own description.");
  });

  test("a portal page key on an engine, version, vendored, Defold, native or other portal page throws naming the manifest and the key", () => {
    const load = (dir: string) => () => loadVersionIndependentPages(ENGINE_FIXTURE_DIR, dir);
    expect(
      load(
        libraryTypesWithPortalPages([{ page: "fresh" }], {
          defoldPages: ["pad"],
          nativeNamespaces: ["share"],
        }),
      ),
    ).not.toThrow();
    const collisions: [
      string,
      PortalDocFixture[],
      Parameters<typeof libraryTypesWithPortalPages>[1],
    ][] = [
      ["gui", [{ page: "gui" }], {}],
      ["defold-rng", [{ page: "defold-rng" }], {}],
      ["demo.one", [{ page: "demo.one" }], {}],
      ["pad", [{ page: "pad" }], { defoldPages: ["pad"] }],
      ["share", [{ page: "share" }], { nativeNamespaces: ["share"] }],
      ["twice", [{ page: "twice" }, { page: "twice" }], {}],
    ];
    for (const [key, docs, options] of collisions) {
      expect(load(libraryTypesWithPortalPages(docs, options))).toThrow(
        new RegExp(`asset-portal-script-api\\.json: page "${key.replace(".", "\\.")}"`),
      );
    }
  });
});

describe("engine pages withhold the overloads the declarations withhold", () => {
  const typed = (fn: { parameters: { name: string; types: string[] }[] }, param: string) =>
    fn.parameters.find((p) => p.name === param)?.types;

  test("each 1.13 b2d.body page drops the handle forms and keeps the table forms", () => {
    for (const id of ["defold-1.13.0", "defold-1.13.1"]) {
      const page = loadApiSurfaceForVersion(REAL_TYPES_DIR, id).find(
        (p) => p.namespace === "b2d.body",
      );
      const named = (name: string) =>
        page?.module.functions.filter((fn) => fn.name === `b2d.body.${name}`) ?? [];
      const fixture = named("create_fixture");
      const massData = named("set_mass_data");
      expect(fixture.map((fn) => typed(fn, "shape"))).not.toContainEqual(["b2Shape"]);
      expect(massData.map((fn) => typed(fn, "data"))).not.toContainEqual(["b2MassData"]);
      expect(fixture.map((fn) => typed(fn, "definition"))).toContainEqual(["table"]);
      expect(massData.map((fn) => typed(fn, "data"))).toContainEqual(["table"]);
    }
  });

  test("the combined b2d.body page carries one curated signature per withheld name", () => {
    const ns = loadCombinedSurface(REAL_TYPES_DIR).namespaces.find(
      (n) => n.namespace === "b2d.body",
    );
    const entries = (name: string) =>
      ns?.entries.filter((e) => e.identity.name === `b2d.body.${name}`) ?? [];
    for (const name of ["create_fixture", "set_mass_data"]) {
      const [entry, ...rest] = entries(name);
      expect(rest).toHaveLength(0);
      expect(entry?.authoritativeSignature).not.toBe("");
      expect(entry?.authoritativeSignature).not.toContain("Record<string | number, unknown>");
    }
    expect(entries("set_mass_data")[0]?.authoritativeSignature).toContain("data: b2d.MassData");
  });
});

describe("engine pages route a function to the namespace that owns it", () => {
  const MOVED = [
    "bullet3d.collision_object.get_shape",
    "bullet3d.collision_object.get_shape_count",
    "bullet3d.collision_object.get_shapes",
  ];

  test("the exact-version page lists each moved function under its owning namespace only", () => {
    const pages = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.13.2");
    const functionsOf = (namespace: string) =>
      pages.find((page) => page.namespace === namespace)?.module.functions.map((fn) => fn.name) ??
      [];
    const owner = functionsOf("bullet3d.collision_object");
    const shape = functionsOf("bullet3d.shape");
    for (const name of MOVED) {
      expect(owner).toContain(name);
      expect(shape).not.toContain(name);
    }
  });

  test("the Combined surface joins each moved function to an authoritative signature", () => {
    const { namespaces } = loadCombinedSurface(REAL_TYPES_DIR);
    const owner = namespaces.find((ns) => ns.namespace === "bullet3d.collision_object");
    const shape = namespaces.find((ns) => ns.namespace === "bullet3d.shape");
    const ownerFunctions = owner?.module.functions.map((fn) => fn.name) ?? [];
    for (const name of MOVED) {
      expect(ownerFunctions).toContain(name);
      const entry = owner?.entries.find((e) => e.identity.name === name);
      expect(entry?.identity.namespace).toBe("bullet3d.collision_object");
      expect(entry?.authoritativeSignature).not.toBe("");
      expect(shape?.module.functions.map((fn) => fn.name) ?? []).not.toContain(name);
      expect(shape?.entries.map((e) => e.identity.name) ?? []).not.toContain(name);
    }
  });
});

describe("lifecycle hooks are not listed as go or gui functions", () => {
  const CONTROLS = { go: "go.get_position", gui: "gui.get_node" } as const;
  const isHook = (namespace: string, name: string): boolean =>
    SCRIPT_HOOK_NAMES.some((hook) => name === hook || name === `${namespace}.${hook}`);
  const functionNames = (page: Parameters<typeof apiModuleSymbols>[0]): string[] =>
    apiModuleSymbols(page)
      .filter((symbol) => symbol.kind === "function")
      .map((symbol) => symbol.name);

  test("the go and gui pages list no hook", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    for (const [namespace, control] of Object.entries(CONTROLS)) {
      const page = pages.find((p) => p.category === "engine" && p.namespace === namespace);
      if (!page) throw new Error(`${namespace} page missing`);
      const names = functionNames(page);
      expect(names).toContain(control);
      expect(names.filter((name) => isHook(namespace, name))).toEqual([]);
    }
  });

  test("the combined go and gui pages list no hook", () => {
    const combined = loadCombinedSurface(REAL_TYPES_DIR);
    for (const [namespace, control] of Object.entries(CONTROLS)) {
      const ns = combined.namespaces.find((n) => n.namespace === namespace);
      if (!ns) throw new Error(`combined ${namespace} namespace missing`);
      const names = functionNames(combinedNamespaceToApiPage(ns));
      expect(names).toContain(control);
      expect(names.filter((name) => isHook(namespace, name))).toEqual([]);
    }
  });
});

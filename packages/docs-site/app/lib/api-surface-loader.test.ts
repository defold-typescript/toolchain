import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiModuleSymbols } from "./api-surface";
import {
  githubOwner,
  libraryDisplayName,
  libraryModuleDirs,
  libraryOriginByNamespace,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadLibraryProvenance,
  loadVersionIndependentPages,
} from "./api-surface-loader";
import { libraryOwnerGroups } from "./nav";

const ENGINE_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const LIBRARY_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/library-display");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");
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

describe("loadLibraryProvenance — LuaLS-sourced libraries", () => {
  test("attributes druid to Insality/druid at the luals-targets ref, not the ts-defold/library pin", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("druid");
    expect(meta.commit).toBe("1.2.5");
    expect(meta.authorUrl).toBe("https://github.com/Insality/druid");
    expect(meta.sourceUrl).toBe("https://github.com/Insality/druid/tree/1.2.5");
    expect(meta.importString).toBe('import * as druid from "druid"');
    expect(meta.license).toBe("MIT");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  // The vendored arm dropped out with the last `library-targets.json` row: every
  // namespace that ships is authored here now, so a real-corpus subject for
  // `authoredHere: false` no longer exists. That branch keeps its witness
  // against the fixture corpus below.
  test("flags druid and decore authoredHere", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("druid").authoredHere).toBe(true);
    expect(meta("decore").authoredHere).toBe(true);
  });

  test("attributes tweener to Insality/defold-tweener as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("tweener").authoredHere).toBe(true);
    expect(meta("tweener").authorUrl).toBe("https://github.com/Insality/defold-tweener");
  });

  test("attributes event to Insality/defold-event as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("event").authoredHere).toBe(true);
    expect(meta("event").authorUrl).toBe("https://github.com/Insality/defold-event");
  });

  test("attributes lang to Insality/defold-lang as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("lang").authoredHere).toBe(true);
    expect(meta("lang").authorUrl).toBe("https://github.com/Insality/defold-lang");
  });

  test("attributes log to Insality/defold-log as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("log").authoredHere).toBe(true);
    expect(meta("log").authorUrl).toBe("https://github.com/Insality/defold-log");
  });

  test("attributes proto to Insality/defold-proto as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("proto").authoredHere).toBe(true);
    expect(meta("proto").authorUrl).toBe("https://github.com/Insality/defold-proto");
  });

  test("attributes immutable to paweljarosz/lua-immutable as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("immutable").authoredHere).toBe(true);
    expect(meta("immutable").authorUrl).toBe("https://github.com/paweljarosz/lua-immutable");
  });

  test("attributes squid to paweljarosz/squid as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("squid").authoredHere).toBe(true);
    expect(meta("squid").authorUrl).toBe("https://github.com/paweljarosz/squid");
  });

  test("attributes narrator to astrochili/narrator as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("narrator").authoredHere).toBe(true);
    expect(meta("narrator").authorUrl).toBe("https://github.com/astrochili/narrator");
  });

  test("attributes panthera to Insality/panthera as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("panthera").authoredHere).toBe(true);
    expect(meta("panthera").authorUrl).toBe("https://github.com/Insality/panthera");
  });

  test("attributes saver.saver to Insality/defold-saver as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("saver.saver").authoredHere).toBe(true);
    expect(meta("saver.saver").authorUrl).toBe("https://github.com/Insality/defold-saver");
  });

  test("attributes saver.storage to Insality/defold-saver as an authored-here LuaLS library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("saver.storage").authoredHere).toBe(true);
    expect(meta("saver.storage").authorUrl).toBe("https://github.com/Insality/defold-saver");
  });
});

describe("loadLibraryProvenance — script_api-sourced libraries", () => {
  test("attributes bridge to Playgama/bridge-defold at the script-api-targets ref", () => {
    // The page (and provenance) key is the api-doc file stem, which the migration
    // names for the single-segment `namespace` — `bridge`, like the LuaLS libraries.
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("bridge");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("v2.0.0");
    expect(meta.authorUrl).toBe("https://github.com/Playgama/bridge-defold");
    expect(meta.sourceUrl).toBe("https://github.com/Playgama/bridge-defold/tree/v2.0.0");
    expect(meta.license).toBe("MIT");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

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

describe("loadLibraryProvenance — authored/forked libraries", () => {
  test("attributes defcon to britzl/defcon as an authored-here forked library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("defcon");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("2.6.0");
    expect(meta.authorUrl).toBe("https://github.com/britzl/defcon");
    expect(meta.sourceUrl).toBe("https://github.com/britzl/defcon/tree/2.6.0");
    expect(meta.license).toBe("MIT");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  // A library that was never in ts-defold's tree, so nothing about it is derived from
  // a vendored classification dir — the maintained-here reading has to come from the
  // authored-targets entry alone. Upstream publishes no tags, hence a commit pin.
  test("attributes shutter to Klaleus/defold-shutter as an authored-here forked library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("shutter");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("2ed27b50cda551650b01b80c1ccb5dd3f4e161fc");
    expect(meta.authorUrl).toBe("https://github.com/Klaleus/defold-shutter");
    expect(meta.sourceUrl).toBe(
      "https://github.com/Klaleus/defold-shutter/tree/2ed27b50cda551650b01b80c1ccb5dd3f4e161fc",
    );
    expect(meta.license).toBe("Zlib");
    expect(meta.importString).toBe('import * as shutter from "shutter.shutter"');
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  test("renders defcon's import with the namespace alias but the moduleId module path", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("defcon");
    expect(meta.importString).toBe('import * as defcon from "defcon.console"');
  });

  test("a moduleId-less LuaLS library keeps its namespace-as-module import (regression)", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("druid");
    expect(meta.importString).toBe('import * as druid from "druid"');
  });

  test("attributes deftest to britzl/deftest as an authored-here forked library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("deftest");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("2.8.0");
    expect(meta.authorUrl).toBe("https://github.com/britzl/deftest");
    expect(meta.sourceUrl).toBe("https://github.com/britzl/deftest/tree/2.8.0");
    expect(meta.license).toBe("MIT");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  test("renders deftest's import with the namespace alias but the moduleId module path", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("deftest");
    expect(meta.importString).toBe('import * as deftest from "deftest.deftest"');
  });

  test("attributes persist to whiteboxdev/library-defold-persist as an authored-here forked library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("persist");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("b37f61040740f232d86f68e2606f27b6f1bd15c4");
    expect(meta.authorUrl).toBe("https://github.com/whiteboxdev/library-defold-persist");
    expect(meta.license).toBe("Zlib");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  test("renders persist's import with the namespace alias but the moduleId module path", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("persist");
    expect(meta.importString).toBe('import * as persist from "persist.persist"');
  });

  test("attributes defmath to subsoap/defmath as an authored-here forked library pinned to a commit SHA", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("defmath");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("c67c227322334056cea7a631f3ddcdf2bcfd480c");
    expect(meta.authorUrl).toBe("https://github.com/subsoap/defmath");
    expect(meta.sourceUrl).toBe(
      "https://github.com/subsoap/defmath/tree/c67c227322334056cea7a631f3ddcdf2bcfd480c",
    );
    expect(meta.license).toBe("CC0-1.0");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  test("renders defmath's import with the namespace alias but the moduleId module path", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("defmath");
    expect(meta.importString).toBe('import * as defmath from "defmath.defmath"');
  });

  test("attributes zzfx to thejustinwalsh/defold-zzfx as an authored-here forked library pinned to a commit SHA", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("zzfx");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("8c90e12c5b83dd39ebc7a6c0fd28aafd8e7b1eac");
    expect(meta.authorUrl).toBe("https://github.com/thejustinwalsh/defold-zzfx");
    expect(meta.sourceUrl).toBe(
      "https://github.com/thejustinwalsh/defold-zzfx/tree/8c90e12c5b83dd39ebc7a6c0fd28aafd8e7b1eac",
    );
    expect(meta.license).toBe("MIT");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  test("renders zzfx's import with the namespace alias but the moduleId module path", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("zzfx");
    expect(meta.importString).toBe('import * as zzfx from "zzfx.api"');
  });

  test("attributes boom to britzl/boom as an authored-here forked library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("boom");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("5d47820c947dc7b68d1702dfadbf27e6e74e9319");
    expect(meta.authorUrl).toBe("https://github.com/britzl/boom");
    expect(meta.sourceUrl).toBe(
      "https://github.com/britzl/boom/tree/5d47820c947dc7b68d1702dfadbf27e6e74e9319",
    );
    expect(meta.license).toBe("MIT");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  test("renders boom's import with the namespace alias but the moduleId module path", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("boom");
    expect(meta.importString).toBe('import * as boom from "boom.boom"');
  });

  test("attributes defsave to subsoap/defsave as an authored-here forked library", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("defsave");
    expect(meta.authoredHere).toBe(true);
    expect(meta.commit).toBe("v1.2.6");
    expect(meta.authorUrl).toBe("https://github.com/subsoap/defsave");
    expect(meta.sourceUrl).toBe("https://github.com/subsoap/defsave/tree/v1.2.6");
    expect(meta.license).toBe("CC0-1.0");
    expect(meta.sourceUrl).not.toContain("ts-defold/library");
  });

  test("renders defsave's import with the namespace alias but the moduleId module path", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR)("defsave");
    expect(meta.importString).toBe('import * as defsave from "defsave.defsave"');
  });

  test("attributes all three nakama modules to heroiclabs/nakama-defold as authored-here", () => {
    // The core module joined its two helpers on the authored lane, so the
    // provenance boundary this describe used to draw through `nakama-defold` is
    // gone: one repo, one tag, one license across all three.
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    for (const namespace of ["nakama", "nakama.engine.defold", "nakama.util.log"]) {
      const m = meta(namespace);
      expect(m.authoredHere).toBe(true);
      expect(m.commit).toBe("v3.4.0");
      expect(m.authorUrl).toBe("https://github.com/heroiclabs/nakama-defold");
      expect(m.sourceUrl).toBe("https://github.com/heroiclabs/nakama-defold/tree/v3.4.0");
      expect(m.license).toBe("Apache-2.0");
      expect(m.sourceUrl).not.toContain("ts-defold/library");
    }
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
      "get_widget<T extends druid_widget>(widget_class: T, gui_url: Url | string, params?: unknown | undefined): T",
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
    return libraryOwnerGroups(pages, libraryOriginByNamespace(REAL_LIBRARY_TYPES_DIR));
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

  test("merges all three nakama modules into one heroiclabs card once the split lane is gone", () => {
    // All three nakama modules record the same `heroiclabs/nakama-defold` origin,
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
      "nakama.util.log",
    ]);
  });

  test("the merged card distinguishes each of the three pages by its own leaf", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    expect(pages.find((p) => p.namespace === "nakama.engine.defold")?.displayName).toBe(
      "heroiclabs / nakama-defold · defold",
    );
    expect(pages.find((p) => p.namespace === "nakama.util.log")?.displayName).toBe(
      "heroiclabs / nakama-defold · log",
    );
    // The core page's leaf is its namespace, which the repo name does not repeat,
    // so it keeps a suffix too.
    expect(pages.find((p) => p.namespace === "nakama")?.displayName).toBe(
      "heroiclabs / nakama-defold · nakama",
    );
  });
});

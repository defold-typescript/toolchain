import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiModuleSymbols } from "./api-surface";
import {
  githubOwner,
  libraryDisplayName,
  libraryModuleDirs,
  libraryOwnerByDir,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadLibraryProvenance,
  loadVersionIndependentPages,
} from "./api-surface-loader";

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

describe("libraryOwnerByDir", () => {
  test("maps credited dirs to their GitHub owner handles", () => {
    const owners = libraryOwnerByDir(REAL_LIBRARY_TYPES_DIR);
    expect(owners.get("monarch")).toBe("britzl");
    expect(owners.get("squid")).toBe("paweljarosz");
    expect(owners.get("defold-event")).toBe("Insality");
  });

  test("omits an uncredited dir from the returned map", () => {
    const owners = libraryOwnerByDir(LIBRARY_FIXTURE_DIR);
    expect(owners.get("demolib")).toBe("someone");
    expect(owners.has("uncredited")).toBe(false);
  });

  test("attributes LuaLS-sourced libraries to their repo owner so they nest under it", () => {
    const owners = libraryOwnerByDir(REAL_LIBRARY_TYPES_DIR);
    expect(owners.get("druid")).toBe("Insality");
    expect(owners.get("decore")).toBe("Insality");
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

  test("flags druid and decore authoredHere, and a vendored namespace not", () => {
    const meta = loadLibraryProvenance(REAL_LIBRARY_TYPES_DIR);
    expect(meta("druid").authoredHere).toBe(true);
    expect(meta("decore").authoredHere).toBe(true);
    expect(meta("monarch.monarch").authoredHere).toBe(false);
    expect(meta("gooey").authoredHere).toBe(false);
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
      "new(context: LuaTable, style: LuaTable | undefined): druid_instance",
    );
    expect(byName.get("get_widget")).toBe(
      "get_widget<T extends druid_widget>(widget_class: T, gui_url: Url | string, params: unknown | undefined): T",
    );
    expect(byName.get("druid_button.set_enabled")).toBe(
      "druid_button.set_enabled(state: boolean | undefined): druid_button",
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
      "druid_text.get_text_size(text: string | undefined): LuaMultiReturn<[number, number]>",
    );
  });
});

import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage, ApiPageCategory } from "../lib/api-surface";
import { buildNav, libraryCreatorGroups } from "../lib/nav";
import {
  apiPageCardDescription,
  groupApiIndexPages,
  groupLibraryIndexByCreator,
} from "./api-index-sections";

function page(
  namespace: string,
  category: ApiPageCategory,
  route: string,
  opts: { brief?: string; description?: string } = {},
): ApiPage {
  const brief = opts.brief ?? `${namespace} brief`;
  const module: ApiModule = {
    namespace,
    brief,
    description: opts.description ?? "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
  return {
    namespace,
    route,
    brief,
    module,
    translations: {},
    signatures: {},
    category,
  };
}

describe("apiPageCardDescription", () => {
  test("uses the page brief when one exists", () => {
    const apiPage = page("monarch.monarch", "library", "/api/monarch.monarch", {
      brief: "Module summary.",
      description: "Longer module description.",
    });
    expect(apiPageCardDescription(apiPage)).toBe("Module summary.");
  });

  test("falls back to library module descriptions when brief is empty", () => {
    const apiPage = page("bridge.bridge", "library", "/api/bridge.bridge", {
      brief: "",
      description: "One SDK for cross-platform publishing HTML5 games",
    });
    expect(apiPageCardDescription(apiPage)).toBe(
      "One SDK for cross-platform publishing HTML5 games",
    );
  });

  test("does not fall back to long descriptions for non-library pages", () => {
    const apiPage = page("go", "engine", "/api/go", {
      brief: "",
      description: "Long engine module description.",
    });
    expect(apiPageCardDescription(apiPage)).toBe("");
  });
});

describe("groupLibraryIndexByCreator", () => {
  const libraryPages = [
    page("go", "engine", "/api/go"),
    {
      ...page("in.cursor", "library", "/api/in.cursor"),
      displayName: "britzl / input · cursor",
    },
    {
      ...page("in.button", "library", "/api/in.button"),
      displayName: "britzl / input · button",
    },
    page("monarch.monarch", "library", "/api/monarch.monarch"),
    page("squid.squid", "library", "/api/squid.squid"),
  ];
  const moduleDir = new Map([
    ["in.button", "defold-input"],
    ["in.cursor", "defold-input"],
    ["monarch.monarch", "monarch"],
    ["squid.squid", "squid"],
  ]);
  const ownerByDir = new Map([
    ["defold-input", "britzl"],
    ["monarch", "britzl"],
    ["squid", "paweljarosz"],
  ]);

  test("groups libraries by creator and upstream dir", () => {
    const groups = groupLibraryIndexByCreator(libraryPages, moduleDir, ownerByDir);

    expect(groups.map((group) => group.label)).toEqual(["britzl", "paweljarosz"]);
    expect(groups[0]?.libraries.map((library) => library.label)).toEqual([
      "defold-input",
      "monarch",
    ]);
    expect(groups[0]?.libraries[0]?.pages.map((p) => p.namespace)).toEqual([
      "in.button",
      "in.cursor",
    ]);
    expect(groups[1]?.libraries[0]?.pages.map((p) => p.namespace)).toEqual(["squid.squid"]);
  });

  test("matches the left nav library tree order", () => {
    const indexGroups = groupLibraryIndexByCreator(libraryPages, moduleDir, ownerByDir);
    const navGroups = libraryCreatorGroups(
      libraryPages
        .filter((apiPage) => apiPage.category === "library")
        .map((apiPage) => ({ namespace: apiPage.namespace, route: apiPage.route })),
      moduleDir,
      ownerByDir,
    );

    expect(
      indexGroups.map((creator) => ({
        label: creator.label,
        libraries: creator.libraries.map((library) => ({
          label: library.label,
          modules: library.pages.map((apiPage) => apiPage.namespace),
        })),
      })),
    ).toEqual(
      navGroups.map((creator) => ({
        label: creator.label,
        libraries: creator.libraries.map((library) => ({
          label: library.label,
          modules: library.modules.map((module) => module.label),
        })),
      })),
    );
  });
});

describe("groupApiIndexPages", () => {
  test("collects API pages into the same section order as the left nav", () => {
    const sections = groupApiIndexPages([
      page("go", "engine", "/api/go"),
      page("globals", "engine", "/api/globals"),
      page("Hash", "global-type", "/api/Hash"),
      page("base", "lua-stdlib", "/api/base"),
      page("monarch.monarch", "library", "/api/monarch.monarch"),
      page("in.button", "library", "/api/in.button"),
    ]);
    const nav = buildNav([], {
      globals: sections.globals.map((p) => ({ label: p.namespace, route: p.route })),
      globalTypes: sections.globalType.map((p) => ({ label: p.namespace, route: p.route })),
      luaStdlib: sections.luaStdlib.map((p) => ({ label: p.namespace, route: p.route })),
      engine: sections.engine.map((p) => ({ label: p.namespace, route: p.route })),
      libraries: [],
    });
    const apiNavOrder =
      nav.find((category) => category.id === "api")?.links.map((link) => link.label) ?? [];
    const apiIndexOrder = [
      sections.globals.length > 0 ? "Globals" : undefined,
      sections.globalType.length > 0 ? "Global types" : undefined,
      sections.luaStdlib.length > 0 ? "Lua Standard" : undefined,
      sections.engine.length > 0 ? "Defold" : undefined,
    ].filter((label): label is string => label !== undefined);

    expect(apiIndexOrder).toEqual(apiNavOrder);
    expect(sections.globals.map((p) => p.namespace)).toEqual(["globals"]);
    expect(sections.engine.map((p) => p.namespace)).toEqual(["go"]);
    expect(sections.library.map((p) => p.namespace)).toEqual(["monarch.monarch", "in.button"]);
  });

  test("yields an empty library section when no library pages are present", () => {
    const sections = groupApiIndexPages([page("go", "engine", "/api/go")]);
    expect(sections.library).toEqual([]);
  });
});

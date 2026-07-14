import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage, ApiPageCategory } from "../lib/api-surface";
import type { NamespaceBadgeCounts } from "../lib/combined-surface";
import { buildNav, libraryCreatorGroups } from "../lib/nav";
import { CombinedIndex } from "./api-index";
import {
  apiCardBadgeHtml,
  apiPageCardDescription,
  groupApiIndexPages,
  groupLibraryIndexByCreator,
  withGlobalTypes,
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

describe("apiCardBadgeHtml", () => {
  test("maps an engine namespace with non-zero counts to the namespaceCountBadges pill HTML", () => {
    const counts = new Map<string, NamespaceBadgeCounts>([
      ["material", { new: 8, changed: 0, deprecated: 0 }],
    ]);
    const html = apiCardBadgeHtml(page("material", "engine", "/api/material"), counts);
    expect(html).toContain("api-badge-count--new");
    expect(html).toContain("8 new");
  });

  test("a zero-count engine namespace maps to an empty string", () => {
    const counts = new Map<string, NamespaceBadgeCounts>([
      ["go", { new: 0, changed: 0, deprecated: 0 }],
    ]);
    expect(apiCardBadgeHtml(page("go", "engine", "/api/go"), counts)).toBe("");
  });

  test("a version-independent (non-engine) namespace maps to an empty string", () => {
    const counts = new Map<string, NamespaceBadgeCounts>([
      ["Vector3", { new: 5, changed: 0, deprecated: 0 }],
    ]);
    expect(apiCardBadgeHtml(page("Vector3", "global-type", "/api/Vector3"), counts)).toBe("");
  });

  test("a namespace absent from the counts map maps to an empty string", () => {
    expect(apiCardBadgeHtml(page("go", "engine", "/api/go"), new Map())).toBe("");
  });
});

describe("CombinedIndex", () => {
  const mixed: ApiPage[] = [
    page("globals", "engine", "/api/globals"),
    page("Vector3", "global-type", "/api/Vector3"),
    page("base", "lua-stdlib", "/api/base"),
    page("go", "engine", "/api/go"),
    page("material", "engine", "/api/material"),
    page("monarch.monarch", "library", "/api/monarch.monarch"),
  ];

  test("renders all four non-library groups and counts them all, not engine-only", () => {
    const html = String(CombinedIndex({ pages: mixed, versions: ["1.2", "1.3"] }));
    expect(html).toContain("Globals");
    expect(html).toContain("Global types");
    expect(html).toContain("Lua standard library");
    expect(html).toContain("Defold engine");
    // library page is excluded from the combined index (it owns /libraries)
    expect(html).not.toContain("monarch.monarch");
    // count is the sum across the four rendered groups (globals + globalType +
    // luaStdlib + engine = 1 + 1 + 1 + 2 = 5), not the engine-only 2.
    expect(html).toContain("5 namespaces documented");
  });

  test("places the change badge inside the engine card title row and emits none for a zero-count card", () => {
    const badgeCounts = new Map<string, NamespaceBadgeCounts>([
      ["material", { new: 8, changed: 0, deprecated: 0 }],
      ["go", { new: 0, changed: 0, deprecated: 0 }],
    ]);
    const html = String(
      CombinedIndex({
        pages: [page("material", "engine", "/api/material"), page("go", "engine", "/api/go")],
        versions: ["1.2", "1.3"],
        badgeCounts,
      }),
    );
    expect(html).toContain("api-badge-count--new");
    expect(html).toContain("8 new");
    // exactly one pill — material has it, go (zero-count) does not
    expect(html.split("api-badge-count--new").length - 1).toBe(1);
    // the pill sits in the card title flex row, after the material label
    expect(html).toContain("flex items-center gap-2");
    expect(html.indexOf("material")).toBeLessThan(html.indexOf("8 new"));
  });
});

describe("withGlobalTypes", () => {
  test("re-adds global-type pages so the version index renders the section", () => {
    const versionPages = [page("go", "engine", "/api/go"), page("base", "lua-stdlib", "/api/base")];
    const globalTypePages = [
      page("Vector3", "global-type", "/api/Vector3"),
      page("Hash", "global-type", "/api/Hash"),
    ];

    const sections = groupApiIndexPages(withGlobalTypes(versionPages, globalTypePages));

    expect(sections.globalType.map((p) => p.namespace)).toEqual(["Vector3", "Hash"]);
    expect(sections.engine.map((p) => p.namespace)).toEqual(["go"]);
    expect(sections.luaStdlib.map((p) => p.namespace)).toEqual(["base"]);
  });

  test("appends global-type pages after the version pages in original order", () => {
    const versionPages = [page("go", "engine", "/api/go"), page("base", "lua-stdlib", "/api/base")];
    const globalTypePages = [
      page("Vector3", "global-type", "/api/Vector3"),
      page("Hash", "global-type", "/api/Hash"),
    ];

    expect(withGlobalTypes(versionPages, globalTypePages).map((p) => p.namespace)).toEqual([
      "go",
      "base",
      "Vector3",
      "Hash",
    ]);
  });

  test("dedupes by namespace so the default surface never double-renders a global type", () => {
    const shared = page("Hash", "global-type", "/api/Hash");
    const versionPages = [page("go", "engine", "/api/go"), shared];
    const globalTypePages = [shared, page("Vector3", "global-type", "/api/Vector3")];

    const merged = withGlobalTypes(versionPages, globalTypePages);

    expect(merged.filter((p) => p.namespace === "Hash")).toHaveLength(1);
    expect(merged.map((p) => p.namespace)).toEqual(["go", "Hash", "Vector3"]);
  });
});

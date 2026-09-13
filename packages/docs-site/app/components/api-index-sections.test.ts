import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiModule } from "@defold-typescript/types";
import { defoldListings, libraryOrigins } from "../lib/api-content";
import type { ApiPage, ApiPageCategory } from "../lib/api-surface";
import { loadApiSurface } from "../lib/api-surface-loader";
import type { NamespaceBadgeCounts } from "../lib/combined-surface";
import { buildNav, type LibraryOrigin, libraryOwnerGroups } from "../lib/nav";
import { CombinedIndex } from "./api-index";
import {
  apiCardBadgeHtml,
  apiPageCardDescription,
  groupApiIndexPages,
  groupLibraryIndexByOwner,
} from "./api-index-sections";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

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

describe("groupLibraryIndexByOwner", () => {
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
  const origins = new Map<string, LibraryOrigin>([
    ["in.button", { owner: "britzl", repo: "defold-input" }],
    ["in.cursor", { owner: "britzl", repo: "defold-input" }],
    ["monarch.monarch", { owner: "britzl", repo: "monarch" }],
    ["squid.squid", { owner: "paweljarosz", repo: "squid" }],
  ]);

  test("groups libraries by owner and repo", () => {
    const groups = groupLibraryIndexByOwner(libraryPages, origins);

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
    const indexGroups = groupLibraryIndexByOwner(libraryPages, origins);
    const navGroups = libraryOwnerGroups(
      libraryPages
        .filter((apiPage) => apiPage.category === "library")
        .map((apiPage) => ({ namespace: apiPage.namespace, route: apiPage.route })),
      origins,
      [],
    );

    expect(
      indexGroups.map((owner) => ({
        label: owner.label,
        libraries: owner.libraries.map((library) => ({
          label: library.label,
          modules: library.pages.map((apiPage) => apiPage.namespace),
        })),
      })),
    ).toEqual(
      navGroups.map((owner) => ({
        label: owner.label,
        libraries: owner.libraries.map((library) => ({
          label: library.label,
          modules: library.modules.map((module) => module.label),
        })),
      })),
    );
  });
});

describe("groupLibraryIndexByOwner with listing-only Defold libraries", () => {
  const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  const origins = libraryOrigins(REAL_LIBRARY_TYPES_DIR);
  const listings = defoldListings(REAL_LIBRARY_TYPES_DIR);
  const manifest = JSON.parse(
    readFileSync(join(REAL_LIBRARY_TYPES_DIR, "defold-extensions.json"), "utf8"),
  ) as { libraries: { repo: string; description: string; docs: unknown[] }[] };
  const untypedRepos = manifest.libraries
    .filter((entry) => entry.docs.length === 0)
    .map((entry) => entry.repo);
  const typedRepos = manifest.libraries
    .filter((entry) => entry.docs.length > 0)
    .map((entry) => entry.repo);
  const groups = groupLibraryIndexByOwner(pages, origins, listings);
  const defold = groups.find((group) => group.owner === "defold");

  test("lists every manifest entry without docs exactly once under defold, with no pages", () => {
    expect(untypedRepos.length).toBeGreaterThan(0);
    const listed = (defold?.libraries ?? []).filter((library) => library.listing);
    expect(listed.map((library) => library.listing?.url).sort()).toEqual([...untypedRepos].sort());
    for (const library of listed) {
      const entry = manifest.libraries.find((e) => e.repo === library.listing?.url);
      expect(library.pages).toEqual([]);
      expect(library.repo).toBe(library.listing?.url.split("/").pop() ?? "");
      expect(library.listing?.description).toBe(entry?.description ?? "");
      expect(library.listing?.route).toBe(`/libraries/defold/${library.repo}`);
      expect(["none", "untyped"]).toContain(library.listing?.api ?? "");
    }
  });

  test("derives listings from the sidebar grouping, so both name the same repos in one order", () => {
    const navGroups = libraryOwnerGroups(
      pages
        .filter((apiPage) => apiPage.category === "library")
        .map((apiPage) => ({ namespace: apiPage.namespace, route: apiPage.route })),
      origins,
      listings,
    );
    const shape = (all: { owner: string; libraries: { repo: string; route?: string }[] }[]) =>
      all.map((group) => ({ owner: group.owner, repos: group.libraries.map((lib) => lib.repo) }));
    expect(shape(groups)).toEqual(shape(navGroups));
    for (const [index, group] of groups.entries()) {
      for (const [libIndex, library] of group.libraries.entries()) {
        const navListing = navGroups[index]?.libraries[libIndex]?.listing;
        expect(
          library.listing ? { route: library.listing.route, api: library.listing.api } : undefined,
        ).toEqual(navListing);
      }
    }
  });

  test("never lists a typed library as listing-only, and extension-iap keeps its page", () => {
    const listedUrls = new Set(
      groups.flatMap((group) =>
        group.libraries.flatMap((library) => (library.listing ? [library.listing.url] : [])),
      ),
    );
    for (const repo of typedRepos) expect(listedUrls.has(repo)).toBe(false);
    const iap = defold?.libraries.find((library) => library.repo === "extension-iap");
    expect(iap?.listing).toBeUndefined();
    expect(iap?.pages.map((p) => p.route)).toEqual(["/api/iap"]);
  });

  test("keeps the official defold group first after listings merge", () => {
    expect(groups[0]?.owner).toBe("defold");
    expect(groups[0]?.official).toBe(true);
    for (const group of groups.slice(1)) expect("official" in group).toBe(false);
  });

  test("a listing whose owner has no typed page starts an official group that still leads", () => {
    const listingOnlyGroups = groupLibraryIndexByOwner(
      [page("monarch.monarch", "library", "/api/monarch.monarch")],
      new Map<string, LibraryOrigin>([["monarch.monarch", { owner: "britzl", repo: "monarch" }]]),
      listings,
    );
    expect(listingOnlyGroups.map((group) => group.owner)).toEqual(["defold", "britzl"]);
    expect(listingOnlyGroups[0]?.official).toBe(true);
  });

  test("sorts listing-only libraries among the typed ones by repo", () => {
    const repos = (defold?.libraries ?? []).map((library) => library.repo);
    expect(repos).toEqual([...repos].sort((a, b) => a.localeCompare(b)));
  });

  test("leaves every other owner group unchanged", () => {
    const without = groupLibraryIndexByOwner(pages, origins);
    const shape = (all: typeof groups) =>
      all
        .filter((group) => group.owner !== "defold")
        .map((group) => ({
          owner: group.owner,
          libraries: group.libraries.map((library) => ({
            repo: library.repo,
            listing: library.listing,
            pages: library.pages.map((p) => p.route),
          })),
        }));
    expect(shape(groups)).toEqual(shape(without));
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

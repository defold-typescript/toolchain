import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { GuidePage } from "./guide";
import { listGuidePages } from "./guide-loader";
import { activeCategoryId, buildNav, type NavLink } from "./nav";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

function realPages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

const GLOBALS = [{ label: "globals", route: "/api/globals" }];
const GLOBAL_TYPES = [
  { label: "Vector3", route: "/api/Vector3" },
  { label: "Hash", route: "/api/Hash" },
];
const LUA_STDLIB = [
  { label: "base", route: "/api/base" },
  { label: "bit", route: "/api/bit" },
];
const ENGINE = [
  { label: "camera", route: "/api/camera" },
  { label: "go", route: "/api/go" },
];

function fullNav() {
  return buildNav(realPages(), {
    globals: GLOBALS,
    globalTypes: [],
    luaStdlib: LUA_STDLIB,
    engine: ENGINE,
    libraries: [],
  });
}

describe("buildNav", () => {
  test("returns the five categories in declared order with declared labels", () => {
    const nav = fullNav();
    expect(nav.map((c) => c.id)).toEqual([
      "get-started",
      "guides",
      "language",
      "tutorial",
      "reference",
    ]);
    expect(nav.map((c) => c.label)).toEqual([
      "Get started",
      "Guides",
      "Language",
      "Tutorial",
      "Reference",
    ]);
  });

  test("has no lua-stdlib category and no /api link anywhere", () => {
    const nav = fullNav();
    expect(nav.find((c) => c.id === "lua-stdlib")).toBeUndefined();
    const allRoutes = nav.flatMap((c) =>
      c.links.flatMap((l) => [l.route, ...(l.children ?? []).map((ch) => ch.route)]),
    );
    expect(allRoutes).not.toContain("/api");
  });

  test("reference links are three route-less group headers in order", () => {
    const reference = fullNav().find((c) => c.id === "reference");
    expect(reference?.links.map((l) => l.label)).toEqual(["Globals", "Lua Standard", "Defold"]);
    for (const header of reference?.links ?? []) {
      expect(header.route).toBeUndefined();
      expect(header.children?.length).toBeGreaterThan(0);
    }
  });

  test("places a populated Global types group between Globals and Lua Standard", () => {
    const nav = buildNav(realPages(), {
      globals: GLOBALS,
      globalTypes: GLOBAL_TYPES,
      luaStdlib: LUA_STDLIB,
      engine: ENGINE,
      libraries: [],
    });
    const reference = nav.find((c) => c.id === "reference");
    expect(reference?.links.map((l) => l.label)).toEqual([
      "Globals",
      "Global types",
      "Lua Standard",
      "Defold",
    ]);
    const group = reference?.links.find((l) => l.label === "Global types");
    expect(group?.route).toBeUndefined();
    expect(group?.children?.map((c) => c.route)).toEqual(["/api/Vector3", "/api/Hash"]);
  });

  test("omits a group header entirely when its namespace list is empty", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: LUA_STDLIB,
      engine: ENGINE,
      libraries: [],
    });
    const reference = nav.find((c) => c.id === "reference");
    expect(reference?.links.map((l) => l.label)).toEqual(["Lua Standard", "Defold"]);
  });

  test("each group holds exactly its namespaces, round-tripping order, route, and labelHtml", () => {
    const reference = fullNav().find((c) => c.id === "reference");
    const byLabel = (label: string) => reference?.links.find((l) => l.label === label);

    expect(byLabel("Globals")?.children?.map((c) => c.route)).toEqual(["/api/globals"]);
    expect(byLabel("Lua Standard")?.children?.map((c) => c.route)).toEqual([
      "/api/base",
      "/api/bit",
    ]);
    expect(byLabel("Defold")?.children?.map((c) => c.route)).toEqual(["/api/camera", "/api/go"]);

    const defold = byLabel("Defold");
    expect(defold?.children?.map((c) => c.label)).toEqual(["camera", "go"]);
    expect(defold?.children?.every((c) => typeof c.labelHtml === "string")).toBe(true);
  });

  test("nests a Libraries group one level: multi-module libs as subgroups, single-module as leaves", () => {
    const nav = buildNav(realPages(), {
      globals: GLOBALS,
      globalTypes: [],
      luaStdlib: LUA_STDLIB,
      engine: ENGINE,
      libraries: [
        {
          dir: "defold-input",
          label: "defold-input",
          modules: [
            { label: "in.button", route: "/api/in.button" },
            { label: "in.cursor", route: "/api/in.cursor" },
          ],
        },
        {
          dir: "monarch",
          label: "monarch",
          modules: [
            { label: "monarch.monarch", route: "/api/monarch.monarch" },
            { label: "monarch.transitions.gui", route: "/api/monarch.transitions.gui" },
          ],
        },
        {
          dir: "library-defold-persist",
          label: "library-defold-persist",
          modules: [{ label: "persist.persist", route: "/api/persist.persist" }],
        },
      ],
    });
    const reference = nav.find((c) => c.id === "reference");
    const libraries = reference?.links.find((l) => l.label === "Libraries");
    expect(libraries?.route).toBeUndefined();
    // Order preserved: two multi-module subgroups, then the single-module leaf.
    expect(libraries?.children?.map((c) => c.label)).toEqual([
      "defold-input",
      "monarch",
      "persist.persist",
    ]);

    const input = libraries?.children?.find((c) => c.label === "defold-input");
    expect(input?.route).toBeUndefined();
    expect(input?.children?.map((c) => c.label)).toEqual(["in.button", "in.cursor"]);
    expect(input?.children?.map((c) => c.route)).toEqual(["/api/in.button", "/api/in.cursor"]);

    // A single-module library renders as a bare leaf — no redundant one-child subgroup.
    const persist = libraries?.children?.find((c) => c.label === "persist.persist");
    expect(persist?.route).toBe("/api/persist.persist");
    expect(persist?.children).toBeUndefined();
  });

  test("emits no Libraries group when the libraries list is empty", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: LUA_STDLIB,
      engine: ENGINE,
      libraries: [],
    });
    const reference = nav.find((c) => c.id === "reference");
    expect(reference?.links.find((l) => l.label === "Libraries")).toBeUndefined();
    expect(reference?.links.map((l) => l.label)).toEqual(["Lua Standard", "Defold"]);
  });

  test("places every guide page route in exactly one category", () => {
    const pages = realPages();
    const nav = buildNav(pages, {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [],
    });
    const guideRoutes = nav.flatMap((c) => c.links.map((l) => l.route)).filter(Boolean);
    expect(new Set(guideRoutes).size).toBe(guideRoutes.length);
    expect(new Set(guideRoutes)).toEqual(new Set(pages.map((p) => p.route)));
  });

  test("places the script-state page in the Language category, not the guides fallback", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [],
    });
    const language = nav.find((c) => c.id === "language");
    expect(language?.links.find((l) => l.route === "/script-state")).toBeDefined();
    const guides = nav.find((c) => c.id === "guides");
    expect(guides?.links.find((l) => l.route === "/script-state")).toBeUndefined();
  });

  test("places the messages page in the Language category, not the guides fallback", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [],
    });
    const language = nav.find((c) => c.id === "language");
    expect(language?.links.find((l) => l.route === "/messages")).toBeDefined();
    const guides = nav.find((c) => c.id === "guides");
    expect(guides?.links.find((l) => l.route === "/messages")).toBeUndefined();
  });

  test("places the data-structures page in the Language category, not the guides fallback", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [],
    });
    const language = nav.find((c) => c.id === "language");
    expect(language?.links.find((l) => l.route === "/data-structures")).toBeDefined();
    const guides = nav.find((c) => c.id === "guides");
    expect(guides?.links.find((l) => l.route === "/data-structures")).toBeUndefined();
  });

  test("maps the index page to / under Get started, labeled Overview", () => {
    const nav = fullNav();
    const getStarted = nav.find((c) => c.id === "get-started");
    const overview = getStarted?.links.find((l) => l.route === "/");
    expect(overview?.label).toBe("Overview");
  });

  test("appends an unmapped page to the fallback (guides) category rather than dropping it", () => {
    const synthetic: GuidePage = {
      file: "brand-new-topic.md",
      slug: "brand-new-topic",
      route: "/brand-new-topic",
      isIndex: false,
      includeInLlmsFull: true,
    };
    const nav = buildNav([...realPages(), synthetic], {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [],
    });
    const guides = nav.find((c) => c.id === "guides");
    const hit = guides?.links.find((l) => l.route === "/brand-new-topic");
    expect(hit).toBeDefined();
    expect(hit?.label).toBe("Brand New Topic");
  });
});

describe("linkFor toc-title rendering", () => {
  function navLinkFor(page: GuidePage): NavLink | undefined {
    const nav = buildNav([...realPages(), page], {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [],
    });
    for (const category of nav) {
      const hit = category.links.find((l) => l.route === page.route);
      if (hit) return hit;
    }
    return undefined;
  }

  test("uses a plain tocTitle verbatim for both label and labelHtml", () => {
    const page: GuidePage = {
      file: "add-typescript.md",
      slug: "add-typescript",
      route: "/add-typescript",
      isIndex: false,
      includeInLlmsFull: true,
      tocTitle: "Add TypeScript",
    };
    const link = navLinkFor(page);
    expect(link?.label).toBe("Add TypeScript");
    expect(link?.labelHtml).toBe("Add TypeScript");
  });

  test("strips backticks for label and renders inline code for labelHtml", () => {
    const page: GuidePage = {
      file: "x.md",
      slug: "x",
      route: "/x",
      isIndex: false,
      includeInLlmsFull: true,
      tocTitle: "API docs vs `ts-defold-types`",
    };
    const link = navLinkFor(page);
    expect(link?.label).toBe("API docs vs ts-defold-types");
    expect(link?.labelHtml).toContain("<code>ts-defold-types</code>");
  });

  test("falls back to humanize / Overview when tocTitle is absent", () => {
    const page: GuidePage = {
      file: "brand-new-topic.md",
      slug: "brand-new-topic",
      route: "/brand-new-topic",
      isIndex: false,
      includeInLlmsFull: true,
    };
    const link = navLinkFor(page);
    expect(link?.label).toBe("Brand New Topic");
    expect(link?.labelHtml).toBe("Brand New Topic");

    const nav = fullNav();
    const overview = nav.flatMap((c) => c.links).find((l) => l.route === "/");
    expect(overview?.label).toBe("Overview");
    expect(overview?.labelHtml).toBe("Overview");
  });
});

describe("activeCategoryId", () => {
  const nav = fullNav();

  test("resolves a guide route to its owning category", () => {
    expect(activeCategoryId("/debugging", nav)).toBe("guides");
  });

  test("resolves engine and lua-stdlib API subpaths to reference via a child route", () => {
    expect(activeCategoryId("/api/base", nav)).toBe("reference");
    expect(activeCategoryId("/api/camera", nav)).toBe("reference");
    expect(activeCategoryId("/api/globals", nav)).toBe("reference");
  });

  test("resolves a versioned API route to reference via the /api fallback", () => {
    expect(activeCategoryId("/api/defold-1.9.8/label", nav)).toBe("reference");
  });

  test("resolves the versioned API index route to reference", () => {
    expect(activeCategoryId("/api/defold-1.9.8", nav)).toBe("reference");
  });

  test("resolves a dotted-slug library page route to reference", () => {
    expect(activeCategoryId("/api/persist.persist", nav)).toBe("reference");
  });

  test("the /api fallback does not fire for non-api routes", () => {
    expect(activeCategoryId("/debugging", nav)).toBe("guides");
    expect(activeCategoryId("/no-such-page", nav)).toBeUndefined();
  });

  test("resolves the index route to get-started by exact match", () => {
    expect(activeCategoryId("/", nav)).toBe("get-started");
  });
});

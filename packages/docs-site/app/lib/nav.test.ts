import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type GuidePage, listGuidePages } from "./guide";
import { activeCategoryId, buildNav, type NavLink } from "./nav";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

function realPages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

const GLOBALS = [{ label: "globals", route: "/api/globals" }];
const LUA_STDLIB = [
  { label: "base", route: "/api/base" },
  { label: "bit", route: "/api/bit" },
];
const ENGINE = [
  { label: "camera", route: "/api/camera" },
  { label: "go", route: "/api/go" },
];

function fullNav() {
  return buildNav(realPages(), { globals: GLOBALS, luaStdlib: LUA_STDLIB, engine: ENGINE });
}

describe("buildNav", () => {
  test("returns the four categories in declared order with declared labels", () => {
    const nav = fullNav();
    expect(nav.map((c) => c.id)).toEqual(["get-started", "guides", "language", "reference"]);
    expect(nav.map((c) => c.label)).toEqual(["Get started", "Guides", "Language", "Reference"]);
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

  test("omits a group header entirely when its namespace list is empty", () => {
    const nav = buildNav(realPages(), { globals: [], luaStdlib: LUA_STDLIB, engine: ENGINE });
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

  test("places every guide page route in exactly one category", () => {
    const pages = realPages();
    const nav = buildNav(pages, { globals: [], luaStdlib: [], engine: [] });
    const guideRoutes = nav.flatMap((c) => c.links.map((l) => l.route)).filter(Boolean);
    expect(new Set(guideRoutes).size).toBe(guideRoutes.length);
    expect(new Set(guideRoutes)).toEqual(new Set(pages.map((p) => p.route)));
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
    };
    const nav = buildNav([...realPages(), synthetic], { globals: [], luaStdlib: [], engine: [] });
    const guides = nav.find((c) => c.id === "guides");
    const hit = guides?.links.find((l) => l.route === "/brand-new-topic");
    expect(hit).toBeDefined();
    expect(hit?.label).toBe("Brand New Topic");
  });
});

describe("linkFor toc-title rendering", () => {
  function navLinkFor(page: GuidePage): NavLink | undefined {
    const nav = buildNav([...realPages(), page], { globals: [], luaStdlib: [], engine: [] });
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

  test("resolves the index route to get-started by exact match", () => {
    expect(activeCategoryId("/", nav)).toBe("get-started");
  });
});

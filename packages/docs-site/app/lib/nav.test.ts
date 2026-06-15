import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type GuidePage, listGuidePages } from "./guide";
import { activeCategoryId, buildNav, type NavLink } from "./nav";

const GUIDE_DIR = join(import.meta.dir, "../../../../docs/guide");

function realPages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

describe("buildNav", () => {
  test("returns the four categories in declared order with declared labels", () => {
    const nav = buildNav(realPages());
    expect(nav.map((c) => c.id)).toEqual(["get-started", "guides", "language", "reference"]);
    expect(nav.map((c) => c.label)).toEqual(["Get started", "Guides", "Language", "Reference"]);
  });

  test("places every page route in exactly one category, plus the fixed /api link", () => {
    const pages = realPages();
    const nav = buildNav(pages);
    const linkRoutes = nav.flatMap((c) => c.links.map((l) => l.route));
    expect(new Set(linkRoutes).size).toBe(linkRoutes.length); // no duplicates

    const expected = new Set([...pages.map((p) => p.route), "/api"]);
    expect(new Set(linkRoutes)).toEqual(expected); // none dropped, none extra
  });

  test("maps the index page to / under Get started, labeled Overview", () => {
    const nav = buildNav(realPages());
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
    const nav = buildNav([...realPages(), synthetic]);
    const guides = nav.find((c) => c.id === "guides");
    const hit = guides?.links.find((l) => l.route === "/brand-new-topic");
    expect(hit).toBeDefined();
    expect(hit?.label).toBe("Brand New Topic");
  });

  test("carries the fixed /api link under Reference even with no backing guide page", () => {
    const nav = buildNav(realPages());
    const reference = nav.find((c) => c.id === "reference");
    expect(reference?.links).toEqual([{ label: "API", route: "/api", labelHtml: "API" }]);
  });
});

describe("linkFor toc-title rendering", () => {
  function navLinkFor(page: GuidePage): NavLink | undefined {
    const nav = buildNav([...realPages(), page]);
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

    const nav = buildNav(realPages());
    const overview = nav.flatMap((c) => c.links).find((l) => l.route === "/");
    expect(overview?.label).toBe("Overview");
    expect(overview?.labelHtml).toBe("Overview");
  });

  test("gives the fixed /api link a matching labelHtml", () => {
    const nav = buildNav(realPages());
    const api = nav.flatMap((c) => c.links).find((l) => l.route === "/api");
    expect(api?.label).toBe("API");
    expect(api?.labelHtml).toBe("API");
  });
});

describe("activeCategoryId", () => {
  const nav = buildNav(realPages());

  test("resolves a guide route to its owning category", () => {
    expect(activeCategoryId("/debugging", nav)).toBe("guides");
  });

  test("resolves an API subpath to reference via prefix match", () => {
    expect(activeCategoryId("/api/foo", nav)).toBe("reference");
  });

  test("resolves the index route to get-started by exact match", () => {
    expect(activeCategoryId("/", nav)).toBe("get-started");
  });
});

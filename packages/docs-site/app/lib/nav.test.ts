import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { GuidePage } from "./guide";
import { listGuidePages } from "./guide-loader";
import { activeCategoryId, buildNav, libraryCreatorGroups, type NavLink } from "./nav";

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
  test("returns the top-level categories in declared order with declared labels", () => {
    const nav = fullNav();
    expect(nav.map((c) => c.id)).toEqual(["get-started", "guides", "api"]);
    expect(nav.map((c) => c.label)).toEqual(["Get started", "Guides", "API"]);
  });

  test("has no lua-stdlib category and links the API category to its index", () => {
    const nav = fullNav();
    expect(nav.find((c) => c.id === "lua-stdlib")).toBeUndefined();
    expect(nav.find((c) => c.id === "api")?.route).toBe("/api");
  });

  test("links the Get started category to its landing so its root node is selectable", () => {
    const nav = fullNav();
    expect(nav.find((c) => c.id === "get-started")?.route).toBe("/get-started");
  });

  test("reference links are three route-less group headers in order", () => {
    const reference = fullNav().find((c) => c.id === "api");
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
    const reference = nav.find((c) => c.id === "api");
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
    const reference = nav.find((c) => c.id === "api");
    expect(reference?.links.map((l) => l.label)).toEqual(["Lua Standard", "Defold"]);
  });

  test("each group holds exactly its namespaces, round-tripping order, route, and labelHtml", () => {
    const reference = fullNav().find((c) => c.id === "api");
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

  test("Libraries is a top-level category with creator, library, and namespace levels", () => {
    const nav = buildNav(realPages(), {
      globals: GLOBALS,
      globalTypes: [],
      luaStdlib: LUA_STDLIB,
      engine: ENGINE,
      libraries: [
        {
          creator: "britzl",
          label: "britzl",
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
              modules: [{ label: "monarch.monarch", route: "/api/monarch.monarch" }],
            },
          ],
        },
        {
          creator: "subsoap",
          label: "subsoap",
          libraries: [
            {
              dir: "library-defold-persist",
              label: "library-defold-persist",
              modules: [{ label: "persist.persist", route: "/api/persist.persist" }],
            },
          ],
        },
      ],
    });
    const libraries = nav.find((c) => c.id === "libraries");
    expect(libraries?.label).toBe("Libraries");
    expect(libraries?.route).toBe("/libraries");
    expect(libraries?.links.map((l) => l.label)).toEqual(["britzl", "subsoap"]);

    const britzl = libraries?.links.find((l) => l.label === "britzl");
    expect(britzl?.route).toBeUndefined();
    expect(britzl?.children?.map((c) => c.label)).toEqual(["defold-input", "monarch"]);

    const monarch = britzl?.children?.find((l) => l.label === "monarch");
    expect(monarch?.route).toBeUndefined();
    expect(monarch?.children).toEqual([
      {
        label: "monarch.monarch",
        labelHtml: "monarch.monarch",
        route: "/api/monarch.monarch",
      },
    ]);

    const labels: string[] = [];
    const collectLabels = (links: NavLink[] | undefined) => {
      for (const link of links ?? []) {
        labels.push(link.label);
        collectLabels(link.children);
      }
    };
    collectLabels(libraries?.links);
    expect(labels.every((label) => !label.includes("/"))).toBe(true);
  });

  test("activeCategoryId resolves the Libraries index and nested namespace leaves", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [
        {
          creator: "subsoap",
          label: "subsoap",
          libraries: [
            {
              dir: "defold-saver",
              label: "defold-saver",
              modules: [
                { label: "saver.saver", route: "/api/saver.saver" },
                { label: "saver.storage", route: "/api/saver.storage" },
              ],
            },
          ],
        },
      ],
    });
    expect(activeCategoryId("/libraries", nav)).toBe("libraries");
    expect(activeCategoryId("/api/saver.storage", nav)).toBe("libraries");
  });

  test("emits no Libraries category when the libraries list is empty", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: LUA_STDLIB,
      engine: ENGINE,
      libraries: [],
    });
    expect(nav.find((c) => c.id === "libraries")).toBeUndefined();
    const reference = nav.find((c) => c.id === "api");
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
    // Guide leaves are now nested under route-less group headers, so the
    // collector recurses into children instead of reading category.links alone.
    const guideRoutes: string[] = [];
    const collect = (links: NavLink[]) => {
      for (const link of links) {
        if (link.route) guideRoutes.push(link.route);
        if (link.children) collect(link.children);
      }
    };
    for (const category of nav) collect(category.links);
    expect(new Set(guideRoutes).size).toBe(guideRoutes.length);
    expect(new Set(guideRoutes)).toEqual(new Set(pages.map((p) => p.route)));
  });

  test("links the Guides category to its /guides landing route", () => {
    const guides = fullNav().find((c) => c.id === "guides");
    expect(guides?.route).toBe("/guides");
  });

  test("nests the Guides pages under seven route-less group headers in learning order", () => {
    const nav = buildNav(realPages(), {
      globals: [],
      globalTypes: [],
      luaStdlib: [],
      engine: [],
      libraries: [],
    });
    const guides = nav.find((c) => c.id === "guides");
    expect(guides?.links.map((l) => l.label)).toEqual([
      "Tutorial",
      "TypeScript",
      "Core concepts",
      "CLI",
      "Toolchain & workflow",
      "Project configuration",
      "Migration",
    ]);
    for (const header of guides?.links ?? []) {
      expect(header.route).toBeUndefined();
      expect(header.children?.length).toBeGreaterThan(0);
    }
    const byLabel = (label: string) => guides?.links.find((l) => l.label === label);
    expect(byLabel("Tutorial")?.children?.map((c) => c.route)).toEqual(["/tetris-tutorial"]);
    expect(byLabel("TypeScript")?.children?.map((c) => c.route)).toEqual([
      "/typescript-vs-lua",
      "/typescript-gotchas",
      "/data-structures",
    ]);
    expect(byLabel("Core concepts")?.children?.map((c) => c.route)).toEqual([
      "/script-lifecycle",
      "/messages",
      "/script-state",
      "/vector-math",
    ]);
    expect(byLabel("CLI")?.children?.map((c) => c.route)).toEqual([
      "/init",
      "/watch",
      "/build",
      "/wall",
      "/resolve",
    ]);
    expect(byLabel("Toolchain & workflow")?.children?.map((c) => c.route)).toEqual([
      "/transpile-diagnostics",
      "/debugging",
      "/agent-runbooks",
      "/helper-scripts",
    ]);
    expect(byLabel("Project configuration")?.children?.map((c) => c.route)).toEqual([
      "/pinning-defold-target",
      "/upgrading-to-defold-1-13-0",
      "/extensions",
    ]);
    expect(byLabel("Migration")?.children?.map((c) => c.route)).toEqual([
      "/api-docs-vs-ts-defold",
      "/migrating-from-ts-defold",
    ]);
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

  test("resolves the /guides landing route to guides via the category route", () => {
    expect(activeCategoryId("/guides", nav)).toBe("guides");
  });

  test("resolves the tutorial route to guides now that it nests under Guides", () => {
    expect(activeCategoryId("/tetris-tutorial", nav)).toBe("guides");
  });

  test("resolves engine and lua-stdlib API subpaths to api via a child route", () => {
    expect(activeCategoryId("/api/base", nav)).toBe("api");
    expect(activeCategoryId("/api/camera", nav)).toBe("api");
    expect(activeCategoryId("/api/globals", nav)).toBe("api");
  });

  test("resolves the API index and versioned API routes to api via the category route", () => {
    expect(activeCategoryId("/api", nav)).toBe("api");
    expect(activeCategoryId("/api/defold-1.9.8/label", nav)).toBe("api");
  });

  test("resolves the versioned API index route to api", () => {
    expect(activeCategoryId("/api/defold-1.9.8", nav)).toBe("api");
  });

  test("resolves an unmatched dotted-slug API route to api via the /api fallback", () => {
    expect(activeCategoryId("/api/persist.persist", nav)).toBe("api");
  });

  test("the /api fallback does not fire for non-api routes", () => {
    expect(activeCategoryId("/debugging", nav)).toBe("guides");
    expect(activeCategoryId("/no-such-page", nav)).toBeUndefined();
  });

  test("resolves the index route to get-started by exact match", () => {
    expect(activeCategoryId("/", nav)).toBe("get-started");
  });
});

describe("libraryCreatorGroups", () => {
  const moduleDir = new Map<string, string>([
    ["squid.squid", "squid"],
    ["in.button", "defold-input"],
    ["in.cursor", "defold-input"],
    ["monarch.monarch", "monarch"],
  ]);
  const ownerByDir = new Map<string, string>([
    ["squid", "paweljarosz"],
    ["defold-input", "britzl"],
    ["monarch", "britzl"],
  ]);

  test("groups pages into creator, library, and namespace levels", () => {
    const groups = libraryCreatorGroups(
      [
        { namespace: "squid.squid", route: "/api/squid.squid" },
        { namespace: "in.cursor", route: "/api/in.cursor" },
        { namespace: "in.button", route: "/api/in.button" },
        { namespace: "monarch.monarch", route: "/api/monarch.monarch" },
      ],
      moduleDir,
      ownerByDir,
    );
    expect(groups.map((group) => group.label)).toEqual(["britzl", "paweljarosz"]);
    expect(groups[0]?.libraries.map((lib) => lib.label)).toEqual(["defold-input", "monarch"]);
    expect(groups[0]?.libraries[0]?.modules).toEqual([
      { label: "in.button", route: "/api/in.button" },
      { label: "in.cursor", route: "/api/in.cursor" },
    ]);
    expect(groups[1]?.libraries[0]?.modules).toEqual([
      { label: "squid.squid", route: "/api/squid.squid" },
    ]);
  });

  test("falls back to the dir for uncredited libraries", () => {
    const [group] = libraryCreatorGroups(
      [{ namespace: "orphan.module", route: "/api/orphan.module" }],
      new Map([["orphan.module", "orphan-lib"]]),
      new Map(),
    );
    expect(group?.creator).toBe("orphan-lib");
    expect(group?.libraries[0]?.label).toBe("orphan-lib");
    expect(group?.libraries[0]?.modules[0]?.label).toBe("orphan.module");
  });
});

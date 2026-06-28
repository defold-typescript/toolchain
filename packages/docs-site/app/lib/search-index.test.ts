import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ApiPage } from "./api-surface";
import { listApiVersions, loadApiSurface, loadApiSurfaceForVersion } from "./api-surface-loader";
import type { GuidePage } from "./guide";
import {
  apiSearchRecords,
  buildSearchIndex,
  searchIndexFileForRoute,
  versionSearchIndexRecords,
} from "./search-index";

const API_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");

const page = (file: string, isIndex = false): GuidePage => {
  const slug = isIndex ? "" : file.replace(/\.md$/, "");
  return { file, slug, route: isIndex ? "/" : `/${slug}`, isIndex, includeInLlmsFull: true };
};

const CONTENTS: Record<string, string> = {
  "getting-started.md": [
    "# Getting Started",
    "",
    "Install the package and run it.",
    "",
    "```ts",
    "const secretCode = 1;",
    "```",
    "",
    "Some **bold** prose and a [helpful link](https://example.com/page).",
  ].join("\n"),
  "README.md": "# Overview\n\nThe project index prose.\n",
  "no-heading.md": "Just prose, no level-one heading here.\n",
};

const read = (p: GuidePage): string => CONTENTS[p.file] ?? "";

const only = (page: GuidePage) => {
  const [record] = buildSearchIndex([page], read);
  if (!record) throw new Error("expected exactly one record");
  return record;
};

describe("buildSearchIndex", () => {
  test("returns one record per page with route, H1 title, and text", () => {
    const record = only(page("getting-started.md"));
    expect(record.route).toBe("/getting-started");
    expect(record.title).toBe("Getting Started");
    expect(record.text).toContain("Install the package");
  });

  test("falls back to a humanized slug title when there is no H1", () => {
    expect(only(page("no-heading.md")).title).toBe("No Heading");
  });

  test("maps the README index page to route /", () => {
    const record = only(page("README.md", true));
    expect(record.route).toBe("/");
    expect(record.title).toBe("Overview");
  });

  test("excludes fenced code blocks from text", () => {
    const { text } = only(page("getting-started.md"));
    expect(text).not.toContain("secretCode");
    expect(text).not.toContain("```");
  });

  test("reduces markdown markup to plain text", () => {
    const { text } = only(page("getting-started.md"));
    expect(text).toContain("bold");
    expect(text).not.toContain("**");
    expect(text).toContain("helpful link");
    expect(text).not.toContain("https://example.com");
    expect(text).not.toContain("](");
  });

  test("returns records in stable sorted order regardless of input order", () => {
    const pages = [page("getting-started.md"), page("README.md", true), page("no-heading.md")];
    const records = buildSearchIndex(pages, read);
    const routes = records.map((r) => r.route);
    expect(routes).toEqual([...routes].sort());
  });
});

describe("searchIndexFileForRoute", () => {
  const versions = ["defold-1.9.8"];

  test("maps versioned API routes to their version-specific index", () => {
    expect(searchIndexFileForRoute("/api/defold-1.9.8/label", versions)).toBe(
      "search-index-defold-1.9.8.json",
    );
  });

  test("maps default and non-API routes to the default index", () => {
    expect(searchIndexFileForRoute("/api/go", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/guide/x", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/", versions)).toBe("search-index.json");
  });

  test("keeps unknown version-looking API routes on the default index", () => {
    expect(searchIndexFileForRoute("/api/foo/bar", versions)).toBe("search-index.json");
  });
});

describe("versionSearchIndexRecords", () => {
  test("returns one guide-plus-API record set per non-default version", () => {
    const guideRecords = [{ route: "/", title: "Overview", text: "Guide prose" }];
    const [entry] = versionSearchIndexRecords(API_FIXTURE_DIR, guideRecords, {
      versions: listApiVersions(API_FIXTURE_DIR),
      pagesForVersion: loadApiSurfaceForVersion,
    });
    expect(entry?.version).toBe("old");
    expect(entry?.records).toEqual([
      ...guideRecords,
      ...apiSearchRecords(loadApiSurfaceForVersion(API_FIXTURE_DIR, "old")),
    ]);
    expect(entry?.records.some((record) => record.route === "/api/old/wmath")).toBe(true);
  });
});

describe("apiSearchRecords", () => {
  test("returns one record per ApiPage with the page route and a `<namespace> API` title", () => {
    const pages = loadApiSurface(API_FIXTURE_DIR);
    const records = apiSearchRecords(pages);
    expect(records).toHaveLength(pages.length);
    for (const page of pages) {
      const record = records.find((r) => r.route === page.route);
      expect(record).toBeDefined();
      expect(record?.title).toBe(`${page.namespace} API`);
    }
  });

  test("indexes the namespace plus a symbol name and its brief into text", () => {
    const camera = loadApiSurface(API_FIXTURE_DIR).find((p) => p.namespace === "camera");
    if (!camera) throw new Error("expected a camera fixture page");
    const fn = camera.module.functions[0];
    if (!fn) throw new Error("expected the camera fixture to carry a function");
    const [record] = apiSearchRecords([camera]);
    expect(record?.text).toContain("camera");
    expect(record?.text).toContain(fn.name);
    // the page renders `description || brief`; assert whichever it emits is indexed
    expect(record?.text).toContain(fn.description || fn.brief);
  });

  test("excludes Lua example fenced blocks from text", () => {
    const page: ApiPage = {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo brief",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [
          {
            name: "demo.run",
            brief: "run it",
            description: "Runs the demo.",
            parameters: [],
            returnValues: [],
            examples: "local secretExampleToken = demo.run()",
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
    };
    const [record] = apiSearchRecords([page]);
    expect(record?.text).toContain("demo.run");
    expect(record?.text).not.toContain("secretExampleToken");
  });

  test("returns records in stable route-sorted order regardless of input order", () => {
    const pages = loadApiSurface(API_FIXTURE_DIR);
    const records = apiSearchRecords([...pages].reverse());
    const routes = records.map((r) => r.route);
    expect(routes).toEqual([...routes].sort());
  });

  test("indexes parameter and return doc prose into text while preserving the schema", () => {
    const page: ApiPage = {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo brief",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [
          {
            name: "demo.run",
            brief: "run it",
            description: "Runs the demo.",
            parameters: [
              {
                name: "loop",
                doc: "<p>keepLoopingDocToken</p>",
                types: ["boolean"],
                isOptional: true,
              },
            ],
            returnValues: [
              {
                name: "",
                doc: "<p>frameCounterDocToken</p>",
                types: ["number"],
                isOptional: false,
              },
            ],
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
    };
    const [record] = apiSearchRecords([page]);
    expect(record?.text).toContain("keepLoopingDocToken");
    expect(record?.text).toContain("frameCounterDocToken");
    expect(Object.keys(record ?? {}).sort()).toEqual(["route", "text", "title"]);
    expect(record?.title).toBe("demo API");
  });
});

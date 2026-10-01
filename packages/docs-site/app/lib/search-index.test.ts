import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { searchIndexOutputs } from "../../scripts/build-search-index";
import { memberAnchorPage } from "./__fixtures__/member-anchor-page";
import { apiVersionAxis, windowedApiPages } from "./api-content";
import { type ApiPage, apiModuleSymbols } from "./api-surface";
import {
  listApiVersions,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import type { GuidePage } from "./guide";
import {
  apiSearchRecords,
  buildSearchIndex,
  combinedSearchRecords,
  type SearchRecord,
  searchIndexFileForRoute,
  toPlainText,
  versionSearchIndexRecords,
} from "./search-index";
import { buildSymbolIndex, combinedSymbolIndexRecords, memberAnchors } from "./symbol-index";
import { resolveVersionWindow } from "./version-window";

const API_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
// Derived from the target registry, so a version rotation does not need an edit
// here: "newest tracked" is what the lifecycle prose is keyed on.
const NEWEST_VERSION = (versionsWithDiskFixtures(REAL_TYPES_DIR)[0]?.id ?? "").replace(
  /^defold-/,
  "",
);
const TRACKED_VERSIONS = versionsWithDiskFixtures(REAL_TYPES_DIR).map((v) =>
  v.id.replace(/^defold-/, ""),
);
const OLDEST_VERSION = TRACKED_VERSIONS[TRACKED_VERSIONS.length - 1] as string;
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

// The oldest release a namespace's surviving-but-not-universal symbols were
// introduced in, read off the Combined projection production renders from. The lifecycle
// prose is keyed on *that* release, not on whichever one is newest: a symbol
// promoted two releases ago keeps naming its own release forever, and asserting
// the newest version only held while it happened to be the promoting one.
function introducedVersionFor(namespace: string): string {
  const ns = loadCombinedSurface(REAL_TYPES_DIR).namespaces.find((n) => n.namespace === namespace);
  const introduced = new Set(
    (ns?.entries ?? [])
      .filter(
        (e) => e.availableIn.includes(NEWEST_VERSION) && !e.availableIn.includes(OLDEST_VERSION),
      )
      .map((e) => e.availableIn[e.availableIn.length - 1] as string),
  );
  // The oldest: a later release can introduce further symbols (1.13.2 documents
  // new nil returns in b2d.body), while the prose checked here is the original one.
  const oldest = TRACKED_VERSIONS.filter((version) => introduced.has(version)).at(-1);
  if (oldest === undefined) throw new Error(`${namespace}: no introducing release`);
  return oldest;
}

// The release that dropped a symbol: the one immediately newer than the last
// release still carrying it. Derived for the same reason as `introducedVersionFor`
// — a removal two releases back keeps naming the release that made it.
function removedVersionFor(namespace: string, name: string): string {
  const ns = loadCombinedSurface(REAL_TYPES_DIR).namespaces.find((n) => n.namespace === namespace);
  const entry = (ns?.entries ?? []).find((e) => e.identity.name === name);
  const lastHeld = entry?.availableIn[entry.availableIn.length - 1];
  const index = TRACKED_VERSIONS.indexOf(lastHeld ?? "");
  if (index < 1) throw new Error(`${namespace}.${name}: no release after ${lastHeld}`);
  return TRACKED_VERSIONS[index - 1] as string;
}

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
  // versionIds now carries the current (default) engine version too — every
  // version, the current one included, owns an explicit prefixed index.
  const versions = ["defold-1.13.0", "defold-1.12.4"];

  test("maps every versioned API route to its version-specific index, current included", () => {
    expect(searchIndexFileForRoute("/api/defold-1.13.0/camera", versions)).toBe(
      "search-index-defold-1.13.0.json",
    );
    expect(searchIndexFileForRoute("/api/defold-1.12.4/camera", versions)).toBe(
      "search-index-defold-1.12.4.json",
    );
  });

  test("maps unprefixed canonical and non-API routes to the shared Combined index", () => {
    expect(searchIndexFileForRoute("/api/camera", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/api/Hash", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/guide/x", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/", versions)).toBe("search-index.json");
  });

  test("keeps unknown version-looking API routes on the shared index", () => {
    expect(searchIndexFileForRoute("/api/foo/bar", versions)).toBe("search-index.json");
  });

  test("resolves the /api/combined compat route to the canonical Combined index", () => {
    expect(searchIndexFileForRoute("/api/combined/model", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/api/combined", versions)).toBe("search-index.json");
  });
});

describe("versionSearchIndexRecords", () => {
  const sharedPages = loadVersionIndependentPages(API_FIXTURE_DIR);
  const sharedRecords = apiSearchRecords(sharedPages);

  test("returns a guide-plus-shared-plus-API record set per version, the default included", () => {
    const guideRecords = [{ route: "/", title: "Overview", text: "Guide prose" }];
    const entries = versionSearchIndexRecords(API_FIXTURE_DIR, guideRecords, {
      versions: listApiVersions(API_FIXTURE_DIR),
      pagesForVersion: loadApiSurfaceForVersion,
      sharedPages,
    });
    const versionIds = entries.map((entry) => entry.version);
    expect(versionIds).toContain("cur");
    expect(versionIds).toContain("old");

    const old = entries.find((entry) => entry.version === "old");
    expect(old?.records).toEqual([
      ...guideRecords,
      ...sharedRecords,
      ...apiSearchRecords(loadApiSurfaceForVersion(API_FIXTURE_DIR, "old")),
    ]);
    expect(old?.records.some((record) => record.route === "/api/old/wmath")).toBe(true);

    // The default version no longer borrows the unversioned file: it gets its
    // own prefixed record set keyed to `/api/cur/<ns>`.
    const cur = entries.find((entry) => entry.version === "cur");
    expect(cur?.records).toEqual([
      ...guideRecords,
      ...sharedRecords,
      ...apiSearchRecords(loadApiSurfaceForVersion(API_FIXTURE_DIR, "cur")),
    ]);
    expect(cur?.records.some((record) => record.route.startsWith("/api/cur/"))).toBe(true);
  });

  test("carries the shared version-independent records at canonical routes in every version", () => {
    const entries = versionSearchIndexRecords(API_FIXTURE_DIR, [], {
      versions: listApiVersions(API_FIXTURE_DIR),
      pagesForVersion: loadApiSurfaceForVersion,
      sharedPages,
    });
    const sharedRoutes = sharedPages.map((p) => p.route);
    expect(sharedRoutes.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const routes = new Set(entry.records.map((r) => r.route));
      for (const route of sharedRoutes) expect(routes.has(route)).toBe(true);
    }
  });
});

describe("apiSearchRecords", () => {
  const fixtureRecords = apiSearchRecords([memberAnchorPage]);
  const fixtureIndex = buildSymbolIndex([memberAnchorPage]);
  const fixtureRecord = (key: string) => {
    const record = fixtureRecords.find((r) => r.route === fixtureIndex[key]?.route);
    if (!record) throw new Error(`no search record for ${key}`);
    return record;
  };

  test("returns one page record per ApiPage with the page route and a `<namespace> API` title", () => {
    const pages = loadApiSurface(API_FIXTURE_DIR);
    const records = apiSearchRecords(pages);
    const pageRecords = records.filter((r) => !r.route.includes("#"));
    expect(pageRecords).toHaveLength(pages.length);
    for (const page of pages) {
      const record = pageRecords.find((r) => r.route === page.route);
      expect(record).toBeDefined();
      expect(record?.title).toBe(`${page.namespace} API`);
    }
  });

  test("routes one record per member heading at the symbol index's anchor, titled by its key", () => {
    expect(fixtureRecords.map((r): (string | undefined)[] => [r.route, r.title])).toEqual([
      ["/api/demo", "demo API"],
      [fixtureIndex["demo.LIMIT"]?.route, "demo.LIMIT"],
      [fixtureIndex["demo.move"]?.route, "demo.move"],
      [fixtureIndex["demo.Options"]?.route, "demo.Options"],
      [fixtureIndex["demo.Options.no_stack"]?.route, "demo.Options.no_stack"],
      [fixtureIndex["demo.Options.open"]?.route, "demo.Options.open"],
      [fixtureIndex["demo.speed"]?.route, "demo.speed"],
      [fixtureIndex["demo.Mode"]?.route, "demo.Mode"],
    ]);
  });

  test("keeps the module intro on the page record and every member's text off it", () => {
    const pageRecord = fixtureRecords.find((r) => r.route === "/api/demo");
    expect(pageRecord?.text).toContain("introToken");
    expect(pageRecord?.text).not.toContain("demo.move(");
    expect(pageRecord?.text).not.toContain("ProseToken");
    for (const typeText of ["no_stack", "noStackProseToken", "openProseToken", "Options"]) {
      expect(pageRecord?.text).not.toContain(typeText);
    }
  });

  test("gives each type heading its own record holding its definition or member prose", () => {
    expect(fixtureRecord("demo.Mode").text).toContain("typeof demo.LIMIT");
    expect(fixtureRecord("demo.Options").text).toContain("interface Options extends BaseOptions");
    expect(fixtureRecord("demo.Options.no_stack").text).toContain("noStackProseToken");
    const open = fixtureRecord("demo.Options.open");
    expect(open.text).toContain("openProseToken");
    expect(open.text).not.toContain("secretTypeExampleToken");
  });

  test("folds both overload forms into the group's one record", () => {
    const move = fixtureRecord("demo.move");
    expect(move.text).toContain("demo.move(dx: number): boolean");
    expect(move.text).toContain("demo.move(x: number, y: number)");
    expect(move.text).toContain("stepProseToken");
    expect(move.text).toContain("pointProseToken");
    expect(fixtureRecord("demo.LIMIT").text).toContain("limitProseToken");
    expect(fixtureRecord("demo.speed").text).toContain("fastProseToken");
  });

  test("indexes the namespace plus a symbol name and its brief into the member's text", () => {
    const camera = loadApiSurface(API_FIXTURE_DIR).find((p) => p.namespace === "camera");
    if (!camera) throw new Error("expected a camera fixture page");
    const fn = camera.module.functions[0];
    if (!fn) throw new Error("expected the camera fixture to carry a function");
    const route = buildSymbolIndex([camera])[fn.name]?.route;
    const record = apiSearchRecords([camera]).find((r) => r.route === route);
    expect(route).toContain("#");
    expect(record?.text).toContain("camera");
    expect(record?.text).toContain(fn.name);
    // the page renders `description || brief`; assert whichever it emits is indexed
    expect(record?.text).toContain(fn.description || fn.brief);
  });

  test("excludes Lua example fenced blocks from text", () => {
    const move = fixtureRecord("demo.move");
    expect(move.text).toContain("demo.move");
    for (const record of fixtureRecords) expect(record.text).not.toContain("secretExampleToken");
  });

  test("returns records in stable route-sorted order regardless of input order", () => {
    const pages = loadApiSurface(API_FIXTURE_DIR);
    const records = apiSearchRecords([...pages].reverse());
    const routes = records.map((r) => r.route);
    expect(routes).toEqual([...routes].sort());
  });

  test("indexes a library page into the default search index with no bespoke wiring", () => {
    const pages = loadApiSurface(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
    const monarch = pages.find((p) => p.namespace === "monarch.monarch");
    if (!monarch) throw new Error("expected a monarch.monarch library page");
    expect(monarch.category).toBe("library");
    const records = apiSearchRecords(pages);
    const record = records.find((r) => r.route === monarch.route);
    expect(record).toBeDefined();
    expect(record?.title).toBe("monarch.monarch API");
    expect(record?.text).toContain("monarch");
  });

  test("indexes parameter and return doc prose into the member's text while preserving the schema", () => {
    const move = fixtureRecord("demo.move");
    expect(move.text).toContain("stepParamToken");
    expect(move.text).toContain("movedReturnToken");
    for (const record of fixtureRecords) {
      expect(Object.keys(record).sort()).toEqual(["route", "text", "title"]);
    }
  });

  test("threads lifecycle prose into member records and keeps removed symbols historical-only", () => {
    // The member records of one page: every record routed at an anchor on it.
    const membersOf = (records: SearchRecord[], namespace: string) => {
      const pageRecord = records.find((r) => r.title === `${namespace} API`);
      if (!pageRecord) throw new Error(`no ${namespace} page record`);
      return {
        pageRecord,
        members: records.filter((r) => r.route.startsWith(`${pageRecord.route}#`)),
      };
    };
    const defaultRecords = apiSearchRecords(loadApiSurface(REAL_TYPES_DIR));
    const since = `Since Defold ${introducedVersionFor("b2d.body")}`;
    const body = membersOf(defaultRecords, "b2d.body");
    expect(body.members.some((r) => r.text.includes(since))).toBe(true);
    expect(body.pageRecord.text).not.toContain(since);

    // `model.material` is present through 1.12.4 only, so the canonical surface
    // neither renders it nor carries its removed-in badge.
    const defaultModel = membersOf(defaultRecords, "model");
    for (const record of [defaultModel.pageRecord, ...defaultModel.members]) {
      expect(record.text).not.toContain("Removed in Defold");
    }

    const historicalRecords = apiSearchRecords(
      loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.12.4"),
    );
    const removed = `Removed in Defold ${removedVersionFor("model", "material")}`;
    const historicalModel = membersOf(historicalRecords, "model");
    expect(historicalModel.members.some((r) => r.text.includes(removed))).toBe(true);
    expect(historicalModel.pageRecord.text).not.toContain(removed);
  });
});

describe("combinedSearchRecords", () => {
  const combined = loadCombinedSurface(REAL_TYPES_DIR);
  const records = combinedSearchRecords(combined);
  const index = combinedSymbolIndexRecords(combined);
  const memberRecord = (key: string): SearchRecord => {
    const record = records.find((r) => r.route === index[key]?.route);
    if (!record) throw new Error(`no search record for ${key}`);
    return record;
  };
  const memberTexts = (namespace: string): string[] =>
    records.filter((r) => r.route.startsWith(`/api/${namespace}#`)).map((r) => r.text);
  const pageText = (namespace: string): string =>
    records.find((r) => r.route === `/api/${namespace}`)?.text ?? "";

  test("emits one page record per Combined namespace, routed under canonical /api", () => {
    const routes = records.map((r) => r.route);
    expect(routes).toEqual([...routes].sort((a, b) => a.localeCompare(b)));
    const pageRecords = records.filter((r) => !r.route.includes("#"));
    expect(pageRecords).toHaveLength(combined.namespaces.length);
    for (const ns of combined.namespaces) {
      const record = pageRecords.find((r) => r.route === `/api/${ns.namespace}`);
      expect(record).toBeDefined();
      expect(record?.title).toBe(`${ns.namespace} API`);
    }
  });

  test("routes one record per member heading at the anchor its symbol-index key carries", () => {
    const anchored = records.filter((r) => r.route.includes("#"));
    expect(anchored.length).toBeGreaterThan(1000);
    expect(new Set(anchored.map((r) => r.route)).size).toBe(anchored.length);
    const misrouted = anchored
      .filter((r) => index[r.title]?.route !== r.route)
      .map((r) => `${r.title} -> ${r.route}`);
    expect(misrouted).toEqual([]);
    expect(memberRecord("go.get_position").text).toContain("get_position(");
  });

  test("routes a constant-union alias to its own type heading", () => {
    expect(memberRecord("b2d.joint.JOINT_TYPE").text).toContain("type JOINT_TYPE =");
    expect(pageText("b2d.joint")).not.toContain("JOINT_TYPE =");
  });

  test("sources text from the projection's authoritative signatures", () => {
    // the declaration-backed, drift-free shape — not the ref-doc token form
    expect(memberRecord("model.set_blend_weights").text).toContain(
      "set_blend_weights(url: string | Hash | Url, weights?: number[])",
    );
    expect(pageText("model")).not.toContain("set_blend_weights(");
  });

  test("threads availability prose for symbols that are not present in every version", () => {
    const since = `Since Defold ${introducedVersionFor("compute")}`;
    expect(memberTexts("compute").some((text) => text.includes(since))).toBe(true);
    expect(pageText("compute")).not.toContain(since);
    const changed = `Signature changed in Defold ${introducedVersionFor("liveupdate")}`;
    expect(memberTexts("liveupdate").some((text) => text.includes(changed))).toBe(true);
    expect(pageText("liveupdate")).not.toContain(changed);
  });

  test("threads a verified upstream deprecation into the Combined search text", () => {
    expect(memberTexts("model").some((text) => text.includes("Deprecated since 1.13.0"))).toBe(
      true,
    );
    expect(pageText("model")).not.toContain("Deprecated since 1.13.0");
  });
});

describe("per-version search reads the pages its version route renders", () => {
  const outputs = searchIndexOutputs({ typesDir: REAL_TYPES_DIR });
  // The record a version page's member heading owns: the page route plus the
  // member's anchor on that page.
  const memberText = (version: string, page: ApiPage, kind: string, name: string): string => {
    const anchor = memberAnchors(page).get(`${kind}:${name}`);
    if (anchor === undefined) throw new Error(`no ${kind} ${name} anchor on ${page.route}`);
    return recordText(version, `${page.route}#${anchor}`);
  };
  const recordText = (version: string, route: string): string => {
    const file = outputs.find((output) => output.file === `search-index-${version}.json`);
    if (!file) throw new Error(`no search index for ${version}`);
    const record = file.records.find((candidate) => candidate.route === route);
    if (!record) throw new Error(`no ${route} record in ${version}`);
    return record.text;
  };

  test("a slot correction reaches the version record as the declaration prints it", () => {
    const window = resolveVersionWindow(apiVersionAxis(REAL_TYPES_DIR), "defold-1.13.1", null);
    if (!window) throw new Error("1.13.1 is not a tracked version");
    const pages = windowedApiPages(window, REAL_TYPES_DIR);
    const factoryPage = pages.find((page) => page.namespace === "factory");
    if (!factoryPage) throw new Error("factory page missing from the 1.13.1 window");
    const factory = memberText("defold-1.13.1", factoryPage, "function", "factory.get_status");
    expect(factory).toContain("factory.get_status(url: string | Hash | Url)");
    expect(factory).not.toContain("factory.get_status(url?:");

    const resource = pages.find((page) => page.namespace === "resource");
    if (!resource) throw new Error("resource page missing from the 1.13.1 window");
    const createTexture = apiModuleSymbols(resource, resource.translations, resource.signatures)
      .filter((s) => s.name === "resource.create_texture")
      .map((s) => s.signature)
      .find((signature) => signature.includes("buffer?:"));
    if (!createTexture) throw new Error("no create_texture declaration with an optional buffer");
    expect(memberText("defold-1.13.1", resource, "function", "resource.create_texture")).toContain(
      toPlainText(createTexture),
    );
  });

  test("every function row a version page renders is in that version's record", () => {
    const axis = apiVersionAxis(REAL_TYPES_DIR);
    const missing: string[] = [];
    let compared = 0;
    let generatedArms = 0;
    let authoredArms = 0;
    for (const { id } of versionsWithDiskFixtures(REAL_TYPES_DIR)) {
      const window = resolveVersionWindow(axis, id, null);
      if (!window) throw new Error(`${id} is not a tracked version`);
      for (const page of windowedApiPages(window, REAL_TYPES_DIR)) {
        const rows = apiModuleSymbols(page, page.translations, page.signatures)
          .filter((symbol) => symbol.kind === "function")
          .map((symbol) => ({ symbol, plain: toPlainText(symbol.signature) }));
        const generated = new Set([...(page.authoritativeArms?.values() ?? [])].flat());
        for (const [index, { symbol, plain }] of rows.entries()) {
          compared += 1;
          const text = memberText(id, page, "function", symbol.name);
          if (!text.includes(plain)) missing.push(`${id} ${symbol.signature}`);
          if (symbol.declarationIdentity !== undefined) continue;
          // An arm whose text another row already contains could be found through that row.
          const distinguishable = rows.every(
            (other, j) => j === index || !other.plain.includes(plain),
          );
          if (!distinguishable) continue;
          if (generated.has(symbol.signature)) generatedArms += 1;
          else authoredArms += 1;
        }
      }
    }
    expect(missing).toEqual([]);
    expect(compared).toBeGreaterThan(1000);
    expect(generatedArms).toBeGreaterThan(0);
    expect(authoredArms).toBeGreaterThan(0);
  });
});

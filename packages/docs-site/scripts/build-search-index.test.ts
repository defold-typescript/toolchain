import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ApiPageOptions } from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import {
  type CombinedSurface,
  combinedApiPages,
} from "@defold-typescript/docs-render/combined-surface";
import type { SearchRecord } from "@defold-typescript/docs-render/search-route";
import { buildSymbolIndex } from "@defold-typescript/docs-render/symbol-index";
import { apiVersionAxis } from "@defold-typescript/docs-render/toolchain-surface";
import {
  loadCombinedSurface,
  loadSignaturesArtifact,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import {
  resolveVersionWindow,
  windowCombinedSurface,
} from "@defold-typescript/docs-render/version-window";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import { libraryPageNames } from "../app/lib/__fixtures__/library-page-names";
import { renderedHeadingIds } from "../app/lib/__fixtures__/rendered-heading-ids";
import {
  HISTORICAL_ONLY_NAMESPACE,
  makeWindowedTypesDir,
} from "../app/lib/__fixtures__/windowed-surface";
import { renderGuidePage } from "../app/lib/content";
import { listGuidePages } from "../app/lib/guide-loader";
import { combinedSearchRecords } from "../app/lib/search-index";
import {
  type SearchIndexOutput,
  searchIndexFiles,
  searchIndexOutputs,
  versionRoutePages,
  writeSearchIndexes,
} from "./build-search-index";

const TYPES_DIR = join(import.meta.dir, "..", "..", "types");
const GUIDE_DIR = join(import.meta.dir, "..", "..", "docs", "guide");

describe("searchIndexOutputs", () => {
  let outputs: SearchIndexOutput[] = [];
  let files: string[] = [];
  let shared: SearchIndexOutput | undefined;
  beforeAll(async () => {
    outputs = await searchIndexOutputs();
    files = outputs.map((output) => output.file);
    shared = outputs.find((output) => output.file === "search-index.json");
  });

  test("emits the shared Combined search-index.json with canonical API routes", () => {
    expect(files).toContain("search-index.json");
    const apiRecords = shared?.records.filter((record) => record.route.startsWith("/api/")) ?? [];
    expect(apiRecords.length).toBeGreaterThan(0);
    // Combined engine records route canonically, never under the /api/combined compat prefix.
    for (const record of apiRecords) {
      expect(record.route.startsWith("/api/combined/")).toBe(false);
    }
  });

  test("keeps the version-independent reference pages in the shared index", () => {
    const sharedRoutes = new Set(shared?.records.map((record) => record.route));
    const versionIndependentRoutes = loadVersionIndependentPages(TYPES_DIR).map(
      (page) => page.route,
    );
    expect(versionIndependentRoutes.length).toBeGreaterThan(0);
    for (const route of versionIndependentRoutes) {
      expect(sharedRoutes.has(route)).toBe(true);
    }
  });

  test("no index offers a library page", () => {
    const libraryRoutes = new Set(libraryPageNames().map((name) => `/api/${name}`));
    expect(libraryRoutes.size).toBeGreaterThan(0);
    for (const { file, records } of outputs) {
      const offered = records
        .map((record) => record.route)
        .filter(
          (route) =>
            route.startsWith("/libraries") || libraryRoutes.has(route.split("#")[0] as string),
        );
      expect({ file, offered: offered.slice(0, 5) }).toEqual({ file, offered: [] });
    }
  });

  test("emits one prefixed file per tracked version, the current version included", () => {
    for (const version of versionsWithDiskFixtures(TYPES_DIR)) {
      expect(files).toContain(`search-index-${version.id}.json`);
    }
  });

  test("emits no search-index-combined.json", () => {
    expect(files).not.toContain("search-index-combined.json");
  });

  test("every version index carries the version-independent reference records at canonical /api/<ns> routes", () => {
    const sharedRoutes = loadVersionIndependentPages(TYPES_DIR).map((page) => page.route);
    expect(sharedRoutes.length).toBeGreaterThan(0);
    for (const version of versionsWithDiskFixtures(TYPES_DIR)) {
      const output = outputs.find((o) => o.file === `search-index-${version.id}.json`);
      expect(output).toBeDefined();
      const routes = new Set(output?.records.map((record) => record.route));
      for (const route of sharedRoutes) {
        // A version-independent route is canonical (`/api/<ns>`) and must appear
        // verbatim in the version index, never re-prefixed with the version id.
        expect(route.startsWith(`/api/${version.id}/`)).toBe(false);
        expect(routes.has(route)).toBe(true);
      }
    }
  });

  test("exact engine records stay version-prefixed and no shared route is version-prefixed", () => {
    const sharedRoutes = new Set(loadVersionIndependentPages(TYPES_DIR).map((page) => page.route));
    for (const version of versionsWithDiskFixtures(TYPES_DIR)) {
      const output = outputs.find((o) => o.file === `search-index-${version.id}.json`);
      const apiRecords = (output?.records ?? []).filter((r) => r.route.startsWith("/api/"));
      const prefixed = apiRecords.filter((r) => r.route.startsWith(`/api/${version.id}/`));
      expect(prefixed.length).toBeGreaterThan(0);
      // No version-independent (shared) route was re-emitted under the version prefix.
      for (const record of prefixed) {
        expect(sharedRoutes.has(record.route)).toBe(false);
      }
    }
  });
});

// The window (`?since=`) is a view over one surface, never a surface of its own,
// so the artifact set stays linear in tracked versions. Threading the window into
// the builder "for consistency" would multiply this set by the version count.
describe("searchIndexOutputs — the window is not an artifact dimension", () => {
  test("emits exactly one canonical index plus one per tracked version", async () => {
    const expected = [
      "search-index.json",
      ...versionsWithDiskFixtures(TYPES_DIR).map((version) => `search-index-${version.id}.json`),
    ].sort();
    const outputs = await searchIndexOutputs();
    expect(outputs.map((output) => output.file).sort()).toEqual(expected);
    // The release-readiness gate names the files without building their records.
    expect(searchIndexFiles().sort()).toEqual(expected);
  });
});

// The other half of that Non-Goal: a window must not narrow what the canonical
// artifact *contains* either. The expectation is the production record builder's
// own output over the full Combined projection — never a transcribed inventory —
// so the guard tracks whatever the builder emits.
const serializeRecord = (record: SearchRecord): string =>
  JSON.stringify([record.route, record.title, record.text]);

function missingCombinedRecords(
  records: readonly SearchRecord[],
  combined: CombinedSurface,
): SearchRecord[] {
  const present = new Set(records.map(serializeRecord));
  return combinedSearchRecords(combined).filter((record) => !present.has(serializeRecord(record)));
}

describe("searchIndexOutputs — the canonical index carries the full-range Combined surface", () => {
  let outputs: SearchIndexOutput[] = [];
  let canonical: SearchIndexOutput | undefined;
  beforeAll(async () => {
    outputs = await searchIndexOutputs();
    canonical = outputs.find((output) => output.file === "search-index.json");
  });

  test("every full-range Combined record appears verbatim in search-index.json", () => {
    const combined = loadCombinedSurface(TYPES_DIR);
    // Non-vacuity: the production builder really does produce engine records here.
    expect(combinedSearchRecords(combined).length).toBeGreaterThan(0);
    expect(missingCombinedRecords(canonical?.records ?? [], combined)).toEqual([]);
  });

  test("a canonical index narrowed to the newest version reds while its filenames stay identical", () => {
    const combined = loadCombinedSurface(TYPES_DIR);
    const newest = combined.versions[0] as string;
    const narrowedEngine = combinedSearchRecords(
      windowCombinedSurface(combined, loadSignaturesArtifact(TYPES_DIR), {
        from: newest,
        to: newest,
      }),
    );
    const fullEngine = new Set(combinedSearchRecords(combined).map(serializeRecord));
    const narrowedRecords = [
      ...(canonical?.records ?? []).filter((record) => !fullEngine.has(serializeRecord(record))),
      ...narrowedEngine,
    ];
    const mutated = outputs.map((output) =>
      output.file === "search-index.json"
        ? { file: output.file, records: narrowedRecords }
        : output,
    );

    // The emitted filename list is identical — exactly what the shipped
    // cardinality guard sees, and exactly why it stays green on this mutation.
    expect(mutated.map((output) => output.file)).toEqual(outputs.map((output) => output.file));
    expect(missingCombinedRecords(narrowedRecords, combined).length).toBeGreaterThan(0);
  });

  test("the canonical index keeps a namespace that exists at the oldest version alone", async () => {
    const dir = makeWindowedTypesDir();
    try {
      const fixtureCanonical = (await searchIndexOutputs({ typesDir: dir })).find(
        (output) => output.file === "search-index.json",
      );
      const routes = new Set(fixtureCanonical?.records.map((record) => record.route));
      expect(routes.has(`/api/${HISTORICAL_ONLY_NAMESPACE}`)).toBe(true);
      expect(
        missingCombinedRecords(fixtureCanonical?.records ?? [], loadCombinedSurface(dir)),
      ).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A search hit links to `<route>#<anchor>`, so every anchor an emitted record
// carries must be a heading id the page at that route renders. Each page renders
// with the options its `/api` route passes: an engine page with the Combined
// availability markers, any other shared reference page plainly. A guide page's
// ids are its table of contents from the same function its route renders.
describe("searchIndexOutputs — every anchored record lands on a rendered heading", () => {
  let outputs: SearchIndexOutput[] = [];
  const guideIds = new Map<string, Set<string>>();
  beforeAll(async () => {
    outputs = await searchIndexOutputs();
    for (const page of listGuidePages(GUIDE_DIR)) {
      const { toc } = await renderGuidePage(GUIDE_DIR, page);
      guideIds.set(page.route, new Set(toc.map((item) => item.url.replace(/^#/, ""))));
    }
  });
  const sharedPages = loadVersionIndependentPages(TYPES_DIR);
  const sharedRender = (page: ApiPage): [string, ApiPage, ApiPageOptions] => [page.route, page, {}];

  async function unrenderedAnchors(
    file: string,
    pages: [string, ApiPage, ApiPageOptions][],
    extraRecords: SearchRecord[] = [],
  ): Promise<{ checked: number; guideChecked: number; missing: string[] }> {
    const byRoute = new Map(pages.map(([route, page, opts]) => [route, { page, opts }]));
    const anchorsByRoute = new Map<string, string[]>();
    const records = outputs.find((output) => output.file === file)?.records ?? [];
    for (const record of [...records, ...extraRecords]) {
      const [route, anchor] = record.route.split("#");
      if (route === undefined || anchor === undefined) continue;
      anchorsByRoute.set(route, [...(anchorsByRoute.get(route) ?? []), anchor]);
    }
    const missing: string[] = [];
    let checked = 0;
    let guideChecked = 0;
    for (const [route, anchors] of anchorsByRoute) {
      const target = byRoute.get(route);
      const guide = guideIds.get(route);
      const ids = target
        ? await renderedHeadingIds(target.page, target.opts)
        : (guide ?? new Set<string>());
      for (const anchor of anchors) {
        checked += 1;
        if (guide && !target) guideChecked += 1;
        if (!ids.has(anchor)) missing.push(`${route}#${anchor}`);
      }
    }
    return { checked, guideChecked, missing };
  }

  test("search-index.json anchors resolve on the canonical and guide pages", async () => {
    const { checked, guideChecked, missing } = await unrenderedAnchors("search-index.json", [
      ...combinedApiPages(loadCombinedSurface(TYPES_DIR)).map(
        (page): [string, ApiPage, ApiPageOptions] => [page.route, page, { combinedMarkers: true }],
      ),
      ...sharedPages.map(sharedRender),
    ]);
    expect(checked).toBeGreaterThan(1000);
    expect(guideChecked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });

  test("a guide record whose anchor no heading of the page carries is reported", async () => {
    const stray = { route: "/build#no-such-heading", title: "Stray", text: "" };
    expect(guideIds.has("/build")).toBe(true);
    const { missing } = await unrenderedAnchors("search-index.json", [], [stray]);
    expect(missing).toContain(stray.route);
  });

  test("the newest version index's anchors resolve on that version's and the guide's pages", async () => {
    const newest = versionsWithDiskFixtures(TYPES_DIR)[0]?.id ?? "";
    const window = resolveVersionWindow(apiVersionAxis(TYPES_DIR), newest, null);
    if (!window) throw new Error(`${newest} is not a tracked version`);
    const { checked, guideChecked, missing } = await unrenderedAnchors(
      `search-index-${newest}.json`,
      [
        ...versionRoutePages(TYPES_DIR, newest).map((page): [string, ApiPage, ApiPageOptions] => [
          page.route,
          page,
          { combinedMarkers: true, window },
        ]),
        ...sharedPages.map(sharedRender),
      ],
    );
    expect(checked).toBeGreaterThan(1000);
    expect(guideChecked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});

// The other direction from the anchor gate above, which only checks records that
// exist: every member route the symbol index gives a tooltip or cross-link must
// also be a search hit. Pages are indexed one at a time so two pages sharing a
// qualified key never hide each other's route.
describe("searchIndexOutputs — every symbol-index member route is searchable", () => {
  let outputs: SearchIndexOutput[] = [];
  beforeAll(async () => {
    outputs = await searchIndexOutputs();
  });
  const sharedPages = loadVersionIndependentPages(TYPES_DIR);

  function unsearchableRoutes(
    file: string,
    pages: ApiPage[],
  ): { expected: number; missing: string[] } {
    const routes = new Set(
      outputs.find((output) => output.file === file)?.records.map((record) => record.route),
    );
    const expected = new Set(
      pages.flatMap((page) =>
        Object.values(buildSymbolIndex([page]))
          .map((entry) => entry.route)
          .filter((route) => route.includes("#")),
      ),
    );
    return {
      expected: expected.size,
      missing: [...expected].filter((route) => !routes.has(route)),
    };
  }

  test("search-index.json holds a record at every canonical member route", () => {
    const { expected, missing } = unsearchableRoutes("search-index.json", [
      ...combinedApiPages(loadCombinedSurface(TYPES_DIR)),
      ...sharedPages,
    ]);
    expect(expected).toBeGreaterThan(1000);
    expect(missing).toEqual([]);
  });

  test("every version index holds a record at every member route its pages render", () => {
    const versions = versionsWithDiskFixtures(TYPES_DIR);
    expect(versions.length).toBeGreaterThan(0);
    for (const { id } of versions) {
      const { expected, missing } = unsearchableRoutes(`search-index-${id}.json`, [
        ...versionRoutePages(TYPES_DIR, id),
        ...sharedPages,
      ]);
      expect(expected).toBeGreaterThan(1000);
      expect(missing).toEqual([]);
    }
  });
});

// The dialog downloads one written file and searches it in the browser, so each
// file must be a loadable export that answers with its own version's routes.
describe("writeSearchIndexes", () => {
  const dir = mkdtempSync(join(tmpdir(), "search-indexes-"));
  const written = writeSearchIndexes(dir);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("writes every file searchIndexOutputs names", async () => {
    const files = (await written).map((output) => output.file);
    expect(files).toEqual((await searchIndexOutputs()).map((output) => output.file));
    for (const file of files) expect(existsSync(join(dir, file))).toBe(true);
  });

  test("a version's file answers a member query with that version's route", async () => {
    const newest = versionsWithDiskFixtures(TYPES_DIR)[0]?.id ?? "";
    const file = `search-index-${newest}.json`;
    const member = (await written)
      .find((output) => output.file === file)
      ?.records.find((record) => record.title === "go.animate");
    const route = member?.route ?? "";
    expect(route.startsWith(`/api/${newest}/go#`)).toBe(true);

    const from = pathToFileURL(join(dir, file)).href;
    const results = await staticClient({ from }).search("go.animate");
    expect(results.map((result) => result.url)).toContain(route);
  });
});

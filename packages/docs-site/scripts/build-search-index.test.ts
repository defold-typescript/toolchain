import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  HISTORICAL_ONLY_NAMESPACE,
  makeWindowedTypesDir,
} from "../app/lib/__fixtures__/windowed-surface";
import {
  loadCombinedSurface,
  loadSignaturesArtifact,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "../app/lib/api-surface-loader";
import type { CombinedSurface } from "../app/lib/combined-surface";
import { combinedSearchRecords, type SearchRecord } from "../app/lib/search-index";
import { windowCombinedSurface } from "../app/lib/version-window";
import { searchIndexOutputs } from "./build-search-index";

const TYPES_DIR = join(import.meta.dir, "..", "..", "types");
const LIBRARY_TYPES_DIR = join(import.meta.dir, "..", "..", "library-types");

describe("searchIndexOutputs", () => {
  const outputs = searchIndexOutputs();
  const files = outputs.map((output) => output.file);
  const shared = outputs.find((output) => output.file === "search-index.json");

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
    const versionIndependentRoutes = loadVersionIndependentPages(TYPES_DIR, LIBRARY_TYPES_DIR).map(
      (page) => page.route,
    );
    expect(versionIndependentRoutes.length).toBeGreaterThan(0);
    for (const route of versionIndependentRoutes) {
      expect(sharedRoutes.has(route)).toBe(true);
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
    const sharedRoutes = loadVersionIndependentPages(TYPES_DIR, LIBRARY_TYPES_DIR).map(
      (page) => page.route,
    );
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
    const sharedRoutes = new Set(
      loadVersionIndependentPages(TYPES_DIR, LIBRARY_TYPES_DIR).map((page) => page.route),
    );
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
  test("emits exactly one canonical index plus one per tracked version", () => {
    const expected = [
      "search-index.json",
      ...versionsWithDiskFixtures(TYPES_DIR).map((version) => `search-index-${version.id}.json`),
    ];
    expect(
      searchIndexOutputs()
        .map((output) => output.file)
        .sort(),
    ).toEqual(expected.sort());
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
  const outputs = searchIndexOutputs();
  const canonical = outputs.find((output) => output.file === "search-index.json");

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

  test("the canonical index keeps a namespace that exists at the oldest version alone", () => {
    const dir = makeWindowedTypesDir();
    try {
      const fixtureCanonical = searchIndexOutputs({ typesDir: dir }).find(
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

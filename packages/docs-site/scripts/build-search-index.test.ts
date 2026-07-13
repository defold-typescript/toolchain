import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "../app/lib/api-surface-loader";
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
});

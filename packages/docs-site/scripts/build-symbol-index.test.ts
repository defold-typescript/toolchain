import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "../app/lib/api-surface-loader";
import { buildSymbolIndex } from "../app/lib/symbol-index";
import { symbolIndexOutputs } from "./build-symbol-index";

const TYPES_DIR = join(import.meta.dir, "..", "..", "types");
const LIBRARY_TYPES_DIR = join(import.meta.dir, "..", "..", "library-types");

describe("symbolIndexOutputs", () => {
  const outputs = symbolIndexOutputs();
  const files = outputs.map((output) => output.file);
  const shared = outputs.find((output) => output.file === "symbol-index.json");

  test("emits the shared Combined symbol-index.json with canonical routes", () => {
    expect(files).toContain("symbol-index.json");
    const entries = Object.values(shared?.index ?? {});
    expect(entries.length).toBeGreaterThan(0);
    // Every symbol routes canonically, never under the /api/combined compat prefix.
    for (const entry of entries) {
      expect(entry.route.startsWith("/api/")).toBe(true);
      expect(entry.route.startsWith("/api/combined/")).toBe(false);
    }
  });

  test("keeps the version-independent reference symbols in the shared index", () => {
    const versionIndependent = buildSymbolIndex(
      loadVersionIndependentPages(TYPES_DIR, LIBRARY_TYPES_DIR),
    );
    const keys = Object.keys(versionIndependent);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(shared?.index[key]).toBeDefined();
    }
  });

  test("emits one prefixed file per tracked version, the current version included", () => {
    for (const version of versionsWithDiskFixtures(TYPES_DIR)) {
      expect(files).toContain(`symbol-index-${version.id}.json`);
    }
  });

  test("emits no symbol-index-combined.json", () => {
    expect(files).not.toContain("symbol-index-combined.json");
  });

  test("every version index carries the shared reference symbols at canonical routes", () => {
    const sharedIndex = buildSymbolIndex(loadVersionIndependentPages(TYPES_DIR, LIBRARY_TYPES_DIR));
    const sharedKeys = Object.keys(sharedIndex);
    expect(sharedKeys.length).toBeGreaterThan(0);
    // Sanity anchors named by the step: a core value type and its member.
    expect(sharedIndex.Hash).toBeDefined();
    for (const version of versionsWithDiskFixtures(TYPES_DIR)) {
      const output = outputs.find((o) => o.file === `symbol-index-${version.id}.json`);
      expect(output).toBeDefined();
      for (const key of sharedKeys) {
        const entry = output?.index[key];
        expect(entry).toBeDefined();
        // The shared symbol keeps its canonical route, never a version prefix.
        expect(entry?.route).toBe(sharedIndex[key]?.route);
        expect(entry?.route.startsWith(`/api/${version.id}/`)).toBe(false);
      }
    }
  });

  test("exact engine symbols stay version-prefixed", () => {
    for (const version of versionsWithDiskFixtures(TYPES_DIR)) {
      const output = outputs.find((o) => o.file === `symbol-index-${version.id}.json`);
      const entries = Object.values(output?.index ?? {});
      const prefixed = entries.filter((entry) => entry.route.startsWith(`/api/${version.id}/`));
      expect(prefixed.length).toBeGreaterThan(0);
    }
  });
});

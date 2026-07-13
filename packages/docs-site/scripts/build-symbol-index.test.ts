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
});

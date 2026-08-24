import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  HISTORICAL_ONLY_SYMBOL,
  makeWindowedTypesDir,
} from "../app/lib/__fixtures__/windowed-surface";
import {
  loadCombinedSurface,
  loadSignaturesArtifact,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "../app/lib/api-surface-loader";
import type { CombinedSurface } from "../app/lib/combined-surface";
import {
  buildSymbolIndex,
  combinedSymbolIndexRecords,
  type SymbolEntry,
} from "../app/lib/symbol-index";
import { windowCombinedSurface } from "../app/lib/version-window";
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

// The counterpart of the search-index guard: the `?since=` window is a view, so
// the symbol-index artifact set stays one canonical file plus one per version.
describe("symbolIndexOutputs — the window is not an artifact dimension", () => {
  test("emits exactly one canonical index plus one per tracked version", () => {
    const expected = [
      "symbol-index.json",
      ...versionsWithDiskFixtures(TYPES_DIR).map((version) => `symbol-index-${version.id}.json`),
    ];
    expect(
      symbolIndexOutputs()
        .map((output) => output.file)
        .sort(),
    ).toEqual(expected.sort());
  });
});

// The content half of the same Non-Goal, mirroring the search guard: the
// expectation is `combinedSymbolIndexRecords` run over the full-range projection,
// so the guard follows the production builder rather than a transcribed symbol list.
function missingCombinedSymbols(
  index: Record<string, SymbolEntry>,
  combined: CombinedSurface,
): string[] {
  return Object.entries(combinedSymbolIndexRecords(combined))
    .filter(([key, entry]) => {
      const actual = index[key];
      return !actual || actual.route !== entry.route || actual.brief !== entry.brief;
    })
    .map(([key]) => key);
}

describe("symbolIndexOutputs — the canonical index carries the full-range Combined surface", () => {
  const outputs = symbolIndexOutputs();
  const canonical = outputs.find((output) => output.file === "symbol-index.json");

  test("every full-range Combined symbol appears verbatim in symbol-index.json", () => {
    const combined = loadCombinedSurface(TYPES_DIR);
    // Non-vacuity: the production builder really does produce engine symbols here.
    expect(Object.keys(combinedSymbolIndexRecords(combined)).length).toBeGreaterThan(0);
    expect(missingCombinedSymbols(canonical?.index ?? {}, combined)).toEqual([]);
  });

  test("a canonical index narrowed to the newest version reds while its filenames stay identical", () => {
    const combined = loadCombinedSurface(TYPES_DIR);
    const newest = combined.versions[0] as string;
    const narrowed = windowCombinedSurface(combined, loadSignaturesArtifact(TYPES_DIR), {
      from: newest,
      to: newest,
    });
    const fullEngine = combinedSymbolIndexRecords(combined);
    const narrowedIndex: Record<string, SymbolEntry> = {};
    for (const [key, entry] of Object.entries(canonical?.index ?? {})) {
      if (!fullEngine[key]) narrowedIndex[key] = entry;
    }
    Object.assign(narrowedIndex, combinedSymbolIndexRecords(narrowed));
    const mutated = outputs.map((output) =>
      output.file === "symbol-index.json" ? { file: output.file, index: narrowedIndex } : output,
    );

    // The emitted filename list is identical — exactly what the shipped
    // cardinality guard sees, and exactly why it stays green on this mutation.
    expect(mutated.map((output) => output.file)).toEqual(outputs.map((output) => output.file));
    expect(missingCombinedSymbols(narrowedIndex, combined).length).toBeGreaterThan(0);
  });

  test("the canonical index keeps a symbol that exists at the oldest version alone", () => {
    const dir = makeWindowedTypesDir();
    try {
      const fixtureCanonical = symbolIndexOutputs({ typesDir: dir }).find(
        (output) => output.file === "symbol-index.json",
      );
      expect(fixtureCanonical?.index[HISTORICAL_ONLY_SYMBOL]).toBeDefined();
      expect(
        missingCombinedSymbols(fixtureCanonical?.index ?? {}, loadCombinedSurface(dir)),
      ).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

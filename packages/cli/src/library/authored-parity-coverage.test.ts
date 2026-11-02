import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FlatLibraryTargets, writeLibraryTargets } from "../library-data-fixture";
import { PARITY_VERDICT_REASONS } from "./library-data";
import { LIBRARY_DATA_DIR } from "./package-root";
import { type AuthoredTarget, readAuthoredTargets } from "./sync-authored-types";

const DATA_DIR = LIBRARY_DATA_DIR;
const TARGETS = readAuthoredTargets(DATA_DIR);

const LEDGER: AuthoredTarget = {
  repo: "https://github.com/example/ledger",
  ref: "1.0.0",
  license: "MIT",
  authored: "fork/ledger.console.d.ts",
  moduleId: "ledger.console",
  namespace: "ledger",
  apiDoc: "api-doc/ledger.json",
  fidelity: "fidelity/ledger.json",
  upstreamLua: ["source/upstream/ledger/console.lua"],
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Entries as written, a malformed verdict included.
function writeConfig(forks: unknown[]): string {
  const root = mkdtempSync(join(tmpdir(), "authored-parity-coverage-"));
  roots.push(root);
  writeLibraryTargets(root, { forks: forks as NonNullable<FlatLibraryTargets["forks"]> });
  return root;
}

describe("every authored target declares a parity decision", () => {
  // The corpus now carries no verdict at all. The verdict side keeps its teeth through
  // the synthetic registries further down, which drive `readAuthoredTargets` directly.
  test("the corpus is non-trivial and wholly measured — no entry rests on an excuse", () => {
    expect(TARGETS.length).toBeGreaterThan(0);
    expect(TARGETS.filter((entry) => entry.upstreamLua.length > 0).length).toBe(TARGETS.length);
    expect(
      TARGETS.filter((entry) => entry.parityVerdict !== undefined).map((entry) => entry.moduleId),
    ).toEqual([]);
  });

  test("readAuthoredTargets rejects an entry declaring neither, naming it", () => {
    const root = writeConfig([{ ...LEDGER, upstreamLua: [] }]);
    expect(() => readAuthoredTargets(root)).toThrow(/ledger\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/parityVerdict/);
  });

  test("readAuthoredTargets rejects an entry declaring both, naming it", () => {
    const root = writeConfig([
      { ...LEDGER, parityVerdict: { reason: "no-module-file", note: "n/a" } },
    ]);
    expect(() => readAuthoredTargets(root)).toThrow(/ledger\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/both/);
  });
});

describe("a parity verdict is a chosen category, not free prose", () => {
  test("an unknown reason throws, naming the entry and the reason", () => {
    const root = writeConfig([
      { ...LEDGER, upstreamLua: [], parityVerdict: { reason: "too-hard", note: "later" } },
    ]);
    expect(() => readAuthoredTargets(root)).toThrow(/ledger\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/too-hard/);
  });

  test("an empty note throws, so the escape hatch cannot be silent", () => {
    const root = writeConfig([
      { ...LEDGER, upstreamLua: [], parityVerdict: { reason: "no-module-file", note: "  " } },
    ]);
    expect(() => readAuthoredTargets(root)).toThrow(/ledger\.console/);
    expect(() => readAuthoredTargets(root)).toThrow(/note/);
  });

  test("the vocabulary is exactly the three recorded reasons", () => {
    expect([...PARITY_VERDICT_REASONS].sort()).toEqual([
      "no-module-file",
      "unparseable-shape",
      "unresolved-path",
    ]);
  });
});

describe("the concrete targets whose excuses the survey retired", () => {
  // The reason the corpus now carries no verdict at all: `starly.starly` was the last
  // target holding one, and it was dropped rather than measured — its upstream and its
  // author's account are both gone, and the only surviving copy is an unaffiliated
  // third-party mirror. A registry that names it again would be shipping types for a
  // library nobody can obtain.
  test("`unresolved-path` survives with no corpus user, its one holder having been dropped", () => {
    expect(PARITY_VERDICT_REASONS).toContain("unresolved-path");
    expect(TARGETS.map((entry) => entry.namespace)).not.toContain("starly");
    expect(
      TARGETS.filter((entry) => entry.parityVerdict?.reason === "unresolved-path").map(
        (entry) => entry.moduleId,
      ),
    ).toEqual([]);
  });

  test("`unparseable-shape` survives with no corpus user, now describing a refused metatable", () => {
    expect(PARITY_VERDICT_REASONS).toContain("unparseable-shape");
    expect(
      TARGETS.filter((entry) => entry.parityVerdict?.reason === "unparseable-shape").map(
        (entry) => entry.moduleId,
      ),
    ).toEqual([]);
  });
});

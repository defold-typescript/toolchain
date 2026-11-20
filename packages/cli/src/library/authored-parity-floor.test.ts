import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_DATA_DIR, writeLibraryTargets } from "../library-data-fixture";
import {
  authoredFloorRegressions,
  authoredParityPath,
  authoredParityTargets,
  buildAuthoredParity,
  collectAuthoredParity,
  renderAuthoredParity,
} from "./authored-parity";
import { readLibraryData } from "./library-data";
import { parityFloorsByReport } from "./library-floors";
import {
  buildNativeParity,
  NATIVE_PARITY_DIR,
  nativeParityPath,
  renderNativeParity,
} from "./native-parity";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { readNativeTargets } from "./sync-native-types";

const PARITY_DIR = "fidelity/authored";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "authored-parity-"));
  roots.push(root);
  return root;
}

/** A package root holding one parity report under `dir`, so each case exercises the
 * collector over the JSON a regenerated report would write rather than over an
 * artifact the test hands `authoredFloorRegressions` directly. */
function reportRoot(dir: string, report: Record<string, unknown>): string {
  const root = tempRoot();
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, "x.json"), JSON.stringify(report));
  return root;
}

describe("the authored-lane surface-parity ratchet", () => {
  // Listed out of key order, so only the sort can put the floors in key order.
  test("the floors read back sorted by artifact", () => {
    const root = tempRoot();
    writeLibraryTargets(root, {
      forks: ["zeta", "alpha"].map((name) => ({
        repo: "https://github.com/example/ordering",
        ref: "1.0.0",
        authored: `fork/${name}.${name}.d.ts`,
        moduleId: `${name}.${name}`,
        namespace: name,
        apiDoc: `api-doc/${name}.json`,
        upstreamLua: [`source/upstream/${name}.lua`],
      })),
      floors: {
        "github.com/example/ordering": {
          "zeta.zeta": { callable: 1, field: 1 },
          "alpha.alpha": { callable: 0.5, field: 0.25 },
        },
      },
    });
    const floors = parityFloorsByReport(readLibraryData(root));
    expect(Object.keys(floors)).toEqual([`${PARITY_DIR}/alpha.json`, `${PARITY_DIR}/zeta.json`]);
    expect(floors).toEqual({
      [`${PARITY_DIR}/alpha.json`]: { callable: 0.5, field: 0.25 },
      [`${PARITY_DIR}/zeta.json`]: { callable: 1, field: 1 },
    });
  });
});

describe("every committed floor covers both axes", () => {
  test("each artifact's floor parses into two axes", () => {
    expect(parityFloorsByReport(readLibraryData(FIXTURE_DATA_DIR))).toEqual({
      [`${PARITY_DIR}/tally.json`]: { callable: 1, field: 1 },
      [`${NATIVE_PARITY_DIR}/stamp.json`]: { callable: 1, field: 1 },
    });
  });
});

describe("the two-axis ratchet reports each axis on its own", () => {
  const floors = { "fidelity/authored/x.json": { callable: 0.8, field: 0.5 } };
  const artifact = (callableCoverage: number, fieldCoverage: number) => ({
    "fidelity/authored/x.json": { namespace: "x", callableCoverage, fieldCoverage },
  });

  test("a drop on either axis reds, and the message names the axis and both numbers", () => {
    const callable = authoredFloorRegressions(artifact(0.7, 1), floors);
    expect(callable.length).toBe(1);
    expect(callable[0]).toContain("x");
    expect(callable[0]).toContain("callable");
    expect(callable[0]).toContain("0.7");
    expect(callable[0]).toContain("0.8");
    expect(callable[0]).toContain("correct the fork");

    const field = authoredFloorRegressions(artifact(1, 0.25), floors);
    expect(field.length).toBe(1);
    expect(field[0]).toContain("field");
    expect(field[0]).toContain("0.25");
    expect(field[0]).toContain("0.5");
  });

  test("both axes are reported when both drop, so one cannot mask the other", () => {
    expect(authoredFloorRegressions(artifact(0.1, 0.1), floors).length).toBe(2);
  });

  test("meeting a floor exactly is not a regression", () => {
    expect(authoredFloorRegressions(artifact(0.8, 0.5), floors)).toEqual([]);
  });

  test("an arity mismatch reds at full coverage, naming the member and both remedies", () => {
    const path = "fidelity/native/x.json";
    const regressions = authoredFloorRegressions(
      {
        [path]: {
          namespace: "x",
          callableCoverage: 1,
          fieldCoverage: 1,
          arityMismatches: [{ name: "image" }],
        },
      },
      { [path]: { callable: 1, field: 1 } },
    );
    expect(regressions.length).toBe(1);
    expect(regressions[0]).toContain("x.image");
    expect(regressions[0]).toContain("correct the declaration");
    expect(regressions[0]).toContain("record why upstream is wrong");
  });

  test("an unmeasured arity axis reds nothing, an absent list being no claim", () => {
    const path = "fidelity/native/x.json";
    expect(
      authoredFloorRegressions(
        { [path]: { namespace: "x", callableCoverage: 1, fieldCoverage: 1 } },
        { [path]: { callable: 1, field: 1 } },
      ),
    ).toEqual([]);
  });

  test("a native report whose namespace is not the registered module name reds at full coverage", () => {
    const path = "fidelity/native/uuid.json";
    const regressions = authoredFloorRegressions(
      {
        [path]: {
          namespace: "uuid",
          callableCoverage: 1,
          fieldCoverage: 1,
          moduleNameMatches: false,
        },
      },
      { [path]: { callable: 1, field: 1 } },
    );
    expect(regressions.length).toBe(1);
    expect(regressions[0]).toContain("uuid");
    expect(regressions[0]).toContain("module name");
  });
});

describe("the collector carries the arity axis a measured report declares", () => {
  const KEY = `${NATIVE_PARITY_DIR}/x.json`;
  const FULL_FLOOR = { [KEY]: { callable: 1, field: 1 } };

  function nativeReport(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      namespace: "x",
      callableCoverage: 1,
      fieldCoverage: 1,
      moduleNameMatches: true,
      ...extra,
    };
  }

  test("a measured mismatch reaches the ratchet, naming the member", () => {
    const root = reportRoot(
      NATIVE_PARITY_DIR,
      nativeReport({
        arityMeasured: true,
        arityMismatches: [{ name: "image", upstream: 3, declared: 1 }],
      }),
    );
    const artifacts = collectAuthoredParity(root, NATIVE_PARITY_DIR);
    expect(artifacts[KEY]?.arityMismatches).toEqual([{ name: "image" }]);

    const regressions = authoredFloorRegressions(artifacts, FULL_FLOOR);
    expect(regressions.length).toBe(1);
    expect(regressions[0]).toContain("x.image");
  });

  test("an unmeasured axis carries no list, so `false` cannot read as agreement", () => {
    const root = reportRoot(NATIVE_PARITY_DIR, nativeReport({ arityMeasured: false }));
    const artifacts = collectAuthoredParity(root, NATIVE_PARITY_DIR);
    expect(artifacts[KEY]?.arityMismatches).toBeUndefined();
    expect(authoredFloorRegressions(artifacts, FULL_FLOOR)).toEqual([]);
  });

  test("a measured axis whose list is absent or malformed throws, naming the artifact", () => {
    const malformed: Record<string, unknown>[] = [
      { arityMeasured: "true", arityMismatches: [] },
      { arityMeasured: true },
      { arityMeasured: true, arityMismatches: "image" },
      { arityMeasured: true, arityMismatches: [{ upstream: 3, declared: 1 }] },
      { arityMeasured: true, arityMismatches: [{ name: "", upstream: 3, declared: 1 }] },
      { arityMeasured: true, arityMismatches: [null] },
    ];
    for (const extra of malformed) {
      const root = reportRoot(NATIVE_PARITY_DIR, nativeReport(extra));
      expect(() => collectAuthoredParity(root, NATIVE_PARITY_DIR)).toThrow(
        /fidelity\/native\/x\.json/,
      );
    }
  });

  test("an authored-lane report declaring no measurement keeps floor-based charging", () => {
    const key = `${PARITY_DIR}/x.json`;
    const root = reportRoot(PARITY_DIR, {
      namespace: "x",
      callableCoverage: 1,
      fieldCoverage: 1,
      arityMismatches: [{ name: "f", upstream: 2, declared: 1 }],
    });
    const artifacts = collectAuthoredParity(root, PARITY_DIR);
    expect(artifacts[key]?.arityMismatches).toBeUndefined();
    expect(authoredFloorRegressions(artifacts, { [key]: { callable: 1, field: 1 } })).toEqual([]);
  });
});

describe("a collected artifact carries both coverage keys", () => {
  test("a renamed or absent axis key cannot read as undefined and compare nothing", () => {
    for (const report of [
      { namespace: "x", fieldCoverage: 1 },
      { namespace: "x", callableCoverage: 1 },
      { namespace: "x", coverage: 1 },
      { namespace: "x", callableCoverage: "1", fieldCoverage: 1 },
    ]) {
      const root = reportRoot(PARITY_DIR, report);
      expect(() => collectAuthoredParity(root, PARITY_DIR)).toThrow(/fidelity\/authored\/x\.json/);
    }
    const root = reportRoot(PARITY_DIR, {
      namespace: "x",
      callableCoverage: 1,
      fieldCoverage: 0.5,
    });
    expect(collectAuthoredParity(root, PARITY_DIR)).toEqual({
      [`${PARITY_DIR}/x.json`]: { namespace: "x", callableCoverage: 1, fieldCoverage: 0.5 },
    });
  });
});

const DATA_DIR = LIBRARY_DATA_DIR;
const PARITY_REMEDY =
  "Re-run `bun run --cwd packages/library-types parity`, then review the coverage change before committing the report.";

/** One message per committed report that is missing or differs from `fresh`, the
 * report a measurement of the current tree writes. */
function staleReports(reports: ReadonlyArray<{ path: string; fresh: string }>): string[] {
  return reports.flatMap(({ path, fresh }) => {
    const file = join(LIBRARY_TYPES_ROOT, path);
    if (!existsSync(file)) return [`${path} is missing. ${PARITY_REMEDY}`];
    if (readFileSync(file, "utf8") === fresh) return [];
    return [`${path} does not match a fresh measurement of the current tree. ${PARITY_REMEDY}`];
  });
}

describe("the committed parity reports", () => {
  test("every committed authored parity report matches a fresh measurement", () => {
    const targets = authoredParityTargets(DATA_DIR);
    expect(targets.length).toBeGreaterThan(0);
    const reports = targets.map((target) => ({
      path: authoredParityPath(target),
      fresh: renderAuthoredParity(buildAuthoredParity(DATA_DIR, target)),
    }));
    expect(staleReports(reports)).toEqual([]);
  });

  test("every committed native parity report matches a fresh measurement", () => {
    const targets = readNativeTargets(DATA_DIR);
    expect(targets.length).toBeGreaterThan(0);
    const reports = targets.map((target) => ({
      path: nativeParityPath(target),
      fresh: renderNativeParity(buildNativeParity(DATA_DIR, target)),
    }));
    expect(staleReports(reports)).toEqual([]);
  });
});

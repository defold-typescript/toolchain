import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeLibraryTargets } from "../library-data-fixture";
import {
  AUTHORED_PARITY_DIRNAME,
  collectFidelityReports,
  type FidelityFloorReport,
  FLOOR_MANIFEST_FILE,
  LANE_FLOOR_RAISE_COMMAND,
  NATIVE_PARITY_DIRNAME,
  parseFloors,
  raiseCommittedFloors,
  raiseFloors,
  raiseLaneFloors,
  readFloors,
  tokenFloors,
} from "./fidelity-floor";
import { LANE_EVALUATIONS_ROOT } from "./lane-evaluations";

const TOKEN_REPORT = { coverage: 1, totalMembers: 1, totalTypeTokens: 1 };
// A surface-parity report has no type tokens, so the token walk could not read it.
const PARITY_REPORT = { namespace: "tally", callableCoverage: 1, fieldCoverage: 1 };

function writeReportRoot(parityDir: string): string {
  const root = mkdtempSync(join(tmpdir(), "fidelity-floor-walk-"));
  const reports = {
    "glow.json": TOKEN_REPORT,
    "openapi/beacon.json": TOKEN_REPORT,
    [`${parityDir}/tally.json`]: PARITY_REPORT,
  };
  for (const [rel, report] of Object.entries(reports)) {
    const path = join(root, "fidelity", rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report));
  }
  return root;
}

describe("fidelity floor gate: the two halves", () => {
  test("the lane walk reaches the nested openapi evaluation", () => {
    expect(
      collectFidelityReports(LANE_EVALUATIONS_ROOT)["fidelity/openapi/nakama.nakama.json"],
    ).toBeDefined();
  });

  test("the surface-parity lane is carved out, so the two denominators stay apart", () => {
    const root = writeReportRoot(AUTHORED_PARITY_DIRNAME);
    try {
      // `fidelity/authored/` coverage is upstream members declared at the right
      // arity, not type tokens — the parity floors in `library.json` ratchet it.
      expect(Object.keys(collectFidelityReports(root))).toEqual([
        "fidelity/glow.json",
        "fidelity/openapi/beacon.json",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the native surface-parity lane is carved out too", () => {
    const root = writeReportRoot(NATIVE_PARITY_DIRNAME);
    try {
      expect(Object.keys(collectFidelityReports(root))).toEqual([
        "fidelity/glow.json",
        "fidelity/openapi/beacon.json",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the manifest holds only the lanes with no library folder", () => {
    const evaluated = ["markdown-targets.json", "openapi-targets.json"].flatMap((file) => {
      const { targets } = JSON.parse(readFileSync(join(LANE_EVALUATIONS_ROOT, file), "utf8")) as {
        targets: { fidelity: string }[];
      };
      return targets.map(({ fidelity }) => fidelity);
    });
    expect(Object.keys(readFloors(LANE_EVALUATIONS_ROOT))).toEqual(evaluated.sort());
  });
});

describe("fidelity floor gate: lane evaluations", () => {
  const reports = collectFidelityReports(LANE_EVALUATIONS_ROOT);
  const floors = readFloors(LANE_EVALUATIONS_ROOT);

  test("every committed fidelity report has a floor entry", () => {
    const missing = Object.keys(reports)
      .filter((path) => floors[path] === undefined)
      .map((path) => `${path}: no floor entry — run \`${LANE_FLOOR_RAISE_COMMAND}\``);
    expect(missing).toEqual([]);
  });

  test("every floor entry names a report that exists", () => {
    const stale = Object.keys(floors)
      .filter((path) => reports[path] === undefined)
      .map(
        (path) => `${path}: floor entry has no such report — drop the key from where it is kept`,
      );
    expect(stale).toEqual([]);
  });

  test("no report's coverage sits below its floor", () => {
    const regressions = Object.entries(reports)
      .filter(([path, report]) => {
        const floor = floors[path];
        return floor !== undefined && report.coverage < floor;
      })
      .map(
        ([path, report]) =>
          `${path}: coverage ${report.coverage} is below its floor ${floors[path]} — fix the regression, do not lower the floor`,
      );
    expect(regressions).toEqual([]);
  });

  test("every committed report has members and type tokens", () => {
    const empty = Object.entries(reports)
      .filter(([, report]) => report.totalMembers <= 0 || report.totalTypeTokens <= 0)
      .map(
        ([path, report]) =>
          `${path}: totalMembers ${report.totalMembers}, totalTypeTokens ${report.totalTypeTokens} — both must be greater than 0`,
      );
    expect(empty).toEqual([]);
  });

  test("the floors' keys are sorted and their values are ratios", () => {
    const keys = Object.keys(floors);
    expect(keys).toEqual([...keys].sort());
    const outOfRange = Object.entries(floors)
      .filter(
        ([, floor]) =>
          typeof floor !== "number" || !Number.isFinite(floor) || floor < 0 || floor > 1,
      )
      .map(([path, floor]) => `${path}: floor ${floor} is outside [0, 1]`);
    expect(outOfRange).toEqual([]);
  });
});

describe("parseFloors", () => {
  const MANIFEST = "fidelity-floor.json";

  test("a valid manifest round-trips", () => {
    const raw = { "fidelity/a.json": 0.962, "fidelity/b.json": 1 };
    expect(parseFloors(raw, MANIFEST)).toEqual(raw);
  });

  test("the range is inclusive at both ends", () => {
    expect(parseFloors({ "fidelity/a.json": 0, "fidelity/b.json": 1 }, MANIFEST)).toEqual({
      "fidelity/a.json": 0,
      "fidelity/b.json": 1,
    });
  });

  test("a null floor is rejected, naming the manifest, the key and the value", () => {
    expect(() => parseFloors({ "fidelity/a.json": null }, MANIFEST)).toThrow(
      `${MANIFEST}: floor "fidelity/a.json" must be a finite number in [0, 1], got null`,
    );
  });

  test("a false floor is rejected", () => {
    expect(() => parseFloors({ "fidelity/a.json": false }, MANIFEST)).toThrow(
      `${MANIFEST}: floor "fidelity/a.json" must be a finite number in [0, 1], got false`,
    );
  });

  test("a numerically-coercible string is still not a number", () => {
    expect(() => parseFloors({ "fidelity/a.json": "0.9" }, MANIFEST)).toThrow(
      `${MANIFEST}: floor "fidelity/a.json" must be a finite number in [0, 1], got "0.9"`,
    );
  });

  test("NaN is rejected and reads as NaN, not null", () => {
    expect(() => parseFloors({ "fidelity/a.json": Number.NaN }, MANIFEST)).toThrow(
      `${MANIFEST}: floor "fidelity/a.json" must be a finite number in [0, 1], got NaN`,
    );
  });

  test("Infinity is rejected and reads as Infinity", () => {
    expect(() => parseFloors({ "fidelity/a.json": Number.POSITIVE_INFINITY }, MANIFEST)).toThrow(
      `${MANIFEST}: floor "fidelity/a.json" must be a finite number in [0, 1], got Infinity`,
    );
  });

  test("a floor below 0 is rejected, with the value in the message", () => {
    expect(() => parseFloors({ "fidelity/a.json": -0.1 }, MANIFEST)).toThrow(
      `${MANIFEST}: floor "fidelity/a.json" must be a finite number in [0, 1], got -0.1`,
    );
  });

  test("a floor above 1 is rejected, with the value in the message", () => {
    expect(() => parseFloors({ "fidelity/a.json": 1.1 }, MANIFEST)).toThrow(
      `${MANIFEST}: floor "fidelity/a.json" must be a finite number in [0, 1], got 1.1`,
    );
  });

  test("a non-object root is rejected, naming the manifest", () => {
    // An array is `typeof "object"`, so it needs its own check.
    for (const root of [[], null, "x", 42]) {
      expect(() => parseFloors(root, MANIFEST)).toThrow(
        `${MANIFEST}: expected a JSON object of floors`,
      );
    }
  });
});

describe("readFloors", () => {
  test("a root with no manifest returns an empty manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "fidelity-floor-"));
    try {
      expect(readFloors(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a malformed committed manifest throws, so the --raise path cannot reach it", () => {
    const dir = mkdtempSync(join(tmpdir(), "fidelity-floor-"));
    try {
      writeFileSync(join(dir, FLOOR_MANIFEST_FILE), '{"fidelity/a.json": null}');
      expect(() => readFloors(dir)).toThrow(
        `${FLOOR_MANIFEST_FILE}: floor "fidelity/a.json" must be a finite number in [0, 1], got null`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("raiseFloors", () => {
  const report = (coverage: number): FidelityFloorReport => ({
    coverage,
    totalMembers: 1,
    totalTypeTokens: 1,
  });

  test("an improved report raises its floor", () => {
    expect(raiseFloors({ "fidelity/a.json": 0.9 }, { "fidelity/a.json": report(0.95) })).toEqual({
      "fidelity/a.json": 0.95,
    });
  });

  test("a regressed report does not lower its floor", () => {
    expect(raiseFloors({ "fidelity/a.json": 0.9 }, { "fidelity/a.json": report(0.8) })).toEqual({
      "fidelity/a.json": 0.9,
    });
  });

  test("a report with no floor entry gains one at its current coverage", () => {
    expect(raiseFloors({}, { "fidelity/a.json": report(0.42) })).toEqual({
      "fidelity/a.json": 0.42,
    });
  });

  test("a floor entry whose report is gone is dropped", () => {
    expect(
      raiseFloors(
        { "fidelity/gone.json": 1, "fidelity/a.json": 0.5 },
        { "fidelity/a.json": report(0.5) },
      ),
    ).toEqual({ "fidelity/a.json": 0.5 });
  });

  test("output keys are sorted", () => {
    const out = raiseFloors(
      {},
      {
        "fidelity/z.json": report(1),
        "fidelity/a.json": report(1),
        "fidelity/openapi/m.json": report(1),
      },
    );
    expect(Object.keys(out)).toEqual([
      "fidelity/a.json",
      "fidelity/openapi/m.json",
      "fidelity/z.json",
    ]);
  });
});

describe("raiseCommittedFloors", () => {
  function writeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "fidelity-floor-"));
    writeLibraryTargets(join(root, "data", "0.1.0"), {
      luals: [
        {
          repo: "https://github.com/owner/lib",
          ref: "v1",
          sourceGlobs: ["lib/**/*.lua"],
          moduleId: "lib.main",
          namespace: "lib",
        },
      ],
      forks: [
        {
          repo: "https://github.com/owner/lib",
          ref: "v1",
          authored: "fork/lib.fork.d.ts",
          moduleId: "lib.fork",
          namespace: "lib.fork",
          apiDoc: "api-doc/lib.fork.json",
          upstreamLua: ["source/upstream/fork.lua"],
        },
      ],
      floors: { "owner/lib": { "lib.fork": { callable: 0.5, field: 1 }, "lib.main": 0.5 } },
    });
    mkdirSync(join(root, "fidelity", "openapi"), { recursive: true });
    const report = (coverage: number) =>
      JSON.stringify({ coverage, totalMembers: 1, totalTypeTokens: 1 });
    writeFileSync(join(root, "fidelity", "lib.json"), report(0.75));
    writeFileSync(join(root, "fidelity", "openapi", "lib.json"), report(0.25));
    return root;
  }

  test("a served module's floor rises in its library.json and no manifest is written", () => {
    const root = writeRoot();
    try {
      const log = raiseCommittedFloors(join(root, "data", "0.1.0"), root);

      const library = JSON.parse(
        readFileSync(join(root, "data", "0.1.0", "owner/lib", "library.json"), "utf8"),
      );
      expect(library.repo).toBe("https://github.com/owner/lib");
      expect(library.forks).toHaveLength(1);
      expect(library.floors).toEqual({
        "lib.fork": { callable: 0.5, field: 1 },
        "lib.main": 0.75,
      });
      expect(existsSync(join(root, FLOOR_MANIFEST_FILE))).toBe(false);
      expect(log).toContain("fidelity/lib.json: 0.5 -> 0.75");
      expect(log).toContain(
        "fidelity/openapi/lib.json: no library measures this report, so it has no floor",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a regressed report leaves its floor where it is", () => {
    const root = writeRoot();
    try {
      writeFileSync(
        join(root, "fidelity", "lib.json"),
        JSON.stringify({ coverage: 0.25, totalMembers: 1, totalTypeTokens: 1 }),
      );
      raiseCommittedFloors(join(root, "data", "0.1.0"), root);

      expect(tokenFloors(join(root, "data", "0.1.0"))["fidelity/lib.json"]).toBe(0.5);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("raiseLaneFloors", () => {
  test("a lane report gains a floor in the manifest, and an unchanged run writes nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "fidelity-floor-lanes-"));
    try {
      mkdirSync(join(root, "fidelity", "openapi"), { recursive: true });
      writeFileSync(
        join(root, "fidelity", "openapi", "lib.json"),
        JSON.stringify({ coverage: 0.25, totalMembers: 1, totalTypeTokens: 1 }),
      );
      const log = raiseLaneFloors(root);

      expect(readFloors(root)).toEqual({ "fidelity/openapi/lib.json": 0.25 });
      expect(log).toContain("fidelity/openapi/lib.json: (new) -> 0.25");
      writeFileSync(join(root, FLOOR_MANIFEST_FILE), '{ "fidelity/openapi/lib.json": 0.25 }');
      expect(raiseLaneFloors(root)).toEqual([]);
      expect(readFileSync(join(root, FLOOR_MANIFEST_FILE), "utf8")).toBe(
        '{ "fidelity/openapi/lib.json": 0.25 }',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

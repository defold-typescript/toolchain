import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  collectFidelityReports,
  type FidelityFloorReport,
  FLOOR_RAISE_COMMAND,
  raiseFloors,
  readFloors,
} from "./fidelity-floor";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

describe("fidelity floor gate", () => {
  const reports = collectFidelityReports(PACKAGE_ROOT);
  const floors = readFloors(PACKAGE_ROOT);

  test("the walk reaches every lane, including the nested openapi one", () => {
    // Without this the whole gate passes vacuously on a walk that descends nowhere.
    expect(Object.keys(reports).length).toBeGreaterThan(0);
    expect(reports["fidelity/openapi/nakama.nakama.json"]).toBeDefined();
  });

  test("every committed fidelity report has a floor entry", () => {
    const missing = Object.keys(reports)
      .filter((path) => floors[path] === undefined)
      .map((path) => `${path}: no floor entry — run \`${FLOOR_RAISE_COMMAND}\``);
    expect(missing).toEqual([]);
  });

  test("every floor entry names a report that exists", () => {
    const stale = Object.keys(floors)
      .filter((path) => reports[path] === undefined)
      .map(
        (path) => `${path}: floor entry has no such report — drop the key from fidelity-floor.json`,
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

  test("the manifest's keys are sorted and its values are ratios", () => {
    const keys = Object.keys(floors);
    expect(keys).toEqual([...keys].sort());
    const outOfRange = Object.entries(floors)
      .filter(([, floor]) => !(floor >= 0 && floor <= 1))
      .map(([path, floor]) => `${path}: floor ${floor} is outside [0, 1]`);
    expect(outOfRange).toEqual([]);
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

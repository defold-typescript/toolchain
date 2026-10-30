// Coverage floors sit in each library's `library.json`. `library check` measures each
// module from the library's own inputs and compares it with its floor, with no committed
// report in the way, so a data folder is judged by nothing outside it. The two
// `*ByReport` views key the same floors by the committed report each one judges, for
// the gates and tools that read those reports in this repo.

import {
  type AuthoredCoverage,
  authoredFloorRegressions,
  authoredParityPath,
  buildAuthoredParity,
} from "./authored-parity";
import type { LibraryProblem } from "./library-check";
import type { AuthoredFloor, LibraryData } from "./library-data";
import { buildNativeParity, nativeParityPath } from "./native-parity";
import { buildTargetFidelity, lualsFidelityPath } from "./sync-luals-types";
import { buildScriptApiFidelity } from "./sync-script-api-types";

/** One module's coverage: a token ratio, a parity pair, or why it could not be measured. */
export type ModuleMeasure =
  | { moduleId: string; ratio: number }
  | { moduleId: string; parity: AuthoredCoverage }
  | { moduleId: string; failure: string };

async function measured(
  moduleId: string,
  measure: () => number | AuthoredCoverage | Promise<number | AuthoredCoverage>,
): Promise<ModuleMeasure> {
  try {
    const value = await measure();
    return typeof value === "number" ? { moduleId, ratio: value } : { moduleId, parity: value };
  } catch (error) {
    return { moduleId, failure: error instanceof Error ? error.message : String(error) };
  }
}

/** Every module the library measures, in lane order. A fork that records a parity
 * verdict vendors no upstream to measure against, so it has no measure. */
export async function measureLibraryCoverage(
  dataDir: string,
  library: LibraryData,
): Promise<ModuleMeasure[]> {
  return Promise.all([
    ...library.luals.map((target) =>
      measured(target.moduleId, () => buildTargetFidelity(dataDir, target).coverage),
    ),
    ...library.scriptApi.map((target) =>
      measured(
        target.moduleId,
        async () => (await buildScriptApiFidelity(dataDir, target)).coverage,
      ),
    ),
    ...library.authored
      .filter((target) => target.upstreamLua.length > 0)
      .map((target) =>
        measured(target.moduleId, () => {
          const report = buildAuthoredParity(dataDir, target, library.parityExceptions);
          return {
            namespace: target.moduleId,
            callableCoverage: report.callableCoverage,
            fieldCoverage: report.fieldCoverage,
          };
        }),
      ),
    ...library.native.map((target) =>
      measured(target.namespace, () => {
        const report = buildNativeParity(dataDir, target);
        return {
          namespace: target.namespace,
          callableCoverage: report.callableCoverage,
          fieldCoverage: report.fieldCoverage,
          moduleNameMatches: report.moduleNameMatches,
          ...(report.arityMeasured ? { arityMismatches: report.arityMismatches ?? [] } : {}),
        };
      }),
    ),
  ]);
}

function describeMeasure(measure: { ratio: number } | { parity: AuthoredCoverage }): string {
  return "ratio" in measure
    ? `${measure.ratio}`
    : `callable ${measure.parity.callableCoverage}, field ${measure.parity.fieldCoverage}`;
}

/** Every measure below its floor, every module with no floor, and every module that
 * could not be measured, as problems of `library`. */
export function floorProblems(library: LibraryData, measures: ModuleMeasure[]): LibraryProblem[] {
  const problem = (message: string): LibraryProblem => ({
    library: library.dir,
    check: "floor",
    message,
  });
  return measures.flatMap((measure): LibraryProblem[] => {
    const { moduleId } = measure;
    if ("failure" in measure) return [problem(`${moduleId}: ${measure.failure}`)];
    const floor = library.floors[moduleId];
    if (floor === undefined) {
      return [
        problem(
          `${moduleId}: no coverage floor — add one to floors in library.json at its measured ${describeMeasure(measure)}`,
        ),
      ];
    }
    if ("parity" in measure) {
      return authoredFloorRegressions(
        { [moduleId]: measure.parity },
        { [moduleId]: floor as AuthoredFloor },
      ).map(problem);
    }
    return measure.ratio < (floor as number)
      ? [
          problem(
            `${moduleId}: coverage ${measure.ratio} is below its floor ${floor} — fix the regression, do not lower the floor`,
          ),
        ]
      : [];
  });
}

export function sortedByKey<Value>(entries: [string, Value][]): Record<string, Value> {
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Each module with a token floor, as `[report path, module id]`. */
export function tokenReportPaths(library: LibraryData): [string, string][] {
  return [
    ...library.luals.map((target): [string, string] => [
      lualsFidelityPath(target),
      target.moduleId,
    ]),
    ...library.scriptApi.map((target): [string, string] => [target.fidelity, target.moduleId]),
  ];
}

/** The libraries' token floors, by the committed report each one judges. */
export function tokenFloorsByReport(libraries: LibraryData[]): Record<string, number> {
  return sortedByKey(
    libraries.flatMap((library) =>
      tokenReportPaths(library).flatMap(([path, moduleId]): [string, number][] => {
        const floor = library.floors[moduleId];
        return floor === undefined ? [] : [[path, floor as number]];
      }),
    ),
  );
}

/** The libraries' parity floors, by the committed report each one judges. */
export function parityFloorsByReport(libraries: LibraryData[]): Record<string, AuthoredFloor> {
  return sortedByKey(
    libraries.flatMap((library) => {
      const reports: [string, string][] = [
        ...library.authored.map((target): [string, string] => [
          authoredParityPath(target),
          target.moduleId,
        ]),
        ...library.native.map((target): [string, string] => [
          nativeParityPath(target),
          target.namespace,
        ]),
      ];
      return reports.flatMap(([path, key]): [string, AuthoredFloor][] => {
        const floor = library.floors[key];
        return floor === undefined ? [] : [[path, floor as AuthoredFloor]];
      });
    }),
  );
}

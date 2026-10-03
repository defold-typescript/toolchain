import { beforeAll, describe, expect, test } from "bun:test";
import { type HsmBenchReport, runHsmBench } from "./run-hsm-bench";

const BUDGET_MS = 0.5;
// The VM's own first-run allocations (a JIT trace, a deeper Lua stack) land in
// about ten of the ~63,000 measured calls; a table built on every transition
// lands in hundreds.
const ALLOCATING_CALLS_LIMIT = 50;

let report: HsmBenchReport;

beforeAll(async () => {
  report = await runHsmBench();
  console.log(JSON.stringify(report, null, 2));
}, 900_000);

describe("hsm engine benchmark", () => {
  test("runs 200 enemies for 300 allocation and 300 timed frames and reports every number", () => {
    expect(report.enemies).toBe(200);
    expect(report.allocFrames).toBe(300);
    expect(report.frames).toBe(300);
    for (const value of [
      report.allocFrames,
      report.allocUpdates,
      report.allocSends,
      report.timedUpdates,
      report.timedSends,
      report.allocUpdateTransitions,
      report.allocSendTransitions,
      report.timedUpdateTransitions,
      report.timedSendTransitions,
      report.timedHeapProbes,
      report.avgMs,
      report.maxMs,
      report.updateKb,
      report.sendKb,
      report.updateAllocs,
      report.sendAllocs,
      report.fps,
      report.memKb,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  test("measures every update and send in both passes", () => {
    expect(report.allocUpdates).toBe(60_000);
    expect(report.allocSends).toBe(3_000);
    expect(report.timedUpdates).toBe(60_000);
    expect(report.timedSends).toBe(3_000);
  });

  test("every measured call kind moves some machine in both passes", () => {
    expect(report.allocUpdateTransitions).toBeGreaterThan(0);
    expect(report.allocSendTransitions).toBeGreaterThan(0);
    expect(report.timedUpdateTransitions).toBeGreaterThan(0);
    expect(report.timedSendTransitions).toBeGreaterThan(0);
  });

  test("takes no heap samples while timing", () => {
    expect(report.timedHeapProbes).toBe(0);
  });

  test(`spends under ${BUDGET_MS} ms per frame in hsm calls on average`, () => {
    expect(report.avgMs).toBeLessThan(BUDGET_MS);
  });

  test(`allocates in at most ${ALLOCATING_CALLS_LIMIT} update or send calls`, () => {
    expect(report.updateAllocs + report.sendAllocs).toBeLessThanOrEqual(ALLOCATING_CALLS_LIMIT);
  });
});

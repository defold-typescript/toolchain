import { beforeAll, describe, expect, test } from "bun:test";
import { type EcsBenchRun, runEcsBench } from "./run-ecs-bench";
import { smokeVersions } from "./run-ecs-smoke";

const RUN_TIMEOUT_MS = 600_000;
const BUDGET_MS = 0.5;
const FRAMES = 300;
const ENTITIES = 200;
// Each of the 200 entities belongs to 3 of the 6 systems, for 300 frames.
const PROCESS_CALLS = 180_000;
// Each churn frame moves 20 entities in and 20 out, each through 3 systems.
const CHURN_CALLBACKS = 18_000;

const SCENARIOS = ["steady", "churn"] as const;

for (const version of smokeVersions()) {
  describe(`ecs bench in the Defold ${version} engine`, () => {
    let run: EcsBenchRun;

    beforeAll(async () => {
      run = await runEcsBench(version);
      const { log: _log, ...numbers } = run;
      console.log(JSON.stringify(numbers, null, 2));
    }, RUN_TIMEOUT_MS);

    test("prints BENCH_DONE and reports the version it was built for", () => {
      if (!run.done || run.reportedVersion !== version) console.log(run.log);
      expect(run.done).toBe(true);
      expect(run.reportedVersion).toBe(version);
    });

    for (const name of SCENARIOS) {
      test(`${name} runs ${FRAMES} allocation and ${FRAMES} timed frames, ends with ${ENTITIES} entities and reports every number`, () => {
        const scenario = run[name];
        expect(scenario.allocFrames).toBe(FRAMES);
        expect(scenario.timedFrames).toBe(FRAMES);
        expect(scenario.entities).toBe(ENTITIES);
        for (const [field, value] of Object.entries(scenario)) {
          expect([field, Number.isFinite(value)]).toEqual([field, true]);
        }
      });

      test(`${name} makes ${PROCESS_CALLS} process calls in each pass`, () => {
        expect(run[name].allocProcessCalls).toBe(PROCESS_CALLS);
        expect(run[name].timedProcessCalls).toBe(PROCESS_CALLS);
      });

      test(`${name} takes no heap samples while timing`, () => {
        expect(run[name].timedHeapProbes).toBe(0);
      });

      test(`${name} spends under ${BUDGET_MS} ms per frame in ecs calls on average`, () => {
        expect(run[name].avgMs).toBeLessThan(BUDGET_MS);
      });
    }

    test(`churn moves ${CHURN_CALLBACKS} entities into and out of systems in each pass`, () => {
      expect(run.churn.allocAdds).toBe(CHURN_CALLBACKS);
      expect(run.churn.allocRemoves).toBe(CHURN_CALLBACKS);
      expect(run.churn.timedAdds).toBe(CHURN_CALLBACKS);
      expect(run.churn.timedRemoves).toBe(CHURN_CALLBACKS);
    });

    test("steady moves no entity into or out of a system", () => {
      expect(run.steady.allocAdds).toBe(0);
      expect(run.steady.allocRemoves).toBe(0);
      expect(run.steady.timedAdds).toBe(0);
      expect(run.steady.timedRemoves).toBe(0);
    });

    test("no steady allocation frame moves the heap", () => {
      expect(run.steady.allocatingFrames).toBe(0);
    });
  });
}

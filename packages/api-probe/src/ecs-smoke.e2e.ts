import { beforeAll, describe, expect, test } from "bun:test";
import * as ecs from "@defold-typescript/ecs";
import { createSmoke, SMOKE_FRAMES, type SmokeLib } from "../ecs-smoke-project/main/smoke-world";
import { type EcsSmokeRun, runEcsSmoke, smokeVersions } from "./run-ecs-smoke";

const RUN_TIMEOUT_MS = 600_000;

// The source and the shipped declarations each brand filters with their own
// `unique symbol`, so tsc sees two unrelated factory types for one library.
const lib = ecs as unknown as SmokeLib;

// Keyed systems register for the life of the module, so a second world built in
// this process would read its mover key as a reload of the first one's.
let bunTrace: readonly string[] = [];

beforeAll(() => {
  const step = createSmoke(lib);
  const trace: string[] = [];
  for (let frame = 1; frame <= SMOKE_FRAMES; frame++) {
    trace.push(step(frame));
  }
  bunTrace = trace;
});

for (const version of smokeVersions()) {
  describe(`ecs in the Defold ${version} engine`, () => {
    let run: EcsSmokeRun;

    beforeAll(async () => {
      run = await runEcsSmoke(version);
    }, RUN_TIMEOUT_MS);

    test(`prints ECS_DONE after ${SMOKE_FRAMES} trace lines`, () => {
      if (!run.done || run.trace.length !== SMOKE_FRAMES) console.log(run.log);
      expect(run.done).toBe(true);
      expect(run.trace.length).toBe(SMOKE_FRAMES);
    });

    test("reports the version it was built for", () => {
      expect(run.reportedVersion).toBe(version);
    });

    test("prints the trace the same world prints in Bun", () => {
      expect(run.trace).toEqual(bunTrace);
    });
  });
}

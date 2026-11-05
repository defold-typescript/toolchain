import { defineScript } from "@defold-typescript/types";
import { addEntity, getEntityCount, removeEntity, update } from "@defold-typescript/types/ecs";
import { type BenchWorld, benchStats, createBenchWorld, resetBenchStats } from "./bench-world";

const ENTITIES = 200;
// The churn world holds 11 blocks of 20 entities, and one block is always out.
const BLOCK_SIZE = 20;
const CHURN_BLOCKS = 11;
const WARMUP_FRAMES = 300;
// Unmeasured frames between the timed and the allocation pass. The full collect
// shrinks the Lua stack, which sits mostly idle at that point, and the first
// frame after it grows the stack back, as does the first frame to call `ecs`
// from the allocation pass's deeper stack slot.
const SETTLE_FRAMES = 10;
const MEASURED_FRAMES = 300;

type Scenario = "steady" | "churn";

interface ScenarioRun {
  readonly scenario: Scenario;
  readonly bench: BenchWorld;
  phase: "warmup" | "time" | "settle" | "alloc";
  /** Frames run so far, counted from the first warmup frame. */
  frame: number;
  timedFrames: number;
  settleFrames: number;
  allocFrames: number;
  timedSeconds: number;
  maxSeconds: number;
  timedProcessCalls: number;
  timedAdds: number;
  timedRemoves: number;
  timedHeapProbes: number;
  allocatingFrames: number;
  heapKb: number;
}

const originalCollectgarbage = collectgarbage;

// Installed over the global for the timed pass, so any heap sample taken while
// the clock runs shows up in the report instead of inflating the timings.
function countingCollectgarbage(this: void, ...args: unknown[]): unknown {
  benchStats.heapProbes += 1;
  return (originalCollectgarbage as (this: void, ...args: unknown[]) => unknown)(...args);
}

function startScenario(scenario: Scenario): ScenarioRun {
  return {
    scenario,
    bench:
      scenario === "steady"
        ? createBenchWorld(ENTITIES)
        : createBenchWorld(CHURN_BLOCKS * BLOCK_SIZE, BLOCK_SIZE),
    phase: "warmup",
    frame: 0,
    timedFrames: 0,
    settleFrames: 0,
    allocFrames: 0,
    timedSeconds: 0,
    maxSeconds: 0,
    timedProcessCalls: 0,
    timedAdds: 0,
    timedRemoves: 0,
    timedHeapProbes: 0,
    allocatingFrames: 0,
    heapKb: 0,
  };
}

// Every `ecs` call the scenario makes in one frame. Churn frame `k` brings block
// `k % 11` back and takes block `(k + 1) % 11` out, so 200 entities stay live.
function runFrame(run: ScenarioRun, dt: number): void {
  const target = run.bench.world;
  if (run.scenario === "churn") {
    const entities = run.bench.entities;
    const added = (run.frame % CHURN_BLOCKS) * BLOCK_SIZE;
    const removed = ((run.frame + 1) % CHURN_BLOCKS) * BLOCK_SIZE;
    for (let i = 0; i < BLOCK_SIZE; i++) {
      removeEntity(target, entities[removed + i]);
    }
    for (let i = 0; i < BLOCK_SIZE; i++) {
      addEntity(target, entities[added + i]);
    }
  }
  update(target, dt);
}

function report(scenario: string, field: string, value: string | number): void {
  print(`BENCH\t${scenario}\t${field}\t${value}`);
}

function reportScenario(run: ScenarioRun): void {
  const name = run.scenario;
  report(name, "allocFrames", run.allocFrames);
  report(name, "timedFrames", run.timedFrames);
  report(name, "entities", getEntityCount(run.bench.world));
  report(name, "allocProcessCalls", benchStats.processCalls);
  report(name, "timedProcessCalls", run.timedProcessCalls);
  report(name, "allocAdds", benchStats.adds);
  report(name, "allocRemoves", benchStats.removes);
  report(name, "timedAdds", run.timedAdds);
  report(name, "timedRemoves", run.timedRemoves);
  report(name, "avgMs", (run.timedSeconds / run.timedFrames) * 1000);
  report(name, "maxMs", run.maxSeconds * 1000);
  report(name, "allocatingFrames", run.allocatingFrames);
  report(name, "heapKb", run.heapKb);
  report(name, "timedHeapProbes", run.timedHeapProbes);
}

export default defineScript({
  init() {
    return { run: startScenario("steady") };
  },
  update(self, dt) {
    const run = self.run;

    if (run.phase === "warmup" || run.phase === "time") {
      // Warmup frames take the timed frames' path, so the JIT has compiled what
      // the clock measures.
      const t0 = socket.gettime();
      runFrame(run, dt);
      const seconds = socket.gettime() - t0;
      run.frame += 1;

      if (run.phase === "warmup") {
        if (run.frame === WARMUP_FRAMES) {
          collectgarbage("collect");
          collectgarbage("stop");
          resetBenchStats();
          _G.collectgarbage = countingCollectgarbage as typeof collectgarbage;
          run.phase = "time";
        }
        return;
      }

      run.timedFrames += 1;
      run.timedSeconds += seconds;
      run.maxSeconds = math.max(run.maxSeconds, seconds);
      if (run.timedFrames < MEASURED_FRAMES) return;

      run.timedProcessCalls = benchStats.processCalls;
      run.timedAdds = benchStats.adds;
      run.timedRemoves = benchStats.removes;
      run.timedHeapProbes = benchStats.heapProbes;
      _G.collectgarbage = originalCollectgarbage;
      // The JIT compiles a trace on its own schedule and the trace lands on the
      // heap, so it stays off until the allocation pass ends.
      jit.off();
      // A full collect restarts the collector, so it is stopped again.
      collectgarbage("collect");
      collectgarbage("stop");
      run.phase = "settle";
      return;
    }

    const kb0 = collectgarbage("count");
    runFrame(run, dt);
    const kb1 = collectgarbage("count");
    run.frame += 1;

    if (run.phase === "settle") {
      run.settleFrames += 1;
      if (run.settleFrames === SETTLE_FRAMES) {
        resetBenchStats();
        run.phase = "alloc";
      }
      return;
    }

    // With the collector stopped only an allocation can move the count, and a
    // collection can only start from one, so any change means the frame's `ecs`
    // calls built something.
    run.allocFrames += 1;
    if (kb1 !== kb0) {
      run.allocatingFrames += 1;
      run.heapKb += math.abs(kb1 - kb0);
    }
    if (run.allocFrames < MEASURED_FRAMES) return;

    jit.on();
    collectgarbage("restart");
    reportScenario(run);
    if (run.scenario === "steady") {
      self.run = startScenario("churn");
      resetBenchStats();
      return;
    }

    report("run", "engine", sys.get_engine_info().version);
    report("run", "system", sys.get_sys_info().system_name);
    print("BENCH_DONE");
    sys.exit(0);
  },
});

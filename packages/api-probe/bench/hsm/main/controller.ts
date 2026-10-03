import { defineScript } from "@defold-typescript/types";
import * as fps from "metrics.fps";
import * as mem from "metrics.mem";
import { benchStats } from "./bench-stats";

const ENEMIES = 200;
const WARMUP_FRAMES = 60;
const MEASURED_FRAMES = 300;

const originalCollectgarbage = collectgarbage;

// Installed over the global for the timed pass, so any heap sample taken while
// the clock runs shows up in the report instead of inflating the timings.
function countingCollectgarbage(this: void, ...args: unknown[]): unknown {
  benchStats.timedHeapProbes += 1;
  return (originalCollectgarbage as (this: void, ...args: unknown[]) => unknown)(...args);
}

function report(field: string, value: string | number): void {
  print(`BENCH\t${field}\t${value}`);
}

export default defineScript({
  init() {
    for (let i = 0; i < ENEMIES; i++) {
      factory.create("#factory");
    }
    return {
      fpsMeter: fps.create(),
      memMeter: mem.create(),
      frame: 0,
      allocFrames: 0,
      measured: 0,
      lastSeconds: 0,
      maxSeconds: 0,
    };
  },
  update(self) {
    self.fpsMeter.update();
    self.fpsMeter.draw();
    if (benchStats.phase !== "time") self.memMeter.update();
    self.memMeter.draw();
    self.frame += 1;

    if (benchStats.phase === "warmup") {
      if (self.frame === WARMUP_FRAMES) {
        collectgarbage("collect");
        collectgarbage("stop");
        benchStats.updateSeconds = 0;
        benchStats.sendSeconds = 0;
        benchStats.updateKb = 0;
        benchStats.sendKb = 0;
        benchStats.updateAllocs = 0;
        benchStats.sendAllocs = 0;
        benchStats.allocUpdateSlots = 0;
        benchStats.allocSendSlots = 0;
        benchStats.timedUpdateSlots = 0;
        benchStats.timedSendSlots = 0;
        benchStats.allocApproachUpdates = 0;
        benchStats.allocStalledUpdates = 0;
        benchStats.allocAliveHits = 0;
        benchStats.allocStalledHits = 0;
        benchStats.timedApproachUpdates = 0;
        benchStats.timedStalledUpdates = 0;
        benchStats.timedAliveHits = 0;
        benchStats.timedStalledHits = 0;
        benchStats.timedHeapProbes = 0;
        benchStats.phase = "alloc";
      }
      return;
    }

    if (benchStats.phase === "alloc") {
      self.allocFrames += 1;
      if (self.allocFrames < MEASURED_FRAMES) return;
      self.lastSeconds = 0;
      self.maxSeconds = 0;
      _G.collectgarbage = countingCollectgarbage as typeof collectgarbage;
      benchStats.phase = "time";
      return;
    }

    if (benchStats.phase !== "time") return;

    const total = benchStats.updateSeconds + benchStats.sendSeconds;
    self.maxSeconds = math.max(self.maxSeconds, total - self.lastSeconds);
    self.lastSeconds = total;
    self.measured += 1;
    if (self.measured < MEASURED_FRAMES) return;

    benchStats.phase = "done";
    _G.collectgarbage = originalCollectgarbage;
    self.memMeter.update();
    collectgarbage("restart");
    report("frames", self.measured);
    report("allocFrames", self.allocFrames);
    report("enemies", ENEMIES);
    report("avgMs", (total / self.measured) * 1000);
    report("maxMs", self.maxSeconds * 1000);
    report("allocUpdateSlots", benchStats.allocUpdateSlots);
    report("allocSendSlots", benchStats.allocSendSlots);
    report("timedUpdateSlots", benchStats.timedUpdateSlots);
    report("timedSendSlots", benchStats.timedSendSlots);
    report("allocApproachUpdates", benchStats.allocApproachUpdates);
    report("allocStalledUpdates", benchStats.allocStalledUpdates);
    report("allocAliveHits", benchStats.allocAliveHits);
    report("allocStalledHits", benchStats.allocStalledHits);
    report("timedApproachUpdates", benchStats.timedApproachUpdates);
    report("timedStalledUpdates", benchStats.timedStalledUpdates);
    report("timedAliveHits", benchStats.timedAliveHits);
    report("timedStalledHits", benchStats.timedStalledHits);
    report("timedHeapProbes", benchStats.timedHeapProbes);
    report("updateKb", benchStats.updateKb);
    report("sendKb", benchStats.sendKb);
    report("updateAllocs", benchStats.updateAllocs);
    report("sendAllocs", benchStats.sendAllocs);
    report("fps", self.fpsMeter.fps());
    report("memKb", self.memMeter.mem());
    report("engine", sys.get_engine_info().version);
    report("system", sys.get_sys_info().system_name);
    print("BENCH_DONE");
    sys.exit(0);
  },
});

import { defineScript } from "@defold-typescript/types";
import * as fps from "metrics.fps";
import * as mem from "metrics.mem";
import { benchStats } from "./bench-stats";

const ENEMIES = 200;
const WARMUP_FRAMES = 60;
const MEASURED_FRAMES = 300;

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
      measured: 0,
      lastSeconds: 0,
      maxSeconds: 0,
    };
  },
  update(self) {
    self.fpsMeter.update();
    self.fpsMeter.draw();
    self.memMeter.update();
    self.memMeter.draw();
    self.frame += 1;

    if (!benchStats.measuring) {
      if (self.frame === WARMUP_FRAMES) {
        collectgarbage("collect");
        collectgarbage("stop");
        benchStats.updateSeconds = 0;
        benchStats.sendSeconds = 0;
        benchStats.updateKb = 0;
        benchStats.sendKb = 0;
        benchStats.updateAllocs = 0;
        benchStats.sendAllocs = 0;
        benchStats.sends = 0;
        benchStats.measuring = true;
      }
      return;
    }

    const total = benchStats.updateSeconds + benchStats.sendSeconds;
    self.maxSeconds = math.max(self.maxSeconds, total - self.lastSeconds);
    self.lastSeconds = total;
    self.measured += 1;
    if (self.measured < MEASURED_FRAMES) return;

    benchStats.measuring = false;
    collectgarbage("restart");
    report("frames", self.measured);
    report("enemies", ENEMIES);
    report("avgMs", (total / self.measured) * 1000);
    report("maxMs", self.maxSeconds * 1000);
    report("updateKb", benchStats.updateKb);
    report("sendKb", benchStats.sendKb);
    report("updateAllocs", benchStats.updateAllocs);
    report("sendAllocs", benchStats.sendAllocs);
    report("sends", benchStats.sends);
    report("fps", self.fpsMeter.fps());
    report("memKb", self.memMeter.mem());
    report("engine", sys.get_engine_info().version);
    report("system", sys.get_sys_info().system_name);
    print("BENCH_DONE");
    sys.exit(0);
  },
});

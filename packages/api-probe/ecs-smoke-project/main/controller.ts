import { defineScript } from "@defold-typescript/types";
import {
  addEntity,
  addSystem,
  changed,
  filter,
  getEntityCount,
  getSystemCount,
  processingSystem,
  rejectAny,
  removeEntity,
  removeSystem,
  requireAll,
  setSystemIndex,
  sortedProcessingSystem,
  system,
  // Kept as `update`: the binding compiles to a module-level local, so the probe
  // also proves the script's own `update` callback still reaches the engine.
  update,
  world,
} from "@defold-typescript/types/ecs";
import { createSmoke, SMOKE_FRAMES, type SmokeLib } from "./smoke-world";

const lib: SmokeLib = {
  world,
  system,
  processingSystem,
  sortedProcessingSystem,
  requireAll,
  rejectAny,
  filter,
  addEntity,
  changed,
  addSystem,
  removeEntity,
  removeSystem,
  update,
  getEntityCount,
  getSystemCount,
  setSystemIndex,
};

export default defineScript({
  init() {
    return { step: createSmoke(lib), frame: 0 };
  },
  update(self) {
    if (self.frame >= SMOKE_FRAMES) return;
    self.frame += 1;
    print(`ECS\t${self.step(self.frame)}`);
    if (self.frame === SMOKE_FRAMES) {
      print(`ECS_VERSION\t${sys.get_engine_info().version}`);
      print("ECS_DONE");
      sys.exit(0);
    }
  },
});

// The Lua side of the inspector scenarios: every value comes from a public
// specifier, so the compile ships the library modules a project would get.
// Bun never runs it; the types package has no runtime for these specifiers.
import {
  addEntity,
  changed,
  processingSystem,
  refresh,
  removeEntity,
  removeSystem,
  requireAll,
  system,
  update,
  world,
} from "@defold-typescript/types/ecs";
import { inspect } from "@defold-typescript/types/ecs/debug";
import { type Lib, runScenario as runWith } from "./debug-scenarios";

const lib: Lib = {
  world,
  system,
  processingSystem,
  requireAll,
  addEntity,
  removeEntity,
  removeSystem,
  changed,
  refresh,
  update,
  inspect,
};

export function runScenario(name: string): void {
  runWith(lib, name);
}

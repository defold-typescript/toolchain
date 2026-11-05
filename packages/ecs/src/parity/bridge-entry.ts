// The Lua side of the bridge scenarios: every value comes from a public
// specifier, so the compile ships the library modules a project would get.
// Bun never runs it; the types package has no runtime for these specifiers.
import {
  addEntity,
  getEntityCount,
  hasEntity,
  processingSystem,
  refresh,
  removeEntity,
  requireAll,
  update,
  world,
} from "@defold-typescript/types/ecs";
import { join, leave, member, tickMachines } from "@defold-typescript/types/ecs/hsm";
import { defineMachine } from "@defold-typescript/types/hsm";
import { type Lib, runScenario as runWith } from "./bridge-scenarios";

const lib: Lib = {
  world,
  processingSystem,
  requireAll,
  addEntity,
  removeEntity,
  refresh,
  update,
  getEntityCount,
  hasEntity,
  member,
  join,
  leave,
  tickMachines,
  defineMachine,
};

export function runScenario(name: string): string {
  return runWith(lib, name);
}

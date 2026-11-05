// Type-only: the library under test is injected, so one scenario source runs in
// Bun over the workspace sources and in Lua over the modules the build ships.
// The public specifiers keep the Lua compile from pulling in a second copy.
// Every line a scenario produces comes from the engine stubs: `print` and
// `msg.post` append to the trace the test compares.
import type * as Ecs from "@defold-typescript/types/ecs";
import type * as Debug from "@defold-typescript/types/ecs/debug";

export type Lib = Pick<
  typeof Ecs,
  | "world"
  | "system"
  | "processingSystem"
  | "requireAll"
  | "addEntity"
  | "removeEntity"
  | "removeSystem"
  | "changed"
  | "refresh"
  | "update"
> &
  Pick<typeof Debug, "inspect">;

interface Vec {
  x: number;
}

interface Ent {
  pos?: Vec;
  vel?: Vec;
}

export interface Scenario {
  name: string;
  run: (this: void, lib: Lib) => void;
}

const TARGET = "/hero";

function membership(lib: Lib): void {
  const movers = lib.processingSystem<Ent>()(lib.requireAll("pos"), {
    process() {},
    onModify() {},
  });
  const steering = lib.system<Ent>()(lib.requireAll("pos", "vel"), {});
  const w = lib.world<Ent>(movers, steering);
  const inspector = lib.inspect(w, "membership");
  const a: Ent = { pos: { x: 0 }, vel: { x: 1 } };
  const b: Ent = { pos: { x: 0 }, vel: { x: 1 } };
  lib.addEntity(w, a);
  lib.addEntity(w, b);
  lib.update(w, 1);
  inspector.draw(TARGET);
  delete a.vel;
  lib.changed(w, a);
  lib.removeEntity(w, b);
  lib.update(w, 1);
  inspector.draw(TARGET);
}

function systemLeaves(lib: Lib): void {
  const scanner = lib.processingSystem<Ent>()(lib.requireAll("pos"), {
    nocache: true,
    process() {},
  });
  const holder = lib.system<Ent>()(lib.requireAll("pos"), {});
  const w = lib.world<Ent>(scanner, holder, { pos: { x: 0 } }, { pos: { x: 1 } });
  lib.refresh(w);
  const inspector = lib.inspect(w, "system-leaves");
  lib.removeSystem(w, holder);
  lib.refresh(w);
  inspector.draw(TARGET);
}

const RELOAD_KEY = "debug inspector reload";

function reload(lib: Lib): void {
  const mover = lib.processingSystem<Ent>(RELOAD_KEY)(lib.requireAll("pos"), {
    process() {},
  });
  const w = lib.world<Ent>(mover);
  lib.inspect(w, "reload");
  lib.addEntity(w, { pos: { x: 0 }, vel: { x: 1 } });
  lib.addEntity(w, { pos: { x: 0 } });
  lib.refresh(w);
  lib.processingSystem<Ent>(RELOAD_KEY)(lib.requireAll("vel"), {
    process() {},
    onModify() {},
  });
  lib.refresh(w);
}

type ReentryMode = "none" | "change" | "remove";

function reentry(lib: Lib): void {
  let mode: ReentryMode = "none";
  const movers = lib.system<Ent>()(lib.requireAll("pos"), {
    onRemove(entity: Ent) {
      const run = mode;
      mode = "none";
      const w = this.world as Ecs.World<Ent>;
      if (run === "change") {
        lib.removeEntity(w, entity);
        lib.refresh(w);
        lib.addEntity(w, entity);
        lib.refresh(w);
        entity.vel = { x: 1 };
      } else if (run === "remove") {
        entity.vel = { x: 1 };
        lib.addEntity(w, entity);
        lib.refresh(w);
      }
    },
  });
  const steering = lib.system<Ent>()(lib.requireAll("vel"), {});
  const w = lib.world<Ent>(movers, steering);
  lib.inspect(w, "re-entry");
  const e: Ent = { pos: { x: 0 } };
  lib.addEntity(w, e);
  lib.refresh(w);
  mode = "change";
  delete e.pos;
  lib.changed(w, e);
  lib.refresh(w);
  lib.removeEntity(w, e);
  lib.refresh(w);
  const f: Ent = { pos: { x: 0 } };
  lib.addEntity(w, f);
  lib.refresh(w);
  mode = "remove";
  lib.removeEntity(w, f);
  lib.refresh(w);
}

function reinspect(lib: Lib): void {
  const w = lib.world<Ent>(lib.system<Ent>()(lib.requireAll("pos"), {}));
  lib.inspect(w, "again");
  lib.inspect(w, "again");
  lib.addEntity(w, { pos: { x: 0 } });
  lib.refresh(w);
}

export const scenarios: Scenario[] = [
  { name: "membership", run: membership },
  { name: "system-leaves", run: systemLeaves },
  { name: "reload", run: reload },
  { name: "re-entry", run: reentry },
  { name: "reinspect", run: reinspect },
];

export function runScenario(lib: Lib, name: string): void {
  for (const scenario of scenarios) {
    if (scenario.name === name) {
      scenario.run(lib);
      return;
    }
  }
  throw `unknown scenario ${name}`;
}

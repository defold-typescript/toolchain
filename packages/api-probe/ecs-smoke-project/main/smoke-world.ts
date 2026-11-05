// Type-only: the engine script passes the bundled `@defold-typescript/types/ecs`
// and the probe passes `@defold-typescript/ecs`, so one world runs on both.
import type * as Ecs from "@defold-typescript/types/ecs";

export const SMOKE_FRAMES = 300;

export type SmokeLib = Pick<
  typeof Ecs,
  | "world"
  | "system"
  | "processingSystem"
  | "sortedProcessingSystem"
  | "requireAll"
  | "rejectAny"
  | "filter"
  | "addEntity"
  | "changed"
  | "addSystem"
  | "removeEntity"
  | "removeSystem"
  | "update"
  | "getEntityCount"
  | "getSystemCount"
  | "setSystemIndex"
>;

export type SmokeStep = (this: void, frame: number) => string;

interface Ent {
  name: string;
  pos?: number;
  vel?: number;
  rank?: number;
  dead?: true;
}

const MOVER_KEY = "ecs-smoke.mover";
const MAX_SPAWNS = 12;

// Runs the frame's schedule, then `update(world, 1)`, and returns one trace line.
// Every value the line holds is an integer or a name, so LuaJIT and Bun print it
// the same way.
export function createSmoke(lib: SmokeLib): SmokeStep {
  let events: string[] = [];
  const live: Ent[] = [];
  let spawned = 0;
  let pulses = 0;
  let order: string[] = [];
  let watched = 0;

  const w = lib.world<Ent>();

  const defineMover = (speed: number) =>
    lib.processingSystem<Ent>(MOVER_KEY)(lib.requireAll("pos", "vel"), {
      process(entity) {
        entity.pos = entity.pos + speed * entity.vel;
      },
      onAdd(entity) {
        events.push(`+mover:${entity.name}`);
      },
      onRemove(entity) {
        events.push(`-mover:${entity.name}`);
      },
      onModify() {
        events.push("mod:mover");
      },
    });
  const mover = defineMover(1);

  const ranked = lib.sortedProcessingSystem<Ent>()(lib.filter("rank&!dead"), {
    compare(e1, e2) {
      return (e1.rank ?? 0) < (e2.rank ?? 0);
    },
    preProcess() {
      order = [];
    },
    process(entity) {
      order.push(entity.name);
    },
    postProcess() {
      events.push(`order:${order.join(" ")}`);
    },
  });

  const pulse = lib.system<Ent>()({
    interval: 3,
    update() {
      pulses += 1;
      events.push(`pulse:${pulses}`);
    },
  });

  const reaper = lib.processingSystem<Ent>()(lib.requireAll("dead"), {
    process(entity) {
      lib.removeEntity(w, entity);
      events.push(`reap:${entity.name}`);
    },
  });

  const watcher = lib.processingSystem<Ent>()(lib.rejectAny("dead"), {
    nocache: true,
    preProcess() {
      watched = 0;
    },
    process() {
      watched += 1;
    },
    postProcess() {
      events.push(`live:${watched}`);
    },
  });

  lib.addSystem(w, mover);
  lib.addSystem(w, ranked);
  lib.addSystem(w, pulse);
  lib.addSystem(w, reaper);
  lib.addSystem(w, watcher);

  return (frame) => {
    events = [];

    if (frame % 10 === 1 && spawned < MAX_SPAWNS) {
      spawned += 1;
      const entity: Ent = {
        name: `e${spawned}`,
        pos: 0,
        vel: (spawned % 3) + 1,
        rank: (spawned * 7) % 13,
      };
      live.push(entity);
      lib.addEntity(w, entity);
    }
    if (frame % 25 === 0) {
      const oldest = live.shift();
      if (oldest !== undefined) {
        oldest.dead = true;
        lib.changed(w, oldest);
      }
    }
    if (frame === 150) {
      const reloaded = defineMover(2);
      events.push(`reload:${reloaded === mover ? "same" : "new"}`);
    }
    if (frame === 200) {
      events.push(`index:${lib.setSystemIndex(w, pulse, 1)}`);
    }
    if (frame === 240) {
      lib.removeSystem(w, watcher);
    }
    if (frame === 260) {
      lib.addSystem(w, watcher);
    }

    lib.update(w, 1);

    let pos = 0;
    for (const entity of w.entities) {
      pos += entity.pos ?? 0;
    }
    return `${frame}|${events.join(",")}|e=${lib.getEntityCount(w)}|s=${lib.getSystemCount(w)}|pos=${pos}`;
  };
}

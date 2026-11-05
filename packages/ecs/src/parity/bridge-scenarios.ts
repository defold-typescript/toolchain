// Type-only: the library under test is injected, so one scenario source runs in
// Bun over the workspace sources and in Lua over the modules the build ships.
// The public specifiers keep the Lua compile from pulling in a second copy.
import type * as Ecs from "@defold-typescript/types/ecs";
import type * as Bridge from "@defold-typescript/types/ecs/hsm";
import type * as Hsm from "@defold-typescript/types/hsm";

export type Lib = Pick<
  typeof Ecs,
  | "world"
  | "processingSystem"
  | "requireAll"
  | "addEntity"
  | "removeEntity"
  | "refresh"
  | "update"
  | "getEntityCount"
  | "hasEntity"
> &
  Pick<typeof Bridge, "member" | "join" | "leave" | "tickMachines"> &
  Pick<typeof Hsm, "defineMachine">;

type Ev = { type: "GO" } | { type: "BACK" };

interface Marker {
  id: string;
}

interface Ent {
  name: string;
  moving?: true;
  target?: Marker;
  fsm?: Hsm.MachineInstance<Ent, Ev>;
}

type Log = string[];

export interface Scenario {
  name: string;
  run: (this: void, lib: Lib, log: Log) => void;
}

// Lua prints nil as "nil" and JavaScript prints undefined as "undefined".
function shown(value: string | number | boolean | undefined): string {
  return value === undefined ? "-" : `${value}`;
}

function movers(lib: Lib, log: Log) {
  return lib.processingSystem<Ent>()(lib.requireAll("moving"), {
    process(e) {
      log.push(`moving ${e.name}`);
    },
  });
}

function memberScenario(lib: Lib, log: Log): void {
  const w = lib.world<Ent>(movers(lib, log));
  const machine = lib.defineMachine<Ent, Ev>()({
    initial: "/idle",
    states: {
      idle: { on: { GO: "/run" } },
      run: { ...lib.member(w, "moving"), on: { BACK: "/idle" } },
    },
  });
  const e: Ent = { name: "a" };
  lib.addEntity(w, e);
  const m = machine.start(e);
  log.push("update 1");
  lib.update(w, 1);
  m.send({ type: "GO" });
  log.push(`after GO moving=${shown(e.moving)}`);
  log.push("update 2");
  lib.update(w, 1);
  m.send({ type: "BACK" });
  log.push(`after BACK moving=${shown(e.moving)}`);
  log.push("update 3");
  lib.update(w, 1);
  log.push("update 4");
  lib.update(w, 1);
}

function memberValue(lib: Lib, log: Log): void {
  const w = lib.world<Ent>();
  const marker: Marker = { id: "marker" };
  const machine = lib.defineMachine<Ent, Ev>()({
    initial: "/idle",
    states: {
      idle: { on: { GO: "/aim" } },
      aim: { ...lib.member(w, "target", marker), on: { BACK: "/idle" } },
    },
  });
  const e: Ent = { name: "a" };
  const m = machine.start(e);
  log.push(`start target=${shown(e.target?.id)}`);
  m.send({ type: "GO" });
  log.push(`after GO same=${e.target === marker}`);
  m.send({ type: "BACK" });
  log.push(`after BACK target=${shown(e.target?.id)}`);
}

function joinAndLeave(lib: Lib, log: Log): void {
  const w = lib.world<Ent>();
  const machine = lib.defineMachine<Ent, Ev>()({
    initial: "/here",
    enter: lib.join(w),
    states: {
      here: { on: { GO: "/gone" } },
      gone: { enter: lib.leave(w) },
    },
  });
  const e: Ent = { name: "a" };
  const m = machine.start(e);
  log.push(`start count=${lib.getEntityCount(w)}`);
  lib.refresh(w);
  log.push(`refresh count=${lib.getEntityCount(w)}`);
  m.send({ type: "GO" });
  log.push(`after GO count=${lib.getEntityCount(w)}`);
  lib.refresh(w);
  log.push(`refresh count=${lib.getEntityCount(w)}`);
}

function noReAdd(lib: Lib, log: Log): void {
  const w = lib.world<Ent>(movers(lib, log));
  const machine = lib.defineMachine<Ent, Ev>()({
    initial: "/run",
    enter: lib.join(w),
    states: {
      run: {
        ...lib.member(w, "moving"),
        initial: "/run/here",
        states: {
          here: { on: { GO: "/run/gone" } },
          gone: { enter: lib.leave(w) },
        },
      },
    },
  });
  const e: Ent = { name: "a" };
  const m = machine.start(e);
  lib.update(w, 1);
  log.push(`joined count=${lib.getEntityCount(w)} moving=${shown(e.moving)}`);
  m.send({ type: "GO" });
  lib.refresh(w);
  log.push(`left count=${lib.getEntityCount(w)}`);
  m.stop();
  log.push(`stopped moving=${shown(e.moving)}`);
  lib.update(w, 1);
  log.push(`after update count=${lib.getEntityCount(w)}`);

  const loner: Ent = { name: "b" };
  const solo = lib.defineMachine<Ent, Ev>()({
    initial: "/run",
    states: { run: lib.member(w, "moving") },
  });
  solo.start(loner);
  log.push(`loner moving=${shown(loner.moving)}`);
  lib.update(w, 1);
  log.push(`loner count=${lib.getEntityCount(w)}`);
}

function tick(lib: Lib, log: Log): void {
  const w = lib.world<Ent>(lib.tickMachines<Ent>("fsm"), movers(lib, log));
  const machine = lib.defineMachine<Ent, Ev>()({
    initial: "/wait",
    states: {
      wait: {
        update: (ctx, dt) => {
          log.push(`${ctx.name} wait ${dt}`);
          return undefined;
        },
        after: { 0.5: "/run" },
      },
      run: lib.member(w, "moving"),
    },
  });
  for (const name of ["a", "b"]) {
    const e: Ent = { name };
    e.fsm = machine.start(e);
    lib.addEntity(w, e);
  }
  for (let frame = 1; frame <= 3; frame++) {
    log.push(`frame ${frame}`);
    lib.update(w, 0.25);
  }
}

function hasEntity(lib: Lib, log: Log): void {
  const w = lib.world<Ent>();
  const e: Ent = { name: "a" };
  lib.addEntity(w, e);
  log.push(`pending add ${lib.hasEntity(w, e)}`);
  lib.refresh(w);
  log.push(`added ${lib.hasEntity(w, e)}`);
  lib.removeEntity(w, e);
  log.push(`pending remove ${lib.hasEntity(w, e)}`);
  lib.refresh(w);
  log.push(`removed ${lib.hasEntity(w, e)}`);
}

export const scenarios: Scenario[] = [
  { name: "member", run: memberScenario },
  { name: "member value", run: memberValue },
  { name: "join and leave", run: joinAndLeave },
  { name: "no re-add", run: noReAdd },
  { name: "tick", run: tick },
  { name: "hasEntity", run: hasEntity },
];

export function runScenario(lib: Lib, name: string): string {
  const log: Log = [];
  for (const scenario of scenarios) {
    if (scenario.name === name) {
      scenario.run(lib, log);
      return log.join("\n");
    }
  }
  throw `unknown scenario ${name}`;
}

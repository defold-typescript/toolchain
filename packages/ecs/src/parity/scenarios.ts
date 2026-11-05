// Type-only: the library under test is injected, so one scenario source drives
// both the vendored tiny.lua and ecs.
import type * as Ecs from "../index";

export type Lib = Pick<
  typeof Ecs,
  | "world"
  | "system"
  | "processingSystem"
  | "sortedSystem"
  | "sortedProcessingSystem"
  | "requireAll"
  | "requireAny"
  | "rejectAll"
  | "rejectAny"
  | "filter"
  | "tryFilter"
  | "add"
  | "addEntity"
  | "changed"
  | "addSystem"
  | "remove"
  | "removeEntity"
  | "removeSystem"
  | "refresh"
  | "update"
  | "clearEntities"
  | "clearSystems"
  | "getEntityCount"
  | "getSystemCount"
  | "setSystemIndex"
>;

interface Ent {
  name: string;
  a?: number | undefined;
  b?: number | undefined;
  c?: number | undefined;
  d?: number | undefined;
}

type World = Ecs.World<Ent>;
type Log = string[];

interface Named {
  name: string;
}

export interface Scenario {
  name: string;
  run: (this: void, lib: Lib, log: Log) => void;
  // Holds ecs in Lua to ecs in Bun instead of to tiny.lua, for a scenario
  // tiny.lua cannot settle: its table.sort orders tied keys arbitrarily, and
  // its combinators return nil, err rather than raise, and build no filter
  // from zero tokens.
  bunOracle?: true;
}

// Lua prints nil as "nil" and JavaScript prints undefined as "undefined".
function shown(value: string | number | boolean | undefined): string {
  return value === undefined ? "-" : `${value}`;
}

function line(
  log: Log,
  callback: string,
  system: string,
  entity: Named | undefined,
  dt: number | undefined,
): void {
  log.push(`${callback} ${system} ${entity === undefined ? "-" : entity.name} ${shown(dt)}`);
}

function names(list: readonly unknown[] | undefined): string {
  if (list === undefined) {
    return "-";
  }
  let out = "[";
  for (let i = 0; i < list.length; i++) {
    const item = list[i] as Named;
    out = i === 0 ? `${out}${item.name}` : `${out} ${item.name}`;
  }
  return `${out}]`;
}

function counts(log: Log, label: string, w: World): void {
  log.push(`${label} entities ${w.getEntityCount()} systems ${w.getSystemCount()}`);
}

function attempt(log: Log, label: string, run: () => unknown): void {
  try {
    run();
    log.push(`${label} ok`);
  } catch {
    log.push(`${label} error`);
  }
}

function frame(log: Log, w: World, dt: number): void {
  log.push(`update ${dt}`);
  w.update(dt);
}

function tracked(log: Log, name: string) {
  return {
    name,
    onAdd(entity: Ent) {
      line(log, "onAdd", this.name, entity, undefined);
    },
    onRemove(entity: Ent) {
      line(log, "onRemove", this.name, entity, undefined);
    },
  };
}

function filters(lib: Lib, log: Log): void {
  const w = lib.world<Ent>(
    { name: "e1", a: 1, b: 1, c: 1 },
    { name: "e2", a: 1, b: 1 },
    { name: "e3", a: 1 },
    { name: "e4", b: 1, c: 1 },
    { name: "e5", c: 1, d: 1 },
  );
  const system = lib.system<Ent>();
  w.addSystem(system(lib.requireAll("a", "b"), tracked(log, "requireAll")));
  w.addSystem(system(lib.requireAny("a", "d"), tracked(log, "requireAny")));
  w.addSystem(system(lib.rejectAll("b", "c"), tracked(log, "rejectAll")));
  w.addSystem(system(lib.rejectAny("a", "d"), tracked(log, "rejectAny")));
  w.addSystem(system(lib.requireAll("c", lib.rejectAny("a")), tracked(log, "nested")));
  w.addSystem(
    system(
      lib.requireAll(lib.requireAny("a", "d"), lib.requireAll("c")),
      tracked(log, "subfilters"),
    ),
  );
  w.addSystem(
    system(
      (owner: Named, entity: Ent) =>
        owner.name === "custom" && entity.b !== undefined && entity.c === undefined,
      tracked(log, "custom"),
    ),
  );
  w.refresh();
  counts(log, "after refresh", w);
}

function deferredChanges(lib: Lib, log: Log): void {
  const sys = lib.processingSystem<Ent>()(lib.requireAll("a"), {
    ...tracked(log, "S"),
    process(entity, dt) {
      line(log, "process", this.name, entity, dt);
    },
  });
  const w = lib.world<Ent>(sys);
  const e1: Ent = { name: "e1", a: 1 };
  const e2: Ent = { name: "e2", a: 1 };
  const e3: Ent = { name: "e3", a: 1 };
  const state = (label: string) => {
    counts(log, label, w);
    log.push(`${label} matched ${names(sys.entities)}`);
  };

  w.addEntity(e1);
  state("queued e1");
  w.refresh();
  state("refreshed");

  w.addEntity(e2);
  w.addEntity(e2);
  w.removeEntity(e3);
  state("queued e2 twice, removed unknown e3");
  frame(log, w, 0.25);
  state("after update");

  w.changed(e1);
  w.removeEntity(e1);
  w.addEntity(e3);
  w.removeEntity(e3);
  state("queued change and removal");
  frame(log, w, 0.5);
  state("after update");
}

function membership(lib: Lib, log: Log): void {
  const e2: Ent = { name: "e2", a: 1 };
  const sys = lib.system<Ent>()(lib.requireAll("a"), {
    ...tracked(log, "S"),
    onRemove(entity: Ent) {
      line(log, "onRemove", this.name, entity, undefined);
      log.push(`onRemove a ${shown(entity.a)} same ${shown(entity === e2)}`);
    },
  });
  const w = lib.world<Ent>(
    sys,
    { name: "e1", a: 1 },
    e2,
    { name: "e3", a: 1 },
    { name: "e4", a: 1 },
  );
  const state = () => log.push(`matched ${names(sys.entities)} world ${names(w.entities)}`);
  state();

  e2.a = undefined;
  w.changed(e2);
  w.refresh();
  state();

  e2.a = 2;
  w.changed(e2);
  w.refresh();
  state();
}

function everyCallback(log: Log, name: string) {
  return {
    ...tracked(log, name),
    onModify(dt: number) {
      line(log, "onModify", this.name, undefined, dt);
    },
    onAddToWorld() {
      line(log, "onAddToWorld", this.name, undefined, undefined);
    },
    onRemoveFromWorld() {
      line(log, "onRemoveFromWorld", this.name, undefined, undefined);
    },
    preWrap(dt: number) {
      line(log, "preWrap", this.name, undefined, dt);
    },
    postWrap(dt: number) {
      line(log, "postWrap", this.name, undefined, dt);
    },
  };
}

function processingCallbacks(log: Log, name: string) {
  return {
    ...everyCallback(log, name),
    preProcess(dt: number) {
      line(log, "preProcess", this.name, undefined, dt);
    },
    process(entity: Ent, dt: number) {
      line(log, "process", this.name, entity, dt);
    },
    postProcess(dt: number) {
      line(log, "postProcess", this.name, undefined, dt);
    },
  };
}

function callbackOrder(lib: Lib, log: Log): void {
  const a = lib.processingSystem<Ent>()(lib.requireAll("a"), processingCallbacks(log, "A"));
  const b = lib.system<Ent>()(lib.requireAll("a"), {
    ...everyCallback(log, "B"),
    // An arrow ignores `this`, so it must still receive dt in the slot after it.
    update: (dt) => line(log, "update", "B", undefined, dt),
  });
  const c = lib.processingSystem<Ent>()(lib.requireAll("b"), processingCallbacks(log, "C"));
  const w = lib.world<Ent>(a, b, c, { name: "e1", a: 1 }, { name: "e2", a: 1, b: 1 });
  frame(log, w, 0.25);

  const e3: Ent = { name: "e3", b: 1 };
  w.addEntity(e3);
  log.push("refresh");
  w.refresh();
  frame(log, w, 0.5);

  w.removeEntity(e3);
  frame(log, w, 0.75);
}

function systemAddAndRemove(lib: Lib, log: Log): void {
  const w = lib.world<Ent>({ name: "e1", a: 1 }, { name: "e2", a: 1 }, { name: "e3", b: 1 });
  const sys = lib.system<Ent>()(lib.requireAll("a"), {
    ...everyCallback(log, "S"),
  });
  const state = (label: string) => {
    const owner = sys.world === undefined ? "-" : sys.world === w ? "w" : "other";
    log.push(`${label} world ${owner} entities ${names(sys.entities)} index ${shown(sys.index)}`);
  };
  state("new");
  w.addSystem(sys);
  state("queued");
  w.refresh();
  state("added");
  w.remove(sys);
  state("queued removal");
  w.refresh();
  state("removed");

  const other = lib.world<Ent>();
  const t = lib.system<Ent>()({ name: "T" });
  attempt(log, "add T to w", () => w.addSystem(t));
  attempt(log, "add T to other", () => other.addSystem(t));
  attempt(log, "remove T from other", () => other.removeSystem(t));
  attempt(log, "remove S from w again", () => w.removeSystem(sys));
  w.refresh();
  other.refresh();
  counts(log, "w", w);
  counts(log, "other", other);
}

function activeAndSystemFilter(lib: Lib, log: Log): void {
  const make = (name: string) =>
    lib.system<Ent>()(lib.requireAll("a"), {
      name,
      skip: name === "B" ? true : undefined,
      onAdd(entity: Ent) {
        line(log, "onAdd", this.name, entity, undefined);
      },
      onModify(dt: number) {
        line(log, "onModify", this.name, undefined, dt);
      },
      preWrap(dt: number) {
        line(log, "preWrap", this.name, undefined, dt);
      },
      update(dt: number) {
        line(log, "update", this.name, undefined, dt);
      },
      postWrap(dt: number) {
        line(log, "postWrap", this.name, undefined, dt);
      },
    });
  const a = make("A");
  const b = make("B");
  const c = make("C");
  const w = lib.world<Ent>(a, b, c, { name: "e1", a: 1 });
  const notSkipped = lib.rejectAny("skip");

  b.active = false;
  frame(log, w, 0.25);
  w.addEntity({ name: "e2", a: 1 });
  log.push("refresh");
  w.refresh();
  frame(log, w, 0.5);

  b.active = true;
  log.push("update 0.75 without B");
  w.update(0.75, notSkipped);
  log.push("update 1 without B");
  w.update(1, notSkipped);
  frame(log, w, 1.25);
  frame(log, w, 1.5);
}

function interval(lib: Lib, log: Log): void {
  const s = lib.system<Ent>()({
    name: "S",
    interval: 0.5,
    update(dt: number) {
      line(log, "update", this.name, undefined, dt);
    },
  });
  const p = lib.processingSystem<Ent>()(lib.requireAll("a"), {
    name: "P",
    interval: 0.5,
    preProcess(dt) {
      line(log, "preProcess", this.name, undefined, dt);
    },
    process(entity, dt) {
      line(log, "process", this.name, entity, dt);
    },
    postProcess(dt) {
      line(log, "postProcess", this.name, undefined, dt);
    },
  });
  const w = lib.world<Ent>(s, p, { name: "e1", a: 1 });
  const buffered = () =>
    log.push(`bufferedTime S ${shown(s.bufferedTime)} P ${shown(p.bufferedTime)}`);
  frame(log, w, 0.25);
  buffered();
  frame(log, w, 0.75);
  buffered();
  frame(log, w, 1.25);
  buffered();
}

function nocache(lib: Lib, log: Log): void {
  const p = lib.processingSystem<Ent>()(lib.requireAll("a"), {
    ...processingCallbacks(log, "N"),
    nocache: true,
  });
  const e1: Ent = { name: "e1", a: 1 };
  const w = lib.world<Ent>(p, e1, { name: "e2", b: 1 }, { name: "e3", a: 1 });
  log.push(`entities ${names(p.entities)}`);
  frame(log, w, 0.25);

  w.removeEntity(e1);
  w.addEntity({ name: "e4", a: 1 });
  frame(log, w, 0.5);

  w.removeSystem(p);
  frame(log, w, 0.75);
  counts(log, "after removal", w);
}

function setSystemIndex(lib: Lib, log: Log): void {
  const make = (name: string) =>
    lib.system<Ent>()({
      name,
      update(dt: number) {
        line(log, "update", this.name, undefined, dt);
      },
    });
  const a = make("A");
  const b = make("B");
  const c = make("C");
  const d = make("D");
  const w = lib.world<Ent>();
  w.addSystem(a);
  w.addSystem(b);
  w.addSystem(c);
  w.addSystem(d);
  const move = (system: Named & Ecs.SystemFields<Ent>, index: number) => {
    const old = w.setSystemIndex(system, index);
    log.push(
      `setSystemIndex ${system.name} ${index} old ${old} index A=${shown(a.index)} B=${shown(b.index)} C=${shown(c.index)} D=${shown(d.index)} order ${names(w.systems)}`,
    );
  };

  move(a, 1);
  move(a, 3);
  frame(log, w, 0.25);
  move(c, -1);
  frame(log, w, 0.5);
  move(c, 1);
  frame(log, w, 0.75);
  move(b, -2);
  frame(log, w, 1);
}

function clearing(lib: Lib, log: Log): void {
  const a = lib.system<Ent>()(lib.requireAll("a"), everyCallback(log, "A"));
  const b = lib.system<Ent>()(lib.requireAll("b"), everyCallback(log, "B"));
  const e1: Ent = { name: "e1", a: 1, b: 1 };
  const e2: Ent = { name: "e2", a: 1 };
  const e3: Ent = { name: "e3", b: 1 };
  const w = lib.world<Ent>(a, b, e1, e2, e3);

  w.clearEntities();
  counts(log, "cleared entities", w);
  frame(log, w, 0.25);
  counts(log, "after update", w);

  w.add(e1, e2, e3);
  log.push("refresh");
  w.refresh();
  counts(log, "re-added", w);

  w.clearSystems();
  w.clearEntities();
  counts(log, "cleared both", w);
  frame(log, w, 0.5);
  counts(log, "after update", w);
}

function constructionAndSharing(lib: Lib, log: Log): void {
  const a = lib.processingSystem<Ent>()(lib.requireAll("a"), processingCallbacks(log, "A"));
  const e1: Ent = { name: "e1", a: 1 };
  const w = lib.world<Ent>(a, e1, { name: "e2", a: 1 });
  counts(log, "constructed", w);
  log.push(`systems ${names(w.systems)} entities ${names(w.entities)}`);
  frame(log, w, 0.25);

  const b = lib.processingSystem<Ent>()(lib.requireAll("a"), {
    ...tracked(log, "B"),
    process(entity, dt) {
      line(log, "process", this.name, entity, dt);
    },
  });
  const w2 = lib.world<Ent>(b);
  w2.addEntity(e1);
  frame(log, w2, 0.5);
  frame(log, w, 0.5);

  w2.removeEntity(e1);
  frame(log, w2, 0.75);
  frame(log, w, 0.75);
  counts(log, "w", w);
  counts(log, "w2", w2);
}

function copies(lib: Lib, log: Log): void {
  const sys = lib.processingSystem<Ent>()(lib.requireAll("a"), {
    ...tracked(log, "S"),
    process(entity, dt) {
      line(log, "process", this.name, entity, dt);
    },
  });
  const e1: Ent = { name: "e1", a: 1 };
  const w = lib.world<Ent>(sys, e1);
  frame(log, w, 0.25);

  const c1: Ent = { ...e1, name: "c1" };
  const c2: Ent = { ...e1, name: "c2" };
  w.addEntity(c1);
  w.addEntity(c2);
  frame(log, w, 0.5);
  counts(log, "copies added", w);

  w.removeEntity(c1);
  frame(log, w, 0.75);
  w.removeEntity(e1);
  frame(log, w, 1);
  counts(log, "after removals", w);
  log.push(`matched ${names(sys.entities)} world ${names(w.entities)}`);
}

function copyBeforeSource(lib: Lib, log: Log): void {
  const make = (name: string) =>
    lib.processingSystem<Ent>()(lib.requireAll("a"), {
      ...tracked(log, name),
      process(entity, dt) {
        line(log, "process", this.name, entity, dt);
      },
    });
  const a = make("A");
  const b = make("B");
  const e1: Ent = { name: "e1", a: 1 };
  const w = lib.world<Ent>(a, e1);
  const w2 = lib.world<Ent>(b);
  const state = (label: string) => {
    counts(log, `${label} w`, w);
    counts(log, `${label} w2`, w2);
    log.push(
      `${label} w ${names(w.entities)} w2 ${names(w2.entities)} A ${names(a.entities)} B ${names(b.entities)}`,
    );
  };
  const both = (dt: number) => {
    log.push(`update w ${dt}`);
    w.update(dt);
    log.push(`update w2 ${dt}`);
    w2.update(dt);
  };

  const c1: Ent = { ...e1, name: "c1" };
  w2.addEntity(c1);
  log.push("update w2 0.25");
  w2.update(0.25);
  state("copy added");

  w2.addEntity(e1);
  both(0.5);
  state("source added");

  e1.a = 2;
  w.changed(e1);
  w2.changed(e1);
  both(0.75);
  state("changed");

  w.removeEntity(e1);
  both(1);
  state("removed from w");

  w2.removeEntity(c1);
  w2.removeEntity(e1);
  both(1.25);
  state("removed from w2");
}

function reentrantSystemAdd(lib: Lib, log: Log): void {
  const make = (name: string) =>
    lib.system<Ent>()(lib.requireAll("a"), {
      name,
      onAddToWorld(w: World) {
        line(log, "onAddToWorld", this.name, undefined, undefined);
        if (this.name === "A") {
          log.push(`setSystemIndex A 1 old ${w.setSystemIndex(this, 1)}`);
        }
      },
      onAdd(entity: Ent) {
        line(log, "onAdd", this.name, entity, undefined);
      },
      update(dt: number) {
        line(log, "update", this.name, undefined, dt);
      },
    });
  const z = make("Z");
  const a = make("A");
  const b = make("B");
  const w = lib.world<Ent>(z, a, b, { name: "e1", a: 1 });
  log.push(
    `index Z=${shown(z.index)} A=${shown(a.index)} B=${shown(b.index)} order ${names(w.systems)}`,
  );
  frame(log, w, 0.25);
}

function reentrantEntityChange(lib: Lib, log: Log): void {
  const e1: Ent = { name: "e1", a: 1 };
  const e2: Ent = { name: "e2", a: 1 };
  const e3: Ent = { name: "e3", a: 1 };
  const e4: Ent = { name: "e4", a: 1 };
  const sys = lib.system<Ent>()(lib.requireAll("a"), {
    name: "S",
    onAdd(entity: Ent) {
      line(log, "onAdd", this.name, entity, undefined);
      if (entity === e1) {
        const w = this.world as World;
        log.push("queue e3, refresh, queue e4");
        w.addEntity(e3);
        w.refresh();
        w.addEntity(e4);
      }
    },
    onModify(dt: number) {
      line(log, "onModify", this.name, undefined, dt);
    },
  });
  const w = lib.world<Ent>(sys);
  const state = (label: string) => {
    counts(log, label, w);
    log.push(`${label} matched ${names(sys.entities)}`);
  };

  w.addEntity(e1);
  w.addEntity(e2);
  log.push("refresh");
  w.refresh();
  state("refreshed");
  log.push("refresh");
  w.refresh();
  state("refreshed again");
}

interface ReentrantRemoval {
  twoSystems: boolean;
  spawnCopy: boolean;
}

function reentrantRemoval(lib: Lib, log: Log, options: ReentrantRemoval): void {
  const e1: Ent = { name: "e1", a: 1 };
  const e2: Ent = { name: "e2", a: 1 };
  let readded = false;
  let back = e1;
  const make = (name: string) =>
    lib.processingSystem<Ent>()(lib.requireAll("a"), {
      ...tracked(log, name),
      onRemove(entity: Ent) {
        line(log, "onRemove", this.name, entity, undefined);
        if (!readded) {
          readded = true;
          back = options.spawnCopy ? { ...entity, name: "c1" } : entity;
          log.push(`re-add ${back.name}, refresh`);
          const w = this.world as World;
          w.addEntity(back);
          w.refresh();
        }
      },
      process(entity, dt) {
        line(log, "process", this.name, entity, dt);
      },
    });
  const first = make(options.twoSystems ? "A" : "S");
  const systems = [first];
  let w: World;
  if (options.twoSystems) {
    const second = make("B");
    systems.push(second);
    w = lib.world<Ent>(first, second, e1, e2);
  } else {
    w = lib.world<Ent>(first, e1, e2);
  }
  const state = (label: string) => {
    counts(log, label, w);
    let out = `${label} world ${names(w.entities)}`;
    for (const system of systems) {
      out = `${out} ${system.name} ${names(system.entities)}`;
    }
    log.push(out);
  };

  frame(log, w, 0.25);
  w.removeEntity(e1);
  frame(log, w, 0.5);
  state("removed e1");
  w.changed(back);
  frame(log, w, 0.75);
  state("changed back");
  w.removeEntity(back);
  frame(log, w, 1);
  state("removed back");
  w.removeEntity(e2);
  frame(log, w, 1.25);
  state("removed e2");
}

function freeFunctions(lib: Lib, log: Log): void {
  const s = lib.processingSystem<Ent>()(lib.requireAll("a"), {
    ...tracked(log, "S"),
    process(entity, dt) {
      line(log, "process", this.name, entity, dt);
    },
  });
  const t = lib.system<Ent>()({
    name: "T",
    update(dt: number) {
      line(log, "update", this.name, undefined, dt);
    },
  });
  const e1: Ent = { name: "e1", a: 1 };
  const e2: Ent = { name: "e2", a: 1 };
  const w = lib.world<Ent>();
  const state = (label: string) =>
    log.push(`${label} entities ${lib.getEntityCount(w)} systems ${lib.getSystemCount(w)}`);

  lib.add(w, s, e1);
  log.push(`addSystem returns ${lib.addSystem(w, t).name}`);
  log.push(`addEntity returns ${lib.addEntity(w, e2).name}`);
  lib.refresh(w);
  state("refreshed");
  log.push(`setSystemIndex old ${lib.setSystemIndex(w, t, 1)} order ${names(w.systems)}`);
  log.push("update 0.25");
  lib.update(w, 0.25);

  e2.a = undefined;
  log.push(`changed returns ${lib.changed(w, e2).name}`);
  log.push("update 0.5");
  lib.update(w, 0.5);

  lib.remove(w, e1, t);
  log.push(`removeEntity returns ${lib.removeEntity(w, e2).name}`);
  log.push("update 0.75");
  lib.update(w, 0.75);
  state("removed");

  lib.addEntity(w, e1);
  lib.refresh(w);
  lib.clearEntities(w);
  lib.clearSystems(w);
  log.push("update 1");
  lib.update(w, 1);
  state("cleared");
  log.push(`S world unset ${shown(s.world === undefined)}`);
}

// `compare` logs nothing in these scenarios: table.sort and ecs call it in
// different orders and counts. tiny.lua keys `indices` by table and ecs by id,
// so a removal after a sort is what checks them.

function sortedSystems(lib: Lib, log: Log): void {
  const sys = lib.sortedProcessingSystem<Ent>()(lib.requireAny("a", "b"), {
    ...tracked(log, "S"),
    compare(e1, e2) {
      return (e1.c as number) < (e2.c as number);
    },
    process(entity, dt) {
      line(log, "process", this.name, entity, dt);
    },
  });
  const e6: Ent = { name: "e6", b: 1, c: 3 };
  const w = lib.world<Ent>(
    sys,
    { name: "e1", a: 1, c: 5 },
    { name: "e2", b: 1, c: 2 },
    { name: "e3", a: 1, b: 1, c: 8 },
    { name: "e4", a: 1, c: 1 },
    { name: "x", c: 0, d: 1 },
    { name: "e5", b: 1, c: 7 },
    e6,
    { name: "e7", a: 1, c: 6 },
    { name: "e8", a: 1, b: 1, c: 4 },
  );
  const state = (label: string) =>
    log.push(
      `${label} sortDelegate ${shown(sys.sortDelegate !== undefined)} entities ${names(sys.entities)}`,
    );
  state("constructed");
  w.refresh();
  state("refreshed");
  frame(log, w, 0.25);

  w.removeEntity(e6);
  frame(log, w, 0.5);
  state("removed e6");
}

function sortedResortTiming(lib: Lib, log: Log): void {
  const e1: Ent = { name: "e1", c: 30 };
  const e4: Ent = { name: "e4", c: 0 };
  let added = false;
  const sys = lib.sortedSystem<Ent>()(lib.requireAll("c"), {
    name: "S",
    compare(a, b) {
      return a.c < b.c;
    },
    update(dt: number) {
      log.push(`update S ${dt} entities ${names(this.entities)}`);
      if (!added) {
        added = true;
        log.push("add e4");
        (this.world as World).addEntity(e4);
      }
    },
  });
  const w = lib.world<Ent>(sys, e1, { name: "e2", c: 10 }, { name: "e3", c: 20 });
  frame(log, w, 0.25);
  frame(log, w, 0.5);

  e1.c = -10;
  w.changed(e1);
  log.push("e1 c -10, changed");
  frame(log, w, 0.75);
  w.addEntity({ name: "e5", c: 50 });
  log.push("add e5");
  frame(log, w, 1);

  sys.compare = (a, b) => a.c > b.c;
  w.addEntity({ name: "e6", c: 25 });
  log.push("reverse compare, add e6");
  frame(log, w, 1.25);
}

function sortedTies(lib: Lib, log: Log): void {
  const sys = lib.sortedSystem<Ent>()(lib.requireAll("c"), {
    name: "S",
    compare(a, b) {
      return a.c < b.c;
    },
  });
  const e3: Ent = { name: "e3", c: 1 };
  const w = lib.world<Ent>(
    sys,
    { name: "e1", c: 2 },
    { name: "e2", c: 1 },
    e3,
    { name: "e4", c: 2 },
    { name: "e5", c: 1 },
    { name: "e6", c: 2 },
  );
  const state = (label: string) => log.push(`${label} entities ${names(sys.entities)}`);
  w.refresh();
  state("refreshed");
  w.removeEntity(e3);
  w.refresh();
  state("removed e3");
  w.addEntity({ name: "e7", c: 2 });
  w.addEntity({ name: "e8", c: 1 });
  w.refresh();
  state("added e7 e8");
}

const COMPONENTS = ["a", "b", "c", "d"] as const;

// Bit `i` of `mask` sets `COMPONENTS[i]`; the entity is named by the components it has.
function subsetEntity(mask: number): Ent {
  const entity: Ent = { name: "-" };
  let name = "";
  let weight = 1;
  for (let i = 0; i < COMPONENTS.length; i++) {
    if (Math.floor(mask / weight) % 2 === 1) {
      const component = COMPONENTS[i] as (typeof COMPONENTS)[number];
      entity[component] = 1;
      name = `${name}${component}`;
    }
    weight *= 2;
  }
  if (name !== "") {
    entity.name = name;
  }
  return entity;
}

// `a|b&c` is `a or (b and c)`: tiny.filter builds Lua source, so Lua's precedence holds.
const STRING_PATTERNS = [
  "a",
  "!a",
  "a|b|c",
  "a&!b&c",
  "a|(b&c&d)",
  "a|b&c",
  "a&b|c&d",
  "!a|b",
  "!(a|b)",
  "(a|b)&!(c|d)",
  "(a|(b&!c))&d",
  "!(a&!(b|(c&d)))",
  "((a))",
];

function stringFilterTruthTable(lib: Lib, log: Log): void {
  const w = lib.world<Ent>();
  for (let mask = 0; mask < 16; mask++) {
    w.addEntity(subsetEntity(mask));
  }
  const system = lib.system<Ent>();
  const built: { name: string; entities?: readonly Ent[] | undefined }[] = [];
  for (let i = 0; i < STRING_PATTERNS.length; i++) {
    const pattern = STRING_PATTERNS[i] as string;
    built.push(w.addSystem(system(lib.filter(pattern), tracked(log, pattern))));
  }
  w.refresh();
  for (let i = 0; i < built.length; i++) {
    const sys = built[i] as (typeof built)[number];
    log.push(`${sys.name} ${names(sys.entities)}`);
  }

  const p = lib.processingSystem<Ent>()(lib.requireAll("a"), {
    name: "P",
    preProcess() {
      log.push(`ran ${this.name}`);
    },
    process() {},
  });
  const s = lib.system<Ent>()({
    name: "S",
    update() {
      log.push(`ran ${this.name}`);
    },
  });
  const systems = lib.world<Ent>(p, s, { name: "e1", a: 1 });
  log.push("update, systems with process");
  systems.update(0, lib.filter("process"));
  log.push("update, systems without process");
  systems.update(0, lib.filter("!process"));
}

// Each pattern but the last is one tiny.filter rejects as well.
function stringFilterErrors(lib: Lib, log: Log): void {
  const patterns = ["a&", "a|", "()", "a&()", "a&b"];
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i] as string;
    attempt(log, `filter ${pattern}`, () => lib.filter(pattern));
    log.push(`tryFilter ${pattern} ok ${lib.tryFilter(pattern).ok}`);
  }
}

type Combinator = (...tokens: readonly (string | Ecs.Filter)[]) => Ecs.Filter;

// Every call spells out its arguments: a spread array reaches Lua through
// unpack, which drops a trailing nil before the combinator can count it.
function undefinedTokens(log: Log, name: string, build: Combinator): void {
  attempt(log, `${name}()`, () => build());
  attempt(log, `${name}(undefined)`, () => build(undefined as never));
  attempt(log, `${name}("a", undefined)`, () => build("a", undefined as never));
  attempt(log, `${name}("a", undefined, "b")`, () => build("a", undefined as never, "b"));
  const none = build();
  log.push(
    `${name}() takes e1 ${none(undefined, { name: "e1", a: 1 })} e2 ${none(undefined, { name: "e2" })}`,
  );
}

function undefinedFilterTokens(lib: Lib, log: Log): void {
  undefinedTokens(log, "requireAll", lib.requireAll);
  undefinedTokens(log, "requireAny", lib.requireAny);
  undefinedTokens(log, "rejectAll", lib.rejectAll);
  undefinedTokens(log, "rejectAny", lib.rejectAny);
}

export const scenarios: readonly Scenario[] = [
  { name: "filters", run: filters },
  { name: "deferred changes", run: deferredChanges },
  { name: "membership", run: membership },
  { name: "callback order", run: callbackOrder },
  { name: "system add and remove", run: systemAddAndRemove },
  { name: "active and the system filter", run: activeAndSystemFilter },
  { name: "interval", run: interval },
  { name: "nocache", run: nocache },
  { name: "setSystemIndex", run: setSystemIndex },
  { name: "clearing", run: clearing },
  { name: "construction and sharing", run: constructionAndSharing },
  { name: "copies", run: copies },
  { name: "copy before source", run: copyBeforeSource },
  { name: "re-entrant system add", run: reentrantSystemAdd },
  { name: "re-entrant entity change", run: reentrantEntityChange },
  {
    name: "re-entrant removal",
    run: (lib, log) => reentrantRemoval(lib, log, { twoSystems: false, spawnCopy: false }),
  },
  {
    name: "re-entrant removal, two systems",
    run: (lib, log) => reentrantRemoval(lib, log, { twoSystems: true, spawnCopy: false }),
  },
  {
    name: "re-entrant removal spawns a copy",
    run: (lib, log) => reentrantRemoval(lib, log, { twoSystems: true, spawnCopy: true }),
  },
  { name: "free functions", run: freeFunctions },
  { name: "sorted systems", run: sortedSystems },
  { name: "sorted re-sort timing", run: sortedResortTiming },
  { name: "sorted ties", run: sortedTies, bunOracle: true },
  { name: "string filter truth table", run: stringFilterTruthTable },
  { name: "string filter errors", run: stringFilterErrors },
  { name: "undefined filter tokens", run: undefinedFilterTokens, bunOracle: true },
];

export function runScenario(lib: Lib, name: string): string {
  const log: Log = [];
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i] as Scenario;
    if (scenario.name === name) {
      scenario.run(lib, log);
      return log.join("\n");
    }
  }
  throw `unknown scenario "${name}"`;
}

import { describe, expect, test } from "bun:test";
import {
  processingSystem,
  requireAll,
  sortedProcessingSystem,
  sortedSystem,
  system,
  world,
} from "./index";

interface Ent {
  name: string;
  a?: number;
  b?: number;
  c?: number;
}

const names = (list: readonly Ent[] | undefined) => (list ?? []).map((entity) => entity.name);

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

// The registry lives as long as the module, so every test takes a key of its own.
describe("a keyed factory call reloads the system built first", () => {
  test("returns the first table, which the world keeps running with the new definition", () => {
    const log: string[] = [];
    const first = processingSystem<Ent>("reload same table")(requireAll("a"), {
      process(entity) {
        log.push(`A ${entity.name}`);
      },
    });
    const w = world<Ent>(first, { name: "e1", a: 1 });
    const index = first.index;

    const second = processingSystem<Ent>("reload same table")(requireAll("a"), {
      process(entity) {
        log.push(`B ${entity.name}`);
      },
    });
    w.update(0);

    expect(second as unknown).toBe(first);
    expect(log).toEqual(["B e1"]);
    expect(w.getSystemCount()).toBe(1);
    expect(index).toBe(1);
    expect(first.index).toBe(index);
  });

  test("keeps bufferedTime and the held entities, and takes the new interval", () => {
    const dts: number[] = [];
    // A definition that states a field ecs manages must not reset the live value.
    const define = (interval: number) =>
      system<Ent>("reload interval")(requireAll("a"), {
        interval,
        bufferedTime: 0,
        update(dt: number) {
          dts.push(dt);
        },
      });
    const s = define(1);
    const w = world<Ent>(s, { name: "e1", a: 1 }, { name: "e2", a: 1 }, { name: "e3", a: 1 });
    w.update(0.5);
    const before = names(s.entities);
    expect(dts).toEqual([]);

    define(0.25);
    w.update(0);

    expect(dts).toEqual([0.25, 0.25]);
    expect(names(s.entities)).toEqual(before);
    expect(before).toEqual(["e1", "e2", "e3"]);
  });

  test("re-checks the world's entities against a new filter at the next refresh", () => {
    const log: string[] = [];
    const s = system<Ent>("reload refilter")(requireAll("a"), {
      onAdd(entity) {
        log.push(`A add ${entity.name}`);
      },
      onRemove(entity) {
        log.push(`A remove ${entity.name}`);
      },
    });
    const w = world<Ent>(
      s,
      { name: "ea", a: 1 },
      { name: "eb", b: 1 },
      { name: "eab", a: 1, b: 1 },
    );
    log.length = 0;

    system<Ent>("reload refilter")(requireAll("b"), {
      onAdd(entity) {
        log.push(`B add ${entity.name}`);
      },
      onRemove(entity) {
        log.push(`B remove ${entity.name}`);
      },
    });
    expect(names(s.entities)).toEqual(["ea", "eab"]);
    expect(log).toEqual([]);

    w.refresh();

    expect(log).toEqual(["B remove ea", "B add eb"]);
    expect(names(s.entities)).toEqual(["eab", "eb"]);
  });

  test("drops a callback the new definition leaves out and takes its data fields", () => {
    const log: string[] = [];
    const s = processingSystem<Ent>("reload drop callback")(requireAll("a"), {
      speed: 1,
      onAdd(entity) {
        log.push(`add ${entity.name}`);
      },
      process(entity) {
        log.push(`process ${entity.name} ${this.speed}`);
      },
    });
    const w = world<Ent>(s, { name: "e1", a: 1 });
    expect(log).toEqual(["add e1"]);
    log.length = 0;

    processingSystem<Ent>("reload drop callback")(requireAll("a"), {
      speed: 2,
      process(entity) {
        log.push(`process ${entity.name} ${this.speed}`);
      },
    });
    w.addEntity({ name: "e2", a: 1 });
    w.update(0);

    expect(log).toEqual(["process e1 2", "process e2 2"]);
    expect(s.speed).toBe(2);
    expect(s.onAdd).toBeUndefined();
  });

  test("a sorted system re-sorts with the new compare at the next update", () => {
    const s = sortedSystem<Ent>("reload sorted")(requireAll("c"), {
      compare(e1, e2) {
        return e1.c < e2.c;
      },
    });
    const w = world<Ent>(s, { name: "e2", c: 2 }, { name: "e3", c: 3 }, { name: "e1", c: 1 });
    w.update(0);
    expect(names(s.entities)).toEqual(["e1", "e2", "e3"]);

    sortedSystem<Ent>("reload sorted")(requireAll("c"), {
      compare(e1, e2) {
        return e1.c > e2.c;
      },
    });
    w.update(0);

    expect(names(s.entities)).toEqual(["e3", "e2", "e1"]);
  });

  test("a sorted processing system processes in the new compare order after a reload", () => {
    const log: string[] = [];
    const define = (label: string, ascending: boolean) =>
      sortedProcessingSystem<Ent>("reload sorted processing")(requireAll("c"), {
        compare(e1, e2) {
          return ascending ? e1.c < e2.c : e1.c > e2.c;
        },
        process(entity) {
          log.push(`${label} ${entity.name}`);
        },
      });
    const s = define("A", true);
    const w = world<Ent>(s, { name: "e2", c: 2 }, { name: "e1", c: 1 }, { name: "e3", c: 3 });
    w.update(0);

    expect(define("B", false) as unknown).toBe(s);
    w.update(0);

    expect(log).toEqual(["A e1", "A e2", "A e3", "B e3", "B e2", "B e1"]);
  });

  test("a reload that changes nocache throws before changing the system", () => {
    const log: string[] = [];
    const keptFilter = requireAll("a");
    const s = processingSystem<Ent>("reload nocache")(keptFilter, {
      process(entity) {
        log.push(`A ${entity.name}`);
      },
    });
    const w = world<Ent>(s, { name: "e1", a: 1 }, { name: "e2", b: 1 });

    const error = caught(() =>
      processingSystem<Ent>("reload nocache")(requireAll("b"), {
        nocache: true,
        process(entity) {
          log.push(`B ${entity.name}`);
        },
      }),
    );
    w.update(0);

    expect(error).toBe('ecs: a reload of "reload nocache" cannot change nocache');
    expect(s.filter).toBe(keptFilter);
    expect(s.nocache).toBeUndefined();
    expect(log).toEqual(["A e1"]);
  });

  test("an unkeyed factory call builds a new system each time", () => {
    const log: string[] = [];
    const first = processingSystem<Ent>()(requireAll("a"), {
      process(entity) {
        log.push(`A ${entity.name}`);
      },
    });
    const w = world<Ent>(first, { name: "e1", a: 1 });

    const second = processingSystem<Ent>()(requireAll("a"), {
      process(entity) {
        log.push(`B ${entity.name}`);
      },
    });
    w.update(0);

    expect(second as unknown).not.toBe(first);
    expect(log).toEqual(["A e1"]);
  });

  test("a key named after an Object.prototype member keys its own system and changes no built-in", () => {
    const prototypeNames = Object.getOwnPropertyNames(Object.prototype).sort();
    const objectNames = Object.getOwnPropertyNames(Object).sort();
    const log: string[] = [];
    const define = (tag: string) => ({
      tag,
      update() {
        log.push(this.tag);
      },
    });
    const defP1 = define("P1");
    const defP2 = define("P2");
    const defC1 = define("C1");

    const p = system<Ent>("__proto__")(defP1);
    const reloaded = system<Ent>("__proto__")(defP2);
    const c = system<Ent>("constructor")(defC1);
    world<Ent>(p, c).update(0);

    expect(p as unknown).toBe(defP1);
    expect(reloaded as unknown).toBe(defP1);
    expect(c as unknown).toBe(defC1);
    expect(log).toEqual(["P2", "C1"]);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(prototypeNames);
    expect(Object.getOwnPropertyNames(Object).sort()).toEqual(objectNames);
    expect(({} as { update?: unknown }).update).toBeUndefined();
  });

  test("a reload replaces a field named toString or constructor like any other", () => {
    const define = (value: string) =>
      system<Ent>("reload reserved fields")({
        toString: () => value,
        constructor: value,
      });
    const s = define("A");
    define("B");

    expect(String(s)).toBe("B");
    expect(s.constructor).toBe("B");
  });
});

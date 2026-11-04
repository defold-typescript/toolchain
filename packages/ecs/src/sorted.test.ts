import { describe, expect, test } from "bun:test";
import { requireAll, sortedProcessingSystem, world } from "./index";

interface Item {
  name: string;
  key?: number;
}

// Array.prototype.sort is stable since ES2019, so it gives the expected order.
const byKey = (a: Item, b: Item) => (a.key as number) - (b.key as number);

const names = (list: readonly Item[] | undefined) => (list ?? []).map((item) => item.name);

const SIZES = Array.from({ length: 41 }, (_, size) => size);
// Keys 0..2 tie heavily; keys 0..999 rarely do.
const BOUNDS = [3, 1000];

function generator(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 16) % bound;
  };
}

function build(size: number, bound: number) {
  const next = generator(size * 7919 + bound);
  let serial = 0;
  const make = (count: number): Item[] =>
    Array.from({ length: count }, () => {
      serial += 1;
      return { name: `e${serial}`, key: next(bound) };
    });
  const sys = sortedProcessingSystem<Item>()(requireAll("key"), {
    compare(e1, e2) {
      return e1.key < e2.key;
    },
    process() {},
  });
  const ents = make(size);
  const w = world<Item>(sys, ...ents);
  w.refresh();
  return { sys, w, ents, make };
}

describe("sortedProcessingSystem keeps one stable order", () => {
  test("sorts its entities stably on the first refresh", () => {
    for (const size of SIZES) {
      for (const bound of BOUNDS) {
        const { sys, ents } = build(size, bound);
        expect({ size, bound, order: names(sys.entities) }).toEqual({
          size,
          bound,
          order: names(ents.slice().sort(byKey)),
        });
      }
    }
  });

  test("sorts added entities after the held ones they tie with, in add order", () => {
    for (const size of SIZES) {
      for (const bound of BOUNDS) {
        const { sys, w, make } = build(size, bound);
        const held = (sys.entities ?? []).slice();
        const additions = make(Math.floor(size / 2));
        for (const entity of additions) {
          w.addEntity(entity);
        }
        w.refresh();
        expect({ size, bound, order: names(sys.entities) }).toEqual({
          size,
          bound,
          order: names([...held, ...additions].sort(byKey)),
        });
      }
    }
  });

  test("removes entities through the indices the sort rewrote", () => {
    for (const size of SIZES) {
      for (const bound of BOUNDS) {
        const { sys, w } = build(size, bound);
        const held = (sys.entities ?? []).slice();
        const kept = held.filter((_, i) => i % 3 !== 0);
        held.forEach((entity, i) => {
          if (i % 3 === 0) {
            w.removeEntity(entity);
          }
        });
        w.refresh();
        const after = (sys.entities ?? []).slice();
        expect({ size, bound, members: names(after).sort() }).toEqual({
          size,
          bound,
          members: names(kept).sort(),
        });
        const keys = after.map((entity) => entity.key as number);
        expect({ size, bound, keys }).toEqual({
          size,
          bound,
          keys: keys.slice().sort((a, b) => a - b),
        });
      }
    }
  });
});

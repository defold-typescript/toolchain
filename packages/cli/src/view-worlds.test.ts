import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { loadProject, type ProjectLoad } from "./view-load";
import type { SourceSpan } from "./view-run";
import { trackWorlds } from "./view-worlds";

const hsmSourceDir = requireLibrarySourceDir(HSM_LIBRARY);
const ecsSourceDir = requireLibrarySourceDir(ECS_LIBRARY);

const SCRIPT_IMPORT = 'import { defineScript } from "@defold-typescript/types";';
const ECS_IMPORT = 'from "@defold-typescript/types/ecs"';

interface SystemLike {
  readonly [field: string]: unknown;
}

interface WorldLike {
  readonly systems: readonly SystemLike[];
  readonly entities: readonly Record<string, unknown>[];
  update(dt: number): void;
  refresh(): void;
  addEntity(entity: object): void;
  removeEntity(entity: object): void;
  addSystem(system: unknown): void;
  removeSystem(system: unknown): void;
  clearSystems(): void;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "view-worlds-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, text: string): string {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function load(text: string): ProjectLoad {
  return loadProject(write("main.ts", text), { hsmSourceDir, ecsSourceDir });
}

function init(loaded: ProjectLoad): Record<string, unknown> {
  const state = loaded.script?.init?.({});
  if (typeof state !== "object" || state === null) {
    throw new Error("the script's init returned no state");
  }
  return state as Record<string, unknown>;
}

function slice(text: string, span: SourceSpan | undefined): string | undefined {
  return span === undefined ? undefined : text.slice(span.start, span.end);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("trackWorlds", () => {
  test("names each world by the self key holding it, then its export, then its creation order", () => {
    write(
      "pond.ts",
      `import { world } ${ECS_IMPORT};
export const pond = world();
`,
    );
    const loaded = load(`${SCRIPT_IMPORT}
import { world } ${ECS_IMPORT};
import { pond } from "./pond";
export const w = world();
world();
export const shared = world();
export default defineScript({
  init() {
    world();
    return { garden: world(), held: shared, w: world(), again: pond };
  },
});
`);
    const self = init(loaded);
    const tracker = trackWorlds(loaded);

    expect(tracker.names(self)).toEqual([
      "again",
      "w",
      "world-1",
      "held",
      "world-2",
      "garden",
      "w#2",
    ]);
  });

  test("times each system for one frame, averages its last 60 frames and restores its callbacks", () => {
    const loaded = load(`${SCRIPT_IMPORT}
import { processingSystem, requireAll, system, world } ${ECS_IMPORT};
const busy = (ms: number) => {
  const end = os.clock() + ms / 1000;
  while (os.clock() < end) {}
};
const slow = processingSystem()(requireAll("cost"), {
  preWrap() {},
  process(e) { busy(e.cost as number); },
  postWrap() {},
});
const late = system()({ update() {} });
export default defineScript({
  init() { return { garden: world(slow, { cost: 2.05 }), late }; },
});
`);
    const self = init(loaded);
    const garden = self.garden as WorldLike;
    const late = self.late as SystemLike;
    const tracker = trackWorlds(loaded);
    const fields = ["onModify", "preWrap", "update", "postWrap"];
    const own = garden.systems.map((system) => fields.map((field) => system[field]));
    const lateUpdate = late.update;

    tracker.frame(() => {
      garden.update(1 / 60);
      garden.addSystem(late);
      garden.refresh();
    });

    const [slowView, lateView] = tracker.view(garden).systems;
    expect(slowView?.ms).toBeGreaterThanOrEqual(2);
    expect(lateView?.ms).toBe(0);
    expect(fields.map((field) => garden.systems[0]?.[field])).toEqual(own[0] ?? []);
    expect(late.update).toBe(lateUpdate);

    const observed = [slowView?.ms ?? Number.NaN];
    const entity = garden.entities[0] as { cost: number };
    for (let frame = 2; frame <= 70; frame++) {
      if (frame === 11) {
        entity.cost = 0;
      }
      tracker.frame(() => garden.update(1 / 60));
      observed.push(tracker.view(garden).systems[0]?.ms ?? Number.NaN);
    }

    const average = tracker.view(garden).systems[0]?.avgMs ?? Number.NaN;
    expect(average).toBeCloseTo(mean(observed.slice(-60)), 9);
    expect(mean(observed)).toBeGreaterThan(average + 0.1);
  });

  test("lists systems by index with names, state, entities, timings and source, and entities with their components", () => {
    const loaded = load(`import { processingSystem, requireAll, system, world } ${ECS_IMPORT};
const move = processingSystem("move")(requireAll("x"), { process(e) { e.x = (e.x as number) + 1; } });
export const tally = system()({ active: false, interval: 0.5, update() {} });
const scan = processingSystem()(requireAll("x"), { nocache: true, process() {} });
export const garden = world(move, tally, scan, { x: 0, tag: "a", helper: () => 1 }, { y: 1 });
`);
    const text = loaded.files[0]?.text ?? "";
    const tracker = trackWorlds(loaded);
    const { systems, entities } = tracker.view(loaded.worlds[0]);

    expect(systems.map(({ source: _source, ...rest }) => rest)).toEqual([
      {
        index: 1,
        name: "move",
        active: true,
        interval: undefined,
        entities: [1],
        ms: 0,
        avgMs: 0,
      },
      {
        index: 2,
        name: "tally",
        active: false,
        interval: 0.5,
        entities: [],
        ms: 0,
        avgMs: 0,
      },
      {
        index: 3,
        name: "system 3",
        active: true,
        interval: undefined,
        entities: undefined,
        ms: 0,
        avgMs: 0,
      },
    ]);
    expect(systems.map((system) => slice(text, system.source))).toEqual([
      "{ process(e) { e.x = (e.x as number) + 1; } }",
      "{ active: false, interval: 0.5, update() {} }",
      "{ nocache: true, process() {} }",
    ]);
    expect(entities).toEqual([
      { id: 1, value: { x: 0, tag: "a" } },
      { id: 2, value: { y: 1 } },
    ]);
  });

  test("numbers entities as first seen, keeps their ids through frames and reloads, and reports joins and leaves", () => {
    const source = (step: number) => `${SCRIPT_IMPORT}
import { processingSystem, requireAll, world } ${ECS_IMPORT};
const move = processingSystem("move")(requireAll("x"), {
  process(e) { e.x = (e.x as number) + ${step}; },
});
export default defineScript({
  init() { return { garden: world(move, { name: "a", x: 0 }, { name: "b", x: 0 }, { name: "c" }) }; },
});
`;
    const loaded = load(source(1));
    const garden = init(loaded).garden as WorldLike;
    const tracker = trackWorlds(loaded);
    const ids = () => tracker.view(garden).entities.map((entity) => entity.id);
    const sortedIds = () => ids().sort((left, right) => left - right);
    const [a] = garden.entities;

    expect(ids()).toEqual([1, 2, 3]);
    expect(tracker.membership(garden)).toEqual([
      { kind: "join", system: 1, entity: 1 },
      { kind: "join", system: 1, entity: 2 },
    ]);
    expect(tracker.membership(garden)).toEqual([]);

    tracker.frame(() => {
      if (a !== undefined) {
        garden.removeEntity(a);
      }
      garden.addEntity({ name: "d", x: 0 });
      garden.update(0);
    });
    expect(sortedIds()).toEqual([2, 3, 4]);
    expect(tracker.membership(garden)).toEqual([
      { kind: "leave", system: 1, entity: 1 },
      { kind: "join", system: 1, entity: 4 },
    ]);
    const held = [...(tracker.view(garden).systems[0]?.entities ?? [])];
    expect(held.sort((left, right) => left - right)).toEqual([2, 4]);

    write("main.ts", source(10));
    loaded.reload();
    tracker.frame(() => garden.update(0));
    expect(sortedIds()).toEqual([2, 3, 4]);
    expect(tracker.membership(garden)).toEqual([]);
    expect(Object.fromEntries(garden.entities.map((entity) => [entity.name, entity.x]))).toEqual({
      b: 11,
      c: undefined,
      d: 11,
    });

    tracker.reset();
    expect(ids()).toEqual([1, 2, 3]);
    expect(tracker.view(garden).systems[0]?.ms).toBe(0);
  });

  test("logs a leave for every member of a system removed from the world, under the index it had", () => {
    const loaded = load(`import { processingSystem, requireAll, world } ${ECS_IMPORT};
const n = processingSystem("n")(requireAll("x"), { nocache: true, process() {} });
const a = processingSystem("a")(requireAll("x"), { process() {} });
const b = processingSystem("b")(requireAll("y"), { process() {} });
const c = processingSystem("c")(requireAll("x"), { process() {} });
export const garden = world(n, a, b, c, { x: 0 }, { y: 0 }, { x: 1, y: 1 });
`);
    const garden = loaded.worlds[0] as WorldLike;
    const tracker = trackWorlds(loaded);
    const [, a, , c] = garden.systems;
    tracker.membership(garden);

    garden.removeSystem(a);
    garden.refresh();
    expect(tracker.membership(garden)).toEqual([
      { kind: "leave", system: 2, entity: 1 },
      { kind: "leave", system: 2, entity: 3 },
    ]);
    expect(tracker.membership(garden)).toEqual([]);

    garden.clearSystems();
    garden.refresh();
    expect(tracker.membership(garden)).toEqual([
      { kind: "leave", system: 2, entity: 2 },
      { kind: "leave", system: 2, entity: 3 },
      { kind: "leave", system: 3, entity: 1 },
      { kind: "leave", system: 3, entity: 3 },
    ]);
    expect(tracker.membership(garden)).toEqual([]);

    garden.addSystem(c);
    garden.refresh();
    expect(tracker.membership(garden)).toEqual([
      { kind: "join", system: 1, entity: 1 },
      { kind: "join", system: 1, entity: 3 },
    ]);
  });
});

import { shownValue } from "./hsm-view-session";
import type { ProjectLoad } from "./view-load";
import type { SourceLocation } from "./view-run";

export interface SystemView {
  readonly index: number;
  readonly name: string;
  readonly active: boolean;
  readonly interval: number | undefined;
  /** Entity ids in the system's order; `undefined` for a `nocache` system. */
  readonly entities: readonly number[] | undefined;
  readonly ms: number;
  readonly avgMs: number;
  readonly source: SourceLocation | undefined;
}

export interface EntityView {
  readonly id: number;
  readonly value: unknown;
  /** The id of the machine instance the entity holds in a field, when it holds one. */
  readonly machine?: number;
}

/** Where an entity holds a machine instance: the world's index in creation order and the entity's id. */
export interface InstanceHolder {
  readonly world: number;
  readonly entity: number;
}

export interface WorldView {
  readonly systems: readonly SystemView[];
  readonly entities: readonly EntityView[];
}

export interface MembershipChange {
  readonly kind: "join" | "leave";
  /**
   * The system's 1-based index in its world; for a system removed since the last call, the index
   * it had then.
   */
  readonly system: number;
  readonly entity: number;
}

export interface WorldTracker {
  /** A name for each of the load's worlds, in creation order. */
  names(self?: unknown): readonly string[];
  /** Runs one frame with every system's callbacks timed. */
  frame(run: () => void): void;
  /** `instances` maps each machine instance to its id, which the entity holding it carries. */
  view(world: unknown, instances?: ReadonlyMap<unknown, number>): WorldView;
  /**
   * For each instance id in `instances`, the first entity of the load's worlds, in creation order,
   * that holds the instance in a field.
   */
  holders(instances: ReadonlyMap<unknown, number>): ReadonlyMap<number, InstanceHolder>;
  /**
   * What each system of `world` gained and lost since the last call for it; a first call reports
   * every member, and a system removed since then loses every member it held.
   */
  membership(world: unknown): readonly MembershipChange[];
  /** Forgets every id, timing and membership, as a new run starts. */
  reset(): void;
}

interface SystemRecord {
  [field: string]: unknown;
  readonly index?: number;
  readonly active?: boolean;
  readonly interval?: number;
  readonly nocache?: boolean;
  readonly entities?: readonly object[];
}

interface WorldRecord {
  readonly systems: readonly SystemRecord[];
  readonly systemsToAdd?: readonly SystemRecord[];
  readonly entities: readonly object[];
}

interface Timing {
  last: number;
  readonly samples: number[];
}

interface HeldMembers {
  readonly index: number;
  readonly entities: readonly object[];
}

type Callback = (this: unknown, ...args: unknown[]) => unknown;

const TIMED_CALLBACKS = ["onModify", "preWrap", "update", "postWrap"];
const AVERAGED_FRAMES = 60;
// Each world stores an entity's id under a field of its own; it is ecs bookkeeping, not a component.
const ECS_ID_PREFIX = "__ecs_id_";

function heldInstance(entity: object, instances: ReadonlyMap<unknown, number>): number | undefined {
  for (const value of Object.values(entity)) {
    const id = instances.get(value);
    if (id !== undefined) {
      return id;
    }
  }
  return undefined;
}

function componentsOf(entity: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entity).filter(([key]) => !key.startsWith(ECS_ID_PREFIX)),
  );
}

/**
 * Watches the worlds a project load records: names them, times their systems frame by frame, and
 * gives each entity an id that holds until `reset`.
 */
export function trackWorlds(load: ProjectLoad): WorldTracker {
  let ids = new WeakMap<object, number>();
  let lastId = 0;
  let timings = new WeakMap<object, Timing>();
  let members = new WeakMap<object, Map<SystemRecord, HeldMembers>>();

  const worlds = (): readonly WorldRecord[] => load.worlds as readonly WorldRecord[];

  const idOf = (entity: object): number => {
    let id = ids.get(entity);
    if (id === undefined) {
      id = ++lastId;
      ids.set(entity, id);
    }
    return id;
  };

  // Every world in creation order, so an id does not depend on which world is looked at first.
  const seeAll = (): void => {
    for (const world of worlds()) {
      for (const entity of world.entities) {
        idOf(entity);
      }
      for (const system of world.systems) {
        for (const entity of system.entities ?? []) {
          idOf(entity);
        }
      }
    }
  };

  const record = (system: SystemRecord, ms: number): void => {
    let timing = timings.get(system);
    if (timing === undefined) {
      timing = { last: 0, samples: [] };
      timings.set(system, timing);
    }
    timing.last = ms;
    timing.samples.push(ms);
    if (timing.samples.length > AVERAGED_FRAMES) {
      timing.samples.shift();
    }
  };

  const averageOf = (timing: Timing | undefined): number => {
    if (timing === undefined || timing.samples.length === 0) {
      return 0;
    }
    return timing.samples.reduce((sum, ms) => sum + ms, 0) / timing.samples.length;
  };

  return {
    names(self) {
      const held = typeof self === "object" && self !== null ? Object.entries(self) : [];
      const counts = new Map<string, number>();
      let unnamed = 0;
      return worlds().map((world) => {
        const base =
          held.find(([, value]) => value === world)?.[0] ??
          load.exportName(world) ??
          `world-${++unnamed}`;
        const count = (counts.get(base) ?? 0) + 1;
        counts.set(base, count);
        return count === 1 ? base : `${base}#${count}`;
      });
    },
    frame(run) {
      const spent = new Map<SystemRecord, number>();
      const wrapped: {
        readonly system: SystemRecord;
        readonly field: string;
        readonly original: Callback;
        readonly wrapper: Callback;
      }[] = [];
      for (const world of worlds()) {
        for (const system of [...world.systems, ...(world.systemsToAdd ?? [])]) {
          for (const field of TIMED_CALLBACKS) {
            const original = system[field];
            if (typeof original !== "function") {
              continue;
            }
            const callback = original as Callback;
            const wrapper: Callback = function (this: unknown, ...args: unknown[]) {
              const started = performance.now();
              try {
                return callback.apply(this, args);
              } finally {
                spent.set(system, (spent.get(system) ?? 0) + performance.now() - started);
              }
            };
            system[field] = wrapper;
            wrapped.push({ system, field, original: callback, wrapper });
          }
        }
      }
      try {
        run();
      } finally {
        // A field that no longer holds its wrapper was replaced during the frame, by a keyed
        // reload or the system itself, and keeps what replaced it.
        for (const { system, field, original, wrapper } of wrapped) {
          if (system[field] === wrapper) {
            system[field] = original;
          }
        }
        for (const world of worlds()) {
          for (const system of world.systems) {
            record(system, spent.get(system) ?? 0);
          }
        }
        seeAll();
      }
    },
    view(world, instances) {
      seeAll();
      const { systems, entities } = world as WorldRecord;
      return {
        systems: systems.map((system, position) => {
          const index = typeof system.index === "number" ? system.index : position + 1;
          const timing = timings.get(system);
          return {
            index,
            name: load.systemName(system) ?? `system ${index}`,
            active: system.active === true,
            interval: typeof system.interval === "number" ? system.interval : undefined,
            entities: system.nocache === true ? undefined : (system.entities ?? []).map(idOf),
            ms: timing?.last ?? 0,
            avgMs: averageOf(timing),
            source: load.systemSource(system),
          };
        }),
        entities: entities.map((entity) => {
          const machine = instances === undefined ? undefined : heldInstance(entity, instances);
          return {
            id: idOf(entity),
            value: shownValue(componentsOf(entity)),
            ...(machine === undefined ? {} : { machine }),
          };
        }),
      };
    },
    holders(instances) {
      seeAll();
      const found = new Map<number, InstanceHolder>();
      worlds().forEach((world, index) => {
        for (const entity of world.entities) {
          for (const value of Object.values(entity)) {
            const id = instances.get(value);
            if (id !== undefined && !found.has(id)) {
              found.set(id, { world: index, entity: idOf(entity) });
            }
          }
        }
      });
      return found;
    },
    membership(world) {
      seeAll();
      const { systems } = world as WorldRecord;
      const before = members.get(world as object) ?? new Map<SystemRecord, HeldMembers>();
      const after = new Map<SystemRecord, HeldMembers>();
      const changes: MembershipChange[] = [];
      const present = new Set(systems);
      for (const [system, { index, entities }] of before) {
        if (present.has(system)) {
          continue;
        }
        for (const entity of entities) {
          changes.push({ kind: "leave", system: index, entity: idOf(entity) });
        }
      }
      systems.forEach((system, position) => {
        if (system.nocache === true) {
          return;
        }
        const index = typeof system.index === "number" ? system.index : position + 1;
        const held = [...(system.entities ?? [])];
        const was = before.get(system)?.entities ?? [];
        const heldSet = new Set(held);
        const wasSet = new Set(was);
        after.set(system, { index, entities: held });
        for (const entity of was) {
          if (!heldSet.has(entity)) {
            changes.push({ kind: "leave", system: index, entity: idOf(entity) });
          }
        }
        for (const entity of held) {
          if (!wasSet.has(entity)) {
            changes.push({ kind: "join", system: index, entity: idOf(entity) });
          }
        }
      });
      members.set(world as object, after);
      return changes;
    },
    reset() {
      ids = new WeakMap();
      lastId = 0;
      timings = new WeakMap();
      members = new WeakMap();
    },
  };
}

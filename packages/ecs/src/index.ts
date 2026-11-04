/*
Copyright (c) 2016 Calvin Rose

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// A TypeScript port of tiny-ecs (https://github.com/bakpakin/tiny-ecs), written
// in the subset that compiles to plain Lua 5.1 without lualib_bundle and also
// runs unchanged in Bun.

// ---------------------------------------------------------------------------
// Runtime shapes. The public types below are views over these.

type Token = string | FilterFn;
type FilterFn = (this: void, subject: unknown, candidate: unknown) => boolean;

interface EntityRecord {
  [component: string]: unknown;
}

type IdIndex = Record<number, number | undefined>;

interface SystemRecord {
  __ecs_system?: true;
  world?: WorldRecord | undefined;
  active?: boolean;
  entities?: EntityRecord[] | undefined;
  indices?: IdIndex | undefined;
  index?: number | undefined;
  modified?: boolean;
  interval?: number;
  bufferedTime?: number;
  nocache?: boolean;
  filter?: FilterFn;
  onAdd?: (this: SystemRecord, entity: EntityRecord) => void;
  onRemove?: (this: SystemRecord, entity: EntityRecord) => void;
  onModify?: (this: SystemRecord, dt: number) => void;
  onAddToWorld?: (this: SystemRecord, world: WorldRecord) => void;
  onRemoveFromWorld?: (this: SystemRecord, world: WorldRecord) => void;
  preWrap?: (this: SystemRecord, dt: number) => void;
  postWrap?: (this: SystemRecord, dt: number) => void;
  update?: (this: SystemRecord, dt: number) => void;
  preProcess?: (this: SystemRecord, dt: number) => void;
  process?: (this: SystemRecord, entity: EntityRecord, dt: number) => void;
  postProcess?: (this: SystemRecord, dt: number) => void;
  compare?: (this: SystemRecord, e1: EntityRecord, e2: EntityRecord) => boolean;
  sortDelegate?: ((this: void, e1: EntityRecord, e2: EntityRecord) => boolean) | undefined;
}

interface WorldRecord {
  idKey: string;
  systems: SystemRecord[];
  entities: EntityRecord[];
  entityIndex: IdIndex;
  entitiesToChange: EntityRecord[];
  entitiesToRemove: EntityRecord[];
  systemsToAdd: SystemRecord[];
  systemsToRemove: SystemRecord[];
  add: typeof worldAdd;
  addEntity: typeof worldAddEntity;
  changed: typeof worldAddEntity;
  addSystem: typeof worldAddSystem;
  remove: typeof worldRemove;
  removeEntity: typeof worldRemoveEntity;
  removeSystem: typeof worldRemoveSystem;
  refresh: typeof worldRefresh;
  update: typeof worldUpdate;
  clearEntities: typeof worldClearEntities;
  clearSystems: typeof worldClearSystems;
  getEntityCount: typeof worldGetEntityCount;
  getSystemCount: typeof worldGetSystemCount;
  setSystemIndex: typeof worldSetSystemIndex;
}

// ---------------------------------------------------------------------------
// Entity identity. Each world stores its entities' ids under a field of its
// own, `__ecs_id_<n>`, so one entity can join several worlds and taking a new
// id in one never rekeys a table another world indexes. A table joining a world
// takes a fresh id unless one of the world's systems still caches it under its
// current one, which only a removal in progress leaves behind, and leaving the
// world clears the field once the table is gone from the world list. A copied
// table carries its source's fields, so every lookup also checks that the slot
// the id names holds this very table.

let lastId = 0;
let lastWorld = 0;

function idOf(entity: EntityRecord, key: string): number | undefined {
  return entity[key] as number | undefined;
}

function freshId(entity: EntityRecord, key: string): number {
  lastId += 1;
  entity[key] = lastId;
  return lastId;
}

function slotOf(
  list: readonly EntityRecord[],
  index: IdIndex,
  entity: EntityRecord,
  key: string,
): number | undefined {
  const id = idOf(entity, key);
  if (id === undefined) {
    return undefined;
  }
  const pos = index[id];
  if (pos === undefined || list[pos] !== entity) {
    return undefined;
  }
  return pos;
}

function cachedId(
  systems: readonly SystemRecord[],
  entity: EntityRecord,
  key: string,
): number | undefined {
  const id = idOf(entity, key);
  if (id === undefined) {
    return undefined;
  }
  const count = systems.length;
  for (let i = 0; i < count; i++) {
    const system = systems[i] as SystemRecord;
    if (
      system.nocache !== true &&
      slotOf(system.entities as EntityRecord[], system.indices as IdIndex, entity, key) !==
        undefined
    ) {
      return id;
    }
  }
  return undefined;
}

function swapRemove(
  list: EntityRecord[],
  index: IdIndex,
  pos: number,
  entity: EntityRecord,
  key: string,
): void {
  const last = list[list.length - 1] as EntityRecord;
  list[pos] = last;
  index[idOf(last, key) as number] = pos;
  index[idOf(entity, key) as number] = undefined;
  list.pop();
}

// ---------------------------------------------------------------------------
// Array helpers that lower to plain Lua table operations.

function removeShifting<T>(list: T[], pos: number): void {
  const last = list.length - 1;
  for (let i = pos; i < last; i++) {
    list[i] = list[i + 1] as T;
  }
  list.pop();
}

function insertShifting<T>(list: T[], pos: number, item: T): void {
  let i = list.length;
  list.push(item);
  while (i > pos) {
    list[i] = list[i - 1] as T;
    i -= 1;
  }
  list[pos] = item;
}

// Binary insertion sort. Lua's table.sort is not stable and JavaScript's is, so
// the two runtimes share this one. An item moves only past items it goes
// `before`, which keeps ties in place, and it allocates nothing.
function stableSort<T>(list: T[], before: (this: void, a: T, b: T) => boolean): void {
  const count = list.length;
  for (let i = 1; i < count; i++) {
    const item = list[i] as T;
    if (before(item, list[i - 1] as T)) {
      let low = 0;
      let high = i - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (before(item, list[mid] as T)) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }
      for (let j = i; j > low; j--) {
        list[j] = list[j - 1] as T;
      }
      list[low] = item;
    }
  }
}

// ---------------------------------------------------------------------------
// Filters

function passes(token: Token, subject: unknown, candidate: unknown): boolean {
  if (typeof token === "string") {
    return (candidate as EntityRecord)[token] !== undefined;
  }
  return token(subject, candidate);
}

function requireAllFilter(tokens: readonly Token[]): FilterFn {
  return (subject, candidate) => {
    const count = tokens.length;
    for (let i = 0; i < count; i++) {
      if (!passes(tokens[i] as Token, subject, candidate)) {
        return false;
      }
    }
    return true;
  };
}

function requireAnyFilter(tokens: readonly Token[]): FilterFn {
  return (subject, candidate) => {
    const count = tokens.length;
    for (let i = 0; i < count; i++) {
      if (passes(tokens[i] as Token, subject, candidate)) {
        return true;
      }
    }
    return false;
  };
}

function rejectAllFilter(tokens: readonly Token[]): FilterFn {
  return (subject, candidate) => {
    const count = tokens.length;
    for (let i = 0; i < count; i++) {
      if (!passes(tokens[i] as Token, subject, candidate)) {
        return true;
      }
    }
    return false;
  };
}

function rejectAnyFilter(tokens: readonly Token[]): FilterFn {
  return (subject, candidate) => {
    const count = tokens.length;
    for (let i = 0; i < count; i++) {
      if (passes(tokens[i] as Token, subject, candidate)) {
        return false;
      }
    }
    return true;
  };
}

// ---------------------------------------------------------------------------
// Systems

function processingSystemUpdate(this: SystemRecord, dt: number): void {
  const preProcess = this.preProcess;
  const processEntity = this.process;
  const postProcess = this.postProcess;

  if (preProcess !== undefined) {
    preProcess.call(this, dt);
  }

  if (processEntity !== undefined) {
    if (this.nocache === true) {
      const entities = (this.world as WorldRecord).entities;
      const filter = this.filter;
      if (filter !== undefined) {
        const count = entities.length;
        for (let i = 0; i < count; i++) {
          const entity = entities[i] as EntityRecord;
          if (filter(this, entity)) {
            processEntity.call(this, entity, dt);
          }
        }
      }
    } else {
      const entities = this.entities as EntityRecord[];
      const count = entities.length;
      for (let i = 0; i < count; i++) {
        processEntity.call(this, entities[i] as EntityRecord, dt);
      }
    }
  }

  if (postProcess !== undefined) {
    postProcess.call(this, dt);
  }
}

function makeSystem(this: void, first: unknown, second?: unknown): unknown {
  let system: SystemRecord;
  if (second === undefined) {
    system = first as SystemRecord;
  } else {
    system = second as SystemRecord;
    system.filter = first as FilterFn;
  }
  system.__ecs_system = true;
  return system;
}

function makeProcessingSystem(this: void, filter: unknown, def: unknown): unknown {
  const system = def as SystemRecord;
  system.filter = filter as FilterFn;
  system.__ecs_system = true;
  system.update = processingSystemUpdate;
  return system;
}

// Reads `compare` once, at the first sort, as tiny-ecs does: replacing it later
// has no effect until the cached delegate is cleared.
function sortedSystemOnModify(this: SystemRecord, _dt: number): void {
  const entities = this.entities as EntityRecord[];
  const indices = this.indices as IdIndex;
  let sortDelegate = this.sortDelegate;
  if (sortDelegate === undefined) {
    const compare = this.compare as NonNullable<SystemRecord["compare"]>;
    sortDelegate = (e1: EntityRecord, e2: EntityRecord) => compare.call(this, e1, e2);
    this.sortDelegate = sortDelegate;
  }
  stableSort(entities, sortDelegate);
  const key = (this.world as WorldRecord).idKey;
  const count = entities.length;
  for (let i = 0; i < count; i++) {
    indices[idOf(entities[i] as EntityRecord, key) as number] = i;
  }
}

function makeSortedSystem(this: void, first: unknown, second?: unknown): unknown {
  const system = makeSystem(first, second) as SystemRecord;
  system.onModify = sortedSystemOnModify;
  return system;
}

function makeSortedProcessingSystem(this: void, filter: unknown, def: unknown): unknown {
  const system = makeProcessingSystem(filter, def) as SystemRecord;
  system.onModify = sortedSystemOnModify;
  return system;
}

// ---------------------------------------------------------------------------
// World

function isSystem(item: unknown): boolean {
  return (item as SystemRecord).__ecs_system === true;
}

function worldAddEntity(this: WorldRecord, entity: EntityRecord): EntityRecord {
  this.entitiesToChange.push(entity);
  return entity;
}

function worldAddSystem(this: WorldRecord, system: SystemRecord): SystemRecord {
  if (system.world !== undefined) {
    throw "ecs: the system already belongs to a world";
  }
  this.systemsToAdd.push(system);
  system.world = this;
  return system;
}

function addItems(world: WorldRecord, items: readonly unknown[]): void {
  const count = items.length;
  for (let i = 0; i < count; i++) {
    const item = items[i];
    if (isSystem(item)) {
      worldAddSystem.call(world, item as SystemRecord);
    } else {
      worldAddEntity.call(world, item as EntityRecord);
    }
  }
}

function worldAdd(this: WorldRecord, ...items: unknown[]): void {
  addItems(this, items);
}

function worldRemoveEntity(this: WorldRecord, entity: EntityRecord): EntityRecord {
  this.entitiesToRemove.push(entity);
  return entity;
}

function worldRemoveSystem(this: WorldRecord, system: SystemRecord): SystemRecord {
  if (system.world !== this) {
    throw "ecs: the system does not belong to this world";
  }
  this.systemsToRemove.push(system);
  return system;
}

function removeItems(world: WorldRecord, items: readonly unknown[]): void {
  const count = items.length;
  for (let i = 0; i < count; i++) {
    const item = items[i];
    if (isSystem(item)) {
      worldRemoveSystem.call(world, item as SystemRecord);
    } else {
      worldRemoveEntity.call(world, item as EntityRecord);
    }
  }
}

function worldRemove(this: WorldRecord, ...items: unknown[]): void {
  removeItems(this, items);
}

function manageSystems(world: WorldRecord): void {
  const s2a = world.systemsToAdd;
  const s2r = world.systemsToRemove;

  if (s2a.length === 0 && s2r.length === 0) {
    return;
  }

  world.systemsToAdd = [];
  world.systemsToRemove = [];

  const addCount = s2a.length;
  const removeCount = s2r.length;
  const worldEntityList = world.entities;
  const systems = world.systems;

  for (let i = 0; i < removeCount; i++) {
    const system = s2r[i] as SystemRecord;
    const index = system.index;
    if (index !== undefined) {
      const onRemove = system.onRemove;
      if (onRemove !== undefined && system.nocache !== true) {
        const entityList = system.entities as EntityRecord[];
        const count = entityList.length;
        for (let j = 0; j < count; j++) {
          onRemove.call(system, entityList[j] as EntityRecord);
        }
      }
      removeShifting(systems, index - 1);
      const systemCount = systems.length;
      for (let j = index - 1; j < systemCount; j++) {
        (systems[j] as SystemRecord).index = j + 1;
      }
      const onRemoveFromWorld = system.onRemoveFromWorld;
      if (onRemoveFromWorld !== undefined) {
        onRemoveFromWorld.call(system, world);
      }

      system.world = undefined;
      system.entities = undefined;
      system.indices = undefined;
      system.index = undefined;
    }
  }

  for (let i = 0; i < addCount; i++) {
    const system = s2a[i] as SystemRecord;
    const at = system.index;
    if (at === undefined || systems[at - 1] !== system) {
      if (system.nocache !== true) {
        system.entities = [];
        system.indices = {};
      }
      if (system.active === undefined) {
        system.active = true;
      }
      system.modified = true;
      system.world = world;
      systems.push(system);
      system.index = systems.length;
      const onAddToWorld = system.onAddToWorld;
      if (onAddToWorld !== undefined) {
        onAddToWorld.call(system, world);
      }

      if (system.nocache !== true) {
        const entityList = system.entities as EntityRecord[];
        const entityIndices = system.indices as IdIndex;
        const onAdd = system.onAdd;
        const filter = system.filter;
        if (filter !== undefined) {
          const count = worldEntityList.length;
          for (let j = 0; j < count; j++) {
            const entity = worldEntityList[j] as EntityRecord;
            if (filter(system, entity)) {
              entityIndices[idOf(entity, world.idKey) as number] = entityList.length;
              entityList.push(entity);
              if (onAdd !== undefined) {
                onAdd.call(system, entity);
              }
            }
          }
        }
      }
    }
  }
}

function manageEntities(world: WorldRecord): void {
  const e2r = world.entitiesToRemove;
  const e2c = world.entitiesToChange;

  if (e2r.length === 0 && e2c.length === 0) {
    return;
  }

  world.entitiesToChange = [];
  world.entitiesToRemove = [];

  const changeCount = e2c.length;
  const removeCount = e2r.length;
  const entities = world.entities;
  const entityIndex = world.entityIndex;
  const systems = world.systems;
  const key = world.idKey;

  for (let i = 0; i < changeCount; i++) {
    const entity = e2c[i] as EntityRecord;
    if (slotOf(entities, entityIndex, entity, key) === undefined) {
      let id = cachedId(systems, entity, key);
      if (id === undefined) {
        id = freshId(entity, key);
      }
      entityIndex[id] = entities.length;
      entities.push(entity);
    }
    const systemCount = systems.length;
    for (let j = 0; j < systemCount; j++) {
      const system = systems[j] as SystemRecord;
      if (system.nocache !== true) {
        const ses = system.entities as EntityRecord[];
        const seis = system.indices as IdIndex;
        const index = slotOf(ses, seis, entity, key);
        const filter = system.filter;
        if (filter?.(system, entity)) {
          if (index === undefined) {
            system.modified = true;
            seis[idOf(entity, key) as number] = ses.length;
            ses.push(entity);
            const onAdd = system.onAdd;
            if (onAdd !== undefined) {
              onAdd.call(system, entity);
            }
          }
        } else if (index !== undefined) {
          system.modified = true;
          swapRemove(ses, seis, index, entity, key);
          const onRemove = system.onRemove;
          if (onRemove !== undefined) {
            onRemove.call(system, entity);
          }
        }
      }
    }
  }

  for (let i = 0; i < removeCount; i++) {
    const entity = e2r[i] as EntityRecord;
    const listIndex = slotOf(entities, entityIndex, entity, key);
    if (listIndex !== undefined) {
      swapRemove(entities, entityIndex, listIndex, entity, key);
      const systemCount = systems.length;
      for (let j = 0; j < systemCount; j++) {
        const system = systems[j] as SystemRecord;
        if (system.nocache !== true) {
          const ses = system.entities as EntityRecord[];
          const seis = system.indices as IdIndex;
          const index = slotOf(ses, seis, entity, key);
          if (index !== undefined) {
            system.modified = true;
            swapRemove(ses, seis, index, entity, key);
            const onRemove = system.onRemove;
            if (onRemove !== undefined) {
              onRemove.call(system, entity);
            }
          }
        }
      }
      if (slotOf(entities, entityIndex, entity, key) === undefined) {
        entity[key] = undefined;
      }
    }
  }
}

function worldRefresh(this: WorldRecord): void {
  manageSystems(this);
  manageEntities(this);
  const systems = this.systems;
  for (let i = systems.length - 1; i >= 0; i--) {
    const system = systems[i] as SystemRecord;
    if (system.active === true) {
      const onModify = system.onModify;
      if (onModify !== undefined && system.modified === true) {
        onModify.call(system, 0);
      }
      system.modified = false;
    }
  }
}

function worldUpdate(this: WorldRecord, dt: number, filter?: FilterFn): void {
  manageSystems(this);
  manageEntities(this);

  const systems = this.systems;

  for (let i = systems.length - 1; i >= 0; i--) {
    const system = systems[i] as SystemRecord;
    if (system.active === true) {
      const onModify = system.onModify;
      if (onModify !== undefined && system.modified === true) {
        onModify.call(system, dt);
      }
      const preWrap = system.preWrap;
      if (preWrap !== undefined && (filter === undefined || filter(this, system))) {
        preWrap.call(system, dt);
      }
    }
  }

  const updateCount = systems.length;
  for (let i = 0; i < updateCount; i++) {
    const system = systems[i] as SystemRecord;
    if (system.active === true && (filter === undefined || filter(this, system))) {
      const update = system.update;
      if (update !== undefined) {
        const interval = system.interval;
        if (interval !== undefined) {
          const buffered = system.bufferedTime;
          let bufferedTime = (buffered === undefined ? 0 : buffered) + dt;
          while (bufferedTime >= interval) {
            bufferedTime -= interval;
            update.call(system, interval);
          }
          system.bufferedTime = bufferedTime;
        } else {
          update.call(system, dt);
        }
      }

      system.modified = false;
    }
  }

  const postWrapCount = systems.length;
  for (let i = 0; i < postWrapCount; i++) {
    const system = systems[i] as SystemRecord;
    const postWrap = system.postWrap;
    if (
      postWrap !== undefined &&
      system.active === true &&
      (filter === undefined || filter(this, system))
    ) {
      postWrap.call(system, dt);
    }
  }
}

function worldClearEntities(this: WorldRecord): void {
  const entities = this.entities;
  const count = entities.length;
  for (let i = 0; i < count; i++) {
    worldRemoveEntity.call(this, entities[i] as EntityRecord);
  }
}

function worldClearSystems(this: WorldRecord): void {
  const systems = this.systems;
  for (let i = systems.length - 1; i >= 0; i--) {
    worldRemoveSystem.call(this, systems[i] as SystemRecord);
  }
}

function worldGetEntityCount(this: WorldRecord): number {
  return this.entities.length;
}

function worldGetSystemCount(this: WorldRecord): number {
  return this.systems.length;
}

function worldSetSystemIndex(this: WorldRecord, system: SystemRecord, index: number): number {
  manageSystems(this);
  const oldIndex = system.index;
  if (oldIndex === undefined || system.world !== this) {
    throw "ecs: the system does not belong to this world";
  }
  const systems = this.systems;

  let target = index;
  if (target < 0) {
    target = systems.length + 1 + target;
  }

  removeShifting(systems, oldIndex - 1);
  insertShifting(systems, target - 1, system);

  if (target >= oldIndex) {
    for (let i = oldIndex; i <= target; i++) {
      (systems[i - 1] as SystemRecord).index = i;
    }
  } else {
    for (let i = oldIndex; i >= target; i--) {
      (systems[i - 1] as SystemRecord).index = i;
    }
  }

  return oldIndex;
}

function newWorld(items: readonly unknown[]): WorldRecord {
  lastWorld += 1;
  const created: WorldRecord = {
    idKey: `__ecs_id_${lastWorld}`,
    systems: [],
    entities: [],
    entityIndex: {},
    entitiesToChange: [],
    entitiesToRemove: [],
    systemsToAdd: [],
    systemsToRemove: [],
    add: worldAdd,
    addEntity: worldAddEntity,
    changed: worldAddEntity,
    addSystem: worldAddSystem,
    remove: worldRemove,
    removeEntity: worldRemoveEntity,
    removeSystem: worldRemoveSystem,
    refresh: worldRefresh,
    update: worldUpdate,
    clearEntities: worldClearEntities,
    clearSystems: worldClearSystems,
    getEntityCount: worldGetEntityCount,
    getSystemCount: worldGetSystemCount,
    setSystemIndex: worldSetSystemIndex,
  };
  addItems(created, items);
  manageSystems(created);
  manageEntities(created);
  return created;
}

// ---------------------------------------------------------------------------
// Public types

declare const filterKeys: unique symbol;

interface FilterKeys<R extends string, U extends string> {
  readonly required: R;
  readonly used: U;
}

// Method syntax keeps the parameters bivariant, so a filter written for a
// narrower entity or system type still fits.
type FilterCall = {
  bivariant(this: void, subject: unknown, candidate: unknown): boolean;
}["bivariant"];

/**
 * Selects the entities a system sees, called as `filter(system, entity)`, or the
 * systems an `update` runs, called as `filter(world, system)`. A filter built by
 * `requireAll` and its siblings records the components it requires (`R`) and the
 * components it names (`U`).
 */
export type Filter<R extends string = string, U extends string = string> = FilterCall & {
  readonly [filterKeys]?: FilterKeys<R, U>;
};

type FilterToken = string | Filter;

type KeysIn<F> = F extends { readonly [filterKeys]?: infer K }
  ? NonNullable<K> extends FilterKeys<infer R, infer U>
    ? { required: R; used: U }
    : { required: never; used: never }
  : { required: never; used: never };

type RequiredBy<T> = T extends string ? T : KeysIn<T>["required"];
type UsedBy<T> = T extends string ? T : KeysIn<T>["used"];

// A filter typed as plain `Filter` names no known keys, so it is not checked.
type KnownKeys<E, F> = string extends KeysIn<F>["used"]
  ? unknown
  : [Exclude<KeysIn<F>["used"], keyof E>] extends [never]
    ? unknown
    : { readonly "unknown components": Exclude<KeysIn<F>["used"], keyof E> };

/** `E` with the components `K` present. */
export type With<E, K> = [K] extends [never]
  ? E
  : E & { [P in K & keyof E]-?: Exclude<E[P], undefined> };

/** The fields every system carries. ecs sets `world`, `entities`, `indices` and `index`. */
export interface SystemFields<E> {
  /** The world the system belongs to, set by `addSystem`. */
  readonly world?: World<E> | undefined;
  /** Whether `update` and `refresh` run the system. Defaults to `true`. */
  active?: boolean | undefined;
  /** The entities the system holds, in the order it processes them. A `nocache` system has none. */
  readonly entities?: readonly E[] | undefined;
  /** Each held entity's position in `entities`, keyed by the entity's id in the system's world. */
  readonly indices?: Readonly<Record<number, number | undefined>> | undefined;
  /** The system's 1-based position in its world. Change it with `setSystemIndex`. */
  readonly index?: number | undefined;
  /** Whether the system's entities changed since its last update; `onModify` runs while it is set. */
  modified?: boolean | undefined;
  /** When set, `update` runs once per `interval` of buffered time instead of once per frame. */
  interval?: number | undefined;
  /** The time an interval system has buffered toward its next update. */
  bufferedTime?: number | undefined;
  /** When `true`, a processing system filters the world's entities on every update and keeps no `entities` list. */
  nocache?: boolean | undefined;
  /** Selects the system's entities. */
  filter?: Filter | undefined;
}

/** The callbacks every system may define. `this` is the system. */
export interface SystemCallbacks<E, X = E> {
  /** An entity joined the system. */
  onAdd?(entity: X): void;
  /** An entity left the system. */
  onRemove?(entity: E): void;
  /** Runs before the next update after the system's entities changed. */
  onModify?(dt: number): void;
  /** The system joined a world, before it takes the world's entities. */
  onAddToWorld?(world: World<E>): void;
  /** The system left a world, after its entities left it. */
  onRemoveFromWorld?(world: World<E>): void;
  /** Runs before any system updates, in reverse index order. */
  preWrap?(dt: number): void;
  /** Runs after every system updated, in index order. */
  postWrap?(dt: number): void;
}

/** The callbacks of a system built by `system`. */
export interface PlainSystemCallbacks<E, X = E> extends SystemCallbacks<E, X> {
  /** Runs once per world update, or once per `interval`. */
  update?(dt: number): void;
}

/** The callbacks of a system built by `processingSystem`. */
export interface ProcessingSystemCallbacks<E, X = E> extends SystemCallbacks<E, X> {
  /** Runs before the system processes its entities. */
  preProcess?(dt: number): void;
  /** Runs once per entity the system holds. */
  process?(entity: X, dt: number): void;
  /** Runs after the system processed its entities. */
  postProcess?(dt: number): void;
  /** A processing system's `update` runs `preProcess`, `process` and `postProcess`. */
  update?: never;
}

/** What a sorted system's definition adds to its callbacks. */
export interface SortedDefinition<X> {
  /** Whether `e1` goes before `e2`. Read once, at the system's first sort. */
  compare(e1: X, e2: X): boolean;
  /** A sorted system keeps its entities, so it cannot be `nocache`. */
  nocache?: false | undefined;
}

/** The callbacks of a system built by `sortedSystem`. */
export interface SortedSystemCallbacks<E, X = E>
  extends PlainSystemCallbacks<E, X>,
    SortedDefinition<X> {
  /** A sorted system's `onModify` sorts its entities. */
  onModify?: never;
}

/** The callbacks of a system built by `sortedProcessingSystem`. */
export interface SortedProcessingSystemCallbacks<E, X = E>
  extends ProcessingSystemCallbacks<E, X>,
    SortedDefinition<X> {
  /** A sorted system's `onModify` sorts its entities. */
  onModify?: never;
}

/** A system: its definition `D` plus the fields ecs manages. */
export type System<E, D = unknown> = D & SystemFields<E>;

/** The fields a sorted system adds to those every system carries. */
export interface SortedSystemFields<X> {
  /** A sorted system keeps its entities, so it cannot be `nocache`. */
  nocache?: false | undefined;
  /** `compare` bound to the system, built at the first sort and kept. */
  readonly sortDelegate?: ((this: void, e1: X, e2: X) => boolean) | undefined;
}

/** A sorted system over entities `E` whose `compare` takes `X`. */
export type SortedSystem<E, D = unknown, X = E> = System<E, D> & SortedSystemFields<X>;

// Callback keys take their type from the callback interface alone. Typed as
// `D & C`, a callback written as an arrow would also carry its own signature,
// and TSTL would then compile it without the `self` slot ecs passes the system in.
type Definition<D, C> = { [K in keyof D]: K extends keyof C ? C[K] : D[K] } & C;

/** Builds a system from a definition, with or without a filter. */
export interface SystemFactory<E> {
  <D extends object>(
    this: void,
    def: Definition<D, PlainSystemCallbacks<E>> & ThisType<System<E, D>>,
  ): System<E, D>;
  <F extends Filter, D extends object>(
    this: void,
    filter: F & KnownKeys<E, F>,
    def: Definition<D, PlainSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> &
      ThisType<System<E, D>>,
  ): System<E, D>;
}

/** Builds a processing system from a filter and a definition. */
export type ProcessingSystemFactory<E> = <F extends Filter, D extends object>(
  this: void,
  filter: F & KnownKeys<E, F>,
  def: Definition<D, ProcessingSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> &
    ThisType<System<E, D>>,
) => System<E, D>;

/** Builds a sorted system from a definition, with or without a filter. */
export interface SortedSystemFactory<E> {
  <D extends object>(
    this: void,
    def: Definition<D, SortedSystemCallbacks<E>> & ThisType<SortedSystem<E, D>>,
  ): SortedSystem<E, D>;
  <F extends Filter, D extends object>(
    this: void,
    filter: F & KnownKeys<E, F>,
    def: Definition<D, SortedSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> &
      ThisType<SortedSystem<E, D, With<E, KeysIn<F>["required"]>>>,
  ): SortedSystem<E, D, With<E, KeysIn<F>["required"]>>;
}

/** Builds a sorted processing system from a filter and a definition. */
export type SortedProcessingSystemFactory<E> = <F extends Filter, D extends object>(
  this: void,
  filter: F & KnownKeys<E, F>,
  def: Definition<D, SortedProcessingSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> &
    ThisType<SortedSystem<E, D, With<E, KeysIn<F>["required"]>>>,
) => SortedSystem<E, D, With<E, KeysIn<F>["required"]>>;

/**
 * Holds entities and systems. Adding and removing take effect at the next
 * `refresh` or `update`.
 */
export interface World<E> {
  /** The world's systems, in index order. */
  readonly systems: readonly SystemFields<E>[];
  /** The entities the world holds, as of its last `refresh` or `update`. */
  readonly entities: readonly E[];
  /** Adds each item as a system or an entity. */
  add(this: World<E>, ...items: (E | SystemFields<E>)[]): void;
  /** Adds an entity, or re-checks one whose components changed. */
  addEntity<T extends E>(this: World<E>, entity: T): T;
  /** Re-checks an entity whose components changed; the same as `addEntity`. */
  changed<T extends E>(this: World<E>, entity: T): T;
  /** Adds a system. Throws if the system already belongs to a world. */
  addSystem<S extends SystemFields<E>>(this: World<E>, system: S): S;
  /** Removes each item as a system or an entity. */
  remove(this: World<E>, ...items: (E | SystemFields<E>)[]): void;
  /** Removes an entity. */
  removeEntity<T extends E>(this: World<E>, entity: T): T;
  /** Removes a system. Throws if the system belongs to another world or none. */
  removeSystem<S extends SystemFields<E>>(this: World<E>, system: S): S;
  /** Applies pending changes and runs `onModify` with `0` on each modified system. */
  refresh(this: World<E>): void;
  /** Applies pending changes and updates every active system, or those `systemFilter` selects. */
  update(this: World<E>, dt: number, systemFilter?: Filter): void;
  /** Removes every entity. */
  clearEntities(this: World<E>): void;
  /** Removes every system. */
  clearSystems(this: World<E>): void;
  /** The number of entities the world holds. */
  getEntityCount(this: World<E>): number;
  /** The number of systems the world holds. */
  getSystemCount(this: World<E>): number;
  /** Moves a system to a 1-based index (negative counts from the end) and returns its old index. */
  setSystemIndex(this: World<E>, system: SystemFields<E>, index: number): number;
}

// ---------------------------------------------------------------------------
// Public functions

/** Selects entities that have every component and pass every filter given. */
export function requireAll<const T extends readonly FilterToken[]>(
  ...tokens: T
): Filter<RequiredBy<T[number]>, UsedBy<T[number]>> {
  return requireAllFilter(tokens as readonly Token[]) as Filter<
    RequiredBy<T[number]>,
    UsedBy<T[number]>
  >;
}

/** Selects entities that have at least one component or pass at least one filter given. */
export function requireAny<const T extends readonly FilterToken[]>(
  ...tokens: T
): Filter<never, UsedBy<T[number]>> {
  return requireAnyFilter(tokens as readonly Token[]) as Filter<never, UsedBy<T[number]>>;
}

/** Rejects entities that have every component and pass every filter given. */
export function rejectAll<const T extends readonly FilterToken[]>(
  ...tokens: T
): Filter<never, UsedBy<T[number]>> {
  return rejectAllFilter(tokens as readonly Token[]) as Filter<never, UsedBy<T[number]>>;
}

/** Rejects entities that have at least one component or pass at least one filter given. */
export function rejectAny<const T extends readonly FilterToken[]>(
  ...tokens: T
): Filter<never, UsedBy<T[number]>> {
  return rejectAnyFilter(tokens as readonly Token[]) as Filter<never, UsedBy<T[number]>>;
}

/** Returns a factory for plain systems over entities of type `E`. */
export function system<E>(): SystemFactory<E> {
  return makeSystem as unknown as SystemFactory<E>;
}

/** Returns a factory for processing systems over entities of type `E`. */
export function processingSystem<E>(): ProcessingSystemFactory<E> {
  return makeProcessingSystem as unknown as ProcessingSystemFactory<E>;
}

/** Returns a factory for systems that keep their entities ordered by `compare`. */
export function sortedSystem<E>(): SortedSystemFactory<E> {
  return makeSortedSystem as unknown as SortedSystemFactory<E>;
}

/** Returns a factory for processing systems that process their entities in `compare` order. */
export function sortedProcessingSystem<E>(): SortedProcessingSystemFactory<E> {
  return makeSortedProcessingSystem as unknown as SortedProcessingSystemFactory<E>;
}

/** Creates a world holding `items`, applied at once. */
export function world<E>(...items: (E | SystemFields<E>)[]): World<E> {
  return newWorld(items) as unknown as World<E>;
}

export function add<E>(target: World<E>, ...items: (E | SystemFields<E>)[]): void {
  addItems(target as unknown as WorldRecord, items);
}

export function addEntity<E, T extends E>(target: World<E>, entity: T): T {
  return target.addEntity(entity);
}

export function changed<E, T extends E>(target: World<E>, entity: T): T {
  return target.changed(entity);
}

export function addSystem<E, S extends SystemFields<E>>(target: World<E>, system: S): S {
  return target.addSystem(system);
}

export function remove<E>(target: World<E>, ...items: (E | SystemFields<E>)[]): void {
  removeItems(target as unknown as WorldRecord, items);
}

export function removeEntity<E, T extends E>(target: World<E>, entity: T): T {
  return target.removeEntity(entity);
}

export function removeSystem<E, S extends SystemFields<E>>(target: World<E>, system: S): S {
  return target.removeSystem(system);
}

export function refresh<E>(target: World<E>): void {
  target.refresh();
}

export function update<E>(target: World<E>, dt: number, systemFilter?: Filter): void {
  target.update(dt, systemFilter);
}

export function clearEntities<E>(target: World<E>): void {
  target.clearEntities();
}

export function clearSystems<E>(target: World<E>): void {
  target.clearSystems();
}

export function getEntityCount<E>(target: World<E>): number {
  return target.getEntityCount();
}

export function getSystemCount<E>(target: World<E>): number {
  return target.getSystemCount();
}

export function setSystemIndex<E>(
  target: World<E>,
  system: SystemFields<E>,
  index: number,
): number {
  return target.setSystemIndex(system, index);
}

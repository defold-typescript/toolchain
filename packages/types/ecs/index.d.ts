// Generated from packages/ecs/src/index.ts by `bun run --cwd packages/transpiler declarations`; do not edit.
declare const filterKeys: unique symbol;
interface FilterKeys<R extends string, U extends string> {
    readonly required: R;
    readonly used: U;
}
type FilterCall = {
    bivariant(this: void, subject: unknown, candidate: unknown): boolean;
}["bivariant"];
/**
 * Selects the entities a system sees, or the systems an `update` runs.
 *
 * @remarks
 * A system calls it as `filter(system, entity)`, and `update` calls it as `filter(world, system)`.
 * A filter built by `requireAll` and its siblings records the components it requires (`R`) and
 * the components it names (`U`), so a system's callbacks see the required components as present
 * and a name the entity type lacks is a compile error.
 *
 * @see requireAll
 * @see https://defold-typescript.github.io/toolchain/entity-systems#filters
 */
export type Filter<R extends string = string, U extends string = string> = FilterCall & {
    readonly [filterKeys]?: FilterKeys<R, U>;
};
type FilterToken = string | Filter;
type KeysIn<F> = F extends {
    readonly [filterKeys]?: infer K;
} ? NonNullable<K> extends FilterKeys<infer R, infer U> ? {
    required: R;
    used: U;
} : {
    required: never;
    used: never;
} : {
    required: never;
    used: never;
};
type RequiredBy<T> = T extends string ? T : KeysIn<T>["required"];
type UsedBy<T> = T extends string ? T : KeysIn<T>["used"];
type KnownKeys<E, F> = string extends KeysIn<F>["used"] ? unknown : [Exclude<KeysIn<F>["used"], keyof E>] extends [never] ? unknown : {
    readonly "unknown components": Exclude<KeysIn<F>["used"], keyof E>;
};
type PatternOperator = "&" | "|" | "!" | "(" | ")";
type PatternNames<P extends string, Name extends string = "", Names extends string = never> = string extends P ? string : P extends `${infer C}${infer Rest}` ? C extends PatternOperator ? PatternNames<Rest, "", Names | (Name extends "" ? never : Name)> : PatternNames<Rest, `${Name}${C}`, Names> : Names | (Name extends "" ? never : Name);
/** `E` with the components `K` present. */
export type With<E, K> = [K] extends [never] ? E : E & {
    [P in K & keyof E]-?: Exclude<E[P], undefined>;
};
/**
 * The fields every system carries.
 *
 * @remarks
 * ecs sets `world`, `entities`, `indices`, `index`, `modified` and `bufferedTime`. A definition
 * may set `active`, `interval`, `nocache` and its own fields, and the factory sets `filter`.
 */
export interface SystemFields<E> {
    /**
     * The world the system belongs to.
     *
     * @remarks
     * `addSystem` sets it at once, and it is cleared when the system leaves at a `refresh` or
     * `update`.
     */
    readonly world?: World<E> | undefined;
    /**
     * Whether `update` and `refresh` run the system.
     *
     * @remarks
     * Defaults to `true`. An inactive system still gains and loses entities, with `onAdd` and
     * `onRemove`.
     */
    active?: boolean | undefined;
    /**
     * The entities the system holds, in the order it processes them.
     *
     * @remarks
     * A `nocache` system has none.
     */
    readonly entities?: readonly E[] | undefined;
    /** Each held entity's position in `entities`, keyed by the entity's id in the system's world. */
    readonly indices?: Readonly<Record<number, number | undefined>> | undefined;
    /**
     * The system's 1-based position in its world.
     *
     * @see World.setSystemIndex
     */
    readonly index?: number | undefined;
    /**
     * Whether the system's entities changed since its last update.
     *
     * @remarks
     * `onModify` runs while it is set. An `update` whose system filter leaves the system out keeps
     * it set.
     */
    modified?: boolean | undefined;
    /**
     * When set, `update` runs once per `interval` of buffered time instead of once per frame.
     *
     * @remarks
     * The system buffers each update's `dt` and runs `update` once for each whole `interval` it
     * holds, with `interval` as `dt`: zero, one or several times a frame.
     */
    interval?: number | undefined;
    /** The time an interval system has buffered toward its next update. */
    bufferedTime?: number | undefined;
    /**
     * When `true`, a processing system keeps no `entities` list.
     *
     * @remarks
     * A `nocache` system filters the world's entities on every update and gets no `onAdd` or
     * `onRemove`. A keyed reload cannot change it.
     */
    nocache?: boolean | undefined;
    /**
     * Selects the system's entities.
     *
     * @remarks
     * The factory sets it from its first argument. A system built without one holds no entities.
     */
    filter?: Filter | undefined;
}
/**
 * The callbacks every system may define.
 *
 * @remarks
 * `this` is the system in each.
 *
 * @see https://defold-typescript.github.io/toolchain/entity-systems#one-frame
 */
export interface SystemCallbacks<E, X = E> {
    /**
     * Runs when an entity joins the system.
     *
     * @remarks
     * Runs while the `refresh` or `update` that applies the add runs, before any `onModify`.
     *
     * @param entity The entity, which has the filter's components.
     */
    onAdd?(entity: X): void;
    /**
     * Runs when an entity leaves the system.
     *
     * @remarks
     * Runs while the `refresh` or `update` that applies the change runs, and for every entity the
     * system holds when the system leaves its world.
     *
     * @param entity The entity, which may have lost the filter's components.
     */
    onRemove?(entity: E): void;
    /**
     * Runs before the next update after the system's entities changed.
     *
     * @remarks
     * `update` runs `onModify` and `preWrap` together from the last system to the first: system N
     * runs both before system N-1 runs either. A system that just joined counts as changed.
     *
     * @param dt The update's `dt`, or `0` from `refresh`.
     */
    onModify?(dt: number): void;
    /**
     * Runs when the system joins a world, before it takes the world's entities.
     *
     * @param world The world the system joined.
     */
    onAddToWorld?(world: World<E>): void;
    /**
     * Runs when the system leaves a world, after its entities left it.
     *
     * @param world The world the system left.
     */
    onRemoveFromWorld?(world: World<E>): void;
    /**
     * Runs before any system updates.
     *
     * @remarks
     * `update` runs `onModify` and `preWrap` together from the last system to the first: system N
     * runs both before system N-1 runs either.
     *
     * @param dt The update's `dt`.
     */
    preWrap?(dt: number): void;
    /**
     * Runs after every system updated.
     *
     * @remarks
     * `update` runs `postWrap` from the first system to the last.
     *
     * @param dt The update's `dt`.
     */
    postWrap?(dt: number): void;
}
/** The callbacks of a system built by `system`. */
export interface PlainSystemCallbacks<E, X = E> extends SystemCallbacks<E, X> {
    /**
     * Runs once per world update, or once per `interval`.
     *
     * @remarks
     * The world runs `update` from the first system to the last.
     *
     * @param dt The update's `dt`, or the system's `interval`.
     */
    update?(dt: number): void;
}
/** The callbacks of a system built by `processingSystem`. */
export interface ProcessingSystemCallbacks<E, X = E> extends SystemCallbacks<E, X> {
    /**
     * Runs before the system processes its entities.
     *
     * @param dt The update's `dt`, or the system's `interval`.
     */
    preProcess?(dt: number): void;
    /**
     * Runs once for each entity the system holds.
     *
     * @param entity The entity, which has the filter's components.
     * @param dt The update's `dt`, or the system's `interval`.
     */
    process?(entity: X, dt: number): void;
    /**
     * Runs after the system processed its entities.
     *
     * @param dt The update's `dt`, or the system's `interval`.
     */
    postProcess?(dt: number): void;
    /** A processing system's `update` runs `preProcess`, `process` and `postProcess`. */
    update?: never;
}
/** What a sorted system's definition adds to its callbacks. */
export interface SortedDefinition<X> {
    /**
     * Whether `e1` goes before `e2`.
     *
     * @remarks
     * Read at the system's first sort, and again after a keyed reload. The sort is stable: two
     * entities where neither goes before the other keep their order.
     *
     * @param e1 An entity the system holds.
     * @param e2 Another entity the system holds.
     * @returns `true` when `e1` goes first.
     */
    compare(e1: X, e2: X): boolean;
    /** A sorted system keeps its entities, so it cannot be `nocache`. */
    nocache?: false | undefined;
}
/** The callbacks of a system built by `sortedSystem`. */
export interface SortedSystemCallbacks<E, X = E> extends PlainSystemCallbacks<E, X>, SortedDefinition<X> {
    /** A sorted system's `onModify` sorts its entities. */
    onModify?: never;
}
/** The callbacks of a system built by `sortedProcessingSystem`. */
export interface SortedProcessingSystemCallbacks<E, X = E> extends ProcessingSystemCallbacks<E, X>, SortedDefinition<X> {
    /** A sorted system's `onModify` sorts its entities. */
    onModify?: never;
}
/** A system: its definition `D` plus the fields ecs manages. */
export type System<E, D = unknown> = D & SystemFields<E>;
/** The fields a sorted system adds to those every system carries. */
export interface SortedSystemFields<X> {
    /** A sorted system keeps its entities, so it cannot be `nocache`. */
    nocache?: false | undefined;
    /** `compare` bound to the system, built at the first sort and kept until a keyed reload. */
    readonly sortDelegate?: ((this: void, e1: X, e2: X) => boolean) | undefined;
}
/** A sorted system over entities `E` whose `compare` takes `X`. */
export type SortedSystem<E, D = unknown, X = E> = System<E, D> & SortedSystemFields<X>;
type Definition<D, C> = {
    [K in keyof D]: K extends keyof C ? C[K] : D[K];
} & C;
/**
 * Builds a system from a definition, with or without a filter.
 *
 * @see system
 */
export interface SystemFactory<E> {
    /**
     * Builds a system that holds no entities.
     *
     * @param def The system's fields and callbacks; `this` in each callback is the system.
     * @returns `def` as a system, or under a key the system the key built first.
     * @throws When a keyed reload changes `nocache`.
     */
    <D extends object>(this: void, def: Definition<D, PlainSystemCallbacks<E>> & ThisType<System<E, D>>): System<E, D>;
    /**
     * Builds a system over the entities `filter` selects.
     *
     * @param filter Selects the system's entities; its required components are present in each
     * callback.
     * @param def The system's fields and callbacks; `this` in each callback is the system.
     * @returns `def` as a system, or under a key the system the key built first.
     * @throws When a keyed reload changes `nocache`.
     */
    <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, PlainSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<System<E, D>>): System<E, D>;
}
/**
 * Builds a processing system from a filter and a definition.
 *
 * @remarks
 * `filter`'s required components are present in each callback, and `this` in each is the system.
 * Under a key it returns the system the key built first, and throws when the reload changes
 * `nocache`.
 *
 * @see processingSystem
 */
export type ProcessingSystemFactory<E> = <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, ProcessingSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<System<E, D>>) => System<E, D>;
/**
 * Builds a sorted system from a definition, with or without a filter.
 *
 * @see sortedSystem
 */
export interface SortedSystemFactory<E> {
    /**
     * Builds a sorted system that holds no entities.
     *
     * @param def The system's fields, callbacks and `compare`; `this` in each is the system.
     * @returns `def` as a system, or under a key the system the key built first.
     * @throws When a keyed reload changes `nocache`.
     */
    <D extends object>(this: void, def: Definition<D, SortedSystemCallbacks<E>> & ThisType<SortedSystem<E, D>>): SortedSystem<E, D>;
    /**
     * Builds a sorted system over the entities `filter` selects.
     *
     * @param filter Selects the system's entities; its required components are present in each
     * callback and in `compare`.
     * @param def The system's fields, callbacks and `compare`; `this` in each is the system.
     * @returns `def` as a system, or under a key the system the key built first.
     * @throws When a keyed reload changes `nocache`.
     */
    <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, SortedSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<SortedSystem<E, D, With<E, KeysIn<F>["required"]>>>): SortedSystem<E, D, With<E, KeysIn<F>["required"]>>;
}
/**
 * Builds a sorted processing system from a filter and a definition.
 *
 * @remarks
 * `filter`'s required components are present in each callback and in `compare`, and `this` in
 * each is the system. Under a key it returns the system the key built first, and throws when the
 * reload changes `nocache`.
 *
 * @see sortedProcessingSystem
 */
export type SortedProcessingSystemFactory<E> = <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, SortedProcessingSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<SortedSystem<E, D, With<E, KeysIn<F>["required"]>>>) => SortedSystem<E, D, With<E, KeysIn<F>["required"]>>;
/**
 * Holds entities and systems.
 *
 * @remarks
 * Adding and removing take effect at the next `refresh` or `update`, so no system sees its
 * entities change in the middle of a loop. Each method is also a function that takes the world
 * first: `update(w, dt)` is `w.update(dt)`.
 *
 * @see world
 * @see https://defold-typescript.github.io/toolchain/entity-systems#the-world
 */
export interface World<E> {
    /** The world's systems, in index order. */
    readonly systems: readonly SystemFields<E>[];
    /** The entities the world holds, as of its last `refresh` or `update`. */
    readonly entities: readonly E[];
    /**
     * Adds each item as a system or an entity.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`.
     *
     * @param items Systems and entities, in any mix.
     * @throws When a system already belongs to a world.
     */
    add(this: World<E>, ...items: (E | SystemFields<E>)[]): void;
    /**
     * Adds an entity, or re-checks one whose components changed.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`, when each system checks the entity against
     * its filter.
     *
     * @param entity The entity.
     * @returns `entity`.
     */
    addEntity<T extends E>(this: World<E>, entity: T): T;
    /**
     * Re-checks an entity whose components changed; the same as `addEntity`.
     *
     * @remarks
     * Each system checks the entity against its filter at the next `refresh` or `update`.
     *
     * @param entity The entity whose components changed.
     * @returns `entity`.
     */
    changed<T extends E>(this: World<E>, entity: T): T;
    /**
     * Adds a system.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`, and sets the system's `world` at once.
     *
     * @param system The system.
     * @returns `system`.
     * @throws When the system already belongs to a world.
     */
    addSystem<S extends SystemFields<E>>(this: World<E>, system: S): S;
    /**
     * Removes each item as a system or an entity.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`.
     *
     * @param items Systems and entities, in any mix.
     * @throws When a system belongs to another world or to none.
     */
    remove(this: World<E>, ...items: (E | SystemFields<E>)[]): void;
    /**
     * Removes an entity.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`.
     *
     * @param entity The entity.
     * @returns `entity`.
     */
    removeEntity<T extends E>(this: World<E>, entity: T): T;
    /**
     * Removes a system.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`.
     *
     * @param system The system.
     * @returns `system`.
     * @throws When the system belongs to another world or to none.
     */
    removeSystem<S extends SystemFields<E>>(this: World<E>, system: S): S;
    /**
     * Applies pending changes and runs `onModify` with `0` on each modified system.
     *
     * @remarks
     * Only active systems run `onModify`, from the last system to the first.
     */
    refresh(this: World<E>): void;
    /**
     * Applies pending changes and updates every active system, or those `systemFilter` selects.
     *
     * @remarks
     * One update runs four passes. Systems waiting to join or leave do so, then entities. From the
     * last system to the first, each active system runs `onModify` if its entities changed, then
     * `preWrap`. From the first to the last, each runs `update`, and then each runs `postWrap`.
     * `onModify` runs on every active system whatever `systemFilter` selects.
     *
     * @param dt The time since the last update.
     * @param systemFilter Selects the systems that run `preWrap`, `update` and `postWrap`, called
     * as `filter(world, system)`.
     * @see https://defold-typescript.github.io/toolchain/entity-systems#one-frame
     */
    update(this: World<E>, dt: number, systemFilter?: Filter): void;
    /**
     * Removes every entity.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`.
     */
    clearEntities(this: World<E>): void;
    /**
     * Removes every system.
     *
     * @remarks
     * Takes effect at the next `refresh` or `update`.
     */
    clearSystems(this: World<E>): void;
    /**
     * The number of entities the world holds.
     *
     * @returns The length of `entities`, as of the last `refresh` or `update`.
     */
    getEntityCount(this: World<E>): number;
    /**
     * The number of systems the world holds.
     *
     * @returns The length of `systems`, as of the last `refresh` or `update`.
     */
    getSystemCount(this: World<E>): number;
    /**
     * Moves a system to a 1-based index (negative counts from the end) and returns its old index.
     *
     * @remarks
     * Applies pending system changes first, so a system added since the last update can move.
     *
     * @param system A system of this world.
     * @param index The new index, where `1` is the first and `-1` the last.
     * @returns The system's old index.
     * @throws When the system does not belong to this world.
     */
    setSystemIndex(this: World<E>, system: SystemFields<E>, index: number): number;
}
/**
 * Builds a filter that selects an entity with every component and passing every filter given.
 *
 * @remarks
 * A system built with it sees each named component as present in its callbacks, along with the
 * components a nested `requireAll` requires.
 *
 * @param tokens Component names and filters.
 * @returns The filter.
 * @throws When a token is neither a component name nor a filter.
 * @see https://defold-typescript.github.io/toolchain/entity-systems#filters
 * @example
 * ```ts
 * import { processingSystem, requireAll } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   position?: { x: number };
 *   velocity?: { x: number };
 * }
 *
 * export const move = processingSystem<Ent>()(requireAll("position", "velocity"), {
 *   process(e, dt) {
 *     e.position.x += e.velocity.x * dt;
 *   },
 * });
 * ```
 */
export declare function requireAll<const T extends readonly FilterToken[]>(...tokens: T): Filter<RequiredBy<T[number]>, UsedBy<T[number]>>;
/**
 * Builds a filter that selects an entity with at least one component or passing at least one
 * filter given.
 *
 * @remarks
 * It narrows no component, since no single one is certain.
 *
 * @param tokens Component names and filters.
 * @returns The filter.
 * @throws When a token is neither a component name nor a filter.
 * @example
 * ```ts
 * import { processingSystem, requireAny } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   sprite?: Url;
 *   label?: Url;
 * }
 *
 * export const visible = processingSystem<Ent>()(requireAny("sprite", "label"), {
 *   process(e) {
 *     if (e.sprite !== undefined) {
 *       msg.post(e.sprite, "enable");
 *     }
 *   },
 * });
 * ```
 */
export declare function requireAny<const T extends readonly FilterToken[]>(...tokens: T): Filter<never, UsedBy<T[number]>>;
/**
 * Builds a filter that rejects an entity with every component and passing every filter given.
 *
 * @param tokens Component names and filters.
 * @returns The filter.
 * @throws When a token is neither a component name nor a filter.
 * @example
 * ```ts
 * import { processingSystem, rejectAll, requireAll } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   position?: { y: number };
 *   frozen?: true;
 *   pinned?: true;
 * }
 *
 * export const sink = processingSystem<Ent>()(
 *   requireAll("position", rejectAll("frozen", "pinned")),
 *   {
 *     process(e, dt) {
 *       e.position.y -= dt;
 *     },
 *   },
 * );
 * ```
 */
export declare function rejectAll<const T extends readonly FilterToken[]>(...tokens: T): Filter<never, UsedBy<T[number]>>;
/**
 * Builds a filter that rejects an entity with at least one component or passing at least one
 * filter given.
 *
 * @param tokens Component names and filters.
 * @returns The filter.
 * @throws When a token is neither a component name nor a filter.
 * @example
 * ```ts
 * import { processingSystem, rejectAny, requireAll } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   velocity?: { y: number };
 *   frozen?: true;
 * }
 *
 * export const fall = processingSystem<Ent>()(requireAll("velocity", rejectAny("frozen")), {
 *   process(e, dt) {
 *     e.velocity.y -= 9.8 * dt;
 *   },
 * });
 * ```
 */
export declare function rejectAny<const T extends readonly FilterToken[]>(...tokens: T): Filter<never, UsedBy<T[number]>>;
/**
 * Builds a filter from a tiny-ecs pattern such as `"a&!b"`.
 *
 * @remarks
 * A pattern holds component names of letters, digits and `_`, joined by `&` (and) and `|` (or),
 * each optionally prefixed by `!` (not) and grouped with parentheses. `&` binds tighter than `|`,
 * so `a|b&c` is `a|(b&c)`. A pattern filter narrows no component, but a name the entity type
 * lacks is still a compile error.
 *
 * @param pattern The pattern, with no whitespace.
 * @returns The filter.
 * @throws When the pattern breaks this syntax; the message names the 1-based position where it
 * stops.
 * @see tryFilter
 * @see https://defold-typescript.github.io/toolchain/entity-systems#string-filters
 * @example
 * ```ts
 * import { filter, processingSystem } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 *   position?: { x: number };
 *   frozen?: true;
 * }
 *
 * export const awake = processingSystem<Ent>()(filter("position&!frozen"), {
 *   process(e) {
 *     print(e.name);
 *   },
 * });
 * ```
 */
export declare function filter<const P extends string>(pattern: P): Filter<never, PatternNames<P>>;
/**
 * Builds a filter as `filter` does, returning the error instead of throwing it.
 *
 * @param pattern A tiny-ecs pattern, as `filter` takes.
 * @returns `{ ok: true, filter }`, or `{ ok: false, error }` with the message `filter` throws.
 * @example
 * ```ts
 * import { tryFilter } from "@defold-typescript/types/ecs";
 *
 * export function check(pattern: string): void {
 *   const result = tryFilter(pattern);
 *   if (!result.ok) {
 *     print(result.error);
 *   }
 * }
 * ```
 */
export declare function tryFilter<const P extends string>(pattern: P): {
    ok: true;
    filter: Filter<never, PatternNames<P>>;
} | {
    ok: false;
    error: string;
};
/**
 * Returns a factory for plain systems over entities of type `E`.
 *
 * @remarks
 * The factory takes a definition, or a filter and a definition. With a `key`, a later factory
 * call under it puts the new definition into the system built first and returns that system, so
 * a hot reload keeps the system running with its entities.
 *
 * @param key Names the system across hot reloads.
 * @returns The factory.
 * @see https://defold-typescript.github.io/toolchain/entity-systems#hot-reload
 * @example
 * ```ts
 * import { system, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const clock = system<Ent>("clock")({
 *   elapsed: 0,
 *   update(dt) {
 *     this.elapsed += dt;
 *   },
 * });
 *
 * export const w = world<Ent>(clock);
 * ```
 */
export declare function system<E>(key?: string): SystemFactory<E>;
/**
 * Returns a factory for processing systems over entities of type `E`.
 *
 * @remarks
 * The factory takes a filter and a definition. The system's `update` runs `preProcess`, then
 * `process` once for each entity it holds, then `postProcess`. With a `key`, a later factory call
 * under it reloads the system built first, as `system` does.
 *
 * @param key Names the system across hot reloads.
 * @returns The factory.
 * @see https://defold-typescript.github.io/toolchain/entity-systems#systems
 * @example
 * ```ts
 * import { processingSystem, requireAll } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   position?: { x: number };
 *   velocity?: { x: number };
 * }
 *
 * export const move = processingSystem<Ent>("move")(requireAll("position", "velocity"), {
 *   process(e, dt) {
 *     e.position.x += e.velocity.x * dt;
 *   },
 * });
 * ```
 */
export declare function processingSystem<E>(key?: string): ProcessingSystemFactory<E>;
/**
 * Returns a factory for plain systems that keep their entities in `compare` order.
 *
 * @remarks
 * The system sorts at the first `refresh` or `update` after its entities change. With a `key`, a
 * later factory call under it reloads the system built first, which sorts with the new `compare`
 * at its next `refresh` or `update`.
 *
 * @param key Names the system across hot reloads.
 * @returns The factory.
 * @example
 * ```ts
 * import { requireAll, sortedSystem } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 *   score?: number;
 * }
 *
 * export const leaders = sortedSystem<Ent>()(requireAll("score"), {
 *   compare(a, b) {
 *     return a.score > b.score;
 *   },
 *   update() {
 *     const first = this.entities?.[0];
 *     if (first !== undefined) {
 *       print(first.name);
 *     }
 *   },
 * });
 * ```
 */
export declare function sortedSystem<E>(key?: string): SortedSystemFactory<E>;
/**
 * Returns a factory for processing systems that process their entities in `compare` order.
 *
 * @remarks
 * With a `key`, a later factory call under it reloads the system built first, as `sortedSystem`
 * does.
 *
 * @param key Names the system across hot reloads.
 * @returns The factory.
 * @example
 * ```ts
 * import { requireAll, sortedProcessingSystem } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   depth?: number;
 *   sprite?: Url;
 * }
 *
 * export const layers = sortedProcessingSystem<Ent>()(requireAll("depth", "sprite"), {
 *   compare(a, b) {
 *     return a.depth < b.depth;
 *   },
 *   process(e) {
 *     msg.post(e.sprite, "enable");
 *   },
 * });
 * ```
 */
export declare function sortedProcessingSystem<E>(key?: string): SortedProcessingSystemFactory<E>;
/**
 * Creates a world holding `items`, applied at once.
 *
 * @remarks
 * Creating the world runs `onAddToWorld` and `onAdd`, but no `onModify`: the first `update` or
 * `refresh` runs it, since a system that just joined counts as changed.
 *
 * @param items Systems and entities, in any mix.
 * @returns The world.
 * @throws When a system already belongs to a world.
 * @see https://defold-typescript.github.io/toolchain/entity-systems#the-world
 * @example
 * ```ts
 * import { processingSystem, requireAll, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   position?: { x: number };
 * }
 *
 * const drift = processingSystem<Ent>()(requireAll("position"), {
 *   process(e, dt) {
 *     e.position.x += dt;
 *   },
 * });
 *
 * export const w = world<Ent>(drift, { position: { x: 0 } });
 * ```
 */
export declare function world<E>(...items: (E | SystemFields<E>)[]): World<E>;
/**
 * Adds each item as a system or an entity; the same as `target.add(...items)`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`.
 *
 * @param target The world.
 * @param items Systems and entities, in any mix.
 * @throws When a system already belongs to a world.
 * @example
 * ```ts
 * import { add, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>();
 * add(w, { name: "ball" }, { name: "wall" });
 * ```
 */
export declare function add<E>(target: World<E>, ...items: (E | SystemFields<E>)[]): void;
/**
 * Adds an entity, or re-checks one whose components changed; the same as `target.addEntity`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`.
 *
 * @param target The world.
 * @param entity The entity.
 * @returns `entity`.
 * @example
 * ```ts
 * import { addEntity, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>();
 * export const ball = addEntity(w, { name: "ball" });
 * ```
 */
export declare function addEntity<E, T extends E>(target: World<E>, entity: T): T;
/**
 * Re-checks an entity whose components changed; the same as `target.changed`.
 *
 * @remarks
 * Each system checks the entity against its filter at the next `refresh` or `update`.
 *
 * @param target The world.
 * @param entity The entity whose components changed.
 * @returns `entity`.
 * @example
 * ```ts
 * import { changed, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 *   frozen?: true;
 * }
 *
 * const w = world<Ent>();
 *
 * export function freeze(e: Ent): void {
 *   e.frozen = true;
 *   changed(w, e);
 * }
 * ```
 */
export declare function changed<E, T extends E>(target: World<E>, entity: T): T;
/**
 * Adds a system; the same as `target.addSystem`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`, and sets the system's `world` at once.
 *
 * @param target The world.
 * @param system The system.
 * @returns `system`.
 * @throws When the system already belongs to a world.
 * @example
 * ```ts
 * import { addSystem, system, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>();
 * export const ticker = addSystem(
 *   w,
 *   system<Ent>()({
 *     update(dt) {
 *       print(dt);
 *     },
 *   }),
 * );
 * ```
 */
export declare function addSystem<E, S extends SystemFields<E>>(target: World<E>, system: S): S;
/**
 * Removes each item as a system or an entity; the same as `target.remove(...items)`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`.
 *
 * @param target The world.
 * @param items Systems and entities, in any mix.
 * @throws When a system belongs to another world or to none.
 * @example
 * ```ts
 * import { remove, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const ball: Ent = { name: "ball" };
 * const w = world<Ent>(ball);
 * remove(w, ball);
 * ```
 */
export declare function remove<E>(target: World<E>, ...items: (E | SystemFields<E>)[]): void;
/**
 * Removes an entity; the same as `target.removeEntity`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`.
 *
 * @param target The world.
 * @param entity The entity.
 * @returns `entity`.
 * @example
 * ```ts
 * import { removeEntity, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const ball: Ent = { name: "ball" };
 * const w = world<Ent>(ball);
 * removeEntity(w, ball);
 * ```
 */
export declare function removeEntity<E, T extends E>(target: World<E>, entity: T): T;
/**
 * Removes a system; the same as `target.removeSystem`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`.
 *
 * @param target The world.
 * @param system The system.
 * @returns `system`.
 * @throws When the system belongs to another world or to none.
 * @example
 * ```ts
 * import { removeSystem, system, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const ticker = system<Ent>()({});
 * const w = world<Ent>(ticker);
 * removeSystem(w, ticker);
 * ```
 */
export declare function removeSystem<E, S extends SystemFields<E>>(target: World<E>, system: S): S;
/**
 * Applies pending changes and runs `onModify` with `0` on each modified system; the same as
 * `target.refresh()`.
 *
 * @param target The world.
 * @example
 * ```ts
 * import { hasEntity, refresh, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>();
 * const wall: Ent = { name: "wall" };
 * w.add(wall);
 * refresh(w);
 * print(hasEntity(w, wall));
 * ```
 */
export declare function refresh<E>(target: World<E>): void;
/**
 * Applies pending changes and updates every active system, or those `systemFilter` selects; the
 * same as `target.update(dt, systemFilter)`.
 *
 * @param target The world.
 * @param dt The time since the last update.
 * @param systemFilter Selects the systems that run `preWrap`, `update` and `postWrap`, called as
 * `filter(world, system)`.
 * @see World.update
 * @example
 * ```ts
 * import { rejectAny, update, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>();
 *
 * export function step(dt: number, paused: boolean): void {
 *   update(w, dt, paused ? rejectAny("gameplay") : undefined);
 * }
 * ```
 */
export declare function update<E>(target: World<E>, dt: number, systemFilter?: Filter): void;
/**
 * Removes every entity; the same as `target.clearEntities()`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`.
 *
 * @param target The world.
 * @example
 * ```ts
 * import { clearEntities, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>({ name: "ball" });
 * clearEntities(w);
 * ```
 */
export declare function clearEntities<E>(target: World<E>): void;
/**
 * Removes every system; the same as `target.clearSystems()`.
 *
 * @remarks
 * Takes effect at the next `refresh` or `update`.
 *
 * @param target The world.
 * @example
 * ```ts
 * import { clearSystems, system, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>(system<Ent>()({}));
 * clearSystems(w);
 * ```
 */
export declare function clearSystems<E>(target: World<E>): void;
/**
 * The number of entities the world holds; the same as `target.getEntityCount()`.
 *
 * @param target The world.
 * @returns The length of the world's `entities`, as of its last `refresh` or `update`.
 * @example
 * ```ts
 * import { getEntityCount, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>({ name: "ball" });
 * print(getEntityCount(w));
 * ```
 */
export declare function getEntityCount<E>(target: World<E>): number;
/**
 * The number of systems the world holds; the same as `target.getSystemCount()`.
 *
 * @param target The world.
 * @returns The length of the world's `systems`, as of its last `refresh` or `update`.
 * @example
 * ```ts
 * import { getSystemCount, system, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>(system<Ent>()({}));
 * print(getSystemCount(w));
 * ```
 */
export declare function getSystemCount<E>(target: World<E>): number;
/**
 * Whether the world holds `entity` as of its last `refresh` or `update`.
 *
 * @remarks
 * It reads `false` while the entity's add is pending, and `true` while its removal is. It has no
 * method form on the world.
 *
 * @param target The world.
 * @param entity The entity.
 * @returns `true` when the world held `entity` at its last `refresh` or `update`.
 * @example
 * ```ts
 * import { hasEntity, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const w = world<Ent>();
 * const wall: Ent = { name: "wall" };
 * w.add(wall);
 * print(hasEntity(w, wall));
 * w.refresh();
 * print(hasEntity(w, wall));
 * ```
 */
export declare function hasEntity<E>(target: World<E>, entity: E): boolean;
/**
 * Moves a system to a 1-based index and returns its old index; the same as
 * `target.setSystemIndex(system, index)`.
 *
 * @remarks
 * A negative index counts from the end. Pending system changes apply first, so a system added
 * since the last update can move.
 *
 * @param target The world.
 * @param system A system of `target`.
 * @param index The new index, where `1` is the first and `-1` the last.
 * @returns The system's old index.
 * @throws When the system does not belong to `target`.
 * @example
 * ```ts
 * import { setSystemIndex, system, world } from "@defold-typescript/types/ecs";
 *
 * interface Ent {
 *   readonly name: string;
 * }
 *
 * const first = system<Ent>()({});
 * const last = system<Ent>()({});
 * const w = world<Ent>(first, last);
 * setSystemIndex(w, last, 1);
 * ```
 */
export declare function setSystemIndex<E>(target: World<E>, system: SystemFields<E>, index: number): number;
export {};

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
 * Selects the entities a system sees, called as `filter(system, entity)`, or the
 * systems an `update` runs, called as `filter(world, system)`. A filter built by
 * `requireAll` and its siblings records the components it requires (`R`) and the
 * components it names (`U`).
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
/** `E` with the components `K` present. */
export type With<E, K> = [K] extends [never] ? E : E & {
    [P in K & keyof E]-?: Exclude<E[P], undefined>;
};
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
    /** `compare` bound to the system, built at the first sort and kept. */
    readonly sortDelegate?: ((this: void, e1: X, e2: X) => boolean) | undefined;
}
/** A sorted system over entities `E` whose `compare` takes `X`. */
export type SortedSystem<E, D = unknown, X = E> = System<E, D> & SortedSystemFields<X>;
type Definition<D, C> = {
    [K in keyof D]: K extends keyof C ? C[K] : D[K];
} & C;
/** Builds a system from a definition, with or without a filter. */
export interface SystemFactory<E> {
    <D extends object>(this: void, def: Definition<D, PlainSystemCallbacks<E>> & ThisType<System<E, D>>): System<E, D>;
    <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, PlainSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<System<E, D>>): System<E, D>;
}
/** Builds a processing system from a filter and a definition. */
export type ProcessingSystemFactory<E> = <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, ProcessingSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<System<E, D>>) => System<E, D>;
/** Builds a sorted system from a definition, with or without a filter. */
export interface SortedSystemFactory<E> {
    <D extends object>(this: void, def: Definition<D, SortedSystemCallbacks<E>> & ThisType<SortedSystem<E, D>>): SortedSystem<E, D>;
    <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, SortedSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<SortedSystem<E, D, With<E, KeysIn<F>["required"]>>>): SortedSystem<E, D, With<E, KeysIn<F>["required"]>>;
}
/** Builds a sorted processing system from a filter and a definition. */
export type SortedProcessingSystemFactory<E> = <F extends Filter, D extends object>(this: void, filter: F & KnownKeys<E, F>, def: Definition<D, SortedProcessingSystemCallbacks<E, With<E, KeysIn<F>["required"]>>> & ThisType<SortedSystem<E, D, With<E, KeysIn<F>["required"]>>>) => SortedSystem<E, D, With<E, KeysIn<F>["required"]>>;
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
/** Selects entities that have every component and pass every filter given. */
export declare function requireAll<const T extends readonly FilterToken[]>(...tokens: T): Filter<RequiredBy<T[number]>, UsedBy<T[number]>>;
/** Selects entities that have at least one component or pass at least one filter given. */
export declare function requireAny<const T extends readonly FilterToken[]>(...tokens: T): Filter<never, UsedBy<T[number]>>;
/** Rejects entities that have every component and pass every filter given. */
export declare function rejectAll<const T extends readonly FilterToken[]>(...tokens: T): Filter<never, UsedBy<T[number]>>;
/** Rejects entities that have at least one component or pass at least one filter given. */
export declare function rejectAny<const T extends readonly FilterToken[]>(...tokens: T): Filter<never, UsedBy<T[number]>>;
/** Returns a factory for plain systems over entities of type `E`. */
export declare function system<E>(): SystemFactory<E>;
/** Returns a factory for processing systems over entities of type `E`. */
export declare function processingSystem<E>(): ProcessingSystemFactory<E>;
/** Returns a factory for systems that keep their entities ordered by `compare`. */
export declare function sortedSystem<E>(): SortedSystemFactory<E>;
/** Returns a factory for processing systems that process their entities in `compare` order. */
export declare function sortedProcessingSystem<E>(): SortedProcessingSystemFactory<E>;
/** Creates a world holding `items`, applied at once. */
export declare function world<E>(...items: (E | SystemFields<E>)[]): World<E>;
export declare function add<E>(target: World<E>, ...items: (E | SystemFields<E>)[]): void;
export declare function addEntity<E, T extends E>(target: World<E>, entity: T): T;
export declare function changed<E, T extends E>(target: World<E>, entity: T): T;
export declare function addSystem<E, S extends SystemFields<E>>(target: World<E>, system: S): S;
export declare function remove<E>(target: World<E>, ...items: (E | SystemFields<E>)[]): void;
export declare function removeEntity<E, T extends E>(target: World<E>, entity: T): T;
export declare function removeSystem<E, S extends SystemFields<E>>(target: World<E>, system: S): S;
export declare function refresh<E>(target: World<E>): void;
export declare function update<E>(target: World<E>, dt: number, systemFilter?: Filter): void;
export declare function clearEntities<E>(target: World<E>): void;
export declare function clearSystems<E>(target: World<E>): void;
export declare function getEntityCount<E>(target: World<E>): number;
export declare function getSystemCount<E>(target: World<E>): number;
export declare function setSystemIndex<E>(target: World<E>, system: SystemFields<E>, index: number): number;
export {};

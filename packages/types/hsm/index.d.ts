// Generated from packages/hsm/src/index.ts by `bun run --cwd packages/hsm declarations`; do not edit.
export interface EventObject {
    readonly type: string;
}
export type MoveCause = "event" | "after" | "update" | "stop" | "reload" | "always";
/** @noSelf */
export type MoveListener<E extends EventObject, P extends string = string> = (from: P, to: P | undefined, cause: MoveCause, event: E | undefined) => void;
/** @noSelf */
export interface MachineInstance<Ctx, E extends EventObject, P extends string = string> {
    readonly ctx: Ctx;
    readonly path: P | undefined;
    readonly leaves: readonly P[];
    readonly matches: (path: P) => boolean;
    readonly send: (event: E) => void;
    readonly update: (dt: number) => void;
    readonly stop: () => void;
    /**
     * Adds a listener called after each move completes, with the leaf left, the leaf entered and
     * the cause. It is not called for the first entry at `start` or for a move with no `to`; a
     * parallel machine calls it once per moved region. Each call adds a listener, and the returned
     * function removes that one.
     */
    readonly onMove: (listener: MoveListener<E, P>) => () => void;
}
export type MoveAction<Ctx, E extends EventObject, V extends E = E> = (ctx: Ctx, event: V, machine: MachineInstance<Ctx, E>) => void;
/** @noSelf */
export interface TransitionConfig<Ctx, E extends EventObject, V extends E = E> {
    /**
     * The full path of the state to move to. A `to` naming the state the rule is on exits and
     * re-enters it, restarting its timers and `task`; a `to` below it keeps it active.
     */
    readonly to?: string;
    /**
     * The rule is taken only when this returns `true`. It must have no side effects: it is also
     * checked when the move does not happen, in guarded lists and on every `always` recheck.
     */
    readonly when?: (ctx: Ctx, event: V) => boolean;
    /**
     * Runs during the move. The event is accepted when its key matches and `when` passes; then
     * `exit` runs on each state left, deepest first; then `run`; then `enter` on each state
     * entered, outermost first. Shared ancestors neither exit nor enter. A rule with no `to` runs
     * only `run`.
     */
    readonly run?: MoveAction<Ctx, E, V> | readonly MoveAction<Ctx, E, V>[];
    /** Renamed to `to`. */
    readonly target?: never;
    /** Renamed to `when`. */
    readonly guard?: never;
    /** Renamed to `run`. */
    readonly actions?: never;
    /** Removed: a `to` naming the state the rule is on restarts it. */
    readonly reenter?: never;
}
export type TransitionSpec<Ctx, E extends EventObject, V extends E = E> = string | TransitionConfig<Ctx, E, V> | readonly [TransitionConfig<Ctx, E, V>, ...TransitionConfig<Ctx, E, V>[]];
/** @noSelf */
export interface AlwaysConfig<Ctx> {
    readonly to: string;
    /** Checked on every recheck, so it must have no side effects. */
    readonly when?: (ctx: Ctx) => boolean;
    /** Renamed to `to`. */
    readonly target?: never;
    /** Renamed to `when`. */
    readonly guard?: never;
}
export type AlwaysSpec<Ctx> = string | AlwaysConfig<Ctx> | readonly [AlwaysConfig<Ctx>, ...AlwaysConfig<Ctx>[]];
export type OnConfig<Ctx, E extends EventObject> = {
    readonly [K in E["type"]]?: TransitionSpec<Ctx, E, Extract<E, {
        type: K;
    }>>;
};
/**
 * Runs on every way in (`enter`) or out (`exit`) of the state: a move, `start` and `stop`. A hot
 * reload enters the states it adds, but drops a removed state without its `exit`. It gets no
 * event; event data reaches `enter` through `ctx`, set in `run`.
 */
export type StateHook<Ctx, E extends EventObject> = (ctx: Ctx, machine: MachineInstance<Ctx, E>) => void;
export type UpdateHook<Ctx, E extends EventObject> = (ctx: Ctx, dt: number, machine: MachineInstance<Ctx, E>) => string | undefined;
/**
 * Starts work that lives as long as the state. `finish` sends one event and is ignored after the
 * first call or once the state is left. The returned cleanup runs on every way out.
 * @noSelf
 */
export type TaskStart<Ctx, E extends EventObject> = (ctx: Ctx, finish: (event: E) => void, machine: MachineInstance<Ctx, E>) => (() => void) | void;
/** @noSelf */
export interface StateConfig<Ctx, E extends EventObject> {
    readonly type?: "parallel";
    readonly initial?: string;
    readonly restoreDepth?: number | "all";
    readonly states?: {
        readonly [name: string]: StateConfig<Ctx, E>;
    };
    readonly on?: OnConfig<Ctx, E>;
    readonly after?: {
        readonly [seconds: number]: string;
    };
    readonly always?: AlwaysSpec<Ctx>;
    readonly enter?: StateHook<Ctx, E>;
    readonly exit?: StateHook<Ctx, E>;
    readonly update?: UpdateHook<Ctx, E>;
    /** Started on each entry; see `TaskStart`. */
    readonly task?: TaskStart<Ctx, E>;
    /** Renamed to `task`. */
    readonly invoke?: never;
}
export interface MachineConfig<Ctx, E extends EventObject> extends StateConfig<Ctx, E> {
    readonly initial: string;
    readonly states: {
        readonly [name: string]: StateConfig<Ctx, E>;
    };
}
/** @noSelf */
export interface Machine<Ctx, E extends EventObject, P extends string = string> {
    readonly start: (ctx: Ctx) => MachineInstance<Ctx, E, P>;
}
type PathDepth = [never, 0, 1, 2, 3];
type PathsBelow<S, D extends number> = S extends {
    readonly states: infer Children;
} ? {
    [K in keyof Children & string]: K | `${K}/${D extends 1 ? Children[K] extends {
        readonly states: object;
    } ? string : never : PathsBelow<Children[K], PathDepth[D]>}`;
}[keyof Children & string] : never;
export type StatePath<C> = `/${PathsBelow<C, 4>}`;
type NextCount = [never, 2, 3, 4, 5, 6];
type RestoreCountBelow<Children, D extends number> = {
    [K in keyof Children]: RestoreCount<Children[K], D>;
}[keyof Children];
type RestoreCount<S, D extends number> = S extends {
    readonly states: infer Children;
} ? [D] extends [never] ? number : S extends {
    readonly type: "parallel";
} ? RestoreCountBelow<Children, PathDepth[D]> : 1 | (RestoreCountBelow<Children, PathDepth[D]> extends infer N ? N extends number ? number extends N ? number : NextCount[N] : never : never) : never;
interface TransitionCheck<T> {
    readonly to?: T;
    readonly when?: unknown;
    readonly run?: unknown;
}
type SpecCheck<T> = T | TransitionCheck<T> | readonly TransitionCheck<T>[];
type PathCheck<S, Self extends string, All extends string, Ev extends string> = {
    readonly type?: unknown;
    readonly initial?: S extends {
        readonly type: "parallel";
    } ? never : S extends {
        readonly states: infer Children;
    } ? `${Self}/${keyof Children & string}` : never;
    readonly restoreDepth?: S extends {
        readonly type: "parallel";
    } ? never : S extends {
        readonly states: object;
    } ? RestoreCount<S, 4> | "all" : never;
    readonly states?: S extends {
        readonly states: infer Children;
    } ? {
        readonly [K in keyof Children]: PathCheck<Children[K], `${Self}/${K & string}`, All, Ev>;
    } : unknown;
    readonly on?: S extends {
        readonly on: infer On;
    } ? {
        readonly [K in keyof On]: K extends Ev ? SpecCheck<All> : never;
    } : unknown;
    readonly after?: S extends {
        readonly after: infer After;
    } ? {
        readonly [K in keyof After]: All;
    } : unknown;
    readonly always?: S extends {
        readonly always: unknown;
    } ? SpecCheck<All> : unknown;
    readonly enter?: unknown;
    readonly exit?: unknown;
    readonly update?: unknown;
    readonly task?: unknown;
};
export interface MachineConfigError {
    readonly "hsm: an initial or a to names an unknown state path, or an on key an unknown event": never;
}
export type DefinedMachine<Ctx, E extends EventObject, C> = C extends PathCheck<C, "", StatePath<C>, E["type"]> ? Machine<Ctx, E, StatePath<C>> : MachineConfigError;
export declare function defineMachine<Ctx, E extends EventObject>(key?: string): <const C extends MachineConfig<Ctx, E>>(config: C) => DefinedMachine<Ctx, E, C>;
export {};

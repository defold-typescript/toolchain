// Generated from packages/hsm/src/index.ts by `bun run --cwd packages/hsm declarations`; do not edit.
/**
 * An event a machine handles: an object with a string `type`, plus any payload fields. A
 * machine's event type is a union of these.
 */
export interface EventObject {
    /** Names the event. A state's `on` takes these values as its keys. */
    readonly type: string;
}
/**
 * What made a move happen: `event` for a sent event, `after` for a timer, `update` for a path an
 * `update` hook returned, `always` for an `always` rule, `stop` for `stop()`, and `reload` for a
 * hot reload that changed the current state.
 */
export type MoveCause = "event" | "after" | "update" | "stop" | "reload" | "always";
/**
 * A listener given to `onMove`. It gets the leaf left, the leaf entered (`undefined` after
 * `stop()`), the cause, and the event, which is `undefined` unless the cause is `event`. It runs
 * after the move's `enter` hooks.
 * @noSelf
 */
export type MoveListener<E extends EventObject, P extends string = string> = (from: P, to: P | undefined, cause: MoveCause, event: E | undefined) => void;
/**
 * One running machine, returned by `start`. `P` is the union of the machine's state paths; the
 * `machine` a hook, a `run` or a `task` receives uses plain `string` paths instead.
 * @noSelf
 */
export interface MachineInstance<Ctx, E extends EventObject, P extends string = string> {
    /** The context passed to `start`. */
    readonly ctx: Ctx;
    /**
     * The full path of the deepest active state, or `undefined` once stopped. In a parallel state
     * it is the first region's leaf.
     */
    readonly path: P | undefined;
    /**
     * The full path of every active leaf, in region order: one path without parallel states, empty
     * once stopped. It is the same array on every read, updated in place.
     */
    readonly leaves: readonly P[];
    /** Whether the state at the full path `path` is active. Ancestors of the current state count. */
    readonly matches: (path: P) => boolean;
    /**
     * Handles `event`, or queues it when called during a step. An event no active state handles is
     * dropped, and once the machine is stopped the call does nothing.
     */
    readonly send: (event: E) => void;
    /**
     * Advances the machine by `dt` seconds: runs the `update` hooks, then the `after` timers if no
     * hook moved it. A machine whose `update` is not called is frozen in time, and once the machine
     * is stopped the call does nothing.
     */
    readonly update: (dt: number) => void;
    /**
     * Exits every active state, deepest first, and sets `path` to `undefined`. Called during a
     * step, it lets that step finish and drops the queued events.
     */
    readonly stop: () => void;
    /**
     * Adds a listener called after each move completes, with the leaf left, the leaf entered and
     * the cause. It is not called for the first entry at `start` or for a move with no `to`; a
     * parallel machine calls it once per moved region. Each call adds a listener, and the returned
     * function removes that one.
     */
    readonly onMove: (listener: MoveListener<E, P>) => () => void;
}
/**
 * A function a rule's `run` calls during the move, after the `exit` hooks and before the `enter`
 * hooks. Its `event` is the variant the `on` key names.
 */
export type MoveAction<Ctx, E extends EventObject, V extends E = E> = (ctx: Ctx, event: V, machine: MachineInstance<Ctx, E>) => void;
interface RuleList<Rule> {
    readonly 0: Rule;
    readonly [index: number]: Rule;
    readonly length: number;
}
/**
 * The object form of a rule under `on`: a `to`, a `when` and a `run`, each optional. A rule with
 * no `to` runs its `run` and nothing else: no state exits or enters.
 * @noSelf
 */
export interface TransitionConfig<Ctx, E extends EventObject, V extends E = E, To extends string = string> {
    /**
     * The full path of the state to move to. A `to` naming the state the rule is on exits and
     * re-enters it, restarting its timers and `task`; a `to` below it keeps it active.
     */
    readonly to?: To;
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
/**
 * What an `on` key maps to: a target path, a `TransitionConfig`, or a non-empty list of them
 * tried in order. The first rule with no `when`, or whose `when` returns `true`, is taken.
 */
export type TransitionSpec<Ctx, E extends EventObject, V extends E = E, To extends string = string> = To | TransitionConfig<Ctx, E, V, To> | RuleList<TransitionConfig<Ctx, E, V, To>>;
/**
 * The object form of an `always` rule: a `to` and an optional `when`. It gets no event and has
 * no `run`; side effects belong in the target's `enter`.
 * @noSelf
 */
export interface AlwaysConfig<Ctx, To extends string = string> {
    /**
     * The full path of the state to move to. An `always` rule without one throws when the machine
     * is defined.
     */
    readonly to: To;
    /** Checked on every recheck, so it must have no side effects. */
    readonly when?: (ctx: Ctx) => boolean;
    /** Renamed to `to`. */
    readonly target?: never;
    /** Renamed to `when`. */
    readonly guard?: never;
}
/**
 * What `always` takes: a target path, an `AlwaysConfig`, or a non-empty list of them. The first
 * whose `when` is missing or passes is taken.
 */
export type AlwaysSpec<Ctx, To extends string = string> = To | AlwaysConfig<Ctx, To> | RuleList<AlwaysConfig<Ctx, To>>;
/**
 * A state's rules by event `type`. Only the machine's event types are keys, and each rule's
 * `when` and `run` see the event variant its key names.
 */
export type OnConfig<Ctx, E extends EventObject, To extends string = string> = {
    readonly [K in E["type"]]?: TransitionSpec<Ctx, E, Extract<E, {
        type: K;
    }>, To>;
};
/**
 * Runs on every way in (`enter`) or out (`exit`) of the state: a move, `start` and `stop`. A hot
 * reload enters the states it adds, but drops a removed state without its `exit`. It gets no
 * event; event data reaches `enter` through `ctx`, set in `run`.
 */
export type StateHook<Ctx, E extends EventObject> = (ctx: Ctx, machine: MachineInstance<Ctx, E>) => void;
/**
 * Runs on every `update(dt)` while the state is active, deepest state first. It returns a full
 * path to move there, or `undefined` to pass. The first hook to return a path wins: the hooks
 * above it and the `after` timers do not run on that call, and the move has no `run`.
 */
export type UpdateHook<Ctx, E extends EventObject, To extends string = string> = (ctx: Ctx, dt: number, machine: MachineInstance<Ctx, E>) => To | undefined;
/**
 * Starts work that lives as long as the state. `finish` sends one event and is ignored after the
 * first call or once the state is left. The returned cleanup runs on every way out.
 * @noSelf
 */
export type TaskStart<Ctx, E extends EventObject> = (ctx: Ctx, finish: (event: E) => void, machine: MachineInstance<Ctx, E>) => (() => void) | void;
/**
 * A machine definition, returned by the second `defineMachine` call. Its `start` creates the
 * instances that run.
 * @noSelf
 */
export interface Machine<Ctx, E extends EventObject, P extends string = string> {
    /**
     * Creates an instance with `ctx` as its context and enters the root's `initial` chain. Each
     * call returns a separate instance, which has already handled the events its `enter` hooks
     * sent.
     */
    readonly start: (ctx: Ctx) => MachineInstance<Ctx, E, P>;
}
type PathDepth = [never, 0, 1, 2, 3];
type NextCount = [never, 2, 3, 4, 5, 6];
type TreePathsBelow<T, D extends number> = {
    [K in keyof T & string]: K | `${K}/${D extends 1 ? keyof T[K] extends never ? never : string : TreePathsBelow<T[K], PathDepth[D]>}`;
}[keyof T & string];
type TreePath<T> = `/${TreePathsBelow<T, 4>}`;
type SlotPathsBelow<T, D extends number> = unknown extends T ? string : {
    [K in keyof T & string]: K | `${K}/${D extends 1 ? string : SlotPathsBelow<T[K], PathDepth[D]>}`;
}[keyof T & string];
type SlotPath<T> = `/${SlotPathsBelow<T, 4>}`;
type TreeOf<C> = C extends {
    readonly states: infer Children;
} ? {
    readonly [K in keyof Children]: TreeOf<Children[K]>;
} : unknown;
/**
 * The union of a config's state paths, each with its leading `/`. Paths are spelled out four
 * levels deep; below that, any string under a fourth-level path is accepted.
 */
export type StatePath<C> = TreePath<TreeOf<C>>;
type TreeDepth<T, D extends number> = unknown extends T ? number : [D] extends [never] ? number : 1 | ({
    [K in keyof T]: unknown extends T[K] ? never : TreeDepth<T[K], PathDepth[D]>;
}[keyof T] extends infer N ? N extends number ? number extends N ? number : NextCount[N] : never : never);
type AnyChild<Ctx, E extends EventObject, T, To extends string> = unknown extends T ? {
    readonly [name: string]: StateNode<Ctx, E, unknown, string, To>;
} : unknown;
/** @noSelf */
interface StateBase<Ctx, E extends EventObject, T, Self extends string, To extends string> {
    /** Child states, by name. A name is non-empty and contains no `/`. */
    readonly states?: {
        readonly [K in keyof T]: StateNode<Ctx, E, T[K], `${Self}/${K & string}`, To>;
    } & NoInfer<AnyChild<Ctx, E, T, To>>;
    /**
     * Rules by event `type`, each a target path, a rule object or a list of them. An event starts
     * at the deepest active state and moves up to the parent while no rule takes it.
     */
    readonly on?: NoInfer<OnConfig<Ctx, E, To>>;
    /**
     * Targets by delay in seconds of game time. The delay is counted by `update(dt)` while the
     * state is active, from zero on each entry. One `update` call fires at most one timer, and
     * none when an `update` hook moved the machine.
     */
    readonly after?: NoInfer<{
        readonly [seconds: number]: To;
    }>;
    /**
     * Targets taken right after any move that leaves this state active; the first whose `when` is
     * missing or passes wins. It is checked after a move only: not after a rule with no `to`, and
     * not on an `update` call that moves nothing.
     */
    readonly always?: AlwaysSpec<Ctx, To>;
    /**
     * Runs each time the state is entered, outermost state first: on a move, at `start`, and when
     * a hot reload adds the state. It gets no event.
     */
    readonly enter?: StateHook<Ctx, E>;
    /**
     * Runs each time the state is left, deepest state first, including on `stop()`. A state a hot
     * reload removes is dropped without it.
     */
    readonly exit?: StateHook<Ctx, E>;
    /**
     * Runs on every `update(dt)` while the state is active. Return one of the machine's full paths
     * to move there, or `undefined` to stay.
     */
    readonly update?: NoInfer<UpdateHook<Ctx, E, To>>;
    /** Started on each entry; see `TaskStart`. */
    readonly task?: TaskStart<Ctx, E>;
    /** Renamed to `task`. */
    readonly invoke?: never;
}
/** @noSelf */
interface CompoundState<Ctx, E extends EventObject, T, Self extends string, To extends string> extends StateBase<Ctx, E, T, Self, To> {
    /**
     * `"parallel"` keeps every child active at once, each as a region with its own active state.
     * Not allowed on the root.
     */
    readonly type?: never;
    /**
     * The full path of the child entered with this state, such as `/on/bright` inside `on`.
     * Required when `states` is set, unless the state is parallel.
     */
    readonly initial?: NoInfer<unknown extends T ? string : `${Self}/${keyof T & string}`>;
    /**
     * Makes the state remember which child was active when it was last left, and enter it again
     * instead of `initial`. The count is how many levels down to restore, and `"all"` restores
     * every level below the state. The first entry uses `initial`, and a move that targets a state
     * inside this one lands on that target.
     */
    readonly restoreDepth?: NoInfer<TreeDepth<T, 4> | "all">;
}
/** @noSelf */
interface ParallelState<Ctx, E extends EventObject, T, Self extends string, To extends string> extends StateBase<Ctx, E, T, Self, To> {
    /**
     * `"parallel"` keeps every child active at once, each as a region with its own active state.
     * Not allowed on the root.
     */
    readonly type: "parallel";
    readonly initial?: never;
    readonly restoreDepth?: never;
}
type StateNode<Ctx, E extends EventObject, T, Self extends string, To extends string> = CompoundState<Ctx, E, T, Self, To> | ParallelState<Ctx, E, T, Self, To>;
type RootState<Ctx, E extends EventObject, T> = CompoundState<Ctx, E, T, "", NoInfer<SlotPath<T>>> & {
    readonly initial: string;
    readonly states: object;
};
/**
 * The config of one state. Every field is optional. A state with child `states` is a compound
 * state and needs an `initial`, unless its `type` is `"parallel"`; a state without children is a
 * leaf.
 */
export type StateConfig<Ctx, E extends EventObject> = StateNode<Ctx, E, unknown, string, string>;
/**
 * The root config passed to `defineMachine`. It takes the fields of a state and requires
 * `initial` and `states`. The root has no name and cannot be parallel.
 */
export type MachineConfig<Ctx, E extends EventObject> = CompoundState<Ctx, E, unknown, string, string> & {
    readonly initial: string;
    readonly states: {
        readonly [name: string]: StateConfig<Ctx, E>;
    };
};
/**
 * Defines a machine in two calls: `defineMachine<Ctx, E>()` fixes the context and event types and
 * takes an optional hot-reload key, and the second call takes the config. The config is checked
 * when that call runs, and a mistake throws, naming the state path. With a key, a later
 * definition under it puts its states into the machine already built, so every running instance
 * sees the edit; without one, each call builds a separate machine.
 */
export declare function defineMachine<Ctx, E extends EventObject>(key?: string): <T>(config: RootState<Ctx, E, T>) => Machine<Ctx, E, TreePath<T>>;
export {};

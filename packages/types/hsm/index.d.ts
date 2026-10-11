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
 * after the move's `enter` hooks. The event is read-only: the listener cannot assign to its
 * fields.
 * @noSelf
 */
export type MoveListener<E extends EventObject, P extends string = string> = (from: P, to: P | undefined, cause: MoveCause, event: Readonly<E> | undefined) => void;
/**
 * A listener given to `onUnhandled`. It gets the event no rule of an active state took. The
 * event is read-only: the listener cannot assign to its fields.
 * @noSelf
 */
export type UnhandledListener<E extends EventObject> = (event: Readonly<E>) => void;
/**
 * What a `when` sees of the running machine: which states are active, and nothing that changes
 * it. `P` is the union of the paths it takes. The `machine` a `when` receives takes the machine's
 * state paths, and also any path below a leaf state and below a level whose states hold only
 * callbacks with unannotated parameters. `Tag` is the union of the machine's tag names.
 * @noSelf
 */
export interface MachineView<P extends string = string, Tag extends string = never> {
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
    readonly matches: {
        matches(this: void, path: P): boolean;
    }["matches"];
    /**
     * Whether an active state carries `tag`. A parent's tag holds while any of its children is
     * active, and a tag in any region of a parallel state counts. The answer is `false` for a name
     * no state carries, and once stopped.
     */
    readonly hasTag: (tag: Tag) => boolean;
}
/**
 * One running machine, returned by `start`. `P` is the union of the paths it takes: the
 * machine's state paths on a started instance. The `machine` a hook, a `run` or a `task`
 * receives takes those paths, and also any path below a leaf state and below a level whose
 * states hold only callbacks with unannotated parameters. `Tag` is the union of the machine's tag
 * names.
 * @noSelf
 */
export interface MachineInstance<Ctx, E extends EventObject, P extends string = string, Tag extends string = never> extends MachineView<P, Tag> {
    /** The context passed to `start`. */
    readonly ctx: Ctx;
    /**
     * Whether a rule of an active state would take `event` if it were sent at that moment. The
     * answer is for that one event, payload included: a rule's `when` reads it. A rule with no
     * `to` counts. No hook, `run` or listener runs and nothing is queued, and once the machine is
     * stopped the answer is `false`.
     */
    readonly can: (event: E) => boolean;
    /**
     * Handles `event`, or queues it when called during a step. An event no active state handles is
     * dropped: it runs the active states' `unhandled` hooks and is then reported to the
     * `onUnhandled` listeners. Once the machine is stopped the call does nothing.
     */
    readonly send: (event: E) => void;
    /**
     * Advances the machine by `dt` seconds: runs the `update` hooks, then, in every region no hook
     * moved, each state's `every` entries and after them its `after` timers. A machine with no
     * parallel state is one region. A machine whose `update` is not called is frozen in time, and
     * once the machine is stopped the call does nothing.
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
    /**
     * Adds a listener called with each event the machine processes that no rule of an active state
     * takes. It runs inside the step, after the active states' `unhandled` hooks and before the
     * next queued event. A rule with no `to` takes its event. Each call adds a listener, and the
     * returned function removes that one.
     */
    readonly onUnhandled: (listener: UnhandledListener<E>) => () => void;
}
/**
 * A function a rule's `run` calls during the move, after the `exit` hooks and before the `enter`
 * hooks. Its `event` is the variant the `on` key names, and is read-only: a `run` changes `ctx`
 * and cannot assign to a field of the event. `Hook` is the union of the paths its `machine`
 * takes: the machine's paths for a `run` written in the config, and any `string` when left out.
 */
export type MoveAction<Ctx, E extends EventObject, V extends E = E, Tag extends string = never, Hook extends string = string> = (ctx: Ctx, event: Readonly<V>, machine: MachineInstance<Ctx, E, Hook, Tag>) => void;
/**
 * A function a `run` calls where there is no event: under `after`, `always` and `every`. `Hook`
 * is the union of the paths its `machine` takes: the machine's paths for a `run` written in the
 * config, and any `string` when left out.
 */
export type RunAction<Ctx, E extends EventObject, Tag extends string = never, Hook extends string = string> = (ctx: Ctx, machine: MachineInstance<Ctx, E, Hook, Tag>) => void;
type RuleRun<Ctx, E extends EventObject, Tag extends string = never, Hook extends string = string> = [E] extends [never] ? never : RunAction<Ctx, E, Tag, Hook> | readonly RunAction<Ctx, E, Tag, Hook>[];
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
export interface TransitionConfig<Ctx, E extends EventObject, V extends E = E, To extends string = string, Tag extends string = never, Hook extends string = string> {
    /**
     * The full path of the state to move to. A `to` naming the state the rule is on exits and
     * re-enters it, restarting its timers and `task`; a `to` below it keeps it active.
     */
    readonly to?: To;
    /**
     * The rule is taken only when this returns `true`. It must have no side effects: it is also
     * checked when the move does not happen, in guarded lists and on every `always` recheck.
     * `ctx` and `event` are read-only here, one level deep: a write belongs in `run`.
     * `machine` reads the active states; inside a parallel state it shows the regions that already
     * took the event.
     */
    readonly when?: (ctx: Readonly<Ctx>, event: Readonly<V>, machine: MachineView<Hook, Tag>) => boolean;
    /**
     * Runs during the move. The event is accepted when its key matches and `when` passes; then
     * `exit` runs on each state left, deepest first; then `run`; then `enter` on each state
     * entered, outermost first. Shared ancestors neither exit nor enter. A rule with no `to` runs
     * only `run`.
     */
    readonly run?: MoveAction<Ctx, E, V, Tag, Hook> | readonly MoveAction<Ctx, E, V, Tag, Hook>[];
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
export type TransitionSpec<Ctx, E extends EventObject, V extends E = E, To extends string = string, Tag extends string = never, Hook extends string = string> = To | TransitionConfig<Ctx, E, V, To, Tag, Hook> | RuleList<TransitionConfig<Ctx, E, V, To, Tag, Hook>>;
/**
 * The object form of an `always` rule: a `to`, an optional `when` and an optional `run`. It gets
 * no event. `E` is the machine's event type; a rule typed without it has no `run`. `Hook` is
 * the union of the paths the `machine` of its `when` and `run` takes: any `string` when left out.
 * @noSelf
 */
export interface AlwaysConfig<Ctx, To extends string = string, E extends EventObject = never, Tag extends string = never, Hook extends string = string> {
    /**
     * The full path of the state to move to. An `always` rule without one throws when the machine
     * is defined.
     */
    readonly to: To;
    /**
     * Checked on every recheck, so it must have no side effects. `ctx` is read-only here, one
     * level deep: a write belongs in `run`. `machine` reads the active states; inside a parallel
     * state it shows the regions that already moved.
     */
    readonly when?: (ctx: Readonly<Ctx>, machine: MachineView<Hook, Tag>) => boolean;
    /** Runs between the `exit` and `enter` hooks of the move, only when the rule is taken. */
    readonly run?: RuleRun<Ctx, E, Tag, Hook>;
    /** Renamed to `to`. */
    readonly target?: never;
    /** Renamed to `when`. */
    readonly guard?: never;
}
/**
 * What `always` takes: a target path, an `AlwaysConfig`, or a non-empty list of them. The first
 * whose `when` is missing or passes is taken.
 */
export type AlwaysSpec<Ctx, To extends string = string, E extends EventObject = never, Tag extends string = never, Hook extends string = string> = To | AlwaysConfig<Ctx, To, E, Tag, Hook> | AlwaysConfig<Ctx, To, never, Tag, Hook> | RuleList<AlwaysConfig<Ctx, To, E, Tag, Hook> | AlwaysConfig<Ctx, To, never, Tag, Hook>>;
/**
 * The object form of a rule on an `after` timer: a `to`, a `when` and a `run`, each optional. A
 * rule with neither a `to` nor a `run` throws when the machine is defined. `E` is the machine's
 * event type; a rule typed without it has no `run`. `Hook` is the union of the paths the
 * `machine` of its `when` and `run` takes: any `string` when left out.
 * @noSelf
 */
export interface AfterRule<Ctx, To extends string = string, E extends EventObject = never, Tag extends string = never, Hook extends string = string> {
    /**
     * The full path of the state to move to when the timer fires. A rule without one runs its
     * `run` and nothing else: no state exits or enters, and it is not a move.
     */
    readonly to?: To;
    /**
     * The timer fires only when this returns `true`. It is first checked once the delay has
     * passed, then on every `update` call until it passes or the state is left, so it must have no
     * side effects. `ctx` is read-only here, one level deep: a write belongs in `run`. `machine`
     * reads the active states.
     */
    readonly when?: (ctx: Readonly<Ctx>, machine: MachineView<Hook, Tag>) => boolean;
    /**
     * Runs when the timer fires: between the `exit` and `enter` hooks of the move, or on its own
     * for a rule with no `to`.
     */
    readonly run?: RuleRun<Ctx, E, Tag, Hook>;
}
/**
 * One entry of the list form of `after`: a `delay` beside the fields of an `AfterRule`.
 * @noSelf
 */
export interface AfterConfig<Ctx, To extends string = string, E extends EventObject = never, Tag extends string = never, Hook extends string = string> extends AfterRule<Ctx, To, E, Tag, Hook> {
    /**
     * The delay in seconds of game time: a number, or a function of the context that returns one.
     * A function is read once each time the state is entered, after its `enter` hook, and again on
     * a hot reload, so the delay is fixed for that stay. The function only reads the context: it
     * cannot assign to a field of `ctx`. A result that is not a non-negative number throws, naming
     * the state.
     */
    readonly delay: number | ((ctx: Readonly<Ctx>) => number);
}
/**
 * One entry of the list form of `every`: a `delay` and the `run` it repeats.
 * @noSelf
 */
export interface EveryConfig<Ctx, E extends EventObject, Tag extends string = never, Hook extends string = string> {
    /**
     * The seconds of game time between two runs: a number, or a function of the context that
     * returns one. A function is read once each time the state is entered, after its `enter` hook,
     * and again on a hot reload, so the delay is fixed for that stay. The function only reads the
     * context: it cannot assign to a field of `ctx`. A result that is not a positive number
     * throws, naming the state.
     */
    readonly delay: number | ((ctx: Readonly<Ctx>) => number);
    /** Runs each time the delay passes: one function, or a list run in order. */
    readonly run: RunAction<Ctx, E, Tag, Hook> | readonly RunAction<Ctx, E, Tag, Hook>[];
    /** Not taken here: an `after` timer leaves the state. */
    readonly to?: never;
    /** Not taken here: a `run` tests a condition itself. */
    readonly when?: never;
}
/**
 * A state's rules by event `type`. Only the machine's event types are keys, and each rule's
 * `when` and `run` see the event variant its key names.
 */
export type OnConfig<Ctx, E extends EventObject, To extends string = string, Tag extends string = never, Hook extends string = string> = {
    readonly [K in E["type"]]?: TransitionSpec<Ctx, E, Extract<E, {
        type: K;
    }>, To, Tag, Hook>;
};
/**
 * Runs on every way in (`enter`) or out (`exit`) of the state: a move, `start` and `stop`. A hot
 * reload enters the states it adds, but drops a removed state without its `exit`. It gets no
 * event; event data reaches `enter` through `ctx`, set in `run`. `Hook` is the union of the
 * paths its `machine` takes: the machine's paths for a hook written in the config, and any
 * `string` when left out.
 */
export type StateHook<Ctx, E extends EventObject, Tag extends string = never, Hook extends string = string> = (ctx: Ctx, machine: MachineInstance<Ctx, E, Hook, Tag>) => void;
/**
 * Runs on every `update(dt)` while the state is active, deepest state first. It returns a full
 * path to move there, or `undefined` to pass. The first hook to return a path wins: the hooks
 * above it and the `after` timers of its region do not run on that call, and the move has no
 * `run`. Under a parallel state the other regions still run their hooks and timers, unless the
 * move left the parallel state or entered it again. `Hook` is the union of the paths its
 * `machine` takes: the machine's paths for a hook written in the config, and any `string` when
 * left out.
 */
export type UpdateHook<Ctx, E extends EventObject, To extends string = string, Tag extends string = never, Hook extends string = string> = (ctx: Ctx, dt: number, machine: MachineInstance<Ctx, E, Hook, Tag>) => To | undefined;
/**
 * Runs when the machine drops an event while the state is active: for the events `onUnhandled`
 * reports, and no others. Every active state that has the hook runs it, deepest first, in the
 * order `update` hooks run. `event` is the machine's whole event union, and is read-only: the
 * hook cannot assign to its fields. The hook moves nothing: a `send` from it queues, and a
 * `stop()` ends the step once every hook and listener has run for the event. `Hook` is the
 * union of the paths its `machine` takes: the machine's paths for a hook written in the config,
 * and any `string` when left out.
 */
export type UnhandledHook<Ctx, E extends EventObject, Tag extends string = never, Hook extends string = string> = (ctx: Ctx, event: Readonly<E>, machine: MachineInstance<Ctx, E, Hook, Tag>) => void;
/**
 * Starts work that lives as long as the state. `finish` sends one event and is ignored after the
 * first call or once the state is left. The returned cleanup runs on every way out. A task that
 * starts several callbacks counts them with `waitGroup`. `Hook` is the union of the paths its
 * `machine` takes: the machine's paths for a task written in the config, and any `string` when
 * left out.
 * @noSelf
 */
export type TaskStart<Ctx, E extends EventObject, Tag extends string = never, Hook extends string = string> = (ctx: Ctx, finish: (event: E) => void, machine: MachineInstance<Ctx, E, Hook, Tag>) => (() => void) | void;
/**
 * Counts several pieces of engine work a state starts and waits for, returned by `waitGroup()`.
 * It knows nothing about a machine: built inside a `task`, it is new for each entry of the
 * state.
 * @noSelf
 */
export interface WaitGroup {
    /**
     * Records one pending piece of work and returns the function that reports it finished. That
     * function counts once, and a later call does nothing. It ignores its arguments, so an engine
     * function takes it as its callback, as in `http.request(url, "GET", group.add())`.
     */
    readonly add: () => () => void;
    /**
     * Calls `callback` once when no added work is pending: at once when none is pending at the
     * call, and otherwise inside the report that finishes the last pending piece. Each call
     * registers one callback, and several run in the order registered. A `wait` made before the
     * first `add` runs at once, so it goes after them.
     */
    readonly wait: (callback: () => void) => void;
}
/**
 * A machine definition, returned by the second `defineMachine` call. Its `start` creates the
 * instances that run.
 * @noSelf
 */
export interface Machine<Ctx, E extends EventObject, P extends string = string, Tag extends string = never> {
    /**
     * Creates an instance with `ctx` as its context. Without `at` it enters the root's `initial`
     * chain. With `at`, a list of full state paths such as a copy of `leaves`, it enters toward
     * each path: a level or region no path names goes through `initial`, a path the machine lacks
     * falls back to its closest parent, and of two paths that cannot be active together the first
     * wins. Timer progress and `restoreDepth` memory are not part of the list. Each call returns a
     * separate instance, which has already handled the events its `enter` hooks sent.
     */
    readonly start: (ctx: Ctx, at?: readonly P[]) => MachineInstance<Ctx, E, P, Tag>;
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
type AnyChild<Ctx, E extends EventObject, T, To extends string, Tag extends string = never, Hook extends string = string> = unknown extends T ? {
    readonly [name: string]: StateNode<Ctx, E, unknown, string, To, Tag, Hook>;
} : unknown;
/** @noSelf */
interface StateBase<Ctx, E extends EventObject, T, Self extends string, To extends string, Tag extends string = never, Hook extends string = string> {
    /** Child states, by name. A name is non-empty and contains no `/`. */
    readonly states?: {
        readonly [K in keyof T]: StateNode<Ctx, E, T[K], `${Self}/${K & string}`, To, Tag, Hook>;
    } & NoInfer<AnyChild<Ctx, E, T, To, Tag, Hook>>;
    /**
     * Names from the machine's third type argument that hold while the state is active, read with
     * `hasTag`.
     */
    readonly tags?: readonly Tag[];
    /**
     * Rules by event `type`, each a target path, a rule object or a list of them. An event starts
     * at the deepest active state and moves up to the parent while no rule takes it.
     */
    readonly on?: NoInfer<OnConfig<Ctx, E, To, Tag, Hook>>;
    /**
     * Timers, in one of two forms: targets or `AfterRule` objects by delay in seconds of game
     * time, such as `{ 2: "/idle" }`, or a list of `AfterConfig` entries, such as
     * `[{ delay: (ctx) => ctx.patrolFor, to: "/rest" }]`, whose `delay` is a number or a function
     * of the context. A delay function is read once each time the state is entered, after its
     * `enter` hook, and again on a hot reload. The delay is counted by `update(dt)` while the state
     * is active, from zero on each entry, and a timer fires at most once per stay. An `update`
     * call tries the due timers in delay order: one whose `when` fails stays pending, one with no
     * `to` runs its `run` and the call goes on, and the first that moves ends the timers of its
     * region for that call. None is tried in a region an `update` hook moved on that call. Under a
     * parallel state each region follows both rules on its own, and the parallel state's own
     * timers are tried only when no region moved. A state's `every` entries run before its timers.
     */
    readonly after?: NoInfer<{
        readonly [seconds: number]: To | AfterRule<Ctx, To, E, Tag, Hook> | AfterRule<Ctx, To, never, Tag, Hook>;
    } | readonly (AfterConfig<Ctx, To, E, Tag, Hook> | AfterConfig<Ctx, To, never, Tag, Hook>)[]>;
    /**
     * Code that repeats while the state is active, in one of two forms: a `run` by delay in
     * seconds of game time, such as `{ 0.5: (ctx) => burn(ctx) }`, or a list of `EveryConfig`
     * entries, such as `[{ delay: (ctx) => ctx.fireEvery, run: fire }]`, whose `delay` is a number
     * or a function of the context, read as an `after` delay is. A `run` is one function or a list
     * run in order. An entry first runs one delay after the state is entered, then each time
     * another delay has passed on the state's clock, which `update(dt)` advances while the state
     * is active, from zero on each entry. It runs at most once per `update` call: a call that
     * covers several delays runs it once, and its later runs stay on multiples of the delay. A run
     * is not a move: no `update` hook is skipped, `always` is not rechecked and `onMove` is not
     * called. A state's entries run where its `after` timers are tried and before them, a list in
     * list order and the other form shortest delay first; on a call in which an `update` hook or a
     * timer of a deeper state moved, they wait for the next call. A delay that is not a positive
     * number throws, naming the state.
     */
    readonly every?: NoInfer<{
        readonly [seconds: number]: RunAction<Ctx, E, Tag, Hook> | readonly RunAction<Ctx, E, Tag, Hook>[];
    } | readonly EveryConfig<Ctx, E, Tag, Hook>[]>;
    /**
     * Rules taken right after any move that leaves this state active; the first whose `when` is
     * missing or passes wins, and its `run` runs during the move. It is checked after a move only:
     * not after a rule with no `to`, and not on an `update` call that moves nothing.
     */
    readonly always?: AlwaysSpec<Ctx, To, E, Tag, Hook>;
    /**
     * Runs each time the state is entered, outermost state first: on a move, at `start`, and when
     * a hot reload adds the state. It gets no event.
     */
    readonly enter?: StateHook<Ctx, E, Tag, Hook>;
    /**
     * Runs each time the state is left, deepest state first, including on `stop()`. A state a hot
     * reload removes is dropped without it.
     */
    readonly exit?: StateHook<Ctx, E, Tag, Hook>;
    /**
     * Runs on every `update(dt)` while the state is active. Return one of the machine's full paths
     * to move there, or `undefined` to stay.
     */
    readonly update?: NoInfer<UpdateHook<Ctx, E, To, Tag, Hook>>;
    /** Started on each entry; see `TaskStart`. */
    readonly task?: TaskStart<Ctx, E, Tag, Hook>;
    /** Runs when the machine drops an event while the state is active; see `UnhandledHook`. */
    readonly unhandled?: UnhandledHook<Ctx, E, Tag, Hook>;
    /** Renamed to `task`. */
    readonly invoke?: never;
}
/** @noSelf */
interface CompoundState<Ctx, E extends EventObject, T, Self extends string, To extends string, Tag extends string = never, Hook extends string = string> extends StateBase<Ctx, E, T, Self, To, Tag, Hook> {
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
interface ParallelState<Ctx, E extends EventObject, T, Self extends string, To extends string, Tag extends string = never, Hook extends string = string> extends StateBase<Ctx, E, T, Self, To, Tag, Hook> {
    /**
     * `"parallel"` keeps every child active at once, each as a region with its own active state.
     * Not allowed on the root.
     */
    readonly type: "parallel";
    readonly initial?: never;
    readonly restoreDepth?: never;
}
type StateNode<Ctx, E extends EventObject, T, Self extends string, To extends string, Tag extends string = never, Hook extends string = string> = CompoundState<Ctx, E, T, Self, To, Tag, Hook> | ParallelState<Ctx, E, T, Self, To, Tag, Hook>;
type HookStates<HT> = {
    readonly [K in keyof HT]: {
        readonly states?: HookStates<HT[K]>;
    };
};
type RootState<Ctx, E extends EventObject, T, Tag extends string = never, HT = unknown> = CompoundState<Ctx, E, T, "", NoInfer<SlotPath<T>>, Tag, NoInfer<SlotPath<HT>>> & {
    readonly initial: string;
    readonly states: object;
} & {
    readonly states: HookStates<HT>;
};
/**
 * The config of one state. Every field is optional. A state with child `states` is a compound
 * state and needs an `initial`, unless its `type` is `"parallel"`; a state without children is a
 * leaf. `Tag` is the union of the machine's tag names. The `machine` a callback of a config
 * typed this way receives takes any `string` path.
 */
export type StateConfig<Ctx, E extends EventObject, Tag extends string = never> = StateNode<Ctx, E, unknown, string, string, Tag>;
/**
 * The root config passed to `defineMachine`. It takes the fields of a state and requires
 * `initial` and `states`. The root has no name and cannot be parallel. `Tag` is the union of the
 * machine's tag names. The `machine` a callback of a config typed this way receives takes any
 * `string` path.
 */
export type MachineConfig<Ctx, E extends EventObject, Tag extends string = never> = CompoundState<Ctx, E, unknown, string, string, Tag> & {
    readonly initial: string;
    readonly states: {
        readonly [name: string]: StateConfig<Ctx, E, Tag>;
    };
};
type WithPrivate<Ctx, Priv> = [Priv] extends [never] ? Ctx : Ctx & Priv;
/**
 * Defines a machine in two calls: `defineMachine<Ctx, E>()` fixes the context and event types and
 * takes an optional hot-reload key, and the second call takes the config. The config is checked
 * when that call runs, and a mistake throws, naming the state path. With a key, a later
 * definition under it puts its states into the machine already built, so every running instance
 * sees the edit; without one, each call builds a separate machine.
 *
 * A third type argument, as in `defineMachine<Ctx, E, Tag>()`, is a union of tag names: a state's
 * `tags` lists some of them, and `hasTag` asks whether an active state carries one. A machine
 * defined without it has no tags.
 *
 * The root config may hold `privateCtx`, for a machine that keeps fields of its own, such as a
 * counter, a heat level or a list it builds up. Every hook, `when`, `run`, `task` and `update`
 * then sees those fields beside `Ctx`, while `start` takes only `Ctx` and the instance it returns
 * shows only `Ctx` in its `ctx`. A machine without fields of its own leaves `privateCtx` out.
 */
export declare function defineMachine<Ctx, E extends EventObject, Tag extends string = never>(key?: string): <T, Priv extends object = never, HT = unknown>(config: RootState<WithPrivate<Ctx, Priv>, E, T, Tag, HT> & PrivateCtxConfig<Ctx, Priv>) => Machine<Ctx, E, TreePath<T>, Tag>;
/**
 * Makes a group that counts the engine work a `task` started and tells when all of it has
 * finished. Each `add()` returns the callback to pass to one engine call, and `wait` runs its
 * callback once every one of them has reported.
 *
 * @example
 * ```ts
 * loading: {
 *   task: (ctx, finish) => {
 *     const group = waitGroup();
 *     http.request(ctx.url, "GET", group.add());
 *     go.animate(
 *       ctx.curtain,
 *       "tint.w",
 *       go.PLAYBACK_ONCE_FORWARD,
 *       0,
 *       go.EASING_LINEAR,
 *       0.5,
 *       0,
 *       group.add(),
 *     );
 *     group.wait(() => finish({ type: "READY" }));
 *   },
 *   on: { READY: "/playing" },
 * },
 * ```
 */
export declare function waitGroup(): WaitGroup;
/**
 * The optional key a `defineMachine` root config takes beside `initial` and `states`.
 * @noSelf
 */
export interface PrivateCtxConfig<Ctx, Priv> {
    /**
     * Builds the fields only the machine uses. It runs once per `start`, before the root's `enter`
     * hook, so every instance gets fresh fields of its own; a value written straight into the
     * config would be one array or table shared by every instance. It receives the object passed
     * to `start`, typed `Ctx`, so a private field can start from a field of `Ctx`:
     * `privateCtx: (ctx: TurretOptions) => ({ heat: ctx.startHeat })`. Give `ctx` its type; without
     * one TypeScript can type a hook before it knows the private fields, and that hook reports the
     * field as missing.
     *
     * The fields are added to the object passed to `start`, which stays the instance's `ctx`, so
     * restarting with `start(old.ctx)` keeps the public fields and builds the private ones fresh.
     * A hot reload under the machine's key adds the fields a new factory introduces and leaves
     * every field that already holds a value alone. A private field may not share a name with a
     * field of `Ctx`.
     *
     * The fields are hidden from callers by type only. At run time `ctx` is one table, and hooks,
     * `hsm-view` and a debugger see every field.
     *
     * There are two ways to type the fields.
     *
     * @example
     * **Inferred.** For a few fields, write them inline and let TypeScript infer their types. Add
     * `as` where the inferred type is wrong: an empty array is `never[]` until it reads
     * `[] as Hash[]`, and a field holding one of several strings is any `string` until it reads
     * `"cool" as "cool" | "hot"`.
     *
     * ```ts
     * type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };
     *
     * export const turret = defineMachine<{ readonly fireRate: number }, TurretEvent>("turret")({
     *   privateCtx: () => ({ heat: 0, targets: [] as Hash[] }),
     *   initial: "/idle",
     *   states: {
     *     idle: { on: { SPOTTED: "/firing" } },
     *     firing: {
     *       enter: (ctx) => {
     *         ctx.heat += 1 / ctx.fireRate;
     *       },
     *       on: { LOST: "/idle" },
     *     },
     *   },
     * });
     *
     * const gun = turret.start({ fireRate: 2 }); // gun.ctx shows fireRate only
     * ```
     *
     * @example
     * **A named type.** For more fields, or when a helper outside the config needs the whole
     * context, declare the fields as an interface and make it the factory's return type. The
     * fields need no `as`, a misspelled or unknown field is a compile error, and the whole context
     * is `TurretOptions & TurretPrivate`. `satisfies TurretPrivate` does not do this: it checks the
     * object but keeps its narrow types, so an empty array stays `never[]`.
     *
     * ```ts
     * interface TurretOptions {
     *   readonly fireRate: number;
     * }
     *
     * interface TurretPrivate {
     *   heat: number;
     *   mode: "cool" | "hot";
     * }
     *
     * type TurretEvent = { type: "SPOTTED" } | { type: "LOST" };
     *
     * const overheated = (ctx: TurretOptions & TurretPrivate) => ctx.heat > ctx.fireRate;
     *
     * export const turret = defineMachine<TurretOptions, TurretEvent>("turret")({
     *   privateCtx: (): TurretPrivate => ({ heat: 0, mode: "cool" }),
     *   initial: "/idle",
     *   states: {
     *     idle: { on: { SPOTTED: "/firing" } },
     *     firing: {
     *       enter: (ctx) => {
     *         ctx.heat += 1 / ctx.fireRate;
     *       },
     *       always: { to: "/cooling", when: overheated },
     *       on: { LOST: "/idle" },
     *     },
     *     cooling: {
     *       enter: (ctx) => {
     *         ctx.mode = "hot";
     *       },
     *       exit: (ctx) => {
     *         ctx.heat = 0;
     *         ctx.mode = "cool";
     *       },
     *       after: { 2: "/idle" },
     *     },
     *   },
     * });
     * ```
     */
    readonly privateCtx?: (ctx: Ctx) => Priv & {
        readonly [K in keyof Ctx & keyof Priv]: never;
    };
}
export {};

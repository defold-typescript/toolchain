// Generated from packages/hsm/src/builder.ts by `bun run --cwd packages/transpiler declarations`; do not edit.
import { type AfterRule, type AlwaysConfig, type EventObject, type Machine, type MachineSkeleton, type MoveAction, type PrivateCtxConfig, type RunAction, type StateHook, type TaskStart, type TransitionConfig, type TreePath, type UnhandledHook, type UpdateHook, type WithPrivate } from "./index";
type Delay<Ctx> = number | ((ctx: Readonly<Ctx>) => number);
type EventGuard<Ctx, E extends EventObject, V extends E, P extends string, Tag extends string> = NonNullable<TransitionConfig<Ctx, E, V, P, Tag, P>["when"]>;
type TimerGuard<Ctx, E extends EventObject, P extends string, Tag extends string> = NonNullable<AfterRule<Ctx, P, E, Tag, P>["when"]>;
type AlwaysGuard<Ctx, E extends EventObject, P extends string, Tag extends string> = NonNullable<AlwaysConfig<Ctx, P, E, Tag, P>["when"]>;
/**
 * Adds behavior to a machine whose structure is a skeleton, returned by the second `buildMachine`
 * call. `P` is the union of the skeleton's state paths, and every path a statement takes is one
 * of them.
 * @noSelf
 */
export interface MachineBuilder<Ctx, E extends EventObject, P extends string, Tag extends string = never, Priv = never> {
    /**
     * The builder of the state at the full path `path`, such as `/on/bright`. A path the skeleton
     * lacks throws.
     */
    readonly state: (path: P) => StateBuilder<WithPrivate<Ctx, Priv>, E, P, Tag>;
    /** The builder of the root, whose rules take an event no state below it takes. */
    readonly root: StateBuilder<WithPrivate<Ctx, Priv>, E, P, Tag>;
    /**
     * Writes the statements onto the skeleton's own state objects, in list form, and passes the
     * skeleton and the key to `defineMachine`, returning its machine. It throws, naming the state,
     * on a rule left without its ending, and a second call throws.
     */
    readonly build: () => Machine<Ctx, E, P, Tag>;
}
/**
 * Adds behavior to one state. Each `on`, `after`, `every` and `always` call adds one entry, and
 * a state's entries are tried in call order. `enter`, `exit`, `update`, `task` and `unhandled`
 * each take one function: a second call on the same state throws. Every call throws after
 * `build()`.
 * @noSelf
 */
export interface StateBuilder<Ctx, E extends EventObject, P extends string, Tag extends string> {
    /**
     * Adds a rule for events of type `type`, whose `when` and `run` see that variant. End it with
     * `to`, `run` or `ignore`.
     */
    readonly on: <K extends E["type"]>(type: K) => EventRuleBuilder<Ctx, E, Extract<E, {
        type: K;
    }>, P, Tag>;
    /**
     * Adds a timer that fires once `delay` seconds of game time have passed in the state: a number,
     * or a function of the context read each time the state is entered. End it with `to` or `run`.
     */
    readonly after: (delay: Delay<Ctx>) => TimerRuleBuilder<Ctx, E, P, Tag>;
    /**
     * Adds functions run each time `delay` seconds of game time pass in the state: a number, or a
     * function of the context read each time the state is entered. End it with `run`.
     */
    readonly every: (delay: Delay<Ctx>) => RunBuilder<Ctx, E, P, Tag>;
    /** Adds a rule taken right after any move that leaves the state active. End it with `to`. */
    readonly always: () => AlwaysRuleBuilder<Ctx, E, P, Tag>;
    /** Sets the function run each time the state is entered. */
    readonly enter: (hook: StateHook<Ctx, E, Tag, P>) => void;
    /** Sets the function run each time the state is left. */
    readonly exit: (hook: StateHook<Ctx, E, Tag, P>) => void;
    /**
     * Sets the function run on every `update(dt)` while the state is active, which returns a full
     * path to move there, or `undefined` to stay.
     */
    readonly update: (hook: UpdateHook<Ctx, E, P, Tag, P>) => void;
    /** Sets the work started on each entry; see `TaskStart`. */
    readonly task: (start: TaskStart<Ctx, E, Tag, P>) => void;
    /** Sets the function run when the machine drops an event while the state is active. */
    readonly unhandled: (hook: UnhandledHook<Ctx, E, Tag, P>) => void;
    /** Adds tag names that hold while the state is active, read with `hasTag`. */
    readonly tags: (...names: Tag[]) => void;
}
/**
 * The rule an `on` call added, before its ending. `build()` throws on a rule left without `to`,
 * `run` or `ignore`.
 * @noSelf
 */
export interface EventRuleBuilder<Ctx, E extends EventObject, V extends E, P extends string, Tag extends string> {
    /**
     * Takes the rule only when `guard` returns `true`. It reads `ctx` and `event` and changes
     * neither.
     */
    readonly when: (guard: EventGuard<Ctx, E, V, P, Tag>) => GuardedEventRuleBuilder<Ctx, E, V, P, Tag>;
    /** Ends the rule with the full path of the state to move to. */
    readonly to: (path: P) => EventRunBuilder<Ctx, E, V, P, Tag>;
    /** Ends the rule with functions run in order, with no move: no state exits or enters. */
    readonly run: (...actions: MoveAction<Ctx, E, V, Tag, P>[]) => void;
    /**
     * Ends the rule with nothing to do: the state takes the event, so it stops there and no rule
     * of a parent sees it.
     */
    readonly ignore: () => void;
}
/**
 * An `on` rule after its `when`, before its ending.
 * @noSelf
 */
export interface GuardedEventRuleBuilder<Ctx, E extends EventObject, V extends E, P extends string, Tag extends string> {
    /** Ends the rule with the full path of the state to move to. */
    readonly to: (path: P) => EventRunBuilder<Ctx, E, V, P, Tag>;
    /** Ends the rule with functions run in order, with no move: no state exits or enters. */
    readonly run: (...actions: MoveAction<Ctx, E, V, Tag, P>[]) => void;
}
/**
 * An `on` rule after its `to`.
 * @noSelf
 */
export interface EventRunBuilder<Ctx, E extends EventObject, V extends E, P extends string, Tag extends string> {
    /** Adds functions run in order during the move, after the `exit` hooks and before `enter`. */
    readonly run: (...actions: MoveAction<Ctx, E, V, Tag, P>[]) => void;
}
/**
 * The timer an `after` call added, before its ending. `build()` throws on a timer left without
 * `to` or `run`.
 * @noSelf
 */
export interface TimerRuleBuilder<Ctx, E extends EventObject, P extends string, Tag extends string> {
    /**
     * Fires the timer only when `guard` returns `true`, checked once the delay has passed and then
     * on every `update` call until it passes. It reads `ctx` and changes nothing.
     */
    readonly when: (guard: TimerGuard<Ctx, E, P, Tag>) => GuardedTimerRuleBuilder<Ctx, E, P, Tag>;
    /** Ends the timer with the full path of the state to move to. */
    readonly to: (path: P) => RunBuilder<Ctx, E, P, Tag>;
    /** Ends the timer with functions run in order when it fires, with no move. */
    readonly run: (...actions: RunAction<Ctx, E, Tag, P>[]) => void;
}
/**
 * An `after` timer after its `when`, before its ending.
 * @noSelf
 */
export interface GuardedTimerRuleBuilder<Ctx, E extends EventObject, P extends string, Tag extends string> {
    /** Ends the timer with the full path of the state to move to. */
    readonly to: (path: P) => RunBuilder<Ctx, E, P, Tag>;
    /** Ends the timer with functions run in order when it fires, with no move. */
    readonly run: (...actions: RunAction<Ctx, E, Tag, P>[]) => void;
}
/**
 * An `every` entry, or an `after` timer or `always` rule after its `to`.
 * @noSelf
 */
export interface RunBuilder<Ctx, E extends EventObject, P extends string, Tag extends string> {
    /**
     * Adds functions run in order: each time the delay passes for an `every` entry, and during the
     * move for a timer or an `always` rule.
     */
    readonly run: (...actions: RunAction<Ctx, E, Tag, P>[]) => void;
}
/**
 * The rule an `always` call added, before its `to`. `build()` throws on a rule left without one.
 * @noSelf
 */
export interface AlwaysRuleBuilder<Ctx, E extends EventObject, P extends string, Tag extends string> {
    /** Takes the rule only when `guard` returns `true`. It reads `ctx` and changes nothing. */
    readonly when: (guard: AlwaysGuard<Ctx, E, P, Tag>) => GuardedAlwaysRuleBuilder<Ctx, E, P, Tag>;
    /** Ends the rule with the full path of the state to move to. */
    readonly to: (path: P) => RunBuilder<Ctx, E, P, Tag>;
}
/**
 * An `always` rule after its `when`, before its `to`.
 * @noSelf
 */
export interface GuardedAlwaysRuleBuilder<Ctx, E extends EventObject, P extends string, Tag extends string> {
    /** Ends the rule with the full path of the state to move to. */
    readonly to: (path: P) => RunBuilder<Ctx, E, P, Tag>;
}
/**
 * Defines a machine as a skeleton plus statements, in three steps. `buildMachine<Ctx, E>()` fixes
 * the context and event types and takes an optional hot reload key, as `defineMachine` does; a
 * third type argument is the union of tag names. The second call takes the skeleton: the root's
 * `initial` and `states`, an optional `privateCtx`, and on each state only `initial`, `states`,
 * `type` and `restoreDepth`. It returns a `MachineBuilder`, whose `state(path)` and `root` add
 * behavior one statement at a time, and whose `build()` defines the machine.
 *
 * @example
 * ```ts
 * type LampEvent = { type: "TOGGLE" } | { type: "DIM" };
 *
 * const m = buildMachine<object, LampEvent>("lamp")({
 *   initial: "/off",
 *   states: {
 *     off: {},
 *     on: { initial: "/on/bright", states: { bright: {}, dim: {} } },
 *   },
 * });
 * m.state("/off").on("TOGGLE").to("/on");
 * m.state("/on").on("TOGGLE").to("/off");
 * m.state("/on/bright").on("DIM").to("/on/dim");
 *
 * export const lamp = m.build();
 * ```
 */
export declare function buildMachine<Ctx, E extends EventObject, Tag extends string = never>(key?: string): <T, Priv extends object = never>(skeleton: MachineSkeleton<T> & PrivateCtxConfig<Ctx, Priv>) => MachineBuilder<Ctx, E, TreePath<T>, Tag, Priv>;
export {};

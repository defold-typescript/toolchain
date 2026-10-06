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
interface RuleList<Rule> {
    readonly 0: Rule;
    readonly [index: number]: Rule;
    readonly length: number;
}
/** @noSelf */
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
export type TransitionSpec<Ctx, E extends EventObject, V extends E = E, To extends string = string> = To | TransitionConfig<Ctx, E, V, To> | RuleList<TransitionConfig<Ctx, E, V, To>>;
/** @noSelf */
export interface AlwaysConfig<Ctx, To extends string = string> {
    readonly to: To;
    /** Checked on every recheck, so it must have no side effects. */
    readonly when?: (ctx: Ctx) => boolean;
    /** Renamed to `to`. */
    readonly target?: never;
    /** Renamed to `when`. */
    readonly guard?: never;
}
export type AlwaysSpec<Ctx, To extends string = string> = To | AlwaysConfig<Ctx, To> | RuleList<AlwaysConfig<Ctx, To>>;
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
export type UpdateHook<Ctx, E extends EventObject, To extends string = string> = (ctx: Ctx, dt: number, machine: MachineInstance<Ctx, E>) => To | undefined;
/**
 * Starts work that lives as long as the state. `finish` sends one event and is ignored after the
 * first call or once the state is left. The returned cleanup runs on every way out.
 * @noSelf
 */
export type TaskStart<Ctx, E extends EventObject> = (ctx: Ctx, finish: (event: E) => void, machine: MachineInstance<Ctx, E>) => (() => void) | void;
/** @noSelf */
export interface Machine<Ctx, E extends EventObject, P extends string = string> {
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
export type StatePath<C> = TreePath<TreeOf<C>>;
type TreeDepth<T, D extends number> = unknown extends T ? number : [D] extends [never] ? number : 1 | ({
    [K in keyof T]: unknown extends T[K] ? never : TreeDepth<T[K], PathDepth[D]>;
}[keyof T] extends infer N ? N extends number ? number extends N ? number : NextCount[N] : never : never);
type AnyChild<Ctx, E extends EventObject, T, To extends string> = unknown extends T ? {
    readonly [name: string]: StateNode<Ctx, E, unknown, string, To>;
} : unknown;
/** @noSelf */
interface StateBase<Ctx, E extends EventObject, T, Self extends string, To extends string> {
    readonly states?: {
        readonly [K in keyof T]: StateNode<Ctx, E, T[K], `${Self}/${K & string}`, To>;
    } & NoInfer<AnyChild<Ctx, E, T, To>>;
    readonly on?: NoInfer<OnConfig<Ctx, E, To>>;
    readonly after?: NoInfer<{
        readonly [seconds: number]: To;
    }>;
    readonly always?: AlwaysSpec<Ctx, To>;
    readonly enter?: StateHook<Ctx, E>;
    readonly exit?: StateHook<Ctx, E>;
    readonly update?: NoInfer<UpdateHook<Ctx, E, To>>;
    /** Started on each entry; see `TaskStart`. */
    readonly task?: TaskStart<Ctx, E>;
    /** Renamed to `task`. */
    readonly invoke?: never;
}
/** @noSelf */
interface CompoundState<Ctx, E extends EventObject, T, Self extends string, To extends string> extends StateBase<Ctx, E, T, Self, To> {
    readonly type?: never;
    readonly initial?: NoInfer<unknown extends T ? string : `${Self}/${keyof T & string}`>;
    readonly restoreDepth?: NoInfer<TreeDepth<T, 4> | "all">;
}
/** @noSelf */
interface ParallelState<Ctx, E extends EventObject, T, Self extends string, To extends string> extends StateBase<Ctx, E, T, Self, To> {
    readonly type: "parallel";
    readonly initial?: never;
    readonly restoreDepth?: never;
}
type StateNode<Ctx, E extends EventObject, T, Self extends string, To extends string> = CompoundState<Ctx, E, T, Self, To> | ParallelState<Ctx, E, T, Self, To>;
type RootState<Ctx, E extends EventObject, T> = CompoundState<Ctx, E, T, "", NoInfer<SlotPath<T>>> & {
    readonly initial: string;
    readonly states: object;
};
export type StateConfig<Ctx, E extends EventObject> = StateNode<Ctx, E, unknown, string, string>;
export type MachineConfig<Ctx, E extends EventObject> = CompoundState<Ctx, E, unknown, string, string> & {
    readonly initial: string;
    readonly states: {
        readonly [name: string]: StateConfig<Ctx, E>;
    };
};
export declare function defineMachine<Ctx, E extends EventObject>(key?: string): <T>(config: RootState<Ctx, E, T>) => Machine<Ctx, E, TreePath<T>>;
export {};

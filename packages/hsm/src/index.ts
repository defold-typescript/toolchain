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
export type MoveListener<E extends EventObject, P extends string = string> = (
  from: P,
  to: P | undefined,
  cause: MoveCause,
  event: E | undefined,
) => void;

/**
 * A listener given to `onUnhandled`. It gets the event no rule of an active state took.
 * @noSelf
 */
export type UnhandledListener<E extends EventObject> = (event: E) => void;

/**
 * What a `when` sees of the running machine: which states are active, and nothing that changes
 * it. `P` is the union of the machine's state paths; the `machine` a `when` receives uses plain
 * `string` paths instead. `Tag` is the union of the machine's tag names.
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
  readonly matches: (path: P) => boolean;
  /**
   * Whether an active state carries `tag`. A parent's tag holds while any of its children is
   * active, and a tag in any region of a parallel state counts. The answer is `false` for a name
   * no state carries, and once stopped.
   */
  readonly hasTag: (tag: Tag) => boolean;
}

/**
 * One running machine, returned by `start`. `P` is the union of the machine's state paths; the
 * `machine` a hook, a `run` or a `task` receives uses plain `string` paths instead. `Tag` is the
 * union of the machine's tag names.
 * @noSelf
 */
export interface MachineInstance<
  Ctx,
  E extends EventObject,
  P extends string = string,
  Tag extends string = never,
> extends MachineView<P, Tag> {
  /** The context passed to `start`. */
  readonly ctx: Ctx;
  /**
   * Whether a rule of an active state would take `event` if it were sent at that moment. A rule
   * with no `to` counts. No hook, `run` or listener runs and nothing is queued, and once the
   * machine is stopped the answer is `false`.
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
 * hooks. Its `event` is the variant the `on` key names.
 */
export type MoveAction<Ctx, E extends EventObject, V extends E = E, Tag extends string = never> = (
  ctx: Ctx,
  event: V,
  machine: MachineInstance<Ctx, E, string, Tag>,
) => void;

/**
 * A function a `run` calls where there is no event: under `after`, `always` and `every`.
 */
export type RunAction<Ctx, E extends EventObject, Tag extends string = never> = (
  ctx: Ctx,
  machine: MachineInstance<Ctx, E, string, Tag>,
) => void;

// A rule typed without the machine's event type has no run. The default cannot be EventObject:
// MachineInstance is invariant in E, so such a rule would not fit a machine with narrower events.
// That makes the rule types invariant in E too, and TypeScript does not compare two instances of
// one type by structure, so each slot lists the rule typed without E beside the one typed with it.
type RuleRun<Ctx, E extends EventObject, Tag extends string = never> = [E] extends [never]
  ? never
  : RunAction<Ctx, E, Tag> | readonly RunAction<Ctx, E, Tag>[];

// A list with a first entry: Lua cannot tell [] from {}, so an empty list would compile to a
// transition with no to. It is an object type, not a tuple, because TypeScript reports a bad
// `to` in the object form on that `to` only when the spec union holds no array type.
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
export interface TransitionConfig<
  Ctx,
  E extends EventObject,
  V extends E = E,
  To extends string = string,
  Tag extends string = never,
> {
  /**
   * The full path of the state to move to. A `to` naming the state the rule is on exits and
   * re-enters it, restarting its timers and `task`; a `to` below it keeps it active.
   */
  readonly to?: To;
  /**
   * The rule is taken only when this returns `true`. It must have no side effects: it is also
   * checked when the move does not happen, in guarded lists and on every `always` recheck.
   * `machine` reads the active states; inside a parallel state it shows the regions that already
   * took the event.
   */
  readonly when?: (ctx: Ctx, event: V, machine: MachineView<string, Tag>) => boolean;
  /**
   * Runs during the move. The event is accepted when its key matches and `when` passes; then
   * `exit` runs on each state left, deepest first; then `run`; then `enter` on each state
   * entered, outermost first. Shared ancestors neither exit nor enter. A rule with no `to` runs
   * only `run`.
   */
  readonly run?: MoveAction<Ctx, E, V, Tag> | readonly MoveAction<Ctx, E, V, Tag>[];
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
export type TransitionSpec<
  Ctx,
  E extends EventObject,
  V extends E = E,
  To extends string = string,
  Tag extends string = never,
> = To | TransitionConfig<Ctx, E, V, To, Tag> | RuleList<TransitionConfig<Ctx, E, V, To, Tag>>;

/**
 * The object form of an `always` rule: a `to`, an optional `when` and an optional `run`. It gets
 * no event. `E` is the machine's event type; a rule typed without it has no `run`.
 * @noSelf
 */
export interface AlwaysConfig<
  Ctx,
  To extends string = string,
  E extends EventObject = never,
  Tag extends string = never,
> {
  /**
   * The full path of the state to move to. An `always` rule without one throws when the machine
   * is defined.
   */
  readonly to: To;
  /**
   * Checked on every recheck, so it must have no side effects. `machine` reads the active
   * states; inside a parallel state it shows the regions that already moved.
   */
  readonly when?: (ctx: Ctx, machine: MachineView<string, Tag>) => boolean;
  /** Runs between the `exit` and `enter` hooks of the move, only when the rule is taken. */
  readonly run?: RuleRun<Ctx, E, Tag>;
  /** Renamed to `to`. */
  readonly target?: never;
  /** Renamed to `when`. */
  readonly guard?: never;
}

/**
 * What `always` takes: a target path, an `AlwaysConfig`, or a non-empty list of them. The first
 * whose `when` is missing or passes is taken.
 */
export type AlwaysSpec<
  Ctx,
  To extends string = string,
  E extends EventObject = never,
  Tag extends string = never,
> =
  | To
  | AlwaysConfig<Ctx, To, E, Tag>
  | AlwaysConfig<Ctx, To, never, Tag>
  | RuleList<AlwaysConfig<Ctx, To, E, Tag> | AlwaysConfig<Ctx, To, never, Tag>>;

/**
 * The object form of a rule on an `after` timer: a `to`, a `when` and a `run`, each optional. A
 * rule with neither a `to` nor a `run` throws when the machine is defined. `E` is the machine's
 * event type; a rule typed without it has no `run`.
 * @noSelf
 */
export interface AfterRule<
  Ctx,
  To extends string = string,
  E extends EventObject = never,
  Tag extends string = never,
> {
  /**
   * The full path of the state to move to when the timer fires. A rule without one runs its
   * `run` and nothing else: no state exits or enters, and it is not a move.
   */
  readonly to?: To;
  /**
   * The timer fires only when this returns `true`. It is first checked once the delay has
   * passed, then on every `update` call until it passes or the state is left, so it must have no
   * side effects. `machine` reads the active states.
   */
  readonly when?: (ctx: Ctx, machine: MachineView<string, Tag>) => boolean;
  /**
   * Runs when the timer fires: between the `exit` and `enter` hooks of the move, or on its own
   * for a rule with no `to`.
   */
  readonly run?: RuleRun<Ctx, E, Tag>;
}

/**
 * One entry of the list form of `after`: a `delay` beside the fields of an `AfterRule`.
 * @noSelf
 */
export interface AfterConfig<
  Ctx,
  To extends string = string,
  E extends EventObject = never,
  Tag extends string = never,
> extends AfterRule<Ctx, To, E, Tag> {
  /**
   * The delay in seconds of game time: a number, or a function of the context that returns one.
   * A function is read once each time the state is entered, after its `enter` hook, and again on
   * a hot reload, so the delay is fixed for that stay. A result that is not a non-negative number
   * throws, naming the state.
   */
  readonly delay: number | ((ctx: Ctx) => number);
}

/**
 * One entry of the list form of `every`: a `delay` and the `run` it repeats.
 * @noSelf
 */
export interface EveryConfig<Ctx, E extends EventObject, Tag extends string = never> {
  /**
   * The seconds of game time between two runs: a number, or a function of the context that
   * returns one. A function is read once each time the state is entered, after its `enter` hook,
   * and again on a hot reload, so the delay is fixed for that stay. A result that is not a
   * positive number throws, naming the state.
   */
  readonly delay: number | ((ctx: Ctx) => number);
  /** Runs each time the delay passes: one function, or a list run in order. */
  readonly run: RunAction<Ctx, E, Tag> | readonly RunAction<Ctx, E, Tag>[];
  /** Not taken here: an `after` timer leaves the state. */
  readonly to?: never;
  /** Not taken here: a `run` tests a condition itself. */
  readonly when?: never;
}

/**
 * A state's rules by event `type`. Only the machine's event types are keys, and each rule's
 * `when` and `run` see the event variant its key names.
 */
export type OnConfig<
  Ctx,
  E extends EventObject,
  To extends string = string,
  Tag extends string = never,
> = {
  readonly [K in E["type"]]?: TransitionSpec<Ctx, E, Extract<E, { type: K }>, To, Tag>;
};

/**
 * Runs on every way in (`enter`) or out (`exit`) of the state: a move, `start` and `stop`. A hot
 * reload enters the states it adds, but drops a removed state without its `exit`. It gets no
 * event; event data reaches `enter` through `ctx`, set in `run`.
 */
export type StateHook<Ctx, E extends EventObject, Tag extends string = never> = (
  ctx: Ctx,
  machine: MachineInstance<Ctx, E, string, Tag>,
) => void;

/**
 * Runs on every `update(dt)` while the state is active, deepest state first. It returns a full
 * path to move there, or `undefined` to pass. The first hook to return a path wins: the hooks
 * above it and the `after` timers of its region do not run on that call, and the move has no
 * `run`. Under a parallel state the other regions still run their hooks and timers, unless the
 * move left the parallel state or entered it again.
 */
export type UpdateHook<
  Ctx,
  E extends EventObject,
  To extends string = string,
  Tag extends string = never,
> = (ctx: Ctx, dt: number, machine: MachineInstance<Ctx, E, string, Tag>) => To | undefined;

/**
 * Runs when the machine drops an event while the state is active: for the events `onUnhandled`
 * reports, and no others. Every active state that has the hook runs it, deepest first, in the
 * order `update` hooks run. `event` is the machine's whole event union. The hook moves nothing:
 * a `send` from it queues, and a `stop()` ends the step once every hook and listener has run for
 * the event.
 */
export type UnhandledHook<Ctx, E extends EventObject, Tag extends string = never> = (
  ctx: Ctx,
  event: E,
  machine: MachineInstance<Ctx, E, string, Tag>,
) => void;

/**
 * Starts work that lives as long as the state. `finish` sends one event and is ignored after the
 * first call or once the state is left. The returned cleanup runs on every way out. A task that
 * starts several callbacks counts them with `waitGroup`.
 * @noSelf
 */
export type TaskStart<Ctx, E extends EventObject, Tag extends string = never> = (
  ctx: Ctx,
  finish: (event: E) => void,
  machine: MachineInstance<Ctx, E, string, Tag>,
  // biome-ignore lint/suspicious/noConfusingVoidType: `void` keeps an expression-body task returning a void call (`=> go.animate(...)`) valid.
) => (() => void) | void;

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
export interface Machine<
  Ctx,
  E extends EventObject,
  P extends string = string,
  Tag extends string = never,
> {
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

// The paths a started machine can be in. A node with no children is `unknown`.
type TreePathsBelow<T, D extends number> = {
  [K in keyof T & string]:
    | K
    | `${K}/${D extends 1
        ? keyof T[K] extends never
          ? never
          : string
        : TreePathsBelow<T[K], PathDepth[D]>}`;
}[keyof T & string];

type TreePath<T> = `/${TreePathsBelow<T, 4>}`;

// The paths a config slot accepts. TypeScript checks a config once before it types the
// callbacks, and a level whose states hold only callbacks has no inferred children in that
// check, so a node with no inferred children accepts any path below it.
type SlotPathsBelow<T, D extends number> = unknown extends T
  ? string
  : {
      [K in keyof T & string]:
        | K
        | `${K}/${D extends 1 ? string : SlotPathsBelow<T[K], PathDepth[D]>}`;
    }[keyof T & string];

type SlotPath<T> = `/${SlotPathsBelow<T, 4>}`;

type TreeOf<C> = C extends { readonly states: infer Children }
  ? { readonly [K in keyof Children]: TreeOf<Children[K]> }
  : unknown;

/**
 * The union of a config's state paths, each with its leading `/`. Paths are spelled out four
 * levels deep; below that, any string under a fourth-level path is accepted.
 */
export type StatePath<C> = TreePath<TreeOf<C>>;

// The levels of child states below a node. It counts tree levels, so above a parallel state
// it is an upper bound on the counts restoreDepth takes.
type TreeDepth<T, D extends number> = unknown extends T
  ? number
  : [D] extends [never]
    ? number
    :
        | 1
        | ({
            [K in keyof T]: unknown extends T[K] ? never : TreeDepth<T[K], PathDepth[D]>;
          }[keyof T] extends infer N
            ? N extends number
              ? number extends N
                ? number
                : NextCount[N]
              : never
            : never);

type AnyChild<
  Ctx,
  E extends EventObject,
  T,
  To extends string,
  Tag extends string = never,
> = unknown extends T
  ? { readonly [name: string]: StateNode<Ctx, E, unknown, string, To, Tag> }
  : unknown;

// `states` is the only slot that infers the tree; every other slot that mentions it is wrapped
// in NoInfer. `on`, `after` and `update` are wrapped whole so inference never reads them:
// without exactOptionalPropertyTypes, reading `on` asks for the paths while the tree is still
// being inferred, and a valid config fails as circular. `always` is wrapped only through `To`:
// NoInfer over a union that holds object types hides its string members from completion.
// `every` mentions no path and is wrapped whole all the same: where inference reads it, an
// unannotated callback in it, such as `delay: (ctx) => ctx.rate`, gets no parameter types.
// No callback parameter mentions the tree: one that did would make TypeScript settle the tree
// at the first such callback, before the states beside it are read.
// `tags` mentions only `Tag`, which the first `defineMachine` call fixes and nothing infers, so
// it stays outside NoInfer.
/** @noSelf */
interface StateBase<
  Ctx,
  E extends EventObject,
  T,
  Self extends string,
  To extends string,
  Tag extends string = never,
> {
  /** Child states, by name. A name is non-empty and contains no `/`. */
  readonly states?: {
    readonly [K in keyof T]: StateNode<Ctx, E, T[K], `${Self}/${K & string}`, To, Tag>;
  } & NoInfer<AnyChild<Ctx, E, T, To, Tag>>;
  /**
   * Names from the machine's third type argument that hold while the state is active, read with
   * `hasTag`.
   */
  readonly tags?: readonly Tag[];
  /**
   * Rules by event `type`, each a target path, a rule object or a list of them. An event starts
   * at the deepest active state and moves up to the parent while no rule takes it.
   */
  readonly on?: NoInfer<OnConfig<Ctx, E, To, Tag>>;
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
  readonly after?: NoInfer<
    | {
        readonly [seconds: number]:
          | To
          | AfterRule<Ctx, To, E, Tag>
          | AfterRule<Ctx, To, never, Tag>;
      }
    | readonly (AfterConfig<Ctx, To, E, Tag> | AfterConfig<Ctx, To, never, Tag>)[]
  >;
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
  readonly every?: NoInfer<
    | {
        readonly [seconds: number]: RunAction<Ctx, E, Tag> | readonly RunAction<Ctx, E, Tag>[];
      }
    | readonly EveryConfig<Ctx, E, Tag>[]
  >;
  /**
   * Rules taken right after any move that leaves this state active; the first whose `when` is
   * missing or passes wins, and its `run` runs during the move. It is checked after a move only:
   * not after a rule with no `to`, and not on an `update` call that moves nothing.
   */
  readonly always?: AlwaysSpec<Ctx, To, E, Tag>;
  /**
   * Runs each time the state is entered, outermost state first: on a move, at `start`, and when
   * a hot reload adds the state. It gets no event.
   */
  readonly enter?: StateHook<Ctx, E, Tag>;
  /**
   * Runs each time the state is left, deepest state first, including on `stop()`. A state a hot
   * reload removes is dropped without it.
   */
  readonly exit?: StateHook<Ctx, E, Tag>;
  /**
   * Runs on every `update(dt)` while the state is active. Return one of the machine's full paths
   * to move there, or `undefined` to stay.
   */
  readonly update?: NoInfer<UpdateHook<Ctx, E, To, Tag>>;
  /** Started on each entry; see `TaskStart`. */
  readonly task?: TaskStart<Ctx, E, Tag>;
  /** Runs when the machine drops an event while the state is active; see `UnhandledHook`. */
  readonly unhandled?: UnhandledHook<Ctx, E, Tag>;
  /** Renamed to `task`. */
  readonly invoke?: never;
}

/** @noSelf */
interface CompoundState<
  Ctx,
  E extends EventObject,
  T,
  Self extends string,
  To extends string,
  Tag extends string = never,
> extends StateBase<Ctx, E, T, Self, To, Tag> {
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
interface ParallelState<
  Ctx,
  E extends EventObject,
  T,
  Self extends string,
  To extends string,
  Tag extends string = never,
> extends StateBase<Ctx, E, T, Self, To, Tag> {
  /**
   * `"parallel"` keeps every child active at once, each as a region with its own active state.
   * Not allowed on the root.
   */
  readonly type: "parallel";
  readonly initial?: never;
  readonly restoreDepth?: never;
}

type StateNode<
  Ctx,
  E extends EventObject,
  T,
  Self extends string,
  To extends string,
  Tag extends string = never,
> = CompoundState<Ctx, E, T, Self, To, Tag> | ParallelState<Ctx, E, T, Self, To, Tag>;

type RootState<Ctx, E extends EventObject, T, Tag extends string = never> = CompoundState<
  Ctx,
  E,
  T,
  "",
  NoInfer<SlotPath<T>>,
  Tag
> & {
  readonly initial: string;
  readonly states: object;
};

/**
 * The config of one state. Every field is optional. A state with child `states` is a compound
 * state and needs an `initial`, unless its `type` is `"parallel"`; a state without children is a
 * leaf. `Tag` is the union of the machine's tag names.
 */
export type StateConfig<Ctx, E extends EventObject, Tag extends string = never> = StateNode<
  Ctx,
  E,
  unknown,
  string,
  string,
  Tag
>;

/**
 * The root config passed to `defineMachine`. It takes the fields of a state and requires
 * `initial` and `states`. The root has no name and cannot be parallel. `Tag` is the union of the
 * machine's tag names.
 */
export type MachineConfig<Ctx, E extends EventObject, Tag extends string = never> = CompoundState<
  Ctx,
  E,
  unknown,
  string,
  string,
  Tag
> & {
  readonly initial: string;
  readonly states: { readonly [name: string]: StateConfig<Ctx, E, Tag> };
};

type Guard<Ctx, E extends EventObject> = (ctx: Ctx, event: E, machine: MachineView) => boolean;

interface Transition<Ctx, E extends EventObject> {
  readonly target: number;
  readonly when: Guard<Ctx, E> | undefined;
  readonly run: readonly MoveAction<Ctx, E>[];
}

type Delay<Ctx> = number | ((ctx: Ctx) => number);

interface Compiled<Ctx, E extends EventObject> {
  count: number;
  readonly configs: StateConfig<Ctx, E>[];
  readonly paths: string[];
  readonly parent: number[];
  readonly depth: number[];
  readonly children: number[][];
  readonly parallel: boolean[];
  readonly initialChild: number[];
  readonly restoreDepth: number[];
  readonly levels: number[];
  readonly records: boolean[];
  readonly onIndex: { [type: string]: number }[];
  readonly transitions: Transition<Ctx, E>[][];
  readonly afterDelays: number[][];
  readonly afterRules: Transition<Ctx, E>[][];
  // Set only for a state whose after list holds a delay function: its entries in list order,
  // for each instance to sort once the function is read.
  readonly afterListDelays: (Delay<Ctx>[] | undefined)[];
  readonly afterListRules: (Transition<Ctx, E>[] | undefined)[];
  // A state's every entries: the record form in delay order, a list in list order.
  readonly everyDelays: Delay<Ctx>[][];
  readonly everyRuns: RunAction<Ctx, E>[][][];
  readonly always: Transition<Ctx, E>[][];
  readonly pathIndex: { [path: string]: number };
  // For each tag, the states that carry it.
  readonly tagStates: { [tag: string]: number[] };
}

const ROOT = 0;
const NO_STATE = -1;
const ALWAYS_LIMIT = 10;

function describePath(path: string): string {
  return path === "" ? "(root)" : path;
}

function lookupPath<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  path: string,
): number | undefined {
  const index = compiled.pathIndex[path];
  return typeof index === "number" ? index : undefined;
}

function resolveTarget<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  source: number,
  target: string,
): number {
  const sourcePath = describePath(compiled.paths[source] as string);
  if (target.charAt(0) !== "/") {
    throw `hsm: state "${sourcePath}" targets "${target}", which is not a full path starting with "/"`;
  }
  const index = lookupPath(compiled, target);
  if (index === undefined) {
    throw `hsm: state "${sourcePath}" targets unknown state "${target}"`;
  }
  return index;
}

// A structural cast keeps each read a plain method call: native in JavaScript, string.byte and
// string.sub in Lua.
interface StringUnits {
  charCodeAt(index: number): number;
  byte(index: number): number;
  substring(start: number, end: number): string;
  sub(first: number, last: number): string;
}

// JavaScript strings hold UTF-16 code units; Lua strings hold UTF-8 bytes.
const UTF16_UNITS = "\u{E000}".length === 1;

function unitAt(text: string, index: number): number {
  const units = text as unknown as StringUnits;
  if (UTF16_UNITS) {
    return units.charCodeAt(index);
  }
  return units.byte(index + 1);
}

const SLASH = 47;

// The state at path, or at its closest parent that exists: the path loses its last name until
// a state has it, and the root stands in when none does.
function closestState<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  path: string,
): number {
  let text = path;
  while (true) {
    const state = lookupPath(compiled, text);
    if (state !== undefined) {
      return state;
    }
    let cut = text.length - 1;
    while (cut > 0 && unitAt(text, cut) !== SLASH) {
      cut--;
    }
    if (cut <= 0) {
      return ROOT;
    }
    const units = text as unknown as StringUnits;
    if (UTF16_UNITS) {
      text = units.substring(0, cut);
    } else {
      text = units.sub(1, cut);
    }
  }
}

// Moves surrogates above the rest of the BMP, so UTF-16 units compare in code-point order.
// UTF-8 bytes already do, and every byte is below the surrogate range.
function codePointRank(unit: number): number {
  if (unit >= 0xd800 && unit < 0xe000) {
    return unit + 0x2000;
  }
  if (unit >= 0xe000) {
    return unit - 0x800;
  }
  return unit;
}

function precedes(left: string, right: string): boolean {
  for (let i = 0; i < left.length && i < right.length; i++) {
    const leftUnit = unitAt(left, i);
    const rightUnit = unitAt(right, i);
    if (leftUnit !== rightUnit) {
      return codePointRank(leftUnit) < codePointRank(rightUnit);
    }
  }
  return left.length < right.length;
}

function registerState<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  config: StateConfig<Ctx, E>,
  parentIndex: number,
  path: string,
): void {
  const index = compiled.count;
  compiled.count = index + 1;
  compiled.configs[index] = config;
  compiled.paths[index] = path;
  compiled.parent[index] = parentIndex;
  compiled.depth[index] =
    parentIndex === NO_STATE ? 0 : (compiled.depth[parentIndex] as number) + 1;
  compiled.children[index] = [];
  compiled.parallel[index] = config.type === "parallel";
  compiled.initialChild[index] = NO_STATE;
  compiled.restoreDepth[index] = 0;
  compiled.levels[index] = 0;
  compiled.records[index] = false;
  compiled.pathIndex[path] = index;
  const tags = config.tags as readonly string[] | undefined;
  if (tags !== undefined) {
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i] as string;
      let carriers = compiled.tagStates[tag];
      if (carriers === undefined) {
        carriers = [];
        compiled.tagStates[tag] = carriers;
      }
      carriers.push(index);
    }
  }
  const children = config.states;
  if (children === undefined) {
    return;
  }
  let deepest = 0;
  for (const name in children) {
    if (name === "" || name.indexOf("/") !== -1) {
      throw `hsm: state "${describePath(path)}" has a child named "${name}"; state names must be non-empty and contain no "/"`;
    }
    const child = compiled.count;
    const childPath = `${path}/${name}`;
    registerState(compiled, children[name] as StateConfig<Ctx, E>, index, childPath);
    // Region order is child-name order by code point, the same in both runtimes: neither Lua's
    // pairs nor JavaScript keeps the written order.
    const siblings = compiled.children[index] as number[];
    let slot = siblings.length;
    while (
      slot > 0 &&
      precedes(childPath, compiled.paths[siblings[slot - 1] as number] as string)
    ) {
      siblings[slot] = siblings[slot - 1] as number;
      slot--;
    }
    siblings[slot] = child;
    const childLevels = compiled.levels[child] as number;
    if (childLevels > deepest) {
      deepest = childLevels;
    }
  }
  if (compiled.parallel[index] !== true) {
    deepest++;
  }
  compiled.levels[index] = deepest;
}

function hasChildren<Ctx, E extends EventObject>(config: StateConfig<Ctx, E>): boolean {
  const children = config.states;
  if (children === undefined) {
    return false;
  }
  for (const _name in children) {
    return true;
  }
  return false;
}

function compileInitial<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  index: number,
): void {
  const config = compiled.configs[index] as StateConfig<Ctx, E>;
  const path = compiled.paths[index] as string;
  const initial = config.initial;
  if (compiled.parallel[index] === true) {
    if (index === ROOT) {
      throw `hsm: state "${describePath(path)}" is parallel; put the regions in a child state`;
    }
    if (initial !== undefined) {
      throw `hsm: parallel state "${path}" has initial "${initial}"; every child is entered`;
    }
    if (config.restoreDepth !== undefined) {
      throw `hsm: parallel state "${path}" has restoreDepth; only a compound state resumes a child`;
    }
    if (!hasChildren(config)) {
      throw `hsm: parallel state "${path}" has no child states`;
    }
    return;
  }
  if (!hasChildren(config)) {
    if (initial !== undefined) {
      throw `hsm: state "${describePath(path)}" has initial "${initial}" but no child states`;
    }
    if (config.restoreDepth !== undefined) {
      throw `hsm: state "${describePath(path)}" has restoreDepth but no child states`;
    }
    return;
  }
  compileRestoreDepth(compiled, index);
  if (initial === undefined) {
    throw `hsm: compound state "${describePath(path)}" has no initial`;
  }
  const child = lookupPath(compiled, initial);
  if (child === undefined || compiled.parent[child] !== index) {
    throw `hsm: state "${describePath(path)}" has initial "${initial}", which is not one of its children`;
  }
  compiled.initialChild[index] = child;
}

function compileRestoreDepth<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  index: number,
): void {
  const depth = (compiled.configs[index] as StateConfig<Ctx, E>).restoreDepth;
  if (depth === undefined) {
    return;
  }
  const path = describePath(compiled.paths[index] as string);
  const levels = compiled.levels[index] as number;
  if (depth === "all") {
    compiled.restoreDepth[index] = levels;
    return;
  }
  if (typeof depth !== "number" || Math.floor(depth) !== depth || depth < 1) {
    throw `hsm: state "${path}" has restoreDepth ${depth}; use a whole number from 1, or "all"`;
  }
  if (depth > levels) {
    throw `hsm: state "${path}" has restoreDepth ${depth}, but only ${levels} ${levels === 1 ? "level" : "levels"} of child states below it`;
  }
  compiled.restoreDepth[index] = depth;
}

// A state records its last child only while some restoreDepth above or on it reaches its level.
function compileRecords<Ctx, E extends EventObject>(compiled: Compiled<Ctx, E>): void {
  const reach: number[] = [];
  for (let index = 0; index < compiled.count; index++) {
    const owner = compiled.parent[index] as number;
    let inherited = 0;
    if (owner !== NO_STATE) {
      inherited = reach[owner] as number;
      if (compiled.parallel[owner] !== true) {
        inherited--;
      }
    }
    const current = Math.max(compiled.restoreDepth[index] as number, inherited);
    reach[index] = current;
    compiled.records[index] = current > 0 && compiled.parallel[index] !== true;
  }
}

// A run is one function or a list of them; either way it compiles to a list.
function collectRun<Action>(declared: Action | readonly Action[] | undefined): Action[] {
  const run: Action[] = [];
  if (typeof declared === "function") {
    run.push(declared);
  } else if (declared !== undefined) {
    const list = declared as readonly Action[];
    for (let i = 0; i < list.length; i++) {
      run.push(list[i] as Action);
    }
  }
  return run;
}

function compileTransition<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  source: number,
  spec: string | TransitionConfig<Ctx, E>,
): Transition<Ctx, E> {
  if (typeof spec === "string") {
    return {
      target: resolveTarget(compiled, source, spec),
      when: undefined,
      run: [],
    };
  }
  return {
    target: spec.to === undefined ? NO_STATE : resolveTarget(compiled, source, spec.to),
    when: spec.when,
    run: collectRun<MoveAction<Ctx, E>>(spec.run),
  };
}

function compileOn<Ctx, E extends EventObject>(compiled: Compiled<Ctx, E>, index: number): void {
  const table: { [type: string]: number } = {};
  compiled.onIndex[index] = table;
  const on = (compiled.configs[index] as StateConfig<Ctx, E>).on as
    | { readonly [type: string]: TransitionSpec<Ctx, E> | undefined }
    | undefined;
  if (on === undefined) {
    return;
  }
  for (const type in on) {
    const spec = on[type];
    if (spec === undefined) {
      continue;
    }
    const list: Transition<Ctx, E>[] = [];
    if (
      typeof spec === "string" ||
      (spec as readonly TransitionConfig<Ctx, E>[])[0] === undefined
    ) {
      list.push(compileTransition(compiled, index, spec as string | TransitionConfig<Ctx, E>));
    } else {
      const candidates = spec as readonly TransitionConfig<Ctx, E>[];
      for (let i = 0; i < candidates.length; i++) {
        list.push(compileTransition(compiled, index, candidates[i] as TransitionConfig<Ctx, E>));
      }
    }
    table[type] = compiled.transitions.length;
    compiled.transitions.push(list);
  }
}

function compileAlways<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  index: number,
): void {
  const list: Transition<Ctx, E>[] = [];
  compiled.always[index] = list;
  // Read as an array type: the transpiler shifts an index to Lua's base 1 only on an array.
  const spec = (compiled.configs[index] as StateConfig<Ctx, E>).always as
    | string
    | AlwaysConfig<Ctx, string, E>
    | readonly AlwaysConfig<Ctx, string, E>[]
    | undefined;
  if (spec === undefined) {
    return;
  }
  const candidates: readonly (string | AlwaysConfig<Ctx, string, E>)[] =
    typeof spec === "string" || (spec as readonly AlwaysConfig<Ctx, string, E>[])[0] === undefined
      ? [spec as string | AlwaysConfig<Ctx, string, E>]
      : (spec as readonly AlwaysConfig<Ctx, string, E>[]);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i] as string | AlwaysConfig<Ctx, string, E>;
    if (typeof candidate !== "string" && candidate.to === undefined) {
      throw `hsm: state "${describePath(compiled.paths[index] as string)}" has an always transition with no "to"`;
    }
    list.push(compileTransition(compiled, index, candidate as string | TransitionConfig<Ctx, E>));
  }
}

const NOT_A_DELAY = -1;

// Number-literal keys arrive as numbers in Lua and as canonical number strings in JavaScript.
// A string key counts only when it reads back unchanged, which rejects "" (0 in JavaScript).
function parseDelay(key: string | number): number {
  if (typeof key === "number") {
    return key;
  }
  let delay = NOT_A_DELAY;
  try {
    delay = (key as unknown as number) * 1;
  } catch {
    // Lua raises on arithmetic with a non-numeric string; delay keeps NOT_A_DELAY.
  }
  if (`${delay}` !== key) {
    return NOT_A_DELAY;
  }
  return delay;
}

// NaN fails the comparison, so it is rejected with the negative numbers.
function checkDelay(path: string, delay: unknown, written: unknown): void {
  if (typeof delay !== "number" || !(delay >= 0)) {
    throw `hsm: state "${describePath(path)}" has an after delay "${written}" that is not a non-negative number`;
  }
}

// Keeps the delays ascending; timers with one delay stay in the order they were added. Each
// delay carries one item: a timer's rule, or the run of an every entry.
function insertTimer<Item>(delays: number[], items: Item[], delay: number, item: Item): void {
  let slot = delays.length;
  while (slot > 0 && (delays[slot - 1] as number) > delay) {
    delays[slot] = delays[slot - 1] as number;
    items[slot] = items[slot - 1] as Item;
    slot--;
  }
  delays[slot] = delay;
  items[slot] = item;
}

// For each entry of an after list, the position of its rule among the sorted timers.
function entryPositions<Ctx, E extends EventObject>(
  list: Transition<Ctx, E>[],
  sorted: Transition<Ctx, E>[],
): number[] {
  const positions: number[] = [];
  for (let entry = 0; entry < list.length; entry++) {
    let at = 0;
    while (at < sorted.length && sorted[at] !== list[entry]) {
      at++;
    }
    positions[entry] = at;
  }
  return positions;
}

function compileTimer<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  index: number,
  spec: string | AfterRule<Ctx, string, E>,
): Transition<Ctx, E> {
  const rule = compileTransition(compiled, index, spec as string | TransitionConfig<Ctx, E>);
  if (rule.target === NO_STATE && rule.run.length === 0) {
    throw `hsm: state "${describePath(compiled.paths[index] as string)}" has an after timer with no "to" and no "run"`;
  }
  return rule;
}

function compileAfter<Ctx, E extends EventObject>(compiled: Compiled<Ctx, E>, index: number): void {
  const delays: number[] = [];
  const rules: Transition<Ctx, E>[] = [];
  compiled.afterDelays[index] = delays;
  compiled.afterRules[index] = rules;
  const after = (compiled.configs[index] as StateConfig<Ctx, E>).after;
  if (after === undefined) {
    return;
  }
  const path = compiled.paths[index] as string;
  // Read as an array type: the transpiler shifts an index to Lua's base 1 only on an array.
  const list = after as readonly AfterConfig<Ctx, string, E>[];
  const first = list[0];
  // A rule object under the delay 0, or under 1 in Lua where the read is shifted, is an object
  // too, so the list form is the one whose first entry has a delay.
  if (typeof first !== "object" || first.delay === undefined) {
    const byDelay = after as { readonly [seconds: number]: string | AfterRule<Ctx, string, E> };
    for (const key in byDelay) {
      const delay = parseDelay(key);
      checkDelay(path, delay, key);
      const spec = byDelay[key as unknown as number] as string | AfterRule<Ctx, string, E>;
      insertTimer(delays, rules, delay, compileTimer(compiled, index, spec));
    }
    return;
  }
  const listDelays: Delay<Ctx>[] = [];
  const listRules: Transition<Ctx, E>[] = [];
  let perInstance = false;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i] as AfterConfig<Ctx, string, E>;
    const delay = entry.delay;
    if (typeof delay === "function") {
      perInstance = true;
    } else {
      checkDelay(path, delay, delay);
    }
    listDelays[i] = delay;
    listRules[i] = compileTimer(compiled, index, entry);
  }
  if (perInstance) {
    compiled.afterListDelays[index] = listDelays;
    compiled.afterListRules[index] = listRules;
    return;
  }
  for (let i = 0; i < listDelays.length; i++) {
    insertTimer(delays, rules, listDelays[i] as number, listRules[i] as Transition<Ctx, E>);
  }
}

// NaN fails the comparison, so it is rejected with zero and the negative numbers.
function checkEveryDelay(path: string, delay: unknown, written: unknown): void {
  if (typeof delay !== "number" || !(delay > 0)) {
    throw `hsm: state "${describePath(path)}" has an every delay "${written}" that is not a positive number`;
  }
}

// The first multiple of delay above clock. Rounding can leave the product at or below the
// clock, and one more delay lifts it past.
function nextRun(clock: number, delay: number): number {
  const at = (Math.floor(clock / delay) + 1) * delay;
  if (at > clock) {
    return at;
  }
  return at + delay;
}

function compileEveryRun<Ctx, E extends EventObject>(
  path: string,
  declared: RunAction<Ctx, E> | readonly RunAction<Ctx, E>[] | undefined,
): RunAction<Ctx, E>[] {
  const run = collectRun<RunAction<Ctx, E>>(declared);
  if (run.length === 0) {
    throw `hsm: state "${describePath(path)}" has an every entry with no "run"`;
  }
  return run;
}

function compileEvery<Ctx, E extends EventObject>(compiled: Compiled<Ctx, E>, index: number): void {
  const delays: Delay<Ctx>[] = [];
  const runs: RunAction<Ctx, E>[][] = [];
  compiled.everyDelays[index] = delays;
  compiled.everyRuns[index] = runs;
  const every = (compiled.configs[index] as StateConfig<Ctx, E>).every;
  if (every === undefined) {
    return;
  }
  const path = compiled.paths[index] as string;
  // Read as an array type: the transpiler shifts an index to Lua's base 1 only on an array.
  const list = every as readonly EveryConfig<Ctx, E>[];
  const first = list[0];
  // A run list under the delay 0, or under 1 in Lua where the read is shifted, is an object
  // too, so the list form is the one whose first entry has a delay.
  if (typeof first !== "object" || first.delay === undefined) {
    const byDelay = every as {
      readonly [seconds: number]: RunAction<Ctx, E> | readonly RunAction<Ctx, E>[];
    };
    // Lua's pairs walks number keys in no fixed order, so the entries are sorted by delay.
    for (const key in byDelay) {
      const delay = parseDelay(key);
      checkEveryDelay(path, delay, key);
      const run = compileEveryRun(path, byDelay[key as unknown as number]);
      insertTimer(delays as number[], runs, delay, run);
    }
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const entry = list[i] as EveryConfig<Ctx, E>;
    const delay = entry.delay;
    if (typeof delay !== "function") {
      checkEveryDelay(path, delay, delay);
    }
    delays[i] = delay;
    runs[i] = compileEveryRun(path, entry.run);
  }
}

function compile<Ctx, E extends EventObject>(config: MachineConfig<Ctx, E>): Compiled<Ctx, E> {
  const compiled: Compiled<Ctx, E> = {
    count: 0,
    configs: [],
    paths: [],
    parent: [],
    depth: [],
    children: [],
    parallel: [],
    initialChild: [],
    restoreDepth: [],
    levels: [],
    records: [],
    onIndex: [],
    transitions: [],
    afterDelays: [],
    afterRules: [],
    afterListDelays: [],
    afterListRules: [],
    everyDelays: [],
    everyRuns: [],
    always: [],
    pathIndex: {},
    // A JavaScript object inherits members such as `__proto__` and `constructor`, and a tag can
    // be named like one. This literal has no prototype, so every string is an own key. In Lua
    // the nil field leaves a plain table.
    tagStates: { __proto__: null } as unknown as { [tag: string]: number[] },
  };
  registerState(compiled, config, NO_STATE, "");
  for (let index = 0; index < compiled.count; index++) {
    compileInitial(compiled, index);
    compileOn(compiled, index);
    compileAfter(compiled, index);
    compileEvery(compiled, index);
    compileAlways(compiled, index);
  }
  compileRecords(compiled);
  return compiled;
}

function isAncestorOrSelf<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  ancestor: number,
  state: number,
): boolean {
  const ancestorDepth = compiled.depth[ancestor] as number;
  let current = state;
  while ((compiled.depth[current] as number) > ancestorDepth) {
    current = compiled.parent[current] as number;
  }
  return current === ancestor;
}

function transitionDomain<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  source: number,
  target: number,
): number {
  let domain = source;
  if (source !== ROOT && (target === source || !isAncestorOrSelf(compiled, source, target))) {
    domain = compiled.parent[source] as number;
    while (domain !== ROOT && (domain === target || !isAncestorOrSelf(compiled, domain, target))) {
      domain = compiled.parent[domain] as number;
    }
  }
  // Regions enter and exit together, so a move spanning a parallel state re-enters it.
  while (compiled.parallel[domain] === true) {
    domain = compiled.parent[domain] as number;
  }
  return domain;
}

// Reads a start position: by state, the child a compound state enters, or NO_STATE where no
// path names one. Each path, in list order, claims the child of every compound state above the
// state it names. A path that needs a child an earlier path claimed differently is dropped
// whole, before it claims anything, so the first in the list wins and a dropped path leaves
// nothing behind. Every state has an entry, so neither runtime reads a list with holes.
function startChildren<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  at: readonly string[],
): number[] {
  const parent = compiled.parent;
  const chosen: number[] = [];
  for (let state = 0; state < compiled.count; state++) {
    chosen[state] = NO_STATE;
  }
  for (let i = 0; i < at.length; i++) {
    const target = closestState(compiled, at[i] as string);
    let free = true;
    for (let state = target; free && state !== ROOT; state = parent[state] as number) {
      const claimed = chosen[parent[state] as number] as number;
      free = claimed === NO_STATE || claimed === state;
    }
    for (let state = target; free && state !== ROOT; state = parent[state] as number) {
      const owner = parent[state] as number;
      // Every region of a parallel state is entered, so it holds no choice.
      if (compiled.parallel[owner] !== true) {
        chosen[owner] = state;
      }
    }
  }
  return chosen;
}

interface Definition<Ctx, E extends EventObject> {
  compiled: Compiled<Ctx, E>;
  generation: number;
}

interface Registered<Ctx, E extends EventObject> {
  readonly definition: Definition<Ctx, E>;
  readonly machine: Machine<Ctx, E>;
}

const registered: { [key: string]: Registered<unknown, EventObject> } = {};

// Adds the fields the root's privateCtx returns to ctx; the factory receives target. With
// onlyMissing, a field ctx already has keeps its value: a hot reload adds new private fields and
// leaves the old ones alone.
function fillPrivate(
  target: { [name: string]: unknown },
  root: unknown,
  onlyMissing: boolean,
): void {
  const factory = (root as PrivateCtxConfig<unknown, object>).privateCtx;
  const fields = (factory?.(target) || {}) as { [name: string]: unknown };
  for (const name in fields) {
    if (!onlyMissing || target[name] === undefined) {
      target[name] = fields[name];
    }
  }
}

// Copy-on-write: a report walks the list it started with, so a listener removed mid-report
// never makes it skip another.
function withListener<L>(list: readonly L[], listener: L): L[] {
  const added: L[] = [];
  for (let i = 0; i < list.length; i++) {
    added.push(list[i] as L);
  }
  added.push(listener);
  return added;
}

function withoutListener<L>(list: readonly L[], listener: L): L[] {
  const kept: L[] = [];
  let skipped = false;
  for (let i = 0; i < list.length; i++) {
    const current = list[i] as L;
    if (current !== listener || skipped) {
      kept.push(current);
    } else {
      skipped = true;
    }
  }
  return kept;
}

function createMachine<Ctx, E extends EventObject>(
  definition: Definition<Ctx, E>,
): Machine<Ctx, E> {
  function start(ctx: Ctx, at?: readonly string[]): MachineInstance<Ctx, E> {
    let compiled = definition.compiled;
    let generation = definition.generation;
    let paths = compiled.paths;
    let parent = compiled.parent;
    let children = compiled.children;
    let parallel = compiled.parallel;
    let initialChild = compiled.initialChild;
    let restoreDepth = compiled.restoreDepth;
    let records = compiled.records;
    let configs = compiled.configs;
    let onIndex = compiled.onIndex;
    let transitions = compiled.transitions;
    let afterDelays = compiled.afterDelays;
    let afterRules = compiled.afterRules;
    let afterListDelays = compiled.afterListDelays;
    let afterListRules = compiled.afterListRules;
    let everyDelays = compiled.everyDelays;
    let everyRuns = compiled.everyRuns;
    let always = compiled.always;
    const activeChild: number[] = [];
    const isActive: boolean[] = [];
    const elapsed: number[] = [];
    // For a state with timers, which of them fired during this stay, by position in delay order.
    const fired: (boolean[] | undefined)[] = [];
    // The sorted timers of a state whose after list holds a delay function, read on each entry.
    const ownDelays: (number[] | undefined)[] = [];
    const ownRules: (Transition<Ctx, E>[] | undefined)[] = [];
    // For a state with every entries, by entry: the delay it counts in this stay, and the value
    // of the state's clock at its next run.
    const ownEvery: (number[] | undefined)[] = [];
    const nextRuns: (number[] | undefined)[] = [];
    const entryId: number[] = [];
    const cleanup: ((() => void) | undefined)[] = [];
    // Keyed by path, not index, so a remembered child outlives a rebind's recompilation.
    const remembered: { [parentPath: string]: string } = {};
    let slotCount = 0;
    growSlots();
    sizeFired();
    const leaves: string[] = [];
    let entryCount = 0;
    const queue: (E | undefined)[] = [];
    let queueHead = 0;
    let queueTail = 0;
    let running = true;
    let busy = false;
    let stopRequested = false;
    let moved = false;
    let listeners: MoveListener<E>[] = [];
    let unhandledListeners: UnhandledListener<E>[] = [];

    const instance = {
      ctx,
      path: undefined as string | undefined,
      leaves,
      matches,
      hasTag,
      can,
      send,
      update,
      stop,
      onMove,
      onUnhandled,
    };

    function clearSlot(state: number): void {
      activeChild[state] = NO_STATE;
      isActive[state] = false;
      elapsed[state] = 0;
      fired[state] = undefined;
      ownDelays[state] = undefined;
      ownRules[state] = undefined;
      ownEvery[state] = undefined;
      nextRuns[state] = undefined;
      entryId[state] = 0;
      cleanup[state] = undefined;
    }

    function readDelays(state: number): void {
      const own = ownEvery[state];
      if (own !== undefined) {
        const declared = everyDelays[state] as Delay<Ctx>[];
        const runAt = nextRuns[state] as number[];
        const clock = elapsed[state] as number;
        for (let i = 0; i < own.length; i++) {
          let delay = declared[i] as Delay<Ctx>;
          if (typeof delay === "function") {
            delay = delay(ctx);
            checkEveryDelay(paths[state] as string, delay, delay);
          }
          own[i] = delay;
          runAt[i] = nextRun(clock, delay);
        }
      }
      const list = afterListDelays[state];
      if (list === undefined) {
        return;
      }
      const listRules = afterListRules[state] as Transition<Ctx, E>[];
      const delays: number[] = [];
      const rules: Transition<Ctx, E>[] = [];
      for (let i = 0; i < list.length; i++) {
        let delay = list[i] as Delay<Ctx>;
        if (typeof delay === "function") {
          delay = delay(ctx);
          checkDelay(paths[state] as string, delay, delay);
        }
        insertTimer(delays, rules, delay, listRules[i] as Transition<Ctx, E>);
      }
      ownDelays[state] = delays;
      ownRules[state] = rules;
    }

    function growSlots(): void {
      while (slotCount < compiled.count) {
        clearSlot(slotCount);
        slotCount++;
      }
    }

    // The flag lists and the two lists of a state's every entries are built here, once per
    // compiled definition: an entry and an update only write them in place.
    function sizeFired(): void {
      for (let state = 0; state < compiled.count; state++) {
        const list = afterListDelays[state];
        const count = list === undefined ? (afterDelays[state] as number[]).length : list.length;
        if (count > 0) {
          const flags: boolean[] = [];
          for (let i = 0; i < count; i++) {
            flags[i] = false;
          }
          fired[state] = flags;
        }
        const entries = (everyDelays[state] as Delay<Ctx>[]).length;
        if (entries > 0) {
          const own: number[] = [];
          const runAt: number[] = [];
          for (let i = 0; i < entries; i++) {
            own[i] = 0;
            runAt[i] = 0;
          }
          ownEvery[state] = own;
          nextRuns[state] = runAt;
        }
      }
    }

    function collectActive(state: number, order: number[]): void {
      order.push(state);
      const list = children[state] as number[];
      for (let i = 0; i < list.length; i++) {
        const child = list[i] as number;
        if (isActive[child] === true) {
          collectActive(child, order);
        }
      }
    }

    // Kept states hold their timers and entry id; a state whose path is gone, or whose
    // parent was dropped, is dropped without exit hooks, since its config is gone.
    function rebind(): void {
      const from = instance.path as string;
      const order: number[] = [];
      collectActive(ROOT, order);
      const keptPaths: string[] = [];
      const keptElapsed: number[] = [];
      const keptFired: (boolean[] | undefined)[] = [];
      const keptAt: (number[] | undefined)[] = [];
      const keptEntryId: number[] = [];
      const keptCleanup: ((() => void) | undefined)[] = [];
      for (let i = 0; i < order.length; i++) {
        const state = order[i] as number;
        keptPaths[i] = paths[state] as string;
        keptElapsed[i] = elapsed[state] as number;
        keptFired[i] = fired[state];
        const sorted = ownRules[state];
        if (sorted !== undefined) {
          keptAt[i] = entryPositions(afterListRules[state] as Transition<Ctx, E>[], sorted);
        }
        keptEntryId[i] = entryId[state] as number;
        keptCleanup[i] = cleanup[state];
      }
      for (let state = 0; state < slotCount; state++) {
        clearSlot(state);
      }
      compiled = definition.compiled;
      generation = definition.generation;
      paths = compiled.paths;
      parent = compiled.parent;
      children = compiled.children;
      parallel = compiled.parallel;
      initialChild = compiled.initialChild;
      restoreDepth = compiled.restoreDepth;
      records = compiled.records;
      configs = compiled.configs;
      onIndex = compiled.onIndex;
      transitions = compiled.transitions;
      afterDelays = compiled.afterDelays;
      afterRules = compiled.afterRules;
      afterListDelays = compiled.afterListDelays;
      afterListRules = compiled.afterListRules;
      everyDelays = compiled.everyDelays;
      everyRuns = compiled.everyRuns;
      always = compiled.always;
      fillPrivate(ctx as never, configs[ROOT], true);
      growSlots();
      sizeFired();
      const dropped: number[] = [];
      for (let i = 0; i < order.length; i++) {
        const state = lookupPath(compiled, keptPaths[i] as string);
        const owner = state === undefined ? NO_STATE : (parent[state] as number);
        if (
          state === undefined ||
          (owner !== NO_STATE &&
            (isActive[owner] !== true ||
              (parallel[owner] !== true && activeChild[owner] !== NO_STATE)))
        ) {
          dropped.push(i);
          continue;
        }
        isActive[state] = true;
        if (owner !== NO_STATE && parallel[owner] !== true) {
          activeChild[owner] = state;
        }
        elapsed[state] = keptElapsed[i] as number;
        entryId[state] = keptEntryId[i] as number;
        cleanup[state] = keptCleanup[i];
        // After the clock is restored: an every entry next runs at the first multiple of its
        // delay above it.
        readDelays(state);
        // By list entry where the old and the new definition both read a delay per instance,
        // else by position in delay order: a timer the new definition lacks is dropped, and a
        // new one starts unfired.
        const before = keptFired[i];
        const flags = fired[state];
        if (before !== undefined && flags !== undefined) {
          const was = keptAt[i];
          const sorted = ownRules[state];
          if (was !== undefined && sorted !== undefined) {
            const at = entryPositions(afterListRules[state] as Transition<Ctx, E>[], sorted);
            for (let entry = 0; entry < was.length && entry < at.length; entry++) {
              flags[at[entry] as number] = before[was[entry] as number] as boolean;
            }
          } else {
            for (let timer = 0; timer < before.length && timer < flags.length; timer++) {
              flags[timer] = before[timer] as boolean;
            }
          }
        }
      }
      for (let i = dropped.length - 1; i >= 0; i--) {
        const run = keptCleanup[dropped[i] as number];
        if (run !== undefined) {
          run();
        }
      }
      const entriesBefore = entryCount;
      enterMissing(ROOT);
      if (dropped.length === 0 && entryCount === entriesBefore) {
        return;
      }
      refreshLeaves();
      if (listeners.length > 0) {
        report(from, instance.path, "reload", undefined);
      }
      settleAlways();
    }

    function onMove(listener: MoveListener<E>): () => void {
      listeners = withListener(listeners, listener);
      let removed = false;
      return () => {
        if (removed) {
          return;
        }
        removed = true;
        listeners = withoutListener(listeners, listener);
      };
    }

    function onUnhandled(listener: UnhandledListener<E>): () => void {
      unhandledListeners = withListener(unhandledListeners, listener);
      let removed = false;
      return () => {
        if (removed) {
          return;
        }
        removed = true;
        unhandledListeners = withoutListener(unhandledListeners, listener);
      };
    }

    function report(
      from: string,
      to: string | undefined,
      cause: MoveCause,
      event: E | undefined,
    ): void {
      const current = listeners;
      for (let i = 0; i < current.length; i++) {
        (current[i] as MoveListener<E>)(from, to, cause, event);
      }
    }

    function collectLeaves(state: number, count: number): number {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        let total = count;
        for (let i = 0; i < list.length; i++) {
          total = collectLeaves(list[i] as number, total);
        }
        return total;
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE) {
        return collectLeaves(child, count);
      }
      leaves[count] = paths[state] as string;
      return count + 1;
    }

    function refreshLeaves(): void {
      const count = isActive[ROOT] === true ? collectLeaves(ROOT, 0) : 0;
      while (leaves.length > count) {
        leaves.pop();
      }
      instance.path = leaves[0];
    }

    function enterState(state: number): void {
      const owner = parent[state] as number;
      if (owner !== NO_STATE && parallel[owner] !== true) {
        activeChild[owner] = state;
      }
      isActive[state] = true;
      activeChild[state] = NO_STATE;
      elapsed[state] = 0;
      const flags = fired[state];
      if (flags !== undefined) {
        for (let i = 0; i < flags.length; i++) {
          flags[i] = false;
        }
      }
      entryCount++;
      const id = entryCount;
      entryId[state] = id;
      const config = configs[state] as StateConfig<Ctx, E>;
      const hook = config.enter;
      if (hook !== undefined) {
        hook(ctx, instance);
      }
      readDelays(state);
      const task = config.task;
      if (task !== undefined) {
        // A path, not an index, so a finish held across a rebind still finds its entry.
        const path = paths[state] as string;
        let finished = false;
        const result = task(
          ctx,
          (event: E) => {
            const current = lookupPath(compiled, path);
            if (
              finished ||
              !running ||
              stopRequested ||
              current === undefined ||
              entryId[current] !== id
            ) {
              return;
            }
            finished = true;
            send(event);
          },
          instance,
        );
        if (typeof result === "function") {
          cleanup[state] = result;
        }
      }
    }

    function exitSubtree(state: number): void {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = list.length - 1; i >= 0; i--) {
          exitSubtree(list[i] as number);
        }
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE) {
        exitSubtree(child);
      }
      isActive[state] = false;
      entryId[state] = 0;
      const owner = parent[state] as number;
      if (owner !== NO_STATE) {
        activeChild[owner] = NO_STATE;
        if (records[owner] === true) {
          remembered[paths[owner] as string] = paths[state] as string;
        }
      }
      const hook = (configs[state] as StateConfig<Ctx, E>).exit;
      if (hook !== undefined) {
        hook(ctx, instance);
      }
      const run = cleanup[state];
      if (run !== undefined) {
        cleanup[state] = undefined;
        run();
      }
    }

    function defaultChild(state: number, restore: boolean): number {
      if (restore) {
        const path = remembered[paths[state] as string];
        if (path !== undefined) {
          const child = lookupPath(compiled, path);
          if (child !== undefined && parent[child] === state) {
            return child;
          }
        }
      }
      return initialChild[state] as number;
    }

    // budget counts the levels still restored from an ancestor's restoreDepth; a parallel
    // state passes it to every region without spending a level.
    function enterDefaults(state: number, budget: number): void {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          enterState(list[i] as number);
          enterDefaults(list[i] as number, budget);
        }
        return;
      }
      const remaining = Math.max(restoreDepth[state] as number, budget);
      const child = defaultChild(state, remaining > 0);
      if (child !== NO_STATE) {
        enterState(child);
        enterDefaults(child, remaining - 1);
      }
    }

    function childToward(state: number, target: number): number {
      let child = target;
      while (parent[child] !== state) {
        child = parent[child] as number;
      }
      return child;
    }

    function enterToward(state: number, target: number): void {
      enterState(state);
      if (state === target) {
        enterDefaults(state, 0);
        return;
      }
      const next = childToward(state, target);
      if (parallel[state] !== true) {
        enterToward(next, target);
        return;
      }
      const list = children[state] as number[];
      for (let i = 0; i < list.length; i++) {
        const region = list[i] as number;
        if (region === next) {
          enterToward(region, target);
        } else {
          enterState(region);
          enterDefaults(region, 0);
        }
      }
    }

    // For a state already entered, at a start with a list of paths: chosen is what
    // startChildren read from the list.
    function enterAt(state: number, chosen: number[]): void {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          enterState(list[i] as number);
          enterAt(list[i] as number, chosen);
        }
        return;
      }
      const child = chosen[state] as number;
      if (child === NO_STATE) {
        enterDefaults(state, 0);
        return;
      }
      enterState(child);
      enterAt(child, chosen);
    }

    function enterMissing(state: number): void {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          const region = list[i] as number;
          if (isActive[region] === true) {
            enterMissing(region);
          } else {
            enterState(region);
            enterDefaults(region, 0);
          }
        }
        return;
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE) {
        enterMissing(child);
        return;
      }
      enterDefaults(state, 0);
    }

    function firstLeaf(state: number): string {
      let leaf = state;
      while (true) {
        const child =
          parallel[leaf] === true
            ? ((children[leaf] as number[])[0] as number)
            : (activeChild[leaf] as number);
        if (child === NO_STATE) {
          return paths[leaf] as string;
        }
        leaf = child;
      }
    }

    function transition(
      source: number,
      target: number,
      run: readonly MoveAction<Ctx, E>[] | undefined,
      event: E | undefined,
      cause: MoveCause,
    ): void {
      if (target === NO_STATE) {
        runActions(run, event);
        return;
      }
      const domain = transitionDomain(compiled, source, target);
      const from = firstLeaf(domain);
      const child = activeChild[domain] as number;
      if (child !== NO_STATE) {
        exitSubtree(child);
      }
      runActions(run, event);
      if (target === domain) {
        enterDefaults(domain, 0);
      } else {
        enterToward(childToward(domain, target), target);
      }
      refreshLeaves();
      moved = true;
      if (listeners.length > 0) {
        report(from, firstLeaf(domain), cause, event);
      }
    }

    function settleAlways(): void {
      for (let moves = 0; !stopRequested; moves++) {
        if (!takeAlways(ROOT, moves === ALWAYS_LIMIT)) {
          return;
        }
      }
    }

    function takeAlways(state: number, overLimit: boolean): boolean {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          if (takeAlways(list[i] as number, overLimit)) {
            return true;
          }
        }
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE && takeAlways(child, overLimit)) {
        return true;
      }
      const list = always[state] as Transition<Ctx, E>[];
      for (let i = 0; i < list.length; i++) {
        const candidate = list[i] as Transition<Ctx, E>;
        const when = candidate.when as ((ctx: Ctx, machine: MachineView) => boolean) | undefined;
        if (when === undefined || when(ctx, instance)) {
          if (overLimit) {
            clearQueue();
            busy = false;
            throw `hsm: state "${describePath(paths[state] as string)}" took ${ALWAYS_LIMIT} always transitions in a row; check for an always loop`;
          }
          transition(state, candidate.target, candidate.run, undefined, "always");
          return true;
        }
      }
      return false;
    }

    function runActions(
      run: readonly MoveAction<Ctx, E>[] | undefined,
      event: E | undefined,
    ): void {
      if (run === undefined) {
        return;
      }
      if (event === undefined) {
        // Only a rule outside `on` runs with no event, and its entries are RunActions.
        for (let i = 0; i < run.length; i++) {
          (run[i] as unknown as RunAction<Ctx, E>)(ctx, instance);
        }
        return;
      }
      for (let i = 0; i < run.length; i++) {
        (run[i] as MoveAction<Ctx, E>)(ctx, event, instance);
      }
    }

    function takeEvent(state: number, event: E): boolean {
      const listIndex = (onIndex[state] as { [type: string]: number })[event.type];
      if (typeof listIndex !== "number") {
        return false;
      }
      const list = transitions[listIndex] as Transition<Ctx, E>[];
      for (let i = 0; i < list.length; i++) {
        const candidate = list[i] as Transition<Ctx, E>;
        if (candidate.when === undefined || candidate.when(ctx, event, instance)) {
          transition(state, candidate.target, candidate.run, event, "event");
          return true;
        }
      }
      return false;
    }

    // Each region takes at most one transition; the event bubbles past the parallel
    // state only when none did, and a move that left or re-entered it ends the offer.
    function offerEvent(state: number, event: E): boolean {
      if (parallel[state] === true) {
        const id = entryId[state];
        const list = children[state] as number[];
        let taken = false;
        for (let i = 0; i < list.length; i++) {
          if (offerEvent(list[i] as number, event)) {
            taken = true;
            if (stopRequested || entryId[state] !== id) {
              return true;
            }
          }
        }
        if (taken) {
          return true;
        }
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE && offerEvent(child, event)) {
        return true;
      }
      return takeEvent(state, event);
    }

    // offerEvent's walk with no transition: the first region that would take the event ends
    // the question, and one that would not leaves the state the next region's guards read.
    // A hook can ask while a parallel state is half entered or half left, so a region answers
    // only once it is active.
    function wouldTake(state: number, event: E): boolean {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          const region = list[i] as number;
          if (isActive[region] === true && wouldTake(region, event)) {
            return true;
          }
        }
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE && wouldTake(child, event)) {
        return true;
      }
      const listIndex = (onIndex[state] as { [type: string]: number })[event.type];
      if (typeof listIndex !== "number") {
        return false;
      }
      const list = transitions[listIndex] as Transition<Ctx, E>[];
      for (let i = 0; i < list.length; i++) {
        const when = (list[i] as Transition<Ctx, E>).when;
        if (when === undefined || when(ctx, event, instance)) {
          return true;
        }
      }
      return false;
    }

    function can(event: E): boolean {
      return running && !stopRequested && wouldTake(ROOT, event);
    }

    function clearQueue(): void {
      while (queueHead < queueTail) {
        queue[queueHead] = undefined;
        queueHead++;
      }
      queueHead = 0;
      queueTail = 0;
    }

    function stopNow(): void {
      running = false;
      busy = true;
      clearQueue();
      const from = instance.path as string;
      exitSubtree(ROOT);
      refreshLeaves();
      busy = false;
      if (listeners.length > 0) {
        report(from, undefined, "stop", undefined);
      }
    }

    // No hook can move the machine, so the active states are the same from the first call to
    // the last, and the walk checks neither stopRequested nor entryId.
    function fireUnhandledHooks(state: number, event: E): void {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          fireUnhandledHooks(list[i] as number, event);
        }
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE) {
        fireUnhandledHooks(child, event);
      }
      const hook = (configs[state] as StateConfig<Ctx, E>).unhandled;
      if (hook !== undefined) {
        hook(ctx, event, instance);
      }
    }

    function endStep(): void {
      while (!stopRequested && queueHead < queueTail) {
        const event = queue[queueHead] as E;
        queue[queueHead] = undefined;
        queueHead++;
        moved = false;
        if (!offerEvent(ROOT, event)) {
          fireUnhandledHooks(ROOT, event);
          const current = unhandledListeners;
          for (let i = 0; i < current.length; i++) {
            (current[i] as UnhandledListener<E>)(event);
          }
        }
        if (moved) {
          settleAlways();
        }
      }
      clearQueue();
      busy = false;
      if (stopRequested) {
        stopNow();
      }
    }

    function send(event: E): void {
      if (!running || stopRequested) {
        return;
      }
      queue[queueTail] = event;
      queueTail++;
      if (busy) {
        return;
      }
      busy = true;
      if (generation !== definition.generation) {
        rebind();
      }
      endStep();
    }

    function addElapsed(state: number, dt: number): void {
      elapsed[state] = (elapsed[state] as number) + dt;
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          addElapsed(list[i] as number, dt);
        }
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE) {
        addElapsed(child, dt);
      }
    }

    function tickRegion(state: number, dt: number): boolean {
      return fireUpdateHooks(state, dt) || fireTimers(state);
    }

    // A parallel state's timers fire only after its regions tick, and only if none moved.
    function fireUpdateHooks(state: number, dt: number): boolean {
      if (parallel[state] === true) {
        const id = entryId[state];
        const list = children[state] as number[];
        let regionMoved = false;
        for (let i = 0; i < list.length; i++) {
          if (tickRegion(list[i] as number, dt)) {
            regionMoved = true;
            if (stopRequested || entryId[state] !== id) {
              return true;
            }
          }
        }
        if (regionMoved) {
          return true;
        }
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE && fireUpdateHooks(child, dt)) {
        return true;
      }
      const hook = (configs[state] as StateConfig<Ctx, E>).update;
      if (hook === undefined) {
        return false;
      }
      const target = hook(ctx, dt, instance);
      if (stopRequested) {
        return true;
      }
      if (typeof target === "string") {
        transition(state, resolveTarget(compiled, state, target), undefined, undefined, "update");
        return true;
      }
      return false;
    }

    function fireTimers(state: number): boolean {
      const child = activeChild[state] as number;
      if (child !== NO_STATE && fireTimers(child)) {
        return true;
      }
      const runAt = nextRuns[state];
      if (runAt !== undefined) {
        const own = ownEvery[state] as number[];
        const runs = everyRuns[state] as RunAction<Ctx, E>[][];
        const clock = elapsed[state] as number;
        for (let i = 0; i < runAt.length; i++) {
          if ((runAt[i] as number) <= clock) {
            // Set before the run and from the clock, not from the last run: a call that covers
            // several delays runs the entry once and leaves no drift.
            runAt[i] = nextRun(clock, own[i] as number);
            const run = runs[i] as RunAction<Ctx, E>[];
            for (let action = 0; action < run.length; action++) {
              (run[action] as RunAction<Ctx, E>)(ctx, instance);
            }
            if (stopRequested) {
              return true;
            }
          }
        }
      }
      const flags = fired[state];
      if (flags === undefined) {
        return false;
      }
      const delays = ownDelays[state] || (afterDelays[state] as number[]);
      const rules = ownRules[state] || (afterRules[state] as Transition<Ctx, E>[]);
      const due = elapsed[state] as number;
      for (let i = 0; i < delays.length && (delays[i] as number) <= due; i++) {
        if (flags[i] !== true) {
          const rule = rules[i] as Transition<Ctx, E>;
          const when = rule.when as ((ctx: Ctx, machine: MachineView) => boolean) | undefined;
          if (when === undefined || when(ctx, instance)) {
            // Set before the move: a `to` naming this state re-enters it, which clears the flags.
            flags[i] = true;
            if (rule.target !== NO_STATE) {
              transition(state, rule.target, rule.run, undefined, "after");
              return true;
            }
            runActions(rule.run, undefined);
            if (stopRequested) {
              return true;
            }
          }
        }
      }
      return false;
    }

    function update(dt: number): void {
      if (!running || busy || stopRequested) {
        return;
      }
      busy = true;
      if (generation !== definition.generation) {
        rebind();
      }
      if (!stopRequested) {
        addElapsed(ROOT, dt);
        moved = false;
        tickRegion(ROOT, dt);
        if (moved) {
          settleAlways();
        }
      }
      endStep();
    }

    function stop(): void {
      if (!running) {
        return;
      }
      if (busy) {
        stopRequested = true;
        return;
      }
      stopNow();
    }

    function matches(path: string): boolean {
      const state = lookupPath(compiled, path);
      return state !== undefined && state !== ROOT && isActive[state] === true;
    }

    function hasTag(tag: string): boolean {
      const carriers = compiled.tagStates[tag];
      if (carriers === undefined) {
        return false;
      }
      for (let i = 0; i < carriers.length; i++) {
        if (isActive[carriers[i] as number] === true) {
          return true;
        }
      }
      return false;
    }

    // The whole list is read before any hook runs, so a hook that changes it changes nothing.
    let chosen: number[] | undefined;
    if (at !== undefined) {
      chosen = startChildren(compiled, at);
    }
    busy = true;
    fillPrivate(ctx as never, configs[ROOT], false);
    enterState(ROOT);
    if (chosen === undefined) {
      enterDefaults(ROOT, 0);
    } else {
      enterAt(ROOT, chosen);
    }
    refreshLeaves();
    settleAlways();
    endStep();
    return instance;
  }

  return { start };
}

function define<Ctx, E extends EventObject>(
  key: string | undefined,
  config: MachineConfig<Ctx, E>,
): Machine<Ctx, E> {
  const compiled = compile(config);
  if (key === undefined) {
    return createMachine({ compiled, generation: 0 });
  }
  const existing = registered[key] as unknown as Registered<Ctx, E> | undefined;
  if (existing !== undefined) {
    const definition = existing.definition;
    definition.compiled = compiled;
    definition.generation = definition.generation + 1;
    return existing.machine;
  }
  const definition: Definition<Ctx, E> = { compiled, generation: 0 };
  const machine = createMachine(definition);
  registered[key] = { definition, machine } as unknown as Registered<unknown, EventObject>;
  return machine;
}

// Ctx for a config without privateCtx, Ctx & Priv for one with it. The tuple test keeps the
// context whole while Priv has no inference yet, so a generic helper in a slot, such as
// `sequence`, still takes its ctx from the slot.
type WithPrivate<Ctx, Priv> = [Priv] extends [never] ? Ctx : Ctx & Priv;

// Ctx and E are given explicitly and the config is inferred, so the config takes a second call.
// A key makes a later definition under it (a hot-reloaded module re-running) rebind live instances.
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
export function defineMachine<Ctx, E extends EventObject, Tag extends string = never>(
  key?: string,
): <T, Priv extends object = never>(
  config: RootState<WithPrivate<Ctx, Priv>, E, T, Tag> & PrivateCtxConfig<Ctx, Priv>,
) => Machine<Ctx, E, TreePath<T>, Tag> {
  return ((config: MachineConfig<Ctx, E>) => define(key, config)) as never;
}

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
export function waitGroup(): WaitGroup {
  let pending = 0;
  let waiting: (() => void)[] = [];
  return {
    add: () => {
      pending++;
      let reported = false;
      return () => {
        if (reported) {
          return;
        }
        reported = true;
        pending--;
        if (pending === 0 && waiting.length > 0) {
          // Taken before the calls: an add or a wait a callback makes belongs to the next round.
          const ready = waiting;
          waiting = [];
          for (const callback of ready) {
            callback();
          }
        }
      };
    },
    wait: (callback) => {
      if (pending === 0) {
        callback();
      } else {
        waiting.push(callback);
      }
    },
  };
}

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
  readonly privateCtx?: (ctx: Ctx) => Priv & { readonly [K in keyof Ctx & keyof Priv]: never };
}

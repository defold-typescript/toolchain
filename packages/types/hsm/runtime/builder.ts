// Copied from packages/hsm/src/builder.ts by `bun run --cwd packages/transpiler declarations`; do not edit.
import {
  type AfterRule,
  type AlwaysConfig,
  defineMachine,
  type EventObject,
  type Machine,
  type MachineSkeleton,
  type MoveAction,
  type PrivateCtxConfig,
  type RunAction,
  type StateHook,
  type TaskStart,
  type TransitionConfig,
  type TreePath,
  type UnhandledHook,
  type UpdateHook,
  type WithPrivate,
} from "./index";

type Delay<Ctx> = number | ((ctx: Readonly<Ctx>) => number);

type EventGuard<
  Ctx,
  E extends EventObject,
  V extends E,
  P extends string,
  Tag extends string,
> = NonNullable<TransitionConfig<Ctx, E, V, P, Tag, P>["when"]>;

type TimerGuard<Ctx, E extends EventObject, P extends string, Tag extends string> = NonNullable<
  AfterRule<Ctx, P, E, Tag, P>["when"]
>;

type AlwaysGuard<Ctx, E extends EventObject, P extends string, Tag extends string> = NonNullable<
  AlwaysConfig<Ctx, P, E, Tag, P>["when"]
>;

/**
 * Adds behavior to a machine whose structure is a skeleton, returned by the second `buildMachine`
 * call. `P` is the union of the skeleton's state paths, and every path a statement takes is one
 * of them.
 * @noSelf
 */
export interface MachineBuilder<
  Ctx,
  E extends EventObject,
  P extends string,
  Tag extends string = never,
  Priv = never,
> {
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
 * Adds behavior to one state. Each `on`, `after`, `every` and `always` call adds one entry, in
 * call order. A state's `on`, `every` and `always` entries are tried in that order, and its
 * `after` timers in delay order, call order breaking ties. `enter`, `exit`, `update`, `task` and
 * `unhandled` each take one function: a second call on the same state throws. Every call throws
 * after `build()`.
 * @noSelf
 */
export interface StateBuilder<Ctx, E extends EventObject, P extends string, Tag extends string> {
  /**
   * Adds a rule for events of type `type`, whose `when` and `run` see that variant. End it with
   * `to`, `run` or `ignore`.
   */
  readonly on: <K extends E["type"]>(
    type: K,
  ) => EventRuleBuilder<Ctx, E, Extract<E, { type: K }>, P, Tag>;
  /**
   * Adds a timer that fires once `delay` seconds of game time have passed in the state: a number,
   * or a function of the context read each time the state is entered. A state's timers are tried
   * in delay order, call order breaking ties. End it with `to` or `run`.
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
export interface EventRuleBuilder<
  Ctx,
  E extends EventObject,
  V extends E,
  P extends string,
  Tag extends string,
> {
  /**
   * Takes the rule only when `guard` returns `true`. It reads `ctx` and `event` and changes
   * neither.
   */
  readonly when: (
    guard: EventGuard<Ctx, E, V, P, Tag>,
  ) => GuardedEventRuleBuilder<Ctx, E, V, P, Tag>;
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
export interface GuardedEventRuleBuilder<
  Ctx,
  E extends EventObject,
  V extends E,
  P extends string,
  Tag extends string,
> {
  /** Ends the rule with the full path of the state to move to. */
  readonly to: (path: P) => EventRunBuilder<Ctx, E, V, P, Tag>;
  /** Ends the rule with functions run in order, with no move: no state exits or enters. */
  readonly run: (...actions: MoveAction<Ctx, E, V, Tag, P>[]) => void;
}

/**
 * An `on` rule after its `to`.
 * @noSelf
 */
export interface EventRunBuilder<
  Ctx,
  E extends EventObject,
  V extends E,
  P extends string,
  Tag extends string,
> {
  /** Adds functions run in order during the move, after the `exit` hooks and before `enter`. */
  readonly run: (...actions: MoveAction<Ctx, E, V, Tag, P>[]) => void;
}

/**
 * The timer an `after` call added, before its ending. `build()` throws on a timer left without
 * `to` or `run`.
 * @noSelf
 */
export interface TimerRuleBuilder<
  Ctx,
  E extends EventObject,
  P extends string,
  Tag extends string,
> {
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
export interface GuardedTimerRuleBuilder<
  Ctx,
  E extends EventObject,
  P extends string,
  Tag extends string,
> {
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
export interface AlwaysRuleBuilder<
  Ctx,
  E extends EventObject,
  P extends string,
  Tag extends string,
> {
  /** Takes the rule only when `guard` returns `true`. It reads `ctx` and changes nothing. */
  readonly when: (guard: AlwaysGuard<Ctx, E, P, Tag>) => GuardedAlwaysRuleBuilder<Ctx, E, P, Tag>;
  /** Ends the rule with the full path of the state to move to. */
  readonly to: (path: P) => RunBuilder<Ctx, E, P, Tag>;
}

/**
 * An `always` rule after its `when`, before its `to`.
 * @noSelf
 */
export interface GuardedAlwaysRuleBuilder<
  Ctx,
  E extends EventObject,
  P extends string,
  Tag extends string,
> {
  /** Ends the rule with the full path of the state to move to. */
  readonly to: (path: P) => RunBuilder<Ctx, E, P, Tag>;
}

// One config entry a statement made: an `on` or `always` rule, an `after` timer or an `every`
// entry, in the shape the list form of its slot takes.
interface Entry {
  to?: string;
  when?: unknown;
  run?: unknown[];
  delay?: unknown;
}

type HookSlot = "enter" | "exit" | "update" | "task" | "unhandled";

// The behavior a state's statements made, written onto its skeleton object by `build()`.
interface Behavior {
  on?: { [type: string]: Entry[] };
  after?: Entry[];
  every?: Entry[];
  always?: Entry[];
  tags?: string[];
  enter?: unknown;
  exit?: unknown;
  update?: unknown;
  task?: unknown;
  unhandled?: unknown;
}

interface SkeletonObject {
  readonly states?: { readonly [name: string]: SkeletonObject };
}

interface StateRecord {
  readonly path: string;
  readonly config: SkeletonObject;
  readonly behavior: Behavior;
  builder: StateBuilder<unknown, EventObject, string, string> | undefined;
}

// An entry that still needs its ending, in call order.
interface Pending {
  readonly path: string;
  readonly missing: string;
  done: boolean;
}

/** @noSelf */
interface Ends {
  readonly to: (path: string) => { readonly run: (...actions: unknown[]) => void };
  readonly run: (...actions: unknown[]) => void;
}

function describePath(path: string): string {
  return path === "" ? "(root)" : path;
}

function newRecord(path: string, config: SkeletonObject): StateRecord {
  return { path, config, behavior: {}, builder: undefined };
}

function indexStates(
  records: { [path: string]: StateRecord },
  config: SkeletonObject,
  path: string,
): void {
  const children = config.states;
  if (children === undefined) {
    return;
  }
  for (const name in children) {
    const child = children[name] as SkeletonObject;
    const childPath = `${path}/${name}`;
    records[childPath] = newRecord(childPath, child);
    indexStates(records, child, childPath);
  }
}

function writeBehavior(record: StateRecord): void {
  const behavior = record.behavior as { readonly [slot: string]: unknown };
  const config = record.config as { [slot: string]: unknown };
  for (const slot in behavior) {
    config[slot] = behavior[slot];
  }
}

function createBuilder(
  key: string | undefined,
  skeleton: SkeletonObject,
): MachineBuilder<unknown, EventObject, string, string> {
  // No prototype, so a path such as `toString` is no record. In Lua the nil field leaves a plain
  // table.
  const records = { __proto__: null } as unknown as { [path: string]: StateRecord };
  indexStates(records, skeleton, "");
  const rootRecord = newRecord("", skeleton);
  const pending: Pending[] = [];
  let built = false;

  const open = (path: string): void => {
    if (built) {
      throw `hsm: state "${describePath(path)}" gets a statement after build()`;
    }
  };

  const track = (path: string, missing: string): Pending => {
    const entry: Pending = { path, missing, done: false };
    pending.push(entry);
    return entry;
  };

  const ends = (path: string, entry: Entry, mark: Pending): Ends => {
    const run = (...actions: unknown[]): void => {
      open(path);
      entry.run = actions;
      mark.done = true;
    };
    const to = (target: string) => {
      open(path);
      entry.to = target;
      mark.done = true;
      return { run };
    };
    return { to, run };
  };

  const stateBuilder = (
    record: StateRecord,
  ): StateBuilder<unknown, EventObject, string, string> => {
    const path = record.path;
    const behavior = record.behavior;

    const hook =
      (slot: HookSlot) =>
      (fn: unknown): void => {
        open(path);
        if (behavior[slot] !== undefined) {
          throw `hsm: state "${describePath(path)}" has a second ${slot}`;
        }
        behavior[slot] = fn;
      };

    const append = (list: Entry[] | undefined, entry: Entry): Entry[] => {
      const entries = list === undefined ? [] : list;
      entries.push(entry);
      return entries;
    };

    return {
      on: (type) => {
        open(path);
        const entry: Entry = {};
        let byType = behavior.on;
        if (byType === undefined) {
          // No prototype, so an event such as `constructor` takes rules. In Lua the nil field
          // leaves a plain table.
          byType = { __proto__: null } as unknown as { [type: string]: Entry[] };
          behavior.on = byType;
        }
        byType[type] = append(byType[type], entry);
        const mark = track(path, `an on("${type}") rule with no to, run or ignore`);
        const { to, run } = ends(path, entry, mark);
        return {
          when: (guard) => {
            open(path);
            entry.when = guard;
            return { to, run };
          },
          to,
          run,
          ignore: () => {
            open(path);
            mark.done = true;
          },
        };
      },
      after: (delay) => {
        open(path);
        const entry: Entry = { delay };
        behavior.after = append(behavior.after, entry);
        const { to, run } = ends(
          path,
          entry,
          track(path, "an after() timer with no to and no run"),
        );
        return {
          when: (guard) => {
            open(path);
            entry.when = guard;
            return { to, run };
          },
          to,
          run,
        };
      },
      every: (delay) => {
        open(path);
        const entry: Entry = { delay };
        behavior.every = append(behavior.every, entry);
        const { run } = ends(path, entry, track(path, "an every() entry with no run"));
        return { run };
      },
      always: () => {
        open(path);
        const entry: Entry = {};
        behavior.always = append(behavior.always, entry);
        const { to } = ends(path, entry, track(path, "an always() rule with no to"));
        return {
          when: (guard) => {
            open(path);
            entry.when = guard;
            return { to };
          },
          to,
        };
      },
      enter: hook("enter"),
      exit: hook("exit"),
      update: hook("update"),
      task: hook("task"),
      unhandled: hook("unhandled"),
      tags: (...names) => {
        open(path);
        const tags = behavior.tags === undefined ? [] : behavior.tags;
        for (const name of names) {
          tags.push(name);
        }
        behavior.tags = tags;
      },
    };
  };

  const builderOf = (record: StateRecord): StateBuilder<unknown, EventObject, string, string> => {
    let builder = record.builder;
    if (builder === undefined) {
      builder = stateBuilder(record);
      record.builder = builder;
    }
    return builder;
  };

  return {
    state: (path) => {
      const record = records[path];
      if (record === undefined) {
        throw `hsm: the machine has no state "${path}"`;
      }
      return builderOf(record);
    },
    root: builderOf(rootRecord),
    build: () => {
      if (built) {
        throw "hsm: build() was already called";
      }
      for (const entry of pending) {
        if (!entry.done) {
          throw `hsm: state "${describePath(entry.path)}" has ${entry.missing}`;
        }
      }
      built = true;
      writeBehavior(rootRecord);
      for (const path in records) {
        writeBehavior(records[path] as StateRecord);
      }
      return defineMachine<unknown, EventObject>(key)(skeleton as never) as never;
    },
  };
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
export function buildMachine<Ctx, E extends EventObject, Tag extends string = never>(
  key?: string,
): <T, Priv extends object = never>(
  skeleton: MachineSkeleton<T> & PrivateCtxConfig<Ctx, Priv>,
) => MachineBuilder<Ctx, E, TreePath<T>, Tag, Priv> {
  return ((skeleton: SkeletonObject) => createBuilder(key, skeleton)) as never;
}

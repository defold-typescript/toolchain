import { type MachineIndex, machineIndex, ruleIds, timerEntries } from "./hsm-view-index";
import { type LoadedInstance, type LoadedMachine, loadProject } from "./view-load";
import type { EngineEntry as LoadedEngineEntry } from "./view-run";
import { type EntityView, type SystemView, trackWorlds } from "./view-worlds";

interface EventObject {
  readonly type: string;
  readonly [key: string]: unknown;
}

type MoveListener = (
  from: string,
  to: string | undefined,
  cause: string,
  event: EventObject | undefined,
  source?: string,
  key?: number,
) => void;

interface RuntimeInstance {
  readonly ctx: unknown;
  readonly path: string | undefined;
  readonly leaves: readonly string[];
  readonly matches: (path: string) => boolean;
  can: (event: EventObject) => boolean;
  readonly send: (event: EventObject) => void;
  readonly update: (dt: number) => void;
  // The runtime passes a listener the moved rule's state and key after the event.
  readonly onMove: (listener: MoveListener) => () => void;
}

interface RuleConfig {
  readonly to?: string;
  readonly when?: (
    ctx: unknown,
    eventOrMachine?: EventObject | RuntimeInstance,
    machine?: RuntimeInstance,
  ) => boolean;
  readonly run?: RuleAction | readonly RuleAction[];
}

type RuleAction = (ctx: unknown, event: EventObject, machine: RuntimeInstance) => void;

interface StateConfig {
  readonly type?: "parallel";
  readonly initial?: string;
  readonly states?: Readonly<Record<string, StateConfig>>;
  readonly on?: Readonly<Record<string, string | RuleConfig | readonly RuleConfig[]>>;
  readonly after?: unknown;
  readonly every?: unknown;
  readonly always?: string | RuleConfig | readonly RuleConfig[];
  readonly enter?: (ctx: unknown, machine: RuntimeInstance) => void;
  readonly exit?: (ctx: unknown, machine: RuntimeInstance) => void;
  readonly update?: (ctx: unknown, dt: number, machine: RuntimeInstance) => string | undefined;
  readonly task?: unknown;
}

export type SnapshotEntry =
  | {
      readonly kind: "transition";
      readonly t: number;
      readonly from: string;
      readonly to: string | undefined;
      readonly cause: string;
      readonly event: unknown;
    }
  | { readonly kind: "event"; readonly t: number; readonly event: unknown }
  | { readonly kind: "unhandled"; readonly t: number; readonly event: unknown }
  | { readonly kind: "engine"; readonly t: number; readonly api: string; readonly args: unknown[] }
  | { readonly kind: "print"; readonly t: number; readonly text: string }
  | {
      readonly kind: "edit";
      readonly t: number;
      readonly path: readonly string[];
      readonly value: unknown;
    }
  | { readonly kind: "reload"; readonly t: number; readonly reason?: string }
  | { readonly kind: "error"; readonly t: number; readonly message: string }
  | {
      readonly kind: "join" | "leave";
      readonly t: number;
      /** The system's 1-based index in the picked world. */
      readonly system: number;
      readonly entity: number;
    };

/** A machine instance the run started, as the Machines tab lists it. */
export interface InstanceView {
  /** Counts from 1 in start order, until a restart. */
  readonly id: number;
  /** `<world> entity <id>` for the first entity that holds the instance in a field, else `instance <id>`. */
  readonly label: string;
  readonly machine: string;
}

export interface Snapshot {
  readonly machines: readonly string[];
  /** The followed instance's machine while one is followed, else the simulated one's. */
  readonly picked: string | undefined;
  readonly instances: readonly InstanceView[];
  /** The id of the instance shown in place of the simulated one. */
  readonly following: number | undefined;
  /** The run is not halted. */
  readonly running: boolean;
  /** Run time: seconds since the run started, which Start leaves alone. */
  readonly t: number;
  readonly frame: number;
  readonly worlds: readonly string[];
  readonly world: string | undefined;
  /** The picked world's systems in index order. */
  readonly systems: readonly SystemView[];
  readonly entities: readonly EntityView[];
  readonly path: string | undefined;
  readonly active: readonly string[];
  readonly leaves: readonly string[];
  readonly entered: readonly string[];
  readonly fired: readonly string[];
  readonly rejected: readonly string[];
  readonly accepts: readonly string[];
  readonly ctx: unknown;
  readonly entries: readonly SnapshotEntry[];
  readonly error?: string;
}

export interface SessionIndex extends MachineIndex {
  readonly files: readonly { readonly path: string; readonly text: string }[];
}

export interface HsmViewSession {
  start(ctx: unknown): Snapshot;
  send(event: EventObject): Snapshot;
  update(dt: number): Snapshot;
  editCtx(path: readonly string[], value: unknown): Snapshot;
  pick(name: string): Snapshot;
  pickWorld(name: string): Snapshot;
  /**
   * Shows the run's instance `id` in place of the simulated one, which waits as it was until
   * `follow(undefined)`; `start` and `pick` return to it too. The world updates a followed
   * instance, and events and ctx edits go to it.
   */
  follow(id: number | undefined): Snapshot;
  /** Reruns the files and the script's `init` in fresh runtimes, from `t` 0. */
  restart(): Snapshot;
  reload(): Snapshot;
  index(): SessionIndex;
  snapshot(): Snapshot;
}

interface Updatable {
  update(dt: number): void;
}

type HaltSource = "machine" | "run";

export interface CreateSessionOptions {
  readonly file: string;
  readonly hsmSourceDir: string;
  readonly ecsSourceDir: string;
}

function childPath(parent: string, name: string): string {
  return `${parent}/${name}`;
}

function ancestors(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((_, index) => `/${parts.slice(0, index + 1).join("/")}`);
}

function stateAt(config: StateConfig, path: string): StateConfig | undefined {
  let state: StateConfig | undefined = config;
  for (const part of path.split("/").filter(Boolean)) {
    state = state?.states?.[part];
  }
  return state;
}

/** `value` as the page shows it: functions dropped, a cycle back to an enclosing value marked. */
export function shownValue(value: unknown, stack = new Set<object>()): unknown {
  if (typeof value === "function") {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (stack.has(value)) {
    return "[circular]";
  }
  stack.add(value);
  if (Array.isArray(value)) {
    const result = value
      .map((item) => shownValue(item, stack))
      .filter((item) => item !== undefined);
    stack.delete(value);
    return result;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const shown = shownValue(item, stack);
    if (shown !== undefined) {
      result[key] = shown;
    }
  }
  stack.delete(value);
  return result;
}

function cloneValue(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing;
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) {
      result.push(cloneValue(item, seen));
    }
    return result;
  }
  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) {
    result[key] = cloneValue(item, seen);
  }
  return result;
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function runOf(run: RuleConfig["run"]): readonly RuleAction[] {
  if (run === undefined) {
    return [];
  }
  return typeof run === "function" ? [run] : run;
}

function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

export function createSession(options: CreateSessionOptions): HsmViewSession {
  // Every instance of a machine runs its instrumented config, so each entry names its instance.
  let entered: { readonly instance: unknown; readonly path: string }[] = [];
  let fired: string[] = [];
  // The rules the followed instance's moves name, since its own guards and timers are not watched.
  let moved: string[] = [];
  let rejected: string[] = [];
  let probing = 0;
  const guarded = new WeakSet<object>();
  let entries: SnapshotEntry[] = [];
  let t = 0;
  let picked: string | undefined;
  let instance: RuntimeInstance | undefined;
  let haltedError: string | undefined;
  let haltedBy: HaltSource | undefined;
  let callError: string | undefined;
  let startCtx: unknown = {};
  let frame = 0;
  let self: Record<string, unknown> = {};
  let pickedWorld: unknown;
  let following: number | undefined;
  let unfollow: (() => void) | undefined;

  const begin = (): void => {
    entered = [];
    fired = [];
    moved = [];
    rejected = [];
    entries = [];
    callError = undefined;
  };

  const recordError = (message: string, halt: HaltSource | undefined): void => {
    callError = message;
    if (halt !== undefined) {
      haltedError = message;
      haltedBy = halt;
    }
    entries.push({ kind: "error", t, message });
  };

  // Called from every `enter`, the root's first: `start` runs the initial `enter` hooks before
  // it returns the instance. The set outlives `instrument`, which a reload runs again while a
  // keyed machine keeps its instance. A guard a `can` call runs can call `can` itself, so
  // `probing` is a depth.
  const guardCan = (machine: RuntimeInstance): void => {
    if (guarded.has(machine)) {
      return;
    }
    guarded.add(machine);
    const can = machine.can;
    machine.can = (event) => {
      probing++;
      try {
        return can(event);
      } finally {
        probing--;
      }
    };
  };

  const instrument = (configValue: unknown): unknown => {
    const config = configValue as StateConfig;
    const ids = ruleIds(config);
    const wrap = (state: StateConfig, path: string): StateConfig => {
      const wrapped: Record<string, unknown> = { ...state };
      if (state.states !== undefined) {
        wrapped.states = Object.fromEntries(
          Object.entries(state.states).map(([name, child]) => [
            name,
            wrap(child, childPath(path, name)),
          ]),
        );
      }
      if (state.on !== undefined) {
        const on: Record<string, unknown> = {};
        for (const [event, spec] of Object.entries(state.on)) {
          const source = Array.isArray(spec) ? spec : [spec];
          const rules = source.map((rule, index) => {
            const id = ids[path]?.on[event]?.[index];
            const note: RuleAction = () => {
              if (id !== undefined) {
                fired.push(id);
              }
            };
            if (typeof rule === "string") {
              return { to: rule, run: [note] };
            }
            const when = rule.when;
            if (when === undefined) {
              return { ...rule, run: [note, ...runOf(rule.run)] };
            }
            return {
              ...rule,
              when: (ctx: unknown, event?: EventObject, machine?: RuntimeInstance) => {
                const accepted = when(ctx, event, machine);
                if (!accepted && id !== undefined && probing === 0) {
                  rejected.push(id);
                }
                return accepted;
              },
              run: [note, ...runOf(rule.run)],
            };
          });
          on[event] = Array.isArray(spec) ? rules : rules[0];
        }
        wrapped.on = on;
      }
      const timers = timerEntries(state.after).map((entry, index) => {
        const id = ids[path]?.after[index];
        const note: RuleAction = () => {
          if (id !== undefined) {
            fired.push(id);
          }
        };
        const spec = entry.spec;
        if (typeof spec === "string") {
          return { key: entry.key, spec: { to: spec, run: [note] } };
        }
        if (typeof spec !== "object" || spec === null) {
          return entry;
        }
        const rule = spec as RuleConfig;
        const run = runOf(rule.run);
        // Left as written so the runtime still rejects a timer with no `to` and no `run`.
        if (rule.to === undefined && run.length === 0) {
          return entry;
        }
        const when = rule.when;
        if (when === undefined) {
          return { key: entry.key, spec: { ...rule, run: [note, ...run] } };
        }
        return {
          key: entry.key,
          spec: {
            ...rule,
            // The runtime calls a timer's `when` only once its delay has passed, so a `false`
            // here is a timer that is due and held back.
            when: (...args: Parameters<typeof when>) => {
              const accepted = when(...args);
              if (!accepted && id !== undefined) {
                rejected.push(id);
              }
              return accepted;
            },
            run: [note, ...run],
          },
        };
      });
      if (timers.length > 0) {
        wrapped.after =
          typeof timers[0]?.key === "number"
            ? timers.map((timer) => timer.spec)
            : Object.fromEntries(timers.map((timer) => [timer.key, timer.spec]));
      }
      const repeats = timerEntries(state.every).map((entry, index) => {
        const id = ids[path]?.every[index];
        const note: RuleAction = () => {
          if (id !== undefined) {
            fired.push(id);
          }
        };
        const spec = entry.spec;
        const listed = typeof entry.key === "number";
        const declared = listed
          ? (spec as { readonly run?: unknown } | null | undefined)?.run
          : spec;
        // Left as written so the runtime still rejects an entry with no `run`.
        if (typeof declared !== "function" && !(Array.isArray(declared) && declared.length > 0)) {
          return entry;
        }
        const run = [note, ...runOf(declared as RuleConfig["run"])];
        return { key: entry.key, spec: listed ? { ...(spec as object), run } : run };
      });
      if (repeats.length > 0) {
        wrapped.every =
          typeof repeats[0]?.key === "number"
            ? repeats.map((repeat) => repeat.spec)
            : Object.fromEntries(repeats.map((repeat) => [repeat.key, repeat.spec]));
      }
      if (state.always !== undefined) {
        const source = Array.isArray(state.always) ? state.always : [state.always];
        const rules = source.map((rule, index) => {
          const id = ids[path]?.always[index];
          if (typeof rule === "string") {
            return {
              to: rule,
              when: () => {
                if (id !== undefined) {
                  fired.push(id);
                }
                return true;
              },
            };
          }
          const when = rule.when;
          return {
            ...rule,
            when: (ctx: unknown, machine?: RuntimeInstance) => {
              const accepted = when === undefined || when(ctx, machine);
              if (accepted && id !== undefined) {
                fired.push(id);
              }
              return accepted;
            },
          };
        });
        wrapped.always = Array.isArray(state.always) ? rules : rules[0];
      }
      const update = state.update;
      if (update !== undefined) {
        wrapped.update = (ctx: unknown, dt: number, machine: RuntimeInstance) => {
          const target = update(ctx, dt, machine);
          const id = ids[path]?.update;
          if (typeof target === "string" && id !== undefined) {
            fired.push(id);
          }
          return target;
        };
      }
      const enter = state.enter;
      wrapped.enter = (ctx: unknown, machine: RuntimeInstance) => {
        guardCan(machine);
        if (path !== "") {
          entered.push({ instance: machine, path });
        }
        enter?.(ctx, machine);
      };
      return wrapped as StateConfig;
    };
    return wrap(config, "");
  };

  const loaded = loadProject(options.file, {
    hsmSourceDir: options.hsmSourceDir,
    ecsSourceDir: options.ecsSourceDir,
    onDefine: (_key, config) => instrument(config),
  });

  loaded.engine.setSink((entry: LoadedEngineEntry) => {
    if (entry.kind === "engine") {
      entries.push({
        kind: "engine",
        t,
        api: entry.api,
        args: entry.args.map((arg) => shownValue(arg)),
      });
    } else {
      entries.push({ kind: "print", t, text: entry.text });
    }
  });

  const tracker = trackWorlds(loaded);

  picked = loaded.machines[0]?.name;

  const pickedMachine = (): LoadedMachine | undefined =>
    loaded.machines.find((machine) => machine.name === picked);

  const followedRecord = (): LoadedInstance | undefined =>
    following === undefined ? undefined : loaded.instances[following - 1];

  const shown = (): RuntimeInstance | undefined =>
    following === undefined
      ? instance
      : (followedRecord()?.instance as RuntimeInstance | undefined);

  // By name, so a followed instance of a machine a reload defined afresh shows the edited source.
  const shownMachine = (): LoadedMachine | undefined => {
    const record = followedRecord();
    if (record === undefined) {
      return pickedMachine();
    }
    return (
      loaded.machines.find((machine) => machine.name === record.machine.name) ?? record.machine
    );
  };

  const currentConfig = (): StateConfig | undefined =>
    shownMachine()?.config as StateConfig | undefined;

  const activePaths = (): string[] => {
    const active = new Set<string>();
    for (const leaf of shown()?.leaves ?? []) {
      for (const path of ancestors(leaf)) {
        active.add(path);
      }
    }
    return [...active];
  };

  const acceptedEvents = (): string[] => {
    const config = currentConfig();
    if (config === undefined || shown() === undefined) {
      return [];
    }
    const accepted = new Set(Object.keys(config.on ?? {}));
    for (const path of activePaths()) {
      for (const event of Object.keys(stateAt(config, path)?.on ?? {})) {
        accepted.add(event);
      }
    }
    return [...accepted].sort();
  };

  const namedWorlds = (): { readonly name: string; readonly world: unknown }[] => {
    const names = tracker.names(self);
    return loaded.worlds.map((world, index) => ({ name: names[index] ?? "", world }));
  };

  const instanceIds = (): Map<unknown, number> =>
    new Map(loaded.instances.map((record, index) => [record.instance, index + 1]));

  const instanceViews = (
    ids: ReadonlyMap<unknown, number>,
    worldNames: readonly string[],
  ): InstanceView[] => {
    const holders = tracker.holders(ids);
    return loaded.instances.map((record, index) => {
      const id = index + 1;
      const holder = holders.get(id);
      return {
        id,
        label:
          holder === undefined
            ? `instance ${id}`
            : `${worldNames[holder.world] ?? ""} entity ${holder.entity}`,
        machine: record.machine.name,
      };
    });
  };

  // The log shows what a world's systems gain and lose from the moment it is picked.
  const watchWorld = (world: unknown): void => {
    pickedWorld = world;
    if (world !== undefined) {
      tracker.membership(world);
    }
  };

  // Logs what the picked world's systems gained and lost since the last action. A world built
  // while none is picked becomes the picked one.
  const settle = (): void => {
    if (pickedWorld === undefined || !loaded.worlds.includes(pickedWorld)) {
      watchWorld(loaded.worlds[0]);
      return;
    }
    for (const change of tracker.membership(pickedWorld)) {
      entries.push({ ...change, t });
    }
  };

  const snapshot = (): Snapshot => {
    const error = callError ?? haltedError;
    const named = namedWorlds();
    const ids = instanceIds();
    const view = pickedWorld === undefined ? undefined : tracker.view(pickedWorld, ids);
    const current = shown();
    return {
      machines: loaded.machines.map((machine) => machine.name),
      picked: shownMachine()?.name ?? picked,
      instances: instanceViews(
        ids,
        named.map((each) => each.name),
      ),
      following,
      running: haltedError === undefined,
      t,
      frame,
      worlds: named.map((each) => each.name),
      world: named.find((each) => each.world === pickedWorld)?.name,
      systems: view?.systems ?? [],
      entities: view?.entities ?? [],
      path: current?.path,
      active: activePaths(),
      leaves: [...(current?.leaves ?? [])],
      entered: entered.filter((each) => each.instance === current).map((each) => each.path),
      fired: following === undefined ? [...fired] : [...moved],
      rejected: following === undefined ? [...rejected] : [],
      accepts: acceptedEvents(),
      ctx: shownValue(current?.ctx),
      entries: [...entries],
      ...(error === undefined ? {} : { error }),
    };
  };

  // The runtime reports `from` as the transition domain's first leaf, which for a target
  // leaving a parallel state is the first region's leaf, so a move does not name the timer
  // behind it. Each timer's own `run` names it instead, and the move is only logged.
  const logMove = (
    from: string,
    to: string | undefined,
    cause: string,
    event: EventObject | undefined,
  ): void => {
    entries.push({
      kind: "transition",
      t,
      from,
      to,
      cause,
      event: shownValue(event),
    });
  };

  const attach = (next: RuntimeInstance): void => {
    next.onMove(logMove);
  };

  // The rule the runtime names for a move: the state that holds it and the rule's key there.
  const movedRule = (
    cause: string,
    event: EventObject | undefined,
    source: string | undefined,
    key: number | undefined,
  ): string | undefined => {
    const config = currentConfig();
    const ids = config === undefined || source === undefined ? undefined : ruleIds(config)[source];
    if (config === undefined || source === undefined || ids === undefined) {
      return undefined;
    }
    switch (cause) {
      case "event":
        return event === undefined || key === undefined ? undefined : ids.on[event.type]?.[key];
      case "always":
        return key === undefined ? undefined : ids.always[key];
      case "update":
        return ids.update;
      case "after": {
        // A list entry's key is its index; a record entry's is its delay, read from the key's text.
        const index = timerEntries(stateAt(config, source)?.after).findIndex((entry) =>
          typeof entry.key === "number" ? entry.key === key : Number(entry.key) === key,
        );
        return index < 0 ? undefined : ids.after[index];
      }
      default:
        return undefined;
    }
  };

  const stopFollowing = (): void => {
    unfollow?.();
    unfollow = undefined;
    following = undefined;
  };

  const followInstance = (id: number): void => {
    following = id;
    const followed = followedRecord()?.instance as RuntimeInstance;
    unfollow = followed.onMove((from, to, cause, event, source, key) => {
      logMove(from, to, cause, event);
      const rule = movedRule(cause, event, source, key);
      if (rule !== undefined) {
        moved.push(rule);
      }
    });
  };

  const startPicked = (ctx: unknown): void => {
    const machine = pickedMachine();
    if (machine === undefined) {
      throw new Error(picked === undefined ? "no machine loaded" : `unknown machine: ${picked}`);
    }
    const next = loaded.startUnrecorded(machine, ctx) as RuntimeInstance;
    instance = next;
    attach(next);
  };

  const requireMachine = (): void => {
    if (picked === undefined) {
      throw new Error(`${options.file} defines no machine`);
    }
  };

  const fatalCall = (body: () => void, source: HaltSource): Snapshot => {
    if (haltedError !== undefined) {
      callError = haltedError;
      return snapshot();
    }
    try {
      body();
    } catch (thrown) {
      recordError(messageOf(thrown), source);
    }
    settle();
    return snapshot();
  };

  // As the engine builds it: `self` holds the script's properties when `init` runs, and what
  // `init` returns is merged onto it.
  const beginRun = (): void => {
    const script = loaded.script;
    const properties = script?.properties;
    self = typeof properties === "object" && properties !== null ? { ...properties } : {};
    const state = script?.init?.(self);
    if (typeof state === "object" && state !== null) {
      Object.assign(self, state);
    }
  };

  beginRun();
  if (loaded.machines.length === 0 && loaded.worlds.length === 0) {
    throw new Error(`${options.file} defines no machine and creates no world`);
  }
  watchWorld(loaded.worlds[0]);

  return {
    start(ctx) {
      requireMachine();
      begin();
      // Start replaces the simulated instance, so it clears only a halt that instance caused.
      if (haltedError !== undefined && haltedBy !== "machine") {
        callError = haltedError;
        return snapshot();
      }
      haltedError = undefined;
      haltedBy = undefined;
      instance = undefined;
      stopFollowing();
      startCtx = cloneValue(ctx);
      try {
        startPicked(ctx);
      } catch (thrown) {
        recordError(messageOf(thrown), "machine");
      }
      settle();
      return snapshot();
    },
    send(event) {
      requireMachine();
      begin();
      // A followed instance lives in the run's world, so its failure is the run's: Start, which
      // replaces only the simulated instance, cannot clear it.
      const source: HaltSource = following === undefined ? "machine" : "run";
      return fatalCall(() => {
        const current = shown();
        if (current === undefined) {
          throw new Error("machine has not started");
        }
        const before = fired.length;
        entries.push({ kind: "event", t, event: shownValue(event) });
        current.send(event);
        if (fired.length === before) {
          entries.push({ kind: "unhandled", t, event: shownValue(event) });
        }
      }, source);
    },
    update(dt) {
      begin();
      if (haltedError !== undefined) {
        callError = haltedError;
        return snapshot();
      }
      const script = loaded.script;
      if (script === undefined && loaded.worlds.length === 0 && instance === undefined) {
        recordError("machine has not started", undefined);
        return snapshot();
      }
      t += dt;
      frame += 1;
      let failure: { readonly thrown: unknown; readonly source: HaltSource } | undefined;
      // The machine's update runs inside the frame too, so a world it advances is timed.
      tracker.frame(() => {
        try {
          if (script !== undefined) {
            script.update?.(self, dt);
          } else {
            for (const world of [...loaded.worlds]) {
              (world as Updatable).update(dt);
            }
          }
        } catch (thrown) {
          failure = { thrown, source: "run" };
          return;
        }
        // A followed instance is the world's to update; the simulated one waits as it was.
        try {
          if (following === undefined) {
            instance?.update(dt);
          }
        } catch (thrown) {
          failure = { thrown, source: "machine" };
        }
      });
      if (failure !== undefined) {
        recordError(messageOf(failure.thrown), failure.source);
      }
      settle();
      return snapshot();
    },
    editCtx(path, value) {
      begin();
      if (haltedError !== undefined) {
        callError = haltedError;
        return snapshot();
      }
      const ctx = shown()?.ctx;
      let parent = ctx;
      for (let index = 0; index < path.length - 1; index++) {
        const key = path[index] as string;
        if (typeof parent !== "object" || parent === null || !Object.hasOwn(parent, key)) {
          recordError(`ctx path does not exist: ${path.join(".")}`, undefined);
          return snapshot();
        }
        parent = (parent as Record<string, unknown>)[key];
      }
      const key = path[path.length - 1];
      if (
        key === undefined ||
        typeof parent !== "object" ||
        parent === null ||
        !Object.hasOwn(parent, key)
      ) {
        recordError(`ctx path does not exist: ${path.join(".")}`, undefined);
        return snapshot();
      }
      const current = (parent as Record<string, unknown>)[key];
      if (!isPrimitive(current)) {
        recordError(`ctx path is not a primitive: ${path.join(".")}`, undefined);
        return snapshot();
      }
      if (!isPrimitive(value) || value === undefined) {
        recordError("ctx edits require a primitive value", undefined);
        return snapshot();
      }
      (parent as Record<string, unknown>)[key] = value;
      entries.push({ kind: "edit", t, path: [...path], value: shownValue(value) });
      return snapshot();
    },
    pick(name) {
      requireMachine();
      begin();
      return fatalCall(() => {
        if (!loaded.machines.some((machine) => machine.name === name)) {
          throw new Error(`unknown machine: ${name}`);
        }
        picked = name;
        instance = undefined;
        stopFollowing();
        startPicked(cloneValue(startCtx));
      }, "machine");
    },
    pickWorld(name) {
      const named = namedWorlds();
      const found = named.find((each) => each.name === name);
      if (found === undefined) {
        const known =
          named.length === 0
            ? "the file creates no world"
            : `worlds: ${named.map((each) => each.name).join(", ")}`;
        throw new Error(`unknown world: ${name}; ${known}`);
      }
      begin();
      watchWorld(found.world);
      return snapshot();
    },
    follow(id) {
      if (id !== undefined && (!Number.isInteger(id) || id < 1 || id > loaded.instances.length)) {
        const views = instanceViews(
          instanceIds(),
          namedWorlds().map((each) => each.name),
        );
        const known =
          views.length === 0
            ? "the run started no machine"
            : `instances: ${views.map((view) => `#${view.id} ${view.label}`).join(", ")}`;
        throw new Error(`unknown instance: ${id}; ${known}`);
      }
      begin();
      stopFollowing();
      if (id !== undefined) {
        followInstance(id);
      }
      return snapshot();
    },
    restart() {
      begin();
      const previous = namedWorlds().find((each) => each.world === pickedWorld)?.name;
      try {
        loaded.restart();
      } catch (thrown) {
        recordError(messageOf(thrown), undefined);
        return snapshot();
      }
      t = 0;
      frame = 0;
      tracker.reset();
      instance = undefined;
      stopFollowing();
      haltedError = undefined;
      haltedBy = undefined;
      if (!loaded.machines.some((machine) => machine.name === picked)) {
        picked = loaded.machines[0]?.name;
      }
      pickedWorld = undefined;
      try {
        beginRun();
      } catch (thrown) {
        recordError(messageOf(thrown), "run");
      }
      const named = namedWorlds();
      watchWorld((named.find((each) => each.name === previous) ?? named[0])?.world);
      return snapshot();
    },
    reload() {
      begin();
      const before = pickedMachine();
      try {
        loaded.reload();
      } catch (thrown) {
        recordError(messageOf(thrown), undefined);
        return snapshot();
      }
      if (!loaded.machines.some((machine) => machine.name === picked)) {
        picked = loaded.machines[0]?.name;
      }
      if (haltedError !== undefined) {
        entries.push({ kind: "reload", t });
        return snapshot();
      }
      const current = pickedMachine();
      try {
        if (instance !== undefined && current === undefined) {
          instance = undefined;
          entries.push({ kind: "reload", t });
        } else if (
          instance !== undefined &&
          (before?.key === undefined || current?.key === undefined)
        ) {
          instance = undefined;
          entries.push({ kind: "reload", t, reason: "unkeyed machine restarted" });
          startPicked(cloneValue(startCtx));
        } else {
          entries.push({ kind: "reload", t });
        }
      } catch (thrown) {
        recordError(messageOf(thrown), "machine");
      }
      const onReload = loaded.script?.on_reload;
      if (haltedError === undefined && typeof onReload === "function") {
        try {
          onReload.call(loaded.script, self);
        } catch (thrown) {
          recordError(messageOf(thrown), "run");
        }
      }
      settle();
      return snapshot();
    },
    index() {
      const machine = shownMachine();
      const index = machineIndex(machine?.config, loaded.files);
      return { files: loaded.files, ...index };
    },
    snapshot,
  };
}

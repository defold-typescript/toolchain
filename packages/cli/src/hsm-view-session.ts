import { type MachineIndex, machineIndex, ruleIds, timerEntries } from "./hsm-view-index";
import {
  type EngineEntry as LoadedEngineEntry,
  type LoadedMachine,
  loadMachines,
} from "./hsm-view-load";

interface EventObject {
  readonly type: string;
  readonly [key: string]: unknown;
}

interface RuntimeInstance {
  readonly ctx: unknown;
  readonly path: string | undefined;
  readonly leaves: readonly string[];
  readonly matches: (path: string) => boolean;
  readonly send: (event: EventObject) => void;
  readonly update: (dt: number) => void;
  readonly onMove: (
    listener: (
      from: string,
      to: string | undefined,
      cause: string,
      event: EventObject | undefined,
    ) => void,
  ) => () => void;
}

interface RuntimeMachine {
  readonly start: (ctx: unknown) => RuntimeInstance;
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
  | { readonly kind: "error"; readonly t: number; readonly message: string };

export interface Snapshot {
  readonly machines: readonly string[];
  readonly picked: string | undefined;
  readonly running: boolean;
  readonly t: number;
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
  reload(): Snapshot;
  index(): SessionIndex;
  snapshot(): Snapshot;
}

export interface CreateSessionOptions {
  readonly file: string;
  readonly hsmSourceDir: string;
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

function shownValue(value: unknown, stack = new Set<object>()): unknown {
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
  let entered: string[] = [];
  let fired: string[] = [];
  let rejected: string[] = [];
  let entries: SnapshotEntry[] = [];
  let t = 0;
  let picked: string | undefined;
  let instance: RuntimeInstance | undefined;
  let haltedError: string | undefined;
  let callError: string | undefined;
  let startCtx: unknown = {};

  const begin = (): void => {
    entered = [];
    fired = [];
    rejected = [];
    entries = [];
    callError = undefined;
  };

  const recordError = (message: string, halt: boolean): void => {
    callError = message;
    if (halt) {
      haltedError = message;
    }
    entries.push({ kind: "error", t, message });
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
                if (!accepted && id !== undefined) {
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
      if (path !== "") {
        wrapped.enter = (ctx: unknown, machine: RuntimeInstance) => {
          entered.push(path);
          enter?.(ctx, machine);
        };
      }
      return wrapped as StateConfig;
    };
    return wrap(config, "");
  };

  const loaded = loadMachines(options.file, {
    hsmSourceDir: options.hsmSourceDir,
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

  picked = loaded.machines[0]?.name;

  const pickedMachine = (): LoadedMachine | undefined =>
    loaded.machines.find((machine) => machine.name === picked);

  const currentConfig = (): StateConfig | undefined =>
    pickedMachine()?.config as StateConfig | undefined;

  const activePaths = (): string[] => {
    const active = new Set<string>();
    for (const leaf of instance?.leaves ?? []) {
      for (const path of ancestors(leaf)) {
        active.add(path);
      }
    }
    return [...active];
  };

  const acceptedEvents = (): string[] => {
    const config = currentConfig();
    if (config === undefined || instance === undefined) {
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

  const snapshot = (): Snapshot => {
    const error = callError ?? haltedError;
    return {
      machines: loaded.machines.map((machine) => machine.name),
      picked,
      running: instance !== undefined && instance.path !== undefined && haltedError === undefined,
      t,
      path: instance?.path,
      active: activePaths(),
      leaves: [...(instance?.leaves ?? [])],
      entered: [...entered],
      fired: [...fired],
      rejected: [...rejected],
      accepts: acceptedEvents(),
      ctx: shownValue(instance?.ctx),
      entries: [...entries],
      ...(error === undefined ? {} : { error }),
    };
  };

  // The runtime reports `from` as the transition domain's first leaf, which for a target
  // leaving a parallel state is the first region's leaf, so a move does not name the timer
  // behind it. Each timer's own `run` names it instead, and the move is only logged.
  const attach = (next: RuntimeInstance): void => {
    next.onMove((from, to, cause, event) => {
      entries.push({
        kind: "transition",
        t,
        from,
        to,
        cause,
        event: shownValue(event),
      });
    });
  };

  const startPicked = (ctx: unknown): void => {
    const machine = pickedMachine();
    if (machine === undefined) {
      throw new Error(picked === undefined ? "no machine loaded" : `unknown machine: ${picked}`);
    }
    const next = (machine.machine as RuntimeMachine).start(ctx);
    instance = next;
    attach(next);
  };

  const fatalCall = (body: () => void): Snapshot => {
    if (haltedError !== undefined) {
      callError = haltedError;
      return snapshot();
    }
    try {
      body();
    } catch (thrown) {
      recordError(messageOf(thrown), true);
    }
    return snapshot();
  };

  return {
    start(ctx) {
      begin();
      haltedError = undefined;
      t = 0;
      instance = undefined;
      startCtx = cloneValue(ctx);
      try {
        startPicked(ctx);
      } catch (thrown) {
        recordError(messageOf(thrown), true);
      }
      return snapshot();
    },
    send(event) {
      begin();
      return fatalCall(() => {
        const current = instance;
        if (current === undefined) {
          throw new Error("machine has not started");
        }
        const before = fired.length;
        entries.push({ kind: "event", t, event: shownValue(event) });
        current.send(event);
        if (fired.length === before) {
          entries.push({ kind: "unhandled", t, event: shownValue(event) });
        }
      });
    },
    update(dt) {
      begin();
      return fatalCall(() => {
        const current = instance;
        if (current === undefined) {
          throw new Error("machine has not started");
        }
        t += dt;
        current.update(dt);
      });
    },
    editCtx(path, value) {
      begin();
      if (haltedError !== undefined) {
        callError = haltedError;
        return snapshot();
      }
      const ctx = instance?.ctx;
      let parent = ctx;
      for (let index = 0; index < path.length - 1; index++) {
        const key = path[index] as string;
        if (typeof parent !== "object" || parent === null || !Object.hasOwn(parent, key)) {
          recordError(`ctx path does not exist: ${path.join(".")}`, false);
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
        recordError(`ctx path does not exist: ${path.join(".")}`, false);
        return snapshot();
      }
      const current = (parent as Record<string, unknown>)[key];
      if (!isPrimitive(current)) {
        recordError(`ctx path is not a primitive: ${path.join(".")}`, false);
        return snapshot();
      }
      if (!isPrimitive(value) || value === undefined) {
        recordError("ctx edits require a primitive value", false);
        return snapshot();
      }
      (parent as Record<string, unknown>)[key] = value;
      entries.push({ kind: "edit", t, path: [...path], value: shownValue(value) });
      return snapshot();
    },
    pick(name) {
      begin();
      return fatalCall(() => {
        if (!loaded.machines.some((machine) => machine.name === name)) {
          throw new Error(`unknown machine: ${name}`);
        }
        picked = name;
        instance = undefined;
        startPicked(cloneValue(startCtx));
      });
    },
    reload() {
      begin();
      const before = pickedMachine();
      try {
        loaded.reload();
        if (!loaded.machines.some((machine) => machine.name === picked)) {
          picked = loaded.machines[0]?.name;
        }
        const current = pickedMachine();
        if (current === undefined) {
          throw new Error("reload found no machine");
        }
        if (haltedError !== undefined) {
          entries.push({ kind: "reload", t });
        } else if (before?.key === undefined || current.key === undefined) {
          instance = undefined;
          entries.push({ kind: "reload", t, reason: "unkeyed machine restarted" });
          startPicked(cloneValue(startCtx));
        } else {
          entries.push({ kind: "reload", t });
        }
      } catch (thrown) {
        recordError(messageOf(thrown), false);
      }
      return snapshot();
    },
    index() {
      const machine = pickedMachine();
      const index = machineIndex(machine?.config, loaded.files);
      return { files: loaded.files, ...index };
    },
    snapshot,
  };
}

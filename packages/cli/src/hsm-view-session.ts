import { type MachineIndex, machineIndex, ruleIds } from "./hsm-view-index";
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
  readonly when?: (ctx: unknown, event?: EventObject) => boolean;
  readonly run?: RuleAction | readonly RuleAction[];
}

type RuleAction = (ctx: unknown, event: EventObject, machine: RuntimeInstance) => void;

interface StateConfig {
  readonly type?: "parallel";
  readonly initial?: string;
  readonly states?: Readonly<Record<string, StateConfig>>;
  readonly on?: Readonly<Record<string, string | RuleConfig | readonly RuleConfig[]>>;
  readonly after?: Readonly<Record<string, string>>;
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
  let entries: SnapshotEntry[] = [];
  let t = 0;
  let picked: string | undefined;
  let instance: RuntimeInstance | undefined;
  let haltedError: string | undefined;
  let callError: string | undefined;
  let startCtx: unknown = {};
  let tickOrder: string[] = [];
  let exiting: string[] = [];
  const dueAfter = new Map<string, string>();
  const exitedEarlier = new Set<string>();
  const passedOver = new Set<string>();
  const elapsed = new Map<string, number>();
  const afterProgress = new Map<string, number>();

  const begin = (): void => {
    entered = [];
    fired = [];
    entries = [];
    callError = undefined;
    tickOrder = [];
    exiting = [];
    dueAfter.clear();
    exitedEarlier.clear();
    passedOver.clear();
  };

  const passOver = (path: string): void => {
    passedOver.add(path);
    for (const ancestor of ancestors(path)) {
      passedOver.add(ancestor);
    }
    passedOver.add("");
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
            return { ...rule, run: [note, ...runOf(rule.run)] };
          });
          on[event] = Array.isArray(spec) ? rules : rules[0];
        }
        wrapped.on = on;
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
            when: (ctx: unknown) => {
              const accepted = when === undefined || when(ctx);
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
          if (typeof target === "string") {
            if (id !== undefined) {
              fired.push(id);
            }
            passOver(path);
          }
          return target;
        };
      }
      const enter = state.enter;
      if (path !== "") {
        wrapped.enter = (ctx: unknown, machine: RuntimeInstance) => {
          entered.push(path);
          elapsed.set(path, 0);
          afterProgress.set(path, 0);
          enter?.(ctx, machine);
        };
        const exit = state.exit;
        wrapped.exit = (ctx: unknown, machine: RuntimeInstance) => {
          exiting.push(path);
          exit?.(ctx, machine);
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
      accepts: acceptedEvents(),
      ctx: shownValue(instance?.ctx),
      entries: [...entries],
      ...(error === undefined ? {} : { error }),
    };
  };

  // The runtime reports `from` as the transition domain's first leaf, which for a target
  // leaving a parallel state is the first region's leaf, so fall back to the tick order.
  // A mover's ancestor chain is skipped because the runtime's walk returns before reaching
  // those timers.
  const afterRuleFor = (
    from: string,
  ): { readonly path: string; readonly id: string } | undefined => {
    const due = (path: string): boolean =>
      dueAfter.has(path) && !exitedEarlier.has(path) && !passedOver.has(path);
    const path = [...ancestors(from).reverse(), ""].find(due) ?? tickOrder.find(due);
    const id = path === undefined ? undefined : dueAfter.get(path);
    return path === undefined || id === undefined ? undefined : { path, id };
  };

  const attach = (next: RuntimeInstance): void => {
    next.onMove((from, to, cause, event) => {
      const rule = cause === "after" ? afterRuleFor(from) : undefined;
      if (rule !== undefined) {
        fired.push(rule.id);
        dueAfter.delete(rule.path);
        passOver(rule.path);
        if (!exiting.includes(rule.path)) {
          afterProgress.set(rule.path, (afterProgress.get(rule.path) ?? 0) + 1);
        }
      }
      for (const path of exiting) {
        exitedEarlier.add(path);
      }
      exiting = [];
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

  const tickAfter = (dt: number): void => {
    const config = currentConfig();
    if (config === undefined || instance === undefined) {
      return;
    }
    const order: string[] = [];
    const visit = (state: StateConfig, path: string): void => {
      const activeChildren = Object.entries(state.states ?? {}).filter(([name]) =>
        instance?.matches(childPath(path, name)),
      );
      if (state.type === "parallel") {
        for (const [name, child] of activeChildren) {
          visit(child, childPath(path, name));
        }
      } else {
        const active = activeChildren[0];
        if (active !== undefined) {
          visit(active[1], childPath(path, active[0]));
        }
      }
      order.push(path);
    };
    visit(config, "");
    for (const path of order) {
      elapsed.set(path, (elapsed.get(path) ?? 0) + dt);
    }
    const ids = ruleIds(config);
    for (const path of order) {
      const state = stateAt(config, path);
      const delays = Object.keys(state?.after ?? {}).sort((a, b) => Number(a) - Number(b));
      const index = afterProgress.get(path) ?? 0;
      const delay = delays[index];
      const id = delay === undefined ? undefined : ids[path]?.after[delay]?.[0];
      if (id !== undefined && Number(delay) <= (elapsed.get(path) ?? 0)) {
        dueAfter.set(path, id);
      }
    }
    tickOrder = order;
  };

  return {
    start(ctx) {
      begin();
      haltedError = undefined;
      t = 0;
      instance = undefined;
      elapsed.clear();
      afterProgress.clear();
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
        tickAfter(dt);
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
        elapsed.clear();
        afterProgress.clear();
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
          elapsed.clear();
          afterProgress.clear();
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

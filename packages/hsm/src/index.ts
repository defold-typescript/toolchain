export interface EventObject {
  readonly type: string;
}

export type TransitionCause = "event" | "after" | "update" | "stop" | "reload";

/** @noSelf */
export type TransitionListener<E extends EventObject, P extends string = string> = (
  from: P,
  to: P | undefined,
  cause: TransitionCause,
  event: E | undefined,
) => void;

/** @noSelf */
export interface MachineInstance<Ctx, E extends EventObject, P extends string = string> {
  readonly ctx: Ctx;
  readonly path: P | undefined;
  readonly matches: (path: P) => boolean;
  readonly send: (event: E) => void;
  readonly update: (dt: number) => void;
  readonly stop: () => void;
  readonly onTransition: (listener: TransitionListener<E, P>) => void;
}

export type TransitionAction<Ctx, E extends EventObject, V extends E = E> = (
  ctx: Ctx,
  event: V,
  m: MachineInstance<Ctx, E>,
) => void;

/** @noSelf */
export interface TransitionConfig<Ctx, E extends EventObject, V extends E = E> {
  readonly target?: string;
  readonly guard?: (ctx: Ctx, event: V) => boolean;
  readonly actions?: TransitionAction<Ctx, E, V> | readonly TransitionAction<Ctx, E, V>[];
  readonly reenter?: boolean;
}

export type TransitionSpec<Ctx, E extends EventObject, V extends E = E> =
  | string
  | TransitionConfig<Ctx, E, V>
  // Lua cannot tell [] from {}, so an empty list would compile to a targetless transition.
  | readonly [TransitionConfig<Ctx, E, V>, ...TransitionConfig<Ctx, E, V>[]];

export type OnConfig<Ctx, E extends EventObject> = {
  readonly [K in E["type"]]?: TransitionSpec<Ctx, E, Extract<E, { type: K }>>;
};

export type StateHook<Ctx, E extends EventObject> = (ctx: Ctx, m: MachineInstance<Ctx, E>) => void;

export type UpdateHook<Ctx, E extends EventObject> = (
  ctx: Ctx,
  dt: number,
  m: MachineInstance<Ctx, E>,
) => string | undefined;

/** @noSelf */
export type InvokeStart<Ctx, E extends EventObject> = (
  ctx: Ctx,
  settle: (event: E) => void,
  m: MachineInstance<Ctx, E>,
) => void;

/** @noSelf */
export interface StateConfig<Ctx, E extends EventObject> {
  readonly initial?: string;
  readonly states?: { readonly [name: string]: StateConfig<Ctx, E> };
  readonly on?: OnConfig<Ctx, E>;
  readonly after?: { readonly [seconds: number]: string };
  readonly enter?: StateHook<Ctx, E>;
  readonly exit?: StateHook<Ctx, E>;
  readonly update?: UpdateHook<Ctx, E>;
  readonly invoke?: InvokeStart<Ctx, E>;
}

export interface MachineConfig<Ctx, E extends EventObject> extends StateConfig<Ctx, E> {
  readonly initial: string;
  readonly states: { readonly [name: string]: StateConfig<Ctx, E> };
}

/** @noSelf */
export interface Machine<Ctx, E extends EventObject, P extends string = string> {
  readonly start: (ctx: Ctx) => MachineInstance<Ctx, E, P>;
}

type PathDepth = [never, 0, 1, 2, 3];

type PathsBelow<S, D extends number> = S extends { readonly states: infer Children }
  ? {
      [K in keyof Children & string]:
        | K
        | `${K}/${D extends 1
            ? Children[K] extends { readonly states: object }
              ? string
              : never
            : PathsBelow<Children[K], PathDepth[D]>}`;
    }[keyof Children & string]
  : never;

export type StatePath<C> = `/${PathsBelow<C, 4>}`;

interface TransitionCheck<T> {
  readonly target?: T;
  readonly guard?: unknown;
  readonly actions?: unknown;
  readonly reenter?: unknown;
}

type SpecCheck<T> = T | TransitionCheck<T> | readonly TransitionCheck<T>[];

// Hooks are listed as unknown so a hooks-only leaf still shares a property with this
// all-optional type; without them TypeScript rejects it as a weak-type mismatch.
type PathCheck<S, Self extends string, All extends string, Ev extends string> = {
  readonly initial?: S extends { readonly states: infer Children }
    ? `${Self}/${keyof Children & string}`
    : never;
  readonly states?: S extends { readonly states: infer Children }
    ? {
        readonly [K in keyof Children]: PathCheck<Children[K], `${Self}/${K & string}`, All, Ev>;
      }
    : unknown;
  readonly on?: S extends { readonly on: infer On }
    ? { readonly [K in keyof On]: K extends Ev ? SpecCheck<All> : never }
    : unknown;
  readonly after?: S extends { readonly after: infer After }
    ? { readonly [K in keyof After]: All }
    : unknown;
  readonly enter?: unknown;
  readonly exit?: unknown;
  readonly update?: unknown;
  readonly invoke?: unknown;
};

export interface MachineConfigError {
  readonly "hsm: an initial or target names an unknown state path, or an on key an unknown event": never;
}

export type DefinedMachine<Ctx, E extends EventObject, C> =
  C extends PathCheck<C, "", StatePath<C>, E["type"]>
    ? Machine<Ctx, E, StatePath<C>>
    : MachineConfigError;

type Guard<Ctx, E extends EventObject> = (ctx: Ctx, event: E) => boolean;

interface Transition<Ctx, E extends EventObject> {
  readonly target: number;
  readonly guard: Guard<Ctx, E> | undefined;
  readonly actions: readonly TransitionAction<Ctx, E>[];
  readonly reenter: boolean;
}

interface Compiled<Ctx, E extends EventObject> {
  count: number;
  maxDepth: number;
  readonly configs: StateConfig<Ctx, E>[];
  readonly paths: string[];
  readonly parent: number[];
  readonly depth: number[];
  readonly initialChild: number[];
  readonly onIndex: { [type: string]: number }[];
  readonly transitions: Transition<Ctx, E>[][];
  readonly afterDelays: number[][];
  readonly afterTargets: number[][];
  readonly pathIndex: { [path: string]: number };
}

const ROOT = 0;
const NO_STATE = -1;

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

function registerState<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  config: StateConfig<Ctx, E>,
  parentIndex: number,
  path: string,
): void {
  const index = compiled.count;
  compiled.count = index + 1;
  const depth = parentIndex === NO_STATE ? 0 : (compiled.depth[parentIndex] as number) + 1;
  if (depth > compiled.maxDepth) {
    compiled.maxDepth = depth;
  }
  compiled.configs[index] = config;
  compiled.paths[index] = path;
  compiled.parent[index] = parentIndex;
  compiled.depth[index] = depth;
  compiled.initialChild[index] = NO_STATE;
  compiled.pathIndex[path] = index;
  const children = config.states;
  if (children === undefined) {
    return;
  }
  for (const name in children) {
    if (name === "" || name.indexOf("/") !== -1) {
      throw `hsm: state "${describePath(path)}" has a child named "${name}"; state names must be non-empty and contain no "/"`;
    }
    registerState(compiled, children[name] as StateConfig<Ctx, E>, index, `${path}/${name}`);
  }
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
  if (!hasChildren(config)) {
    if (initial !== undefined) {
      throw `hsm: state "${describePath(path)}" has initial "${initial}" but no child states`;
    }
    return;
  }
  if (initial === undefined) {
    throw `hsm: compound state "${describePath(path)}" has no initial`;
  }
  const child = lookupPath(compiled, initial);
  if (child === undefined || compiled.parent[child] !== index) {
    throw `hsm: state "${describePath(path)}" has initial "${initial}", which is not one of its children`;
  }
  compiled.initialChild[index] = child;
}

function compileTransition<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  source: number,
  spec: string | TransitionConfig<Ctx, E>,
): Transition<Ctx, E> {
  if (typeof spec === "string") {
    return {
      target: resolveTarget(compiled, source, spec),
      guard: undefined,
      actions: [],
      reenter: false,
    };
  }
  const actions: TransitionAction<Ctx, E>[] = [];
  const declared = spec.actions;
  if (typeof declared === "function") {
    actions.push(declared);
  } else if (declared !== undefined) {
    for (let i = 0; i < declared.length; i++) {
      actions.push(declared[i] as TransitionAction<Ctx, E>);
    }
  }
  return {
    target: spec.target === undefined ? NO_STATE : resolveTarget(compiled, source, spec.target),
    guard: spec.guard,
    actions,
    reenter: spec.reenter === true,
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

function compileAfter<Ctx, E extends EventObject>(compiled: Compiled<Ctx, E>, index: number): void {
  const delays: number[] = [];
  const targets: number[] = [];
  compiled.afterDelays[index] = delays;
  compiled.afterTargets[index] = targets;
  const after = (compiled.configs[index] as StateConfig<Ctx, E>).after;
  if (after === undefined) {
    return;
  }
  const path = compiled.paths[index] as string;
  for (const key in after) {
    const delay = parseDelay(key);
    if (!(delay >= 0)) {
      throw `hsm: state "${describePath(path)}" has an after delay "${key}" that is not a non-negative number`;
    }
    const target = resolveTarget(compiled, index, after[key as unknown as number] as string);
    let slot = delays.length;
    while (slot > 0 && (delays[slot - 1] as number) > delay) {
      delays[slot] = delays[slot - 1] as number;
      targets[slot] = targets[slot - 1] as number;
      slot--;
    }
    delays[slot] = delay;
    targets[slot] = target;
  }
}

function compile<Ctx, E extends EventObject>(config: MachineConfig<Ctx, E>): Compiled<Ctx, E> {
  const compiled: Compiled<Ctx, E> = {
    count: 0,
    maxDepth: 0,
    configs: [],
    paths: [],
    parent: [],
    depth: [],
    initialChild: [],
    onIndex: [],
    transitions: [],
    afterDelays: [],
    afterTargets: [],
    pathIndex: {},
  };
  registerState(compiled, config, NO_STATE, "");
  for (let index = 0; index < compiled.count; index++) {
    compileInitial(compiled, index);
    compileOn(compiled, index);
    compileAfter(compiled, index);
  }
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
  reenter: boolean,
): number {
  if (source === ROOT || (!reenter && isAncestorOrSelf(compiled, source, target))) {
    return source;
  }
  let domain = compiled.parent[source] as number;
  while (domain !== ROOT && (domain === target || !isAncestorOrSelf(compiled, domain, target))) {
    domain = compiled.parent[domain] as number;
  }
  return domain;
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

function createMachine<Ctx, E extends EventObject>(
  definition: Definition<Ctx, E>,
): Machine<Ctx, E> {
  function start(ctx: Ctx): MachineInstance<Ctx, E> {
    let compiled = definition.compiled;
    let generation = definition.generation;
    let paths = compiled.paths;
    let parent = compiled.parent;
    let depth = compiled.depth;
    let initialChild = compiled.initialChild;
    let configs = compiled.configs;
    let onIndex = compiled.onIndex;
    let transitions = compiled.transitions;
    let afterDelays = compiled.afterDelays;
    let afterTargets = compiled.afterTargets;
    const active: number[] = [];
    const elapsed: number[] = [];
    const fired: number[] = [];
    const scratch: number[] = [];
    const entryId: number[] = [];
    growSlots();
    let entryCount = 0;
    const queue: (E | undefined)[] = [];
    let queueHead = 0;
    let queueTail = 0;
    let leafDepth = NO_STATE;
    let running = true;
    let busy = false;
    let stopRequested = false;
    const listeners: TransitionListener<E>[] = [];

    const instance = {
      ctx,
      path: undefined as string | undefined,
      matches,
      send,
      update,
      stop,
      onTransition,
    };

    function growSlots(): void {
      for (let i = active.length; i <= compiled.maxDepth; i++) {
        active[i] = NO_STATE;
        elapsed[i] = 0;
        fired[i] = 0;
        scratch[i] = NO_STATE;
        entryId[i] = 0;
      }
    }

    // Kept states hold their slot, timers and entry id; the first missing path and
    // everything below it is dropped without exit hooks, since its config is gone.
    function rebind(): void {
      const from = instance.path as string;
      const oldPaths = paths;
      const oldLeafDepth = leafDepth;
      compiled = definition.compiled;
      generation = definition.generation;
      paths = compiled.paths;
      parent = compiled.parent;
      depth = compiled.depth;
      initialChild = compiled.initialChild;
      configs = compiled.configs;
      onIndex = compiled.onIndex;
      transitions = compiled.transitions;
      afterDelays = compiled.afterDelays;
      afterTargets = compiled.afterTargets;
      growSlots();
      let survivor = 0;
      active[0] = ROOT;
      for (let level = 1; level <= oldLeafDepth; level++) {
        const state = lookupPath(compiled, oldPaths[active[level] as number] as string);
        if (state === undefined) {
          break;
        }
        active[level] = state;
        survivor = level;
      }
      for (let level = survivor + 1; level <= oldLeafDepth; level++) {
        active[level] = NO_STATE;
        elapsed[level] = 0;
        fired[level] = 0;
        entryId[level] = 0;
      }
      leafDepth = survivor;
      const survivorState = active[survivor] as number;
      if (survivor === oldLeafDepth && initialChild[survivorState] === NO_STATE) {
        return;
      }
      enterDown(survivorState, survivorState);
      if (listeners.length > 0) {
        report(from, "reload", undefined);
      }
    }

    function onTransition(listener: TransitionListener<E>): void {
      listeners.push(listener);
    }

    function report(from: string, cause: TransitionCause, event: E | undefined): void {
      for (let i = 0; i < listeners.length; i++) {
        (listeners[i] as TransitionListener<E>)(from, instance.path, cause, event);
      }
    }

    function enterState(state: number): void {
      const level = depth[state] as number;
      active[level] = state;
      elapsed[level] = 0;
      fired[level] = 0;
      leafDepth = level;
      entryCount++;
      const id = entryCount;
      entryId[level] = id;
      const config = configs[state] as StateConfig<Ctx, E>;
      const hook = config.enter;
      if (hook !== undefined) {
        hook(ctx, instance);
      }
      const invoke = config.invoke;
      if (invoke !== undefined) {
        let settled = false;
        invoke(
          ctx,
          (event: E) => {
            if (settled || !running || stopRequested || entryId[level] !== id) {
              return;
            }
            settled = true;
            send(event);
          },
          instance,
        );
      }
    }

    function exitTo(level: number): void {
      while (leafDepth > level) {
        const state = active[leafDepth] as number;
        active[leafDepth] = NO_STATE;
        entryId[leafDepth] = 0;
        leafDepth--;
        const hook = (configs[state] as StateConfig<Ctx, E>).exit;
        if (hook !== undefined) {
          hook(ctx, instance);
        }
      }
    }

    function enterDown(from: number, target: number): void {
      let count = 0;
      let state = target;
      while (state !== from) {
        scratch[count] = state;
        count++;
        state = parent[state] as number;
      }
      while (count > 0) {
        count--;
        enterState(scratch[count] as number);
        scratch[count] = NO_STATE;
      }
      state = target;
      while (initialChild[state] !== NO_STATE) {
        state = initialChild[state] as number;
        enterState(state);
      }
      instance.path = paths[active[leafDepth] as number] as string;
    }

    function transition(
      source: number,
      target: number,
      reenter: boolean,
      actions: readonly TransitionAction<Ctx, E>[] | undefined,
      event: E | undefined,
      cause: TransitionCause,
    ): void {
      if (target === NO_STATE) {
        runActions(actions, event);
        return;
      }
      const from = instance.path as string;
      const domain = transitionDomain(compiled, source, target, reenter);
      exitTo(depth[domain] as number);
      runActions(actions, event);
      enterDown(domain, target);
      if (listeners.length > 0) {
        report(from, cause, event);
      }
    }

    function runActions(
      actions: readonly TransitionAction<Ctx, E>[] | undefined,
      event: E | undefined,
    ): void {
      if (actions === undefined || event === undefined) {
        return;
      }
      for (let i = 0; i < actions.length; i++) {
        (actions[i] as TransitionAction<Ctx, E>)(ctx, event, instance);
      }
    }

    function processEvent(event: E): void {
      for (let level = leafDepth; level >= 0; level--) {
        const state = active[level] as number;
        const listIndex = (onIndex[state] as { [type: string]: number })[event.type];
        if (typeof listIndex !== "number") {
          continue;
        }
        const list = transitions[listIndex] as Transition<Ctx, E>[];
        for (let i = 0; i < list.length; i++) {
          const candidate = list[i] as Transition<Ctx, E>;
          if (candidate.guard === undefined || candidate.guard(ctx, event)) {
            transition(
              state,
              candidate.target,
              candidate.reenter,
              candidate.actions,
              event,
              "event",
            );
            return;
          }
        }
      }
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
      exitTo(NO_STATE);
      instance.path = undefined;
      busy = false;
      if (listeners.length > 0) {
        report(from, "stop", undefined);
      }
    }

    function endStep(): void {
      while (!stopRequested && queueHead < queueTail) {
        const event = queue[queueHead] as E;
        queue[queueHead] = undefined;
        queueHead++;
        processEvent(event);
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

    function fireUpdateHooks(dt: number): boolean {
      for (let level = leafDepth; level >= 0; level--) {
        const state = active[level] as number;
        const hook = (configs[state] as StateConfig<Ctx, E>).update;
        if (hook === undefined) {
          continue;
        }
        const target = hook(ctx, dt, instance);
        if (stopRequested) {
          return true;
        }
        if (typeof target === "string") {
          transition(
            state,
            resolveTarget(compiled, state, target),
            false,
            undefined,
            undefined,
            "update",
          );
          return true;
        }
      }
      return false;
    }

    function fireTimers(): void {
      for (let level = leafDepth; level >= 0; level--) {
        const state = active[level] as number;
        const delays = afterDelays[state] as number[];
        const next = fired[level] as number;
        if (next < delays.length && (delays[next] as number) <= (elapsed[level] as number)) {
          fired[level] = next + 1;
          transition(
            state,
            (afterTargets[state] as number[])[next] as number,
            false,
            undefined,
            undefined,
            "after",
          );
          return;
        }
      }
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
        for (let level = 0; level <= leafDepth; level++) {
          elapsed[level] = (elapsed[level] as number) + dt;
        }
        if (!fireUpdateHooks(dt)) {
          fireTimers();
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
      for (let level = 1; level <= leafDepth; level++) {
        if (paths[active[level] as number] === path) {
          return true;
        }
      }
      return false;
    }

    busy = true;
    enterState(ROOT);
    enterDown(ROOT, ROOT);
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

// Ctx and E are given explicitly and the config is inferred, so the config takes a second call.
// A key makes a later definition under it (a hot-reloaded module re-running) rebind live instances.
export function defineMachine<Ctx, E extends EventObject>(
  key?: string,
): <const C extends MachineConfig<Ctx, E>>(config: C) => DefinedMachine<Ctx, E, C> {
  return ((config: MachineConfig<Ctx, E>) => define(key, config)) as never;
}

export interface EventObject {
  readonly type: string;
}

/** @noSelf */
export interface MachineInstance<Ctx, E extends EventObject> {
  readonly ctx: Ctx;
  readonly path: string;
  readonly matches: (path: string) => boolean;
  readonly send: (event: E) => void;
  readonly update: (dt: number) => void;
  readonly stop: () => void;
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
  | readonly TransitionConfig<Ctx, E, V>[];

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
export interface StateConfig<Ctx, E extends EventObject> {
  readonly initial?: string;
  readonly states?: { readonly [name: string]: StateConfig<Ctx, E> };
  readonly on?: OnConfig<Ctx, E>;
  readonly after?: { readonly [seconds: number]: string };
  readonly enter?: StateHook<Ctx, E>;
  readonly exit?: StateHook<Ctx, E>;
  readonly update?: UpdateHook<Ctx, E>;
}

export interface MachineConfig<Ctx, E extends EventObject> extends StateConfig<Ctx, E> {
  readonly initial: string;
  readonly states: { readonly [name: string]: StateConfig<Ctx, E> };
}

/** @noSelf */
export interface Machine<Ctx, E extends EventObject> {
  readonly start: (ctx: Ctx) => MachineInstance<Ctx, E>;
}

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
  let path: string;
  if (target.charAt(0) === "#") {
    path = target.slice(1);
  } else {
    const base = source === ROOT ? ROOT : (compiled.parent[source] as number);
    path = base === ROOT ? target : `${compiled.paths[base] as string}.${target}`;
  }
  const index = lookupPath(compiled, path);
  if (index === undefined) {
    throw `hsm: state "${describePath(compiled.paths[source] as string)}" targets unknown state "${target}"`;
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
    registerState(
      compiled,
      children[name] as StateConfig<Ctx, E>,
      index,
      path === "" ? name : `${path}.${name}`,
    );
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
  const child = lookupPath(compiled, path === "" ? initial : `${path}.${initial}`);
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
    const delay = (key as unknown as number) * 1;
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

export function defineMachine<Ctx, E extends EventObject>(
  config: MachineConfig<Ctx, E>,
): Machine<Ctx, E> {
  const compiled = compile(config);
  const { paths, parent, depth, initialChild, configs, onIndex, transitions } = compiled;
  const { afterDelays, afterTargets } = compiled;

  function start(ctx: Ctx): MachineInstance<Ctx, E> {
    const slots = compiled.maxDepth + 1;
    const active: number[] = [];
    const elapsed: number[] = [];
    const fired: number[] = [];
    const scratch: number[] = [];
    for (let i = 0; i < slots; i++) {
      active[i] = NO_STATE;
      elapsed[i] = 0;
      fired[i] = 0;
      scratch[i] = NO_STATE;
    }
    const queue: (E | undefined)[] = [];
    let queueHead = 0;
    let queueTail = 0;
    let leafDepth = NO_STATE;
    let running = true;
    let busy = false;
    let stopRequested = false;

    const instance = {
      ctx,
      path: "",
      matches,
      send,
      update,
      stop,
    };

    function enterState(state: number): void {
      const level = depth[state] as number;
      active[level] = state;
      elapsed[level] = 0;
      fired[level] = 0;
      leafDepth = level;
      const hook = (configs[state] as StateConfig<Ctx, E>).enter;
      if (hook !== undefined) {
        hook(ctx, instance);
      }
    }

    function exitTo(level: number): void {
      while (leafDepth > level) {
        const state = active[leafDepth] as number;
        active[leafDepth] = NO_STATE;
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
    ): void {
      if (target === NO_STATE) {
        runActions(actions, event);
        return;
      }
      const domain = transitionDomain(compiled, source, target, reenter);
      exitTo(depth[domain] as number);
      runActions(actions, event);
      enterDown(domain, target);
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
            transition(state, candidate.target, candidate.reenter, candidate.actions, event);
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
      exitTo(NO_STATE);
      instance.path = "";
      busy = false;
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
          transition(state, resolveTarget(compiled, state, target), false, undefined, undefined);
          return true;
        }
      }
      return false;
    }

    function fireTimers(dt: number): void {
      for (let level = 0; level <= leafDepth; level++) {
        elapsed[level] = (elapsed[level] as number) + dt;
      }
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
      if (!fireUpdateHooks(dt)) {
        fireTimers(dt);
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

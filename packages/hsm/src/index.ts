export interface EventObject {
  readonly type: string;
}

export type TransitionCause = "event" | "after" | "update" | "stop" | "reload" | "always";

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
  readonly leaves: readonly P[];
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

/** @noSelf */
export interface AlwaysConfig<Ctx> {
  readonly target: string;
  readonly guard?: (ctx: Ctx) => boolean;
}

export type AlwaysSpec<Ctx> =
  | string
  | AlwaysConfig<Ctx>
  | readonly [AlwaysConfig<Ctx>, ...AlwaysConfig<Ctx>[]];

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
  // biome-ignore lint/suspicious/noConfusingVoidType: `void` keeps an expression-body invoke returning a void call (`=> go.animate(...)`) valid.
) => (() => void) | void;

/** @noSelf */
export interface StateConfig<Ctx, E extends EventObject> {
  readonly type?: "parallel";
  readonly initial?: string;
  readonly history?: "shallow";
  readonly states?: { readonly [name: string]: StateConfig<Ctx, E> };
  readonly on?: OnConfig<Ctx, E>;
  readonly after?: { readonly [seconds: number]: string };
  readonly always?: AlwaysSpec<Ctx>;
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
  readonly type?: unknown;
  readonly initial?: S extends { readonly type: "parallel" }
    ? never
    : S extends { readonly states: infer Children }
      ? `${Self}/${keyof Children & string}`
      : never;
  readonly history?: unknown;
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
  readonly always?: S extends { readonly always: unknown } ? SpecCheck<All> : unknown;
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
  readonly configs: StateConfig<Ctx, E>[];
  readonly paths: string[];
  readonly parent: number[];
  readonly depth: number[];
  readonly children: number[][];
  readonly parallel: boolean[];
  readonly initialChild: number[];
  readonly history: boolean[];
  readonly onIndex: { [type: string]: number }[];
  readonly transitions: Transition<Ctx, E>[][];
  readonly afterDelays: number[][];
  readonly afterTargets: number[][];
  readonly always: Transition<Ctx, E>[][];
  readonly pathIndex: { [path: string]: number };
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

// A structural cast keeps each read a plain method call: native in JavaScript, string.byte in Lua.
interface StringUnits {
  charCodeAt(index: number): number;
  byte(index: number): number;
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
  compiled.history[index] = config.history === "shallow";
  compiled.pathIndex[path] = index;
  const children = config.states;
  if (children === undefined) {
    return;
  }
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
  if (compiled.parallel[index] === true) {
    if (index === ROOT) {
      throw `hsm: state "${describePath(path)}" is parallel; put the regions in a child state`;
    }
    if (initial !== undefined) {
      throw `hsm: parallel state "${path}" has initial "${initial}"; every child is entered`;
    }
    if (compiled.history[index] === true) {
      throw `hsm: parallel state "${path}" has history; only a compound state resumes a child`;
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
    if (compiled.history[index] === true) {
      throw `hsm: state "${describePath(path)}" has history but no child states`;
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

function compileAlways<Ctx, E extends EventObject>(
  compiled: Compiled<Ctx, E>,
  index: number,
): void {
  const list: Transition<Ctx, E>[] = [];
  compiled.always[index] = list;
  const spec = (compiled.configs[index] as StateConfig<Ctx, E>).always;
  if (spec === undefined) {
    return;
  }
  const candidates: readonly (string | AlwaysConfig<Ctx>)[] =
    typeof spec === "string" || (spec as readonly AlwaysConfig<Ctx>[])[0] === undefined
      ? [spec as string | AlwaysConfig<Ctx>]
      : (spec as readonly AlwaysConfig<Ctx>[]);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i] as string | AlwaysConfig<Ctx>;
    if (typeof candidate !== "string" && candidate.target === undefined) {
      throw `hsm: state "${describePath(compiled.paths[index] as string)}" has an always transition with no target`;
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
    configs: [],
    paths: [],
    parent: [],
    depth: [],
    children: [],
    parallel: [],
    initialChild: [],
    history: [],
    onIndex: [],
    transitions: [],
    afterDelays: [],
    afterTargets: [],
    always: [],
    pathIndex: {},
  };
  registerState(compiled, config, NO_STATE, "");
  for (let index = 0; index < compiled.count; index++) {
    compileInitial(compiled, index);
    compileOn(compiled, index);
    compileAfter(compiled, index);
    compileAlways(compiled, index);
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
  let domain = source;
  if (source !== ROOT && (reenter || !isAncestorOrSelf(compiled, source, target))) {
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
    let children = compiled.children;
    let parallel = compiled.parallel;
    let initialChild = compiled.initialChild;
    let history = compiled.history;
    let configs = compiled.configs;
    let onIndex = compiled.onIndex;
    let transitions = compiled.transitions;
    let afterDelays = compiled.afterDelays;
    let afterTargets = compiled.afterTargets;
    let always = compiled.always;
    const activeChild: number[] = [];
    const isActive: boolean[] = [];
    const elapsed: number[] = [];
    const fired: number[] = [];
    const entryId: number[] = [];
    const cleanup: ((() => void) | undefined)[] = [];
    // Keyed by path, not index, so a remembered child outlives a rebind's recompilation.
    const remembered: { [parentPath: string]: string } = {};
    let slotCount = 0;
    growSlots();
    const leaves: string[] = [];
    let entryCount = 0;
    const queue: (E | undefined)[] = [];
    let queueHead = 0;
    let queueTail = 0;
    let running = true;
    let busy = false;
    let stopRequested = false;
    let moved = false;
    const listeners: TransitionListener<E>[] = [];

    const instance = {
      ctx,
      path: undefined as string | undefined,
      leaves,
      matches,
      send,
      update,
      stop,
      onTransition,
    };

    function clearSlot(state: number): void {
      activeChild[state] = NO_STATE;
      isActive[state] = false;
      elapsed[state] = 0;
      fired[state] = 0;
      entryId[state] = 0;
      cleanup[state] = undefined;
    }

    function growSlots(): void {
      while (slotCount < compiled.count) {
        clearSlot(slotCount);
        slotCount++;
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
      const keptFired: number[] = [];
      const keptEntryId: number[] = [];
      const keptCleanup: ((() => void) | undefined)[] = [];
      for (let i = 0; i < order.length; i++) {
        const state = order[i] as number;
        keptPaths[i] = paths[state] as string;
        keptElapsed[i] = elapsed[state] as number;
        keptFired[i] = fired[state] as number;
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
      history = compiled.history;
      configs = compiled.configs;
      onIndex = compiled.onIndex;
      transitions = compiled.transitions;
      afterDelays = compiled.afterDelays;
      afterTargets = compiled.afterTargets;
      always = compiled.always;
      growSlots();
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
        fired[state] = keptFired[i] as number;
        entryId[state] = keptEntryId[i] as number;
        cleanup[state] = keptCleanup[i];
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

    function onTransition(listener: TransitionListener<E>): void {
      listeners.push(listener);
    }

    function report(
      from: string,
      to: string | undefined,
      cause: TransitionCause,
      event: E | undefined,
    ): void {
      for (let i = 0; i < listeners.length; i++) {
        (listeners[i] as TransitionListener<E>)(from, to, cause, event);
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
      fired[state] = 0;
      entryCount++;
      const id = entryCount;
      entryId[state] = id;
      const config = configs[state] as StateConfig<Ctx, E>;
      const hook = config.enter;
      if (hook !== undefined) {
        hook(ctx, instance);
      }
      const invoke = config.invoke;
      if (invoke !== undefined) {
        // A path, not an index, so a settle held across a rebind still finds its entry.
        const path = paths[state] as string;
        let settled = false;
        const result = invoke(
          ctx,
          (event: E) => {
            const current = lookupPath(compiled, path);
            if (
              settled ||
              !running ||
              stopRequested ||
              current === undefined ||
              entryId[current] !== id
            ) {
              return;
            }
            settled = true;
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
        if (history[owner] === true) {
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

    function defaultChild(state: number): number {
      if (history[state] === true) {
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

    function enterDefaults(state: number): void {
      if (parallel[state] === true) {
        const list = children[state] as number[];
        for (let i = 0; i < list.length; i++) {
          enterState(list[i] as number);
          enterDefaults(list[i] as number);
        }
        return;
      }
      const child = defaultChild(state);
      if (child !== NO_STATE) {
        enterState(child);
        enterDefaults(child);
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
        enterDefaults(state);
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
          enterDefaults(region);
        }
      }
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
            enterDefaults(region);
          }
        }
        return;
      }
      const child = activeChild[state] as number;
      if (child !== NO_STATE) {
        enterMissing(child);
        return;
      }
      enterDefaults(state);
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
      reenter: boolean,
      actions: readonly TransitionAction<Ctx, E>[] | undefined,
      event: E | undefined,
      cause: TransitionCause,
    ): void {
      if (target === NO_STATE) {
        runActions(actions, event);
        return;
      }
      const domain = transitionDomain(compiled, source, target, reenter);
      const from = firstLeaf(domain);
      const child = activeChild[domain] as number;
      if (child !== NO_STATE) {
        exitSubtree(child);
      }
      runActions(actions, event);
      if (target === domain) {
        enterDefaults(domain);
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
        const guard = candidate.guard as ((ctx: Ctx) => boolean) | undefined;
        if (guard === undefined || guard(ctx)) {
          if (overLimit) {
            clearQueue();
            busy = false;
            throw `hsm: state "${describePath(paths[state] as string)}" took ${ALWAYS_LIMIT} always transitions in a row; check for an always loop`;
          }
          transition(state, candidate.target, false, undefined, undefined, "always");
          return true;
        }
      }
      return false;
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

    function takeEvent(state: number, event: E): boolean {
      const listIndex = (onIndex[state] as { [type: string]: number })[event.type];
      if (typeof listIndex !== "number") {
        return false;
      }
      const list = transitions[listIndex] as Transition<Ctx, E>[];
      for (let i = 0; i < list.length; i++) {
        const candidate = list[i] as Transition<Ctx, E>;
        if (candidate.guard === undefined || candidate.guard(ctx, event)) {
          transition(state, candidate.target, candidate.reenter, candidate.actions, event, "event");
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

    function endStep(): void {
      while (!stopRequested && queueHead < queueTail) {
        const event = queue[queueHead] as E;
        queue[queueHead] = undefined;
        queueHead++;
        moved = false;
        offerEvent(ROOT, event);
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
      return false;
    }

    function fireTimers(state: number): boolean {
      const child = activeChild[state] as number;
      if (child !== NO_STATE && fireTimers(child)) {
        return true;
      }
      const delays = afterDelays[state] as number[];
      const next = fired[state] as number;
      if (next < delays.length && (delays[next] as number) <= (elapsed[state] as number)) {
        fired[state] = next + 1;
        transition(
          state,
          (afterTargets[state] as number[])[next] as number,
          false,
          undefined,
          undefined,
          "after",
        );
        return true;
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

    busy = true;
    enterState(ROOT);
    enterDefaults(ROOT);
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

// Ctx and E are given explicitly and the config is inferred, so the config takes a second call.
// A key makes a later definition under it (a hot-reloaded module re-running) rebind live instances.
export function defineMachine<Ctx, E extends EventObject>(
  key?: string,
): <const C extends MachineConfig<Ctx, E>>(config: C) => DefinedMachine<Ctx, E, C> {
  return ((config: MachineConfig<Ctx, E>) => define(key, config)) as never;
}

import {
  defineMachine,
  type EventObject,
  type Machine,
  type MachineConfig,
  type MachineInstance,
  type StateConfig,
  type TransitionAction,
  type TransitionConfig,
} from "@defold-typescript/hsm";
import type { Demo, DemoButton, DemoCtx, DemoView } from "./demos";

/**
 * Runs a tutorial demo on the real `hsm` library and narrates it. The config is
 * copied with every hook wrapped to emit a trace line, and every rule gains a
 * leading action that reports which rule fired. Wrapping adds no states, rules
 * or targets, so the machine behaves exactly as the page's code does.
 *
 * Three lines have no hook to come from and are derived for display: the
 * bubbling line (from the config and the path before `send`), "nobody handles"
 * (a sent event no rule fired for), and the timer line (an `update` that moved
 * the machine while no `update` hook returned a target).
 */

export type TraceKind =
  | "event"
  | "bubble"
  | "guard"
  | "action"
  | "exit"
  | "enter"
  | "timer"
  | "queue"
  | "drop"
  | "note";

export interface TraceLine {
  readonly kind: TraceKind;
  readonly text: string;
}

/** A rule or timer chip on the diagram that was just used. */
export interface TraceFire {
  readonly kind: "fire";
  readonly chip: string;
}

export type TraceEntry = TraceLine | TraceFire;
export type Trace = (entry: TraceEntry) => void;

type Instance = MachineInstance<DemoCtx, EventObject>;
type State = StateConfig<DemoCtx, EventObject>;
type Rule = TransitionConfig<DemoCtx, EventObject>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function ruleChip(path: string, type: string, index: number): string {
  return `${path}|on|${type}|${index}`;
}

export function updateChip(path: string): string {
  return `${path}|update`;
}

export function afterChip(path: string, delay: number): string {
  return `${path}|after|${delay}`;
}

export function ruleList(spec: unknown): readonly Rule[] {
  if (typeof spec === "string") return [{ target: spec }];
  if (Array.isArray(spec)) return spec as Rule[];
  return [spec as Rule];
}

export function afterDelays(config: State): number[] {
  return Object.keys(config.after ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

/** `"on.dim"` to `["on", "on.dim"]`. */
export function activePaths(path: string): string[] {
  if (path === "") return [];
  const segments = path.split(".");
  return segments.map((_, i) => segments.slice(0, i + 1).join("."));
}

function childPath(parent: string, name: string): string {
  return parent === "" ? name : `${parent}.${name}`;
}

function parentPath(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(0, dot);
}

function describe(path: string): string {
  return path === "" ? "(machine)" : path;
}

function describeEvent(event: EventObject): string {
  const fields = Object.entries(event)
    .filter(([key]) => key !== "type")
    .map(([key, value]) => `${key} ${String(value)}`);
  return fields.length === 0 ? event.type : `${event.type} (${fields.join(", ")})`;
}

interface Session {
  readonly demo: Demo;
  readonly trace: Trace;
  readonly ctx: DemoCtx;
  readonly configs: Map<string, State>;
  instance: Instance | undefined;
  proxy: Instance | undefined;
  muted: boolean;
  starting: boolean;
  /** Above zero while a send, update or start from outside the machine runs. */
  depth: number;
  /** Events sent during the current outside call, checked for a handler once it returns. */
  sent: EventObject[];
  readonly handled: WeakSet<EventObject>;
  /** States entered during the current outside call. */
  readonly entered: Set<string>;
  readonly clocks: Map<string, number>;
  readonly fired: Map<string, number>;
  readonly entries: Map<string, number>;
  updating: boolean;
  updateMoved: boolean;
  dueTimer: { readonly path: string; readonly delay: number } | undefined;
  timerNoted: boolean;
}

export interface DemoRun extends DemoView<DemoCtx> {
  readonly demo: Demo;
  readonly instance: Instance;
  /** Seconds the state at `path` has been active, counted as its timers count them; 0 when inactive. */
  readonly clock: (path: string) => number;
}

const sessions = new WeakMap<DemoRun, Session>();

function sessionOf(run: DemoRun): Session {
  const session = sessions.get(run);
  if (session === undefined) throw new Error("not a running demo");
  return session;
}

function emit(s: Session, kind: TraceKind, text: string): void {
  if (!s.muted) s.trace({ kind, text });
}

function fire(s: Session, chip: string): void {
  if (!s.muted) s.trace({ kind: "fire", chip });
}

function isStopped(s: Session): boolean {
  return s.instance !== undefined && s.instance.path === "";
}

function proxyOf(s: Session, m: Instance): Instance {
  s.instance ??= m;
  if (s.proxy !== undefined) return s.proxy;
  s.proxy = {
    get ctx() {
      return m.ctx;
    },
    get path() {
      return m.path;
    },
    matches: (path) => m.matches(path),
    send: (event) => {
      if (s.depth === 0) {
        sendFromOutside(s, event);
        return;
      }
      emit(s, "queue", `${event.type} queued (machine is busy)`);
      s.sent.push(event);
      m.send(event);
    },
    update: (dt) => m.update(dt),
    stop: () => {
      if (s.depth > 0) emit(s, "note", "stop() requested; finishing this step first");
      m.stop();
    },
  };
  return s.proxy;
}

// The library fires at most one timer per update, on the deepest active state
// whose next delay is due; this is that state, worked out before the update so
// the timer line can lead the exits it causes.
function dueTimer(s: Session, dt: number): Session["dueTimer"] {
  const active = activePaths((s.instance as Instance).path);
  for (let i = active.length - 1; i >= 0; i--) {
    const path = active[i] as string;
    const delays = afterDelays(s.configs.get(path) as State);
    const next = s.fired.get(path) ?? 0;
    const delay = delays[next];
    if (delay !== undefined && delay <= (s.clocks.get(path) ?? 0) + dt) return { path, delay };
  }
  return undefined;
}

function noteTimer(s: Session): void {
  if (!s.updating || s.updateMoved || s.timerNoted || s.dueTimer === undefined) return;
  const { path, delay } = s.dueTimer;
  s.timerNoted = true;
  s.fired.set(path, (s.fired.get(path) ?? 0) + 1);
  emit(s, "timer", `${describe(path)}: ${delay} s timer fired`);
  fire(s, afterChip(path, delay));
}

function wrapRule(s: Session, rule: Rule, path: string, type: string, index: number): Rule {
  const chip = ruleChip(path, type, index);
  const note = s.demo.notes?.[chip];
  const declared = rule.actions;
  const actions: readonly TransitionAction<DemoCtx, EventObject>[] =
    declared === undefined ? [] : typeof declared === "function" ? [declared] : declared;
  const wrapped: Mutable<Rule> = { ...rule };
  const guard = rule.guard;
  if (guard !== undefined) {
    wrapped.guard = (ctx, event) => {
      const passed = guard(ctx, event);
      if (!passed) emit(s, "guard", `${describe(path)}: guard "${note ?? "check"}" said no`);
      return passed;
    };
  }
  wrapped.actions = [
    (_ctx, event) => {
      s.handled.add(event);
      fire(s, chip);
      if (rule.target === undefined) {
        emit(s, "note", `${describe(path)}: rule has no target, so nothing exits or enters`);
      }
      if (actions.length > 0) emit(s, "action", `actions: ${note ?? "run code"}`);
    },
    ...actions.map(
      (action): TransitionAction<DemoCtx, EventObject> =>
        (ctx, event, m) =>
          action(ctx, event, proxyOf(s, m)),
    ),
  ];
  return wrapped;
}

function wrapState(s: Session, config: State, path: string): State {
  s.configs.set(path, config);
  const wrapped: Mutable<State> = { ...config };

  if (config.states !== undefined) {
    const states: Record<string, State> = {};
    for (const [name, child] of Object.entries(config.states)) {
      states[name] = wrapState(s, child, childPath(path, name));
    }
    wrapped.states = states;
  }

  if (config.on !== undefined) {
    const on: Record<string, readonly Rule[]> = {};
    for (const [type, spec] of Object.entries(config.on)) {
      if (spec === undefined) continue;
      on[type] = ruleList(spec).map((rule, i) => wrapRule(s, rule, path, type, i));
    }
    // Every list holds at least the one rule it was copied from.
    wrapped.on = on as NonNullable<State["on"]>;
  }

  const update = config.update;
  if (update !== undefined) {
    wrapped.update = (ctx, dt, m) => {
      const target = update(ctx, dt, proxyOf(s, m));
      if (typeof target === "string") {
        s.updateMoved = true;
        emit(s, "event", `${describe(path)}: update returned "${target}"`);
        fire(s, updateChip(path));
      }
      return target;
    };
  }

  // The root has no box on the diagram, so its own entry and exit stay silent.
  if (path === "") return wrapped;

  const enter = config.enter;
  wrapped.enter = (ctx, m) => {
    noteTimer(s);
    const parent = parentPath(path);
    const viaInitial =
      (s.configs.get(parent) as State).initial ===
        path.slice(parent === "" ? 0 : parent.length + 1) &&
      (parent === "" ? s.starting : s.entered.has(parent));
    s.clocks.set(path, 0);
    s.fired.set(path, 0);
    s.entries.set(path, (s.entries.get(path) ?? 0) + 1);
    s.entered.add(path);
    emit(s, "enter", `enter ${path}${viaInitial ? " (initial child)" : ""}`);
    enter?.(ctx, proxyOf(s, m));
  };

  const exit = config.exit;
  wrapped.exit = (ctx, m) => {
    noteTimer(s);
    emit(s, "exit", `exit ${path}`);
    exit?.(ctx, proxyOf(s, m));
  };

  const invoke = config.invoke;
  if (invoke !== undefined) {
    wrapped.invoke = (ctx, settle, m) => {
      const entry = s.entries.get(path);
      const proxy = proxyOf(s, m);
      emit(s, "note", `${path}: invoke started`);
      invoke(
        ctx,
        (event) => {
          if (s.entries.get(path) !== entry || !proxy.matches(path)) {
            emit(s, "drop", `late settle(${event.type}) ignored: ${path} was already left`);
            settle(event);
            return;
          }
          emit(s, "note", `${path}: settle(${event.type})`);
          if (s.depth > 0) {
            settle(event);
            return;
          }
          fromOutside(s, event, () => settle(event));
        },
        proxy,
      );
    };
  }

  return wrapped;
}

/** Runs one call into the machine from outside it, then reports events no rule handled. */
function fromOutside(s: Session, event: EventObject | undefined, body: () => void): void {
  const wasStopped = isStopped(s);
  if (s.depth === 0) {
    s.sent = event === undefined ? [] : [event];
    s.entered.clear();
  }
  s.depth++;
  try {
    body();
  } finally {
    s.depth--;
  }
  if (s.depth > 0) return;
  const stopped = isStopped(s);
  for (const sent of s.sent) {
    if (s.handled.has(sent)) continue;
    emit(
      s,
      "drop",
      stopped ? `stop() dropped ${sent.type}` : `nobody handles ${sent.type}, so it is ignored`,
    );
  }
  s.sent = [];
  if (stopped && !wasStopped) emit(s, "note", 'stopped, path = ""');
}

function sendFromOutside(s: Session, event: EventObject): void {
  const instance = s.instance as Instance;
  if (isStopped(s)) {
    emit(s, "drop", `${event.type} ignored: machine is stopped`);
    instance.send(event);
    return;
  }
  emit(s, "event", `send ${describeEvent(event)}`);
  const active = activePaths(instance.path);
  for (let i = active.length - 1; i >= 0; i--) {
    const path = active[i] as string;
    const on = s.configs.get(path)?.on as Record<string, unknown> | undefined;
    if (on?.[event.type] !== undefined) break;
    emit(s, "bubble", `${path} has no ${event.type} rule, asks its parent`);
  }
  fromOutside(s, event, () => instance.send(event));
}

// The demo configs are typed per spec; at this point every demo is the erased `Demo`.
const define = defineMachine<DemoCtx, EventObject>() as unknown as (
  config: MachineConfig<DemoCtx, EventObject>,
) => Machine<DemoCtx, EventObject>;

export function startDemo(demo: Demo, trace: Trace, ctxOverride?: Partial<DemoCtx>): DemoRun {
  const s: Session = {
    demo,
    trace,
    ctx: { ...demo.ctx(), ...ctxOverride },
    configs: new Map(),
    instance: undefined,
    proxy: undefined,
    muted: false,
    starting: false,
    depth: 0,
    sent: [],
    handled: new WeakSet(),
    entered: new Set(),
    clocks: new Map(),
    fired: new Map(),
    entries: new Map(),
    updating: false,
    updateMoved: false,
    dueTimer: undefined,
    timerNoted: false,
  };
  const machine = define(wrapState(s, demo.config, "") as MachineConfig<DemoCtx, EventObject>);
  if (ctxOverride !== undefined) emit(s, "note", `start(${JSON.stringify(ctxOverride)})`);
  s.starting = true;
  fromOutside(s, undefined, () => {
    s.instance = machine.start(s.ctx);
  });
  s.starting = false;
  const instance = s.instance as unknown as Instance;
  emit(s, "note", `start() returned, path = "${instance.path}"`);

  const run: DemoRun = {
    demo,
    instance,
    ctx: s.ctx,
    get path() {
      return instance.path;
    },
    get stopped() {
      return isStopped(s);
    },
    matches: (path) => instance.matches(path),
    clock: (path) => (instance.matches(path) ? (s.clocks.get(path) ?? 0) : 0),
  };
  sessions.set(run, s);
  return run;
}

export function send(run: DemoRun, event: EventObject): void {
  sendFromOutside(sessionOf(run), event);
}

/** Advances a demo by `dt` seconds: the imitated Defold work first, then the machine's `update`. */
export function step(run: DemoRun, dt: number): void {
  const s = sessionOf(run);
  if (isStopped(s)) return;
  s.demo.tick?.(s.ctx, dt);
  if (isStopped(s)) return;
  const instance = s.instance as Instance;
  const before = activePaths(instance.path);
  s.dueTimer = dueTimer(s, dt);
  s.updating = true;
  s.updateMoved = false;
  s.timerNoted = false;
  try {
    fromOutside(s, undefined, () => instance.update(dt));
  } finally {
    s.updating = false;
  }
  // The library adds dt to every active state's timer only when no update hook moved it.
  if (s.updateMoved) return;
  for (const path of before) {
    if (!s.entered.has(path)) s.clocks.set(path, (s.clocks.get(path) ?? 0) + dt);
  }
}

/**
 * Presses a demo button: sends its event, changes the world, or stops this
 * machine quietly and starts a fresh one. Returns the run to use from now on.
 */
export function press(run: DemoRun, button: DemoButton): DemoRun {
  if ("event" in button) {
    send(run, { ...button.event });
    return run;
  }
  if ("change" in button) {
    button.change(run.ctx);
    return run;
  }
  return restart(run, button.restartWith);
}

/** Stops this machine without narrating it and starts a fresh one on the same trace. */
export function restart(run: DemoRun, ctxOverride?: Partial<DemoCtx>): DemoRun {
  const s = sessionOf(run);
  s.muted = true;
  run.instance.stop();
  return startDemo(s.demo, s.trace, ctxOverride);
}

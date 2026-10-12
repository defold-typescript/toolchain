import {
  type AfterRule,
  type AlwaysConfig,
  defineMachine,
  type EventObject,
  type Machine,
  type MachineConfig,
  type MachineInstance,
  type MoveAction,
  type MoveListener,
  type RunAction,
  type StateConfig,
  type TransitionConfig,
} from "@defold-typescript/hsm";
import type { BuddyReaction, Demo, DemoButton, DemoCtx, DemoView } from "./demos";

/**
 * Runs a tutorial demo on the real `hsm` library and narrates it. The config is
 * copied with every hook wrapped to emit a trace line, and every rule gains a
 * leading action that reports which rule fired. Wrapping adds no states, rules
 * or targets, so the machine behaves exactly as the page's code does.
 *
 * Two kinds of line have no hook to come from and are derived for display: the
 * bubbling lines (from the config and the leaves before `send`) and "nobody
 * handles" (a sent event no rule fired for). The second is printed where the library
 * drops the event: by the first `unhandled` hook it runs, or by the runtime's own
 * `onUnhandled` listener when none ran.
 *
 * The machine is handed an object of its own for each send: the library marks no point where it
 * starts on the next queued event, so the spec's object cannot tell two regions taking one send
 * from one region taking two sends of it. Every hook and listener gets the spec's event back.
 *
 * `sequence` waits through Defold's global `timer`, which is imitated here on each run's own
 * clock. A routine goes on in a promise continuation, where no call names its run, so a wait
 * belongs to the run that last called into the runtime. That is exact as long as a run's
 * continuations finish before another run acts: the page steps each diagram in an
 * animation-frame callback of its own, and a test awaits a zero timeout before it touches
 * another run.
 *
 * `holders` and `scope` are the two module-level references to a run: a state's exit clears the
 * first through the task's cleanup, and `discard` clears both.
 *
 * A spec's `script` runs once `start` has returned, as the script that owns the buddy goes on
 * after its own `start` call. Each line it prints is a `heard` line.
 *
 * A run carries the diagram's save from one machine to the next, as a save file outlives the
 * machine that wrote it.
 */

export type TraceKind =
  | "event"
  | "bubble"
  | "when"
  | "action"
  | "exit"
  | "enter"
  | "timer"
  | "queue"
  | "drop"
  | "note"
  // A line the spec's script printed, which the diagram shows in a list of its own.
  | "heard";

export interface TraceLine {
  readonly kind: TraceKind;
  readonly text: string;
}

/** A rule or timer chip on the diagram that was just used, or a routine step that just started. */
export interface TraceFire {
  readonly kind: "fire";
  readonly chip: string;
}

export type TraceEntry = TraceLine | TraceFire;
export type Trace = (entry: TraceEntry) => void;

type Instance = MachineInstance<DemoCtx, EventObject, string, string>;
type State = StateConfig<DemoCtx, EventObject, string>;
type Rule = TransitionConfig<DemoCtx, EventObject, EventObject, string, string>;
type Action = MoveAction<DemoCtx, EventObject, EventObject, string>;
type AlwaysRule = AlwaysConfig<DemoCtx, string, EventObject, string>;
type AfterTimer = AfterRule<DemoCtx, string, EventObject, string>;
/** A function a `run` calls where there is no event: under `always`, `after` and `every`. */
type Run = RunAction<DemoCtx, EventObject, string>;
type Delay = number | ((ctx: Readonly<DemoCtx>) => number);
type TimerKey = "after" | "every";
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function ruleChip(path: string, type: string, index: number): string {
  return `${path}|on|${type}|${index}`;
}

export function alwaysChip(path: string, index: number): string {
  return `${path}|always|${index}`;
}

export function updateChip(path: string): string {
  return `${path}|update`;
}

export function afterChip(path: string, delay: number): string {
  return `${path}|after|${delay}`;
}

export function everyChip(path: string, delay: number): string {
  return `${path}|every|${delay}`;
}

/** An entry of the list form of `after` or `every`, which has no fixed delay to be named by. */
export function listChip(path: string, key: TimerKey, index: number): string {
  return `${path}|${key}|#${index}`;
}

/** A step of the routine a state's `sequence` task runs; step 0 is the stretch up to its first wait. */
export function stepChip(path: string, index: number): string {
  return `${path}|step|${index}`;
}

export function ruleList(spec: unknown): readonly Rule[] {
  if (typeof spec === "string") return [{ to: spec }];
  if (Array.isArray(spec)) return spec as Rule[];
  return [spec as Rule];
}

/** A state's `always` rules in the order the machine tries them; a bare path is a rule with that `to`. */
export function alwaysList(spec: unknown): readonly AlwaysRule[] {
  if (spec === undefined) return [];
  const list = Array.isArray(spec) ? (spec as readonly (string | AlwaysRule)[]) : [spec];
  return list.map((rule) => (typeof rule === "string" ? { to: rule } : (rule as AlwaysRule)));
}

/** A timer as a rule object; a bare path is a rule with that `to`. */
function afterRule(written: unknown): AfterTimer {
  return typeof written === "string" ? { to: written } : (written as AfterTimer);
}

function runList<A>(declared: A | readonly A[] | undefined): readonly A[] {
  if (declared === undefined) return [];
  return Array.isArray(declared) ? (declared as readonly A[]) : [declared as A];
}

/** One `after` or `every` entry and the chip it is drawn as. */
interface Timed {
  readonly chip: string;
  readonly delay: Delay;
  /** A value of the record form, or an entry of the list form. */
  readonly written: unknown;
}

interface TimedList {
  /** Written as a list of entries that each carry a `delay`, not as a record by delay. */
  readonly list: boolean;
  readonly entries: readonly Timed[];
}

/**
 * A state's `after` or `every` entries in the order the diagram lists them: the record form
 * shortest delay first, the list form in list order. The two are told apart as the library
 * does: a list is the form whose first entry is an object with a `delay`.
 */
function timedList(spec: object | undefined, path: string, key: TimerKey): TimedList {
  if (spec === undefined) return { list: false, entries: [] };
  const first = (spec as readonly { readonly delay?: unknown }[])[0];
  if (typeof first === "object" && first.delay !== undefined) {
    const entries = (spec as readonly { readonly delay: Delay }[]).map((written, index) => ({
      chip: listChip(path, key, index),
      delay: written.delay,
      written,
    }));
    return { list: true, entries };
  }
  const byDelay = spec as Readonly<Record<number, unknown>>;
  const entries = Object.keys(byDelay)
    .map(Number)
    .sort((a, b) => a - b)
    .map((delay) => ({
      chip: key === "after" ? afterChip(path, delay) : everyChip(path, delay),
      delay,
      written: byDelay[delay],
    }));
  return { list: false, entries };
}

/** A delay written as a number; `undefined` for a function, whose value is read on each entry. */
function fixedDelay(delay: Delay): number | undefined {
  return typeof delay === "number" ? delay : undefined;
}

/** `"/on/dim"` to `["/on", "/on/dim"]`; a stopped machine (`undefined`) to `[]`. */
export function activePaths(path: string | undefined): string[] {
  if (path === undefined || path === "") return [];
  const segments = path.split("/").slice(1);
  return segments.map((_, i) => `/${segments.slice(0, i + 1).join("/")}`);
}

/** Every active path once: the `activePaths` of each leaf, in the order of `leaves`. */
export function activeStates(leaves: readonly string[]): string[] {
  const active = new Set<string>();
  for (const leaf of leaves) {
    for (const path of activePaths(leaf)) active.add(path);
  }
  return [...active];
}

/** The active children of the state at `path`, in the order their leaves appear in `leaves`. */
function activeChildren(path: string, leaves: readonly string[]): string[] {
  const children: string[] = [];
  for (const leaf of leaves) {
    if (!leaf.startsWith(`${path}/`)) continue;
    const end = leaf.indexOf("/", path.length + 1);
    const child = end < 0 ? leaf : leaf.slice(0, end);
    if (!children.includes(child)) children.push(child);
  }
  return children;
}

/** The root's path is `""`, so a child of the root is `/<name>`. */
function childPath(parent: string, name: string): string {
  return `${parent}/${name}`;
}

/** One rule line of a state box, in the order the diagram lists them. */
export type ChipSpec =
  | {
      readonly kind: "on";
      readonly id: string;
      readonly type: string;
      readonly to: string | undefined;
    }
  | { readonly kind: "always"; readonly id: string; readonly to: string }
  | { readonly kind: "update"; readonly id: string }
  // A delay of `undefined` is a function of the context.
  | { readonly kind: "every"; readonly id: string; readonly delay: number | undefined }
  | {
      readonly kind: "after";
      readonly id: string;
      readonly delay: number | undefined;
      readonly to: string | undefined;
    }
  | { readonly kind: "step"; readonly id: string; readonly index: number; readonly label: string };

/**
 * A quiet state's `update` hook never returns a path, so it gets no rule line. `steps` holds the
 * labels of the state's routine, which are listed after its rules.
 */
export function stateChips(
  config: State,
  path: string,
  quietUpdate = false,
  steps: readonly string[] = [],
): ChipSpec[] {
  const chips: ChipSpec[] = [];
  for (const [type, spec] of Object.entries(config.on ?? {})) {
    if (spec === undefined) continue;
    ruleList(spec).forEach((rule, index) => {
      chips.push({ kind: "on", id: ruleChip(path, type, index), type, to: rule.to });
    });
  }
  alwaysList(config.always).forEach((rule, index) => {
    chips.push({ kind: "always", id: alwaysChip(path, index), to: rule.to });
  });
  if (config.update !== undefined && !quietUpdate) {
    chips.push({ kind: "update", id: updateChip(path) });
  }
  for (const entry of timedList(config.every, path, "every").entries) {
    chips.push({ kind: "every", id: entry.chip, delay: fixedDelay(entry.delay) });
  }
  for (const entry of timedList(config.after, path, "after").entries) {
    const delay = fixedDelay(entry.delay);
    chips.push({ kind: "after", id: entry.chip, delay, to: afterRule(entry.written).to });
  }
  steps.forEach((label, index) => {
    chips.push({ kind: "step", id: stepChip(path, index), index, label });
  });
  return chips;
}

/**
 * The id of every chip a diagram draws: each state below the root, parents before children.
 * `quietUpdates` holds the paths of the states whose `update` hook never returns a path, and
 * `routines` the step labels of the states whose task is a routine, by path.
 */
export function diagramChips(
  root: State,
  quietUpdates: readonly string[] = [],
  routines: Readonly<Record<string, readonly string[]>> = {},
): string[] {
  const ids: string[] = [];
  const collect = (config: State, path: string) => {
    for (const [name, child] of Object.entries(config.states ?? {})) {
      const at = childPath(path, name);
      for (const chip of stateChips(child, at, quietUpdates.includes(at), routines[at])) {
        ids.push(chip.id);
      }
      collect(child, at);
    }
  };
  collect(root, "");
  return ids;
}

/** `"/on/dim"` to `"/on"`, and `"/on"` to the root's `""`. */
function parentPath(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

function describe(path: string): string {
  return path === "" ? "(machine)" : path;
}

/** A path as the page's code would print it: quoted, or `undefined` once stopped. */
export function describePath(path: string | undefined): string {
  return path === undefined ? "undefined" : JSON.stringify(path);
}

/** Starting data as the page's code writes it: `{ wakes: 0 }`. */
function describeFields(fields: Readonly<Record<string, unknown>>): string {
  const written = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return written.length === 0 ? "{}" : `{ ${written.join(", ")} }`;
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
  /**
   * The sends of the current outside call the machine has neither taken nor dropped, as the
   * objects the machine holds for them and in the order they were sent. A stop dropped the ones
   * still here once the call returns.
   */
  readonly pending: Set<EventObject>;
  /** Whether the event the machine is dropping has its line in the log. */
  dropNamed: boolean;
  /** The spec's event behind each object the machine holds for a send. */
  readonly origins: WeakMap<EventObject, EventObject>;
  /** States entered during the current outside call. */
  readonly entered: Set<string>;
  readonly clocks: Map<string, number>;
  readonly entries: Map<string, number>;
  /** The child each state was last left in, by the parent's path. */
  readonly lastChild: Map<string, string>;
  /** Every `after` and `every` chip, by id. */
  readonly timers: Map<string, TimerChip>;
  /** What each delay function returned for the current stay, by chip. */
  readonly delays: Map<string, number>;
  /** The due `after` chips whose `when` said no during the current stay. */
  readonly held: Set<string>;
  /** The run's pending `timer.delay` waits, in the order they were filed. */
  readonly waits: Wait[];
  /** The routine of the state the run is in, and the number of waits it has started in this stay. */
  routine: { readonly path: string; step: number } | undefined;
  /** The paths the diagram's save button kept last. */
  saved: readonly string[] | undefined;
}

/** What a new run starts from: the diagram's save to carry on, and the paths to start at. */
export interface StartFrom {
  readonly saved?: readonly string[];
  readonly at?: readonly string[];
}

type TimerCallback = (self: unknown, handle: number, elapsed: number) => void;

/** One imitated `timer.delay`, counted by the clock of the run that holds it. */
interface Wait {
  readonly handle: number;
  readonly seconds: number;
  elapsed: number;
  readonly callback: TimerCallback;
}

interface TimerChip {
  readonly path: string;
  readonly key: TimerKey;
  readonly delay: number | undefined;
}

export interface DemoRun extends DemoView<DemoCtx> {
  readonly demo: Demo;
  /** The machine itself: a listener added on it gets the machine's object for a send, not the spec's event. */
  readonly instance: Instance;
  /** Seconds the state at `path` has been active, counted as its timers count them; 0 when inactive. */
  readonly clock: (path: string) => number;
  /**
   * How full the bar of an `after` or `every` chip is, from 0 to 1. An `every` bar starts over
   * each time its delay has passed; any bar is empty while its state is inactive.
   */
  readonly progress: (chip: string) => number;
  /**
   * The delay an `after` or `every` chip counts: the number written, or what its function
   * returned for the stay its state is in. `undefined` for a function while the state is inactive.
   */
  readonly delayOf: (chip: string) => number | undefined;
  /** Whether an `after` chip is due and held back by its `when`, for as long as its state stays active. */
  readonly waiting: (chip: string) => boolean;
  /**
   * The step the routine of the state at `path` is in, and how full the bar of the wait it filed
   * last is, from 0 to 1; the bar is empty while no wait is pending. `undefined` unless the run's
   * routine is at `path`.
   */
  readonly routine: (
    path: string,
  ) => { readonly step: number; readonly progress: number } | undefined;
}

const sessions = new WeakMap<DemoRun, Session>();

/** The run that last called into the runtime; an imitated `timer.delay` files its wait there. */
let scope: Session | undefined;

function sessionOf(run: DemoRun): Session {
  const session = sessions.get(run);
  if (session === undefined) throw new Error("not a running demo");
  scope = session;
  return session;
}

function emit(s: Session, kind: TraceKind, text: string): void {
  if (!s.muted) s.trace({ kind, text });
}

function fire(s: Session, chip: string): void {
  if (!s.muted) s.trace({ kind: "fire", chip });
}

/** Names the event the machine is dropping, once for the drop. */
function nameDrop(s: Session, event: EventObject): void {
  if (s.dropNamed) return;
  s.dropNamed = true;
  emit(s, "drop", `nobody handles ${event.type}, so it is ignored`);
}

/**
 * The event the spec sent. One that reached the library some other way, through a task's
 * `finish` or a `can`, is the spec's own already.
 */
function specEvent(s: Session, event: EventObject): EventObject {
  return s.origins.get(event) ?? event;
}

/** Files one send and returns the machine's object for it. The library reads `type` from an event and nothing else. */
function track(s: Session, event: EventObject): EventObject {
  const held = { type: event.type };
  s.origins.set(held, event);
  s.pending.add(held);
  return held;
}

/** The run that holds each pending wait, by handle. */
const holders = new Map<number, Session>();
let lastHandle = 0;

function unfile(s: Session, handle: number): Wait | undefined {
  const at = s.waits.findIndex((wait) => wait.handle === handle);
  if (at < 0) return undefined;
  holders.delete(handle);
  return s.waits.splice(at, 1)[0];
}

/** Defold's `timer` as far as `sequence` uses it, with `step` in place of real time. */
const imitatedTimer = {
  delay(seconds: number, repeating: boolean, callback: TimerCallback): number {
    if (repeating) throw new Error("the imitated timer.delay does not repeat");
    const s = scope;
    if (s === undefined) throw new Error("timer.delay was called with no demo running");
    lastHandle++;
    s.waits.push({ handle: lastHandle, seconds, elapsed: 0, callback });
    holders.set(lastHandle, s);
    if (s.routine !== undefined) {
      s.routine.step++;
      fire(s, stepChip(s.routine.path, s.routine.step));
    }
    return lastHandle;
  },
  cancel(handle: number): boolean {
    const s = holders.get(handle);
    const wait = s === undefined ? undefined : unfile(s, handle);
    if (s === undefined || wait === undefined) return false;
    emit(s, "note", `timer.cancel: the ${wait.seconds} s wait was cancelled`);
    return true;
  },
};

/** Passes `dt` on the run's pending waits, then calls back the ones that are over, oldest first. */
function advanceWaits(s: Session, dt: number): void {
  for (const wait of s.waits) wait.elapsed += dt;
  for (const wait of s.waits.filter((pending) => pending.elapsed >= pending.seconds)) {
    // A callback that ran just before may have cancelled this one.
    if (unfile(s, wait.handle) !== undefined) wait.callback(undefined, wait.handle, wait.elapsed);
  }
}

function routineOf(s: Session, path: string) {
  const routine = s.routine;
  if (routine === undefined || routine.path !== path) return undefined;
  const wait = s.waits[s.waits.length - 1];
  if (wait === undefined) return { step: routine.step, progress: 0 };
  // A wait of zero seconds is over the moment it is filed.
  const progress = wait.seconds > 0 ? Math.min(1, wait.elapsed / wait.seconds) : 1;
  return { step: routine.step, progress };
}

function isStopped(s: Session): boolean {
  return s.instance !== undefined && s.instance.path === undefined;
}

/**
 * Keeps the run's machine and listens for its drops. The library calls a listener after the
 * hooks of the event it drops, so the listener names a drop no hook named and closes it. It is
 * added during `start`, ahead of any listener the spec's script adds, so the log names a drop
 * before the script hears it.
 */
function adopt(s: Session, m: Instance): void {
  if (s.instance !== undefined) return;
  s.instance = m;
  m.onUnhandled((event) => {
    nameDrop(s, event);
    s.dropNamed = false;
    s.pending.delete(event);
  });
}

/**
 * A move listener as the core calls it: the declared arguments, then the path of the state whose
 * rule made the move and that rule's key.
 */
type MoveCall = (...args: [...Parameters<MoveListener<EventObject, string>>, ...unknown[]]) => void;

function proxyOf(s: Session, m: Instance): Instance {
  adopt(s, m);
  if (s.proxy !== undefined) return s.proxy;
  s.proxy = {
    get ctx() {
      return m.ctx;
    },
    get path() {
      return m.path;
    },
    get leaves() {
      return m.leaves;
    },
    matches: (path) => m.matches(path),
    hasTag: (tag) => m.hasTag(tag),
    can: (event) => m.can(event),
    send: (event) => {
      if (s.depth === 0) {
        sendFromOutside(s, event);
        return;
      }
      emit(s, "queue", `${event.type} queued (machine is busy)`);
      m.send(track(s, event));
    },
    update: (dt) => m.update(dt),
    stop: () => {
      if (s.depth > 0) emit(s, "note", "stop() requested; finishing this step first");
      m.stop();
    },
    onMove: (listener) =>
      m.onMove((from, to, cause, event, ...rest: unknown[]) =>
        (listener as MoveCall)(
          from,
          to,
          cause,
          event === undefined ? undefined : specEvent(s, event),
          ...rest,
        ),
      ),
    onUnhandled: (listener) => m.onUnhandled((event) => listener(specEvent(s, event))),
  };
  return s.proxy;
}

/** What a rule's `run` does, in plain words: its own note, else the note of the rule it belongs to. */
function runNote(s: Session, chip: string): string {
  return s.demo.notes?.[`${chip}|run`] ?? s.demo.notes?.[chip] ?? "run code";
}

function wrapAlways(s: Session, rule: AlwaysRule, path: string, index: number): AlwaysRule {
  const chip = alwaysChip(path, index);
  const run = runList<Run>(rule.run);
  const when = rule.when;
  return {
    ...rule,
    // The machine takes the first rule that passes at once, so the line of a yes leads the exits.
    when: (ctx, machine) => {
      const passed = when === undefined || when(ctx, machine);
      if (passed) emit(s, "event", `${describe(path)}: always chose "${rule.to}"`);
      else emit(s, "when", `${describe(path)}: when "${s.demo.notes?.[chip] ?? "check"}" said no`);
      return passed;
    },
    run: [
      () => {
        fire(s, chip);
        if (run.length > 0) emit(s, "action", `run: ${runNote(s, chip)}`);
      },
      ...run.map(
        (action): Run =>
          (ctx, m) =>
            action(ctx, proxyOf(s, m)),
      ),
    ],
  };
}

/** The delay an entry counts during the current stay: the number written, or what its function returned on entry. */
function stayDelay(s: Session, entry: Timed): number | undefined {
  return typeof entry.delay === "number" ? entry.delay : s.delays.get(entry.chip);
}

// The library calls a delay function right after the state's `enter` hook, once per stay.
function wrapDelay(s: Session, entry: Timed, path: string, key: TimerKey): Delay {
  const delay = entry.delay;
  if (typeof delay === "number") return delay;
  return (ctx) => {
    const seconds = delay(ctx);
    s.delays.set(entry.chip, seconds);
    emit(s, "note", `${describe(path)}: ${key} delay read: ${seconds} s`);
    return seconds;
  };
}

/** Copies a state's `after` or `every` in the form it was written, each entry replaced by `wrap`'s. */
function wrapTimed<T extends object>(
  s: Session,
  timed: TimedList,
  path: string,
  key: TimerKey,
  wrap: (entry: Timed) => T,
): unknown {
  for (const entry of timed.entries) {
    s.timers.set(entry.chip, { path, key, delay: fixedDelay(entry.delay) });
  }
  if (timed.list) {
    return timed.entries.map((entry) => ({
      ...wrap(entry),
      delay: wrapDelay(s, entry, path, key),
    }));
  }
  const byDelay: Record<number, T> = {};
  for (const entry of timed.entries) byDelay[entry.delay as number] = wrap(entry);
  return byDelay;
}

/** The `run` of one `every` entry: `declared` behind an action that narrates the run. */
function wrapEvery(s: Session, entry: Timed, declared: readonly Run[], path: string): Run[] {
  return [
    () => {
      emit(s, "timer", `${describe(path)}: every ${stayDelay(s, entry)} s ran`);
      fire(s, entry.chip);
      emit(s, "action", `run: ${runNote(s, entry.chip)}`);
    },
    ...declared.map(
      (action): Run =>
        (ctx, m) =>
          action(ctx, proxyOf(s, m)),
    ),
  ];
}

/**
 * One `after` timer as a rule that narrates itself. The machine asks a due timer's `when` on
 * every update until it passes, so the wrapped `when` is where a timer is seen to fire or wait.
 */
function wrapAfter(s: Session, entry: Timed, path: string): AfterTimer {
  const { chip } = entry;
  const rule = afterRule(entry.written);
  const declared = runList<Run>(rule.run);
  const when = rule.when;
  const wrapped: Mutable<AfterTimer> = {
    ...rule,
    when: (ctx, machine) => {
      const timer = `${describe(path)}: ${stayDelay(s, entry)} s timer`;
      if (when === undefined || when(ctx, machine)) {
        // The machine takes a timer that passes at once, so its line and chip lead the exits.
        s.held.delete(chip);
        emit(s, "timer", `${timer} fired`);
        fire(s, chip);
        return true;
      }
      if (!s.held.has(chip)) {
        s.held.add(chip);
        emit(s, "when", `${timer} is due, but when "${s.demo.notes?.[chip] ?? "check"}" said no`);
      }
      return false;
    },
  };
  if (declared.length > 0) {
    wrapped.run = [
      () => emit(s, "action", `run: ${runNote(s, chip)}`),
      ...declared.map(
        (action): Run =>
          (ctx, m) =>
            action(ctx, proxyOf(s, m)),
      ),
    ];
  }
  return wrapped;
}

function wrapRule(s: Session, rule: Rule, path: string, type: string, index: number): Rule {
  const chip = ruleChip(path, type, index);
  const note = s.demo.notes?.[chip];
  const run = runList<Action>(rule.run);
  const wrapped: Mutable<Rule> = { ...rule };
  const when = rule.when;
  if (when !== undefined) {
    wrapped.when = (ctx, event, machine) => {
      const passed = when(ctx, specEvent(s, event), machine);
      if (!passed) emit(s, "when", `${describe(path)}: when "${note ?? "check"}" said no`);
      return passed;
    };
  }
  wrapped.run = [
    (_ctx, event) => {
      // The rule of a second region that takes the same send finds it gone already.
      s.pending.delete(event);
      fire(s, chip);
      if (rule.to === undefined) {
        emit(s, "note", `${describe(path)}: rule has no to, so nothing exits or enters`);
      }
      if (run.length > 0) emit(s, "action", `run: ${runNote(s, chip)}`);
    },
    ...run.map(
      (action): Action =>
        (ctx, event, m) =>
          action(ctx, specEvent(s, event), proxyOf(s, m)),
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

  if (config.always !== undefined) {
    // The list holds at least the one rule it was copied from.
    wrapped.always = alwaysList(config.always).map((rule, i) =>
      wrapAlways(s, rule, path, i),
    ) as unknown as NonNullable<State["always"]>;
  }

  const update = config.update;
  if (update !== undefined) {
    wrapped.update = (ctx, dt, m) => {
      const target = update(ctx, dt, proxyOf(s, m));
      if (typeof target === "string") {
        emit(s, "event", `${describe(path)}: update returned "${target}"`);
        fire(s, updateChip(path));
      }
      return target;
    };
  }

  if (config.every !== undefined) {
    const every = timedList(config.every, path, "every");
    wrapped.every = wrapTimed(s, every, path, "every", (entry) => {
      // A list entry holds its `run` beside the delay; the record form holds it under the delay.
      const declared = every.list
        ? (entry.written as { readonly run: Run | readonly Run[] }).run
        : (entry.written as Run | readonly Run[]);
      const run = wrapEvery(s, entry, runList(declared), path);
      return every.list ? { run } : run;
    }) as NonNullable<State["every"]>;
  }

  const after = timedList(config.after, path, "after");
  if (config.after !== undefined) {
    wrapped.after = wrapTimed(s, after, path, "after", (entry) =>
      wrapAfter(s, entry, path),
    ) as NonNullable<State["after"]>;
  }

  const unhandled = config.unhandled;
  if (unhandled !== undefined) {
    const note = s.demo.notes?.[`${path}|unhandled`] ?? "run code";
    // The library runs every hook of a drop before its listeners, so the first hook to run names the event.
    wrapped.unhandled = (ctx, event, m) => {
      nameDrop(s, event);
      emit(s, "action", `${describe(path)}: unhandled hook: ${note}`);
      unhandled(ctx, specEvent(s, event), proxyOf(s, m));
    };
  }

  // The root has no box on the diagram, so its own entry and exit stay silent.
  if (path === "") return wrapped;

  const enter = config.enter;
  wrapped.enter = (ctx, m) => {
    const parent = parentPath(path);
    const above = s.configs.get(parent) as State;
    const withParent = parent === "" ? s.starting : s.entered.has(parent);
    // Read from the parent's own restoreDepth: an ancestor's key that reaches this far down, and
    // a move that names the child, are not told apart from it.
    let how = "";
    if (above.type === "parallel") {
      how = " (region)";
    } else if (withParent && above.restoreDepth !== undefined && s.lastChild.get(parent) === path) {
      how = " (remembered child)";
    } else if (withParent && above.initial === path) {
      how = " (initial child)";
    }
    s.clocks.set(path, 0);
    for (const entry of after.entries) s.held.delete(entry.chip);
    s.entries.set(path, (s.entries.get(path) ?? 0) + 1);
    s.entered.add(path);
    emit(s, "enter", `enter ${path}${how}`);
    enter?.(ctx, proxyOf(s, m));
  };

  const exit = config.exit;
  wrapped.exit = (ctx, m) => {
    s.lastChild.set(parentPath(path), path);
    if (s.routine?.path === path) s.routine = undefined;
    emit(s, "exit", `exit ${path}`);
    exit?.(ctx, proxyOf(s, m));
  };

  const task = config.task;
  if (task !== undefined) {
    const isRoutine = s.demo.routines?.[path] !== undefined;
    wrapped.task = (ctx, finish, m) => {
      const entry = s.entries.get(path);
      const proxy = proxyOf(s, m);
      emit(s, "note", `${path}: task started`);
      if (isRoutine) {
        s.routine = { path, step: 0 };
        fire(s, stepChip(path, 0));
      }
      const cleanup = task(
        ctx,
        (event) => {
          if (s.entries.get(path) !== entry || !proxy.matches(path)) {
            emit(s, "drop", `late finish(${event.type}) ignored: ${path} was already left`);
            finish(event);
            return;
          }
          emit(s, "note", `${path}: finish(${event.type})`);
          if (s.depth > 0) {
            finish(event);
            return;
          }
          fromOutside(s, () => finish(event));
        },
        proxy,
      );
      if (typeof cleanup !== "function") return cleanup;
      // The library calls this after the state's `exit` hook, so the line follows the exit line.
      return () => {
        emit(s, "note", `${path}: task cleanup ran`);
        cleanup();
      };
    };
  }

  return wrapped;
}

/** Runs one call into the machine from outside it, then reports the sends a stop dropped. */
function fromOutside(s: Session, body: () => void): void {
  scope = s;
  const wasStopped = isStopped(s);
  if (s.depth === 0) {
    s.pending.clear();
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
  if (stopped) {
    // One call can send an object more than once, so each entry is the machine's object for a single send.
    for (const dropped of s.pending) emit(s, "drop", `stop() dropped ${dropped.type}`);
  }
  s.pending.clear();
  if (stopped && !wasStopped) emit(s, "note", "stopped, path = undefined");
}

function sendFromOutside(s: Session, event: EventObject): void {
  const instance = s.instance as Instance;
  if (isStopped(s)) {
    emit(s, "drop", `${event.type} ignored: machine is stopped`);
    instance.send(event);
    return;
  }
  emit(s, "event", `send ${describeEvent(event)}`);
  for (const top of activeChildren("", instance.leaves)) {
    narrateOffer(s, top, event.type, instance.leaves);
  }
  fromOutside(s, () => instance.send(track(s, event)));
}

/**
 * Narrates the offer of an event type to the state at `path` as the library makes it: to every
 * active child first, then to the state itself unless a child has a rule for the type. Returns
 * whether a state at or below `path` has one.
 */
function narrateOffer(s: Session, path: string, type: string, leaves: readonly string[]): boolean {
  let below = false;
  for (const child of activeChildren(path, leaves)) {
    if (narrateOffer(s, child, type, leaves)) below = true;
  }
  if (below) return true;
  const on = s.configs.get(path)?.on as Record<string, unknown> | undefined;
  if (on?.[type] !== undefined) return true;
  const region = s.configs.get(parentPath(path))?.type === "parallel";
  const next = region ? "so its region does not take it" : "asks its parent";
  emit(s, "bubble", `${path} has no ${type} rule, ${next}`);
  return false;
}

/** The delay a timer chip counts: the number written, or what its function returned for the stay its state is in. */
function chipDelay(s: Session, chip: string): number | undefined {
  const timer = s.timers.get(chip);
  if (timer === undefined) return undefined;
  if (timer.delay !== undefined) return timer.delay;
  return s.instance?.matches(timer.path) ? s.delays.get(chip) : undefined;
}

function chipProgress(s: Session, chip: string): number {
  const timer = s.timers.get(chip);
  const delay = chipDelay(s, chip);
  if (timer === undefined || delay === undefined || !s.instance?.matches(timer.path)) return 0;
  const clock = s.clocks.get(timer.path) ?? 0;
  if (timer.key === "every") return (clock % delay) / delay;
  // A delay of zero is due the moment the state is entered.
  return delay > 0 ? Math.min(1, clock / delay) : 1;
}

// The demo configs are typed per spec; at this point every demo is the erased `Demo`.
const define = defineMachine<DemoCtx, EventObject, string>() as unknown as (
  config: MachineConfig<DemoCtx, EventObject, string>,
) => Machine<DemoCtx, EventObject, string, string>;

export function startDemo(
  demo: Demo,
  trace: Trace,
  ctxOverride?: Partial<DemoCtx>,
  from: StartFrom = {},
): DemoRun {
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
    pending: new Set(),
    dropNamed: false,
    origins: new WeakMap(),
    entered: new Set(),
    clocks: new Map(),
    entries: new Map(),
    lastChild: new Map(),
    timers: new Map(),
    delays: new Map(),
    held: new Set(),
    waits: [],
    routine: undefined,
    saved: from.saved,
  };
  // `timer` is declared as a namespace, which has no assignable type.
  (globalThis as unknown as { timer: typeof imitatedTimer }).timer = imitatedTimer;
  const machine = define(
    wrapState(s, demo.config, "") as MachineConfig<DemoCtx, EventObject, string>,
  );
  if (ctxOverride !== undefined) emit(s, "note", `start(${describeFields(ctxOverride)})`);
  const at = from.at;
  if (at !== undefined) emit(s, "note", `start(ctx, ${JSON.stringify(at)})`);
  s.starting = true;
  fromOutside(s, () => adopt(s, machine.start(s.ctx, at)));
  s.starting = false;
  const instance = s.instance as unknown as Instance;
  emit(s, "note", `start() returned, path = ${describePath(instance.path)}`);
  // A muted run prints nothing, which keeps the stop of a quiet restart out of the list.
  demo.script?.(proxyOf(s, instance), (line) => emit(s, "heard", line));

  const run: DemoRun = {
    demo,
    instance,
    ctx: s.ctx,
    get path() {
      return instance.path;
    },
    get leaves() {
      return instance.leaves;
    },
    get saved() {
      return s.saved;
    },
    get stopped() {
      return isStopped(s);
    },
    matches: (path) => instance.matches(path),
    hasTag: (tag) => instance.hasTag(tag),
    can: (event) => canTake(run, event),
    clock: (path) => (instance.matches(path) ? (s.clocks.get(path) ?? 0) : 0),
    progress: (chip) => chipProgress(s, chip),
    delayOf: (chip) => chipDelay(s, chip),
    waiting: (chip) => s.held.has(chip) && instance.matches(s.timers.get(chip)?.path ?? ""),
    routine: (path) => routineOf(s, path),
  };
  sessions.set(run, s);
  return run;
}

export function send(run: DemoRun, event: EventObject): void {
  sendFromOutside(sessionOf(run), event);
}

/** Whether an active state would take `event` now. The trace is muted while the library's `can` runs, so a `when` that says no adds no log line. */
export function canTake(run: DemoRun, event: EventObject): boolean {
  const s = sessionOf(run);
  const muted = s.muted;
  s.muted = true;
  try {
    return run.instance.can(event);
  } finally {
    s.muted = muted;
  }
}

/** Whether the button sends an event the machine would take now; false for a button that sends none. */
export function takes(run: DemoRun, button: DemoButton): boolean {
  return "event" in button && canTake(run, button.event);
}

/** How the figure answers a press, asked before the press; `undefined` for a button that sends no event. */
export function reactionTo(run: DemoRun, button: DemoButton): BuddyReaction | undefined {
  if (!("event" in button)) return undefined;
  if (!canTake(run, button.event)) return "ignored";
  return button.event.type === "BUMP" ? "bump" : "hop";
}

/**
 * Advances a demo by `dt` seconds: the imitated Defold work first, then the waits of the
 * imitated timer, then the machine's `update`.
 */
export function step(run: DemoRun, dt: number): void {
  const s = sessionOf(run);
  if (isStopped(s)) return;
  s.demo.tick?.(s.ctx, dt);
  if (isStopped(s)) return;
  advanceWaits(s, dt);
  if (isStopped(s)) return;
  const instance = s.instance as Instance;
  // The library updates `leaves` in place, so the active states are listed before the update.
  const before = activeStates(instance.leaves);
  fromOutside(s, () => instance.update(dt));
  // The library adds dt to every active state's clock before the hooks run, hook move
  // or not; a state entered during this update starts from zero.
  for (const path of before) {
    if (!s.entered.has(path)) s.clocks.set(path, (s.clocks.get(path) ?? 0) + dt);
  }
}

/** Stops a demo from outside the machine, as a script's `final` does, and narrates the exits. */
export function stop(run: DemoRun): void {
  const s = sessionOf(run);
  if (isStopped(s)) return;
  emit(s, "event", "stop()");
  fromOutside(s, () => run.instance.stop());
}

/** Stops a run that will not be used again and lets go of it. */
export function discard(run: DemoRun): void {
  stop(run);
  scope = undefined;
}

/**
 * Presses a demo button: sends its event, changes the world, stops the
 * machine, keeps a copy of its `leaves`, or stops this machine quietly and
 * starts a fresh one, at the kept paths for a `startSaved` button. Returns the
 * run to use from now on.
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
  if ("stop" in button) {
    stop(run);
    return run;
  }
  if ("save" in button) {
    const s = sessionOf(run);
    // The library changes `leaves` in place, so the save is a copy, as the page's `[...]` is.
    const saved = [...run.leaves];
    s.saved = saved;
    emit(s, "note", `saved leaves: ${saved.join(", ")}`);
    return run;
  }
  if ("startSaved" in button) return startOver(run, undefined, true);
  return restart(run, button.restartWith);
}

/** Stops this machine without narrating it and starts a fresh one on the same trace. */
export function restart(run: DemoRun, ctxOverride?: Partial<DemoCtx>): DemoRun {
  return startOver(run, ctxOverride, false);
}

/** A restart that hands the diagram's save to the new run, which starts at it when `atSaved`. */
function startOver(
  run: DemoRun,
  ctxOverride: Partial<DemoCtx> | undefined,
  atSaved: boolean,
): DemoRun {
  const s = sessionOf(run);
  s.muted = true;
  run.instance.stop();
  const saved = s.saved;
  // Nothing saved is no list at all, as the page's `save.at` is `undefined` with no save file.
  if (saved === undefined) return startDemo(s.demo, s.trace, ctxOverride);
  return startDemo(s.demo, s.trace, ctxOverride, atSaved ? { saved, at: saved } : { saved });
}

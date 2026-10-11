import type { StateConfig } from "@defold-typescript/hsm";
import {
  type BuddyReaction,
  DEMOS,
  type Demo,
  type DemoButton,
  type DemoCtx,
  type DemoVisual,
} from "./demos";
import { BUDDY_SVG, figureClass, figureLabel, reactionClass } from "./figure";
import {
  type DemoRun,
  describePath,
  discard,
  press,
  reactionTo,
  restart,
  startDemo,
  stateChips,
  step,
  type TraceEntry,
  takes,
} from "./instrument";

/**
 * Builds the live diagrams in place of each `[data-hsm-demo]` placeholder and
 * drives each timed one from an animation-frame loop of its own. Loaded only
 * on a page that places a demo.
 */

type State = StateConfig<DemoCtx, { readonly type: string }>;

const LOG_CAP = 120;
const FLASH_MS = 650;
const REACT_MS = 600;
const MAX_FRAME_SECONDS = 0.1;
const SPEEDS: readonly (readonly [number, string])[] = [
  [1, "Normal speed"],
  [0.5, "Half speed"],
  [0.25, "Quarter speed"],
  [0.1, "Very slow"],
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function span(className: string, text: string): HTMLSpanElement {
  return el("span", className, text);
}

// A quiet `update` hook has no rule line to show it, so it is named with the other hooks.
function hookList(config: State, quietUpdate: boolean): string | undefined {
  const hooks = (["enter", "exit", "task", "update"] as const).filter(
    (key) => config[key] !== undefined && (key !== "update" || quietUpdate),
  );
  if (hooks.length === 0) return undefined;
  const last = hooks[hooks.length - 1] as string;
  const named = hooks.length === 1 ? last : `${hooks.slice(0, -1).join(", ")} and ${last}`;
  return `has ${named} ${hooks.length === 1 ? "hook" : "hooks"}`;
}

interface Chip {
  readonly element: HTMLLIElement;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** An `after` or `every` line: its bar, and the parts that change while the machine runs. */
interface TimerBar {
  readonly id: string;
  readonly key: "after" | "every";
  readonly element: HTMLLIElement;
  readonly label: HTMLSpanElement;
  /** What the label reads while a delay function has no value for the current stay. */
  readonly unread: string;
  readonly bar: HTMLSpanElement;
  text: string;
  waiting: boolean;
  width: string;
}

/** One step of a routine: its mark and the bar of the wait it is in. */
interface StepLine {
  readonly path: string;
  readonly index: number;
  readonly element: HTMLLIElement;
  readonly bar: HTMLSpanElement;
  on: boolean;
  width: string;
}

interface ReadoutLine {
  readonly key: string;
  readonly value: HTMLSpanElement;
}

function setClass(node: HTMLElement, value: string) {
  if (node.className !== value) node.className = value;
}

function setLabel(node: HTMLElement, value: string) {
  if (node.getAttribute("aria-label") !== value) node.setAttribute("aria-label", value);
}

interface Mounted {
  readonly frame: (dt: number) => void;
  readonly dispose: () => void;
}

function mountDemo(host: HTMLElement, demo: Demo): Mounted {
  const boxes = new Map<string, HTMLElement>();
  const chips = new Map<string, Chip>();
  const bars: TimerBar[] = [];
  const steps: StepLine[] = [];
  let dirty = true;
  let playing = !demo.paused;
  let speed = demo.speed ?? 1;

  const log = el("ol", "hsm-log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-label", "What the machine did");
  const readout = el("div", "hsm-readout");
  const visual = demo.visual ? el("div", "hsm-visual") : undefined;

  const trace = (entry: TraceEntry) => {
    // A used chip counts too: a routine step that starts in a promise continuation logs no line.
    dirty = true;
    if (entry.kind === "fire") {
      flash(entry.chip);
      return;
    }
    log.append(el("li", `hsm-l-${entry.kind}`, entry.text));
    while (log.childElementCount > LOG_CAP) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  };

  function flash(id: string) {
    const chip = chips.get(id);
    if (chip === undefined) return;
    chip.element.classList.remove("hsm-flash");
    void chip.element.offsetWidth;
    chip.element.classList.add("hsm-flash");
    clearTimeout(chip.timer);
    chip.timer = setTimeout(() => chip.element.classList.remove("hsm-flash"), FLASH_MS);
  }

  let reaction: string | undefined;
  let reactionTimer: ReturnType<typeof setTimeout> | undefined;

  // The class goes on the element around the figure: every refresh rewrites the figure's own.
  function react(next: BuddyReaction) {
    if (visual === undefined) return;
    if (reaction !== undefined) visual.classList.remove(reaction);
    void visual.offsetWidth;
    reaction = reactionClass(next);
    visual.classList.add(reaction);
    clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => {
      if (reaction !== undefined) visual.classList.remove(reaction);
      reaction = undefined;
    }, REACT_MS);
  }

  function addChip(rules: HTMLUListElement, id: string, parts: (string | Node)[]) {
    const element = el("li", "hsm-rule");
    element.append(...parts);
    rules.append(element);
    chips.set(id, { element, timer: undefined });
    return element;
  }

  function renderState(name: string, config: State, path: string, parent: State): HTMLElement {
    const parallel = config.type === "parallel";
    const region = parent.type === "parallel";
    const classes = ["hsm-state"];
    if (config.states) classes.push("hsm-compound");
    if (parallel) classes.push("hsm-parallel");
    if (region) classes.push("hsm-region");
    const box = el("div", classes.join(" "));
    boxes.set(path, box);
    const title = el("div", "hsm-state-name", name);
    if (parent.initial === path) title.append(" ", span("hsm-init", "starts here"));
    if (region) title.append(" ", span("hsm-init", "region"));
    for (const tag of config.tags ?? []) title.append(" ", span("hsm-tag", tag));
    box.append(title);

    const rules = el("ul", "hsm-rules");
    const routine = el("ol", "hsm-steps");
    const note = (id: string) => demo.notes?.[id];
    const quietUpdate = demo.quietUpdates?.includes(path) ?? false;
    for (const chip of stateChips(config, path, quietUpdate, demo.routines?.[path])) {
      if (chip.kind === "step") {
        const element = el("li", "hsm-step", chip.label);
        const bar = span("hsm-bar", "");
        element.append(bar);
        routine.append(element);
        chips.set(chip.id, { element, timer: undefined });
        steps.push({ path, index: chip.index, element, bar, on: false, width: "" });
      } else if (chip.kind === "on") {
        const parts: (string | Node)[] = [
          span("hsm-ev", chip.type),
          ` → ${chip.to ?? "stay here"}`,
        ];
        if (chip.to === path) parts.push(" ", span("hsm-why", "(restart)"));
        const why = note(chip.id);
        if (why) parts.push(" ", span("hsm-why", why));
        addChip(rules, chip.id, parts);
      } else if (chip.kind === "always") {
        const parts: (string | Node)[] = [span("hsm-ev", "at once"), ` → ${chip.to}`];
        const why = note(chip.id);
        if (why) parts.push(" ", span("hsm-why", why));
        addChip(rules, chip.id, parts);
      } else if (chip.kind === "update") {
        addChip(rules, chip.id, [
          span("hsm-ev", "every frame"),
          " ",
          span("hsm-why", note(chip.id) ?? "update hook"),
        ]);
      } else {
        // A delay that is a function has no value until its state is entered.
        const unread = `${chip.kind} ${note(`${chip.id}|delay`) ?? "? s"}`;
        const text = chip.delay === undefined ? unread : `${chip.kind} ${chip.delay} s`;
        const label = span("hsm-ev", text);
        const parts: (string | Node)[] = [label];
        if (chip.kind === "after") parts.push(` → ${chip.to ?? "stay here"}`);
        const why = note(chip.id);
        if (why) parts.push(" ", span("hsm-why", why));
        if (chip.kind === "after") parts.push(" ", span("hsm-wait-mark", "waiting"));
        const bar = span("hsm-bar", "");
        parts.push(bar);
        const element = addChip(rules, chip.id, parts);
        bars.push({
          id: chip.id,
          key: chip.kind,
          element,
          label,
          unread,
          bar,
          text,
          waiting: false,
          width: "",
        });
      }
    }
    if (rules.childElementCount > 0) box.append(rules);
    if (routine.childElementCount > 0) box.append(routine);

    const hooks = hookList(config, quietUpdate);
    if (hooks) box.append(el("div", "hsm-hooks", hooks));
    if (config.restoreDepth !== undefined) {
      box.append(el("div", "hsm-hooks", "remembers its last child"));
    }
    if (parallel) box.append(el("div", "hsm-hooks", "keeps every region active"));

    if (config.states) {
      const kids = el("div", parallel ? "hsm-level hsm-kids hsm-regions" : "hsm-level hsm-kids");
      for (const [childName, child] of Object.entries(config.states)) {
        kids.append(renderState(childName, child, `${path}/${childName}`, config));
      }
      box.append(kids);
    }
    return box;
  }

  const root = demo.config as State;
  const level = el("div", "hsm-level");
  for (const [name, child] of Object.entries(root.states ?? {})) {
    level.append(renderState(name, child, `/${name}`, root));
  }
  const diagram = el("div", "hsm-diagram");
  const legend = el("div", "hsm-legend");
  legend.append(
    el("i"),
    "Glowing boxes are active. A rule lights up when it's used. A filled button is an event the machine takes right now.",
  );
  diagram.append(level, legend);

  let run: DemoRun = startDemo(demo, trace);

  function clearLog() {
    log.replaceChildren();
  }

  function button(label: string, ghost: boolean, onClick: () => void): HTMLButtonElement {
    const node = el("button", ghost ? "hsm-button hsm-ghost" : "hsm-button", label);
    node.type = "button";
    node.addEventListener("click", () => {
      onClick();
      refresh();
    });
    return node;
  }

  function pressButton(spec: DemoButton) {
    if ("restartWith" in spec) clearLog();
    const answer = reactionTo(run, spec);
    run = press(run, spec);
    if (answer !== undefined) react(answer);
    dirty = true;
  }

  const side = el("div", "hsm-side");
  if (visual) side.append(visual);
  const buttons = el("div", "hsm-buttons");
  const eventButtons: { readonly spec: DemoButton; readonly node: HTMLButtonElement }[] = [];
  for (const spec of demo.buttons) {
    const node = button(spec.label, !("event" in spec), () => pressButton(spec));
    if ("event" in spec) eventButtons.push({ spec, node });
    buttons.append(node);
  }
  const group = el("div");
  group.append(el("div", "hsm-group-label", demo.buttonsLabel ?? "Send an event"), buttons);
  side.append(group);

  if (demo.timed) {
    const pauseLabel = () => (playing ? "Pause time" : "Resume time");
    const pause = button(pauseLabel(), true, () => {
      playing = !playing;
      pause.textContent = pauseLabel();
    });
    const select = el("select", "hsm-speed");
    select.setAttribute("aria-label", "Speed");
    for (const [value, label] of SPEEDS) {
      const option = el("option", undefined, label);
      option.value = String(value);
      option.selected = value === speed;
      select.append(option);
    }
    select.addEventListener("change", () => {
      speed = Number(select.value);
    });
    const clock = el("div", "hsm-clock");
    clock.append(pause, select);
    side.append(clock);
  }

  const restartRow = el("div", "hsm-buttons");
  restartRow.append(
    button("Restart machine", true, () => {
      clearLog();
      run = restart(run);
      dirty = true;
    }),
  );
  side.append(readout, log, restartRow);

  const head = el("div", "hsm-head");
  head.append(el("div", "hsm-title", demo.title), el("p", "hsm-subtitle", demo.subtitle));
  const body = el("div", "hsm-body");
  body.append(diagram, side);
  const frame = el("div", "hsm-demo not-prose");
  frame.append(head, body);
  host.replaceChildren(frame);

  let figure: HTMLElement | undefined;

  function patchVisual(target: HTMLElement, spec: DemoVisual) {
    if (figure === undefined) {
      figure = el("div");
      figure.setAttribute("role", "img");
      figure.innerHTML = BUDDY_SVG;
      target.append(figure);
    }
    setClass(figure, figureClass(spec));
    setLabel(figure, figureLabel(spec));
  }

  let lines: ReadoutLine[] = [];

  function updateReadout() {
    const entries = [["path", describePath(run.path)] as const, ...demo.readout(run)];
    const sameKeys =
      entries.length === lines.length && entries.every(([key], i) => lines[i]?.key === key);
    if (!sameKeys) {
      lines = entries.map(([key, value]) => ({ key, value: span("hsm-v", value) }));
      readout.replaceChildren(
        ...lines.map(({ key, value }) => {
          const line = el("div");
          line.append(span("hsm-k", key), " ", value);
          return line;
        }),
      );
      return;
    }
    entries.forEach(([, value], i) => {
      const line = lines[i];
      if (line && line.value.textContent !== value) line.value.textContent = value;
    });
  }

  function refresh() {
    for (const [path, box] of boxes) box.classList.toggle("hsm-on", run.matches(path));
    for (const { spec, node } of eventButtons) node.classList.toggle("hsm-can", takes(run, spec));
    updateReadout();
    if (visual && demo.visual) patchVisual(visual, demo.visual(run));
    updateBars();
    updateSteps();
    dirty = false;
  }

  // Each part is written only when it changes: an idle demo leaves its DOM alone.
  function updateBars() {
    for (const timer of bars) {
      const delay = run.delayOf(timer.id);
      const text = delay === undefined ? timer.unread : `${timer.key} ${delay} s`;
      if (text !== timer.text) {
        timer.label.textContent = text;
        timer.text = text;
      }
      const waiting = run.waiting(timer.id);
      if (waiting !== timer.waiting) {
        timer.element.classList.toggle("hsm-wait", waiting);
        timer.waiting = waiting;
      }
      const width = `${run.progress(timer.id) * 100}%`;
      if (width !== timer.width) {
        timer.bar.style.width = width;
        timer.width = width;
      }
    }
  }

  // The step a routine is in is marked, and its bar is the wait it is in; every other bar is empty.
  function updateSteps() {
    for (const line of steps) {
      const routine = run.routine(line.path);
      const progress = routine?.step === line.index ? routine.progress : undefined;
      const on = progress !== undefined;
      if (on !== line.on) {
        line.element.classList.toggle("hsm-step-on", on);
        line.on = on;
      }
      const width = `${(progress ?? 0) * 100}%`;
      if (width !== line.width) {
        line.bar.style.width = width;
        line.width = width;
      }
    }
  }

  refresh();

  return {
    frame: (dt) => {
      if (demo.timed && playing && !run.stopped && dt > 0) {
        step(run, dt * speed);
        dirty = true;
      }
      if (dirty) refresh();
    },
    dispose: () => {
      // A routine left waiting keeps its run, and the run keeps this diagram.
      discard(run);
      for (const chip of chips.values()) clearTimeout(chip.timer);
      clearTimeout(reactionTimer);
      host.replaceChildren();
    },
  };
}

/**
 * Mounts every placeholder that names a known demo; returns a function that stops the diagrams
 * and their runs.
 */
export function mountDemos(
  hosts: Iterable<HTMLElement>,
  demos: Readonly<Record<string, Demo>> = DEMOS,
): () => void {
  const mounted = new Map<Element, { readonly demo: Mounted; visible: boolean; handle: number }>();
  for (const host of hosts) {
    const id = host.dataset.hsmDemo;
    const demo = id !== undefined && Object.hasOwn(demos, id) ? demos[id] : undefined;
    if (demo !== undefined) {
      mounted.set(host, { demo: mountDemo(host, demo), visible: false, handle: 0 });
    }
  }
  // Only demos on screen advance: the reader cannot see the others, and their
  // per-frame writes make WebKit pull the page back mid-scroll.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const item = mounted.get(entry.target);
      if (item) item.visible = entry.isIntersecting;
    }
  });
  for (const host of mounted.keys()) observer.observe(host);
  // Each demo steps in a callback of its own. A routine goes on in a promise continuation, and
  // the browser runs those before the next callback, while the wait they file still belongs to
  // the demo that stepped.
  for (const item of mounted.values()) {
    let last: number | undefined;
    const beat = (now: number) => {
      const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
      last = now;
      if (item.visible) item.demo.frame(dt);
      item.handle = requestAnimationFrame(beat);
    };
    item.handle = requestAnimationFrame(beat);
  }
  return () => {
    observer.disconnect();
    for (const { demo, handle } of mounted.values()) {
      cancelAnimationFrame(handle);
      demo.dispose();
    }
  };
}

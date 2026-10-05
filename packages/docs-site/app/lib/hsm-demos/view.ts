import type { StateConfig } from "@defold-typescript/hsm";
import {
  DEMOS,
  type Demo,
  type DemoButton,
  type DemoCtx,
  type DemoId,
  type DemoVisual,
} from "./demos";
import {
  afterChip,
  afterDelays,
  type DemoRun,
  describePath,
  press,
  restart,
  ruleChip,
  ruleList,
  startDemo,
  step,
  type TraceEntry,
  updateChip,
} from "./instrument";

/**
 * Builds the live diagrams in place of each `[data-hsm-demo]` placeholder and
 * drives the timed ones from one shared animation-frame heartbeat. Loaded only
 * on a page that places a demo.
 */

type State = StateConfig<DemoCtx, { readonly type: string }>;

const LOG_CAP = 120;
const FLASH_MS = 650;
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

function hookList(config: State): string | undefined {
  const hooks = (["enter", "exit", "task"] as const).filter((key) => config[key] !== undefined);
  if (hooks.length === 0) return undefined;
  const last = hooks[hooks.length - 1] as string;
  const named = hooks.length === 1 ? last : `${hooks.slice(0, -1).join(", ")} and ${last}`;
  return `has ${named} ${hooks.length === 1 ? "hook" : "hooks"}`;
}

interface Chip {
  readonly element: HTMLLIElement;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface TimerBar {
  readonly path: string;
  readonly delay: number;
  readonly bar: HTMLSpanElement;
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
  let dirty = true;
  let playing = true;
  let speed = demo.speed ?? 1;

  const log = el("ol", "hsm-log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-label", "What the machine did");
  const readout = el("div", "hsm-readout");
  const visual = demo.visual ? el("div", "hsm-visual") : undefined;

  const trace = (entry: TraceEntry) => {
    if (entry.kind === "fire") {
      flash(entry.chip);
      return;
    }
    log.append(el("li", `hsm-l-${entry.kind}`, entry.text));
    while (log.childElementCount > LOG_CAP) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    dirty = true;
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

  function addChip(rules: HTMLUListElement, id: string, parts: (string | Node)[]) {
    const element = el("li", "hsm-rule");
    element.append(...parts);
    rules.append(element);
    chips.set(id, { element, timer: undefined });
    return element;
  }

  function renderState(name: string, config: State, path: string, parent: State): HTMLElement {
    const box = el("div", config.states ? "hsm-state hsm-compound" : "hsm-state");
    boxes.set(path, box);
    const title = el("div", "hsm-state-name", name);
    if (parent.initial === path) title.append(" ", span("hsm-init", "starts here"));
    box.append(title);

    const rules = el("ul", "hsm-rules");
    const note = (id: string) => demo.notes?.[id];
    for (const [type, spec] of Object.entries(config.on ?? {})) {
      ruleList(spec).forEach((rule, i) => {
        const id = ruleChip(path, type, i);
        const parts: (string | Node)[] = [span("hsm-ev", type), ` → ${rule.to ?? "stay here"}`];
        if (rule.to === path) parts.push(" ", span("hsm-why", "(restart)"));
        const why = note(id);
        if (why) parts.push(" ", span("hsm-why", why));
        addChip(rules, id, parts);
      });
    }
    if (config.update) {
      addChip(rules, updateChip(path), [
        span("hsm-ev", "every frame"),
        " ",
        span("hsm-why", note(updateChip(path)) ?? "update hook"),
      ]);
    }
    for (const delay of afterDelays(config)) {
      const target = (config.after as Record<number, string>)[delay] as string;
      const chip = addChip(rules, afterChip(path, delay), [
        span("hsm-ev", `after ${delay} s`),
        ` → ${target}`,
      ]);
      const bar = span("hsm-bar", "");
      chip.append(bar);
      bars.push({ path, delay, bar, width: "" });
    }
    if (rules.childElementCount > 0) box.append(rules);

    const hooks = hookList(config);
    if (hooks) box.append(el("div", "hsm-hooks", hooks));

    if (config.states) {
      const kids = el("div", "hsm-level hsm-kids");
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
  legend.append(el("i"), "Glowing boxes are active. A rule lights up when it's used.");
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
    run = press(run, spec);
    dirty = true;
  }

  const side = el("div", "hsm-side");
  if (visual) side.append(visual);
  const buttons = el("div", "hsm-buttons");
  for (const spec of demo.buttons) {
    buttons.append(button(spec.label, !("event" in spec), () => pressButton(spec)));
  }
  const group = el("div");
  group.append(el("div", "hsm-group-label", demo.buttonsLabel ?? "Send an event"), buttons);
  side.append(group);

  if (demo.timed) {
    const pause = button("Pause time", true, () => {
      playing = !playing;
      pause.textContent = playing ? "Pause time" : "Resume time";
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
  let pane: HTMLElement | undefined;
  let paneOpacity = "";

  function patchVisual(target: HTMLElement, spec: DemoVisual) {
    if (figure === undefined) {
      figure = el("div");
      figure.setAttribute("role", "img");
      if (spec.kind === "door") {
        pane = el("div", "hsm-door");
        figure.append(pane);
      }
      target.append(figure);
    }
    switch (spec.kind) {
      case "bulb":
        setClass(figure, spec.glow === "off" ? "hsm-bulb" : `hsm-bulb hsm-${spec.glow}`);
        setLabel(figure, `lamp ${spec.glow}`);
        return;
      case "sprite":
        setClass(figure, spec.shown ? "hsm-sprite" : "hsm-sprite hsm-hidden");
        setLabel(figure, spec.shown ? "sprite shown" : "sprite hidden");
        return;
      case "door": {
        setClass(figure, "hsm-doorframe");
        setLabel(figure, `door, ${Math.round(spec.opacity * 100)}% visible`);
        const opacity = spec.opacity.toFixed(2);
        if (pane && opacity !== paneOpacity) {
          pane.style.opacity = opacity;
          paneOpacity = opacity;
        }
        return;
      }
    }
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
    updateReadout();
    if (visual && demo.visual) patchVisual(visual, demo.visual(run));
    updateBars();
    dirty = false;
  }

  function updateBars() {
    for (const timer of bars) {
      const width = `${Math.min(100, (run.clock(timer.path) / timer.delay) * 100)}%`;
      if (width !== timer.width) {
        timer.bar.style.width = width;
        timer.width = width;
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
      for (const chip of chips.values()) clearTimeout(chip.timer);
      host.replaceChildren();
    },
  };
}

/** Mounts every placeholder that names a known demo; returns a function that stops them all. */
export function mountDemos(hosts: Iterable<HTMLElement>): () => void {
  const mounted = new Map<Element, { readonly demo: Mounted; visible: boolean }>();
  for (const host of hosts) {
    const id = host.dataset.hsmDemo;
    if (id !== undefined && Object.hasOwn(DEMOS, id)) {
      mounted.set(host, { demo: mountDemo(host, DEMOS[id as DemoId]), visible: false });
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
  let last: number | undefined;
  let handle = 0;
  const beat = (now: number) => {
    const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    for (const { demo, visible } of mounted.values()) if (visible) demo.frame(dt);
    handle = requestAnimationFrame(beat);
  };
  handle = requestAnimationFrame(beat);
  return () => {
    observer.disconnect();
    cancelAnimationFrame(handle);
    for (const { demo } of mounted.values()) demo.dispose();
  };
}

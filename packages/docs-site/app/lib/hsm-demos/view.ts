import type { StateConfig } from "@defold-typescript/hsm";
import caretIcon from "@phosphor-icons/core/bold/caret-down-bold.svg?raw";
import restartIcon from "@phosphor-icons/core/duotone/arrow-counter-clockwise-duotone.svg?raw";
import enterIcon from "@phosphor-icons/core/duotone/arrow-square-in-duotone.svg?raw";
import exitIcon from "@phosphor-icons/core/duotone/arrow-square-out-duotone.svg?raw";
import arrowIcon from "@phosphor-icons/core/duotone/arrow-square-right-duotone.svg?raw";
import reenterIcon from "@phosphor-icons/core/duotone/arrows-clockwise-duotone.svg?raw";
import historyIcon from "@phosphor-icons/core/duotone/clock-counter-clockwise-duotone.svg?raw";
import saveIcon from "@phosphor-icons/core/duotone/floppy-disk-duotone.svg?raw";
import loadIcon from "@phosphor-icons/core/duotone/folder-open-duotone.svg?raw";
import speedIcon from "@phosphor-icons/core/duotone/gauge-duotone.svg?raw";
import taskIcon from "@phosphor-icons/core/duotone/kanban-duotone.svg?raw";
import pauseIcon from "@phosphor-icons/core/duotone/pause-duotone.svg?raw";
import playIcon from "@phosphor-icons/core/duotone/play-duotone.svg?raw";
import startIcon from "@phosphor-icons/core/duotone/power-duotone.svg?raw";
import regionsIcon from "@phosphor-icons/core/duotone/square-split-horizontal-duotone.svg?raw";
import starIcon from "@phosphor-icons/core/duotone/star-duotone.svg?raw";
import stopIcon from "@phosphor-icons/core/duotone/stop-duotone.svg?raw";
import tagIcon from "@phosphor-icons/core/duotone/tag-duotone.svg?raw";
import { TOOLTIP_TRIGGER_SLOT } from "../../components/ui/tooltip";
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
 * drives each one from an animation-frame loop of its own. Loaded only
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

const HOOKS = ["enter", "exit", "task", "update", "unhandled"] as const;
type Hook = (typeof HOOKS)[number];

interface HookGlyph {
  readonly svg: string;
  /** What the tooltip says in place of "has <name> hook". */
  readonly words?: string;
  /** The class that gives the glyph a color of its own. */
  readonly tint?: string;
}

/** The hooks a box shows as a glyph by its state's name. Every other hook is named in words. */
const HOOK_GLYPHS: Partial<Record<Hook, HookGlyph>> = {
  enter: { svg: enterIcon },
  exit: { svg: exitIcon },
  task: {
    svg: taskIcon,
    words: "has a task: work that takes time and reports when it is done",
    tint: "hsm-task",
  },
};

// A quiet `update` hook has no rule line to show it, so it is named with the other hooks.
function hooksOf(config: State, quietUpdate: boolean): Hook[] {
  return HOOKS.filter((key) => config[key] !== undefined && (key !== "update" || quietUpdate));
}

function hookWords(hooks: readonly Hook[]): string {
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

type EventButton = Extract<DemoButton, { readonly event: unknown }>;
type CodeSwitch = Extract<DemoButton, { readonly change: unknown }>;

/** Machine time as a clock reads it: hours, minutes and seconds. */
export function clockText(seconds: number): string {
  // A sum of frame times falls just short of the second it has reached.
  const whole = Math.floor(seconds + 1e-6);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(Math.floor(whole / 3600))}:${two(Math.floor(whole / 60) % 60)}:${two(whole % 60)}`;
}

/** A Phosphor glyph beside a button's words, or in place of them. */
function icon(svg: string, className = "hsm-icon"): HTMLSpanElement {
  const node = el("span", className);
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = svg;
  return node;
}

/** A glyph that stands for words: a screen reader reads them in its place. */
function wordGlyph(svg: string, className: string, words: string): HTMLSpanElement {
  const node = icon(svg, className);
  node.removeAttribute("aria-hidden");
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", words);
  return node;
}

/** The arrow between a rule's trigger and where it leads, read out as "to". */
function arrow(): HTMLSpanElement {
  return wordGlyph(arrowIcon, "hsm-icon hsm-arrow", "to");
}

/** A mark shown as a glyph. Its words are the page's tooltip, reached by pointer or keyboard. */
function markGlyph(svg: string, words: string, tint?: string): HTMLSpanElement {
  const node = wordGlyph(svg, tint ? `hsm-icon hsm-mark ${tint}` : "hsm-icon hsm-mark", words);
  node.tabIndex = 0;
  nameGlyph(node, words);
  return node;
}

/** Names a button that is a glyph alone: for a screen reader, and in the page's tooltip. */
function nameGlyph(node: HTMLElement, words: string) {
  node.setAttribute("aria-label", words);
  tooltip(node, words);
}

/** Gives an element the page's tooltip. */
function tooltip(node: HTMLElement, words: string) {
  node.dataset.slot = TOOLTIP_TRIGGER_SLOT;
  node.dataset.tooltipContent = words;
}

function glyphOf(spec: DemoButton): string | undefined {
  if ("restartWith" in spec) return startIcon;
  if ("stop" in spec) return stopIcon;
  if ("save" in spec) return saveIcon;
  if ("startSaved" in spec) return loadIcon;
  return undefined;
}

/**
 * A menu drawn over the page, after shadcn/ui's DropdownMenu: it opens under the button that
 * was pressed, and the arrow keys walk its items.
 */
interface Menu {
  readonly element: HTMLDivElement;
  /** The button the menu is open under; `undefined` while it is closed. */
  opener: HTMLButtonElement | undefined;
}

const MENU_GAP = 4;
const MENU_EDGE = 8;
const MENU_KEYS: Readonly<Record<string, (at: number, count: number) => number>> = {
  ArrowDown: (at, count) => (at + 1) % count,
  ArrowUp: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_at, count) => count - 1,
};

/** `closed` runs when the menu closes, whoever closed it. */
function createMenu(closed: () => void = () => {}): Menu {
  const element = el("div", "hsm-menu");
  element.setAttribute("popover", "auto");
  element.setAttribute("role", "menu");
  const menu: Menu = { element, opener: undefined };
  // The browser closes the menu on Escape and on a press outside it, with no call from here.
  element.addEventListener("beforetoggle", (event) => {
    if ((event as ToggleEvent).newState !== "closed") return;
    menu.opener?.setAttribute("aria-expanded", "false");
    menu.opener = undefined;
    closed();
  });
  element.addEventListener("keydown", (event) => {
    const move = MENU_KEYS[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const items = Array.from(element.querySelectorAll("button"));
    items[move(items.indexOf(document.activeElement as HTMLButtonElement), items.length)]?.focus();
  });
  return menu;
}

function openMenu(menu: Menu, opener: HTMLButtonElement) {
  // One menu may serve several buttons, so it may be open under another of them.
  if (menu.opener === undefined) menu.element.showPopover();
  else menu.opener.setAttribute("aria-expanded", "false");
  menu.opener = opener;
  opener.setAttribute("aria-expanded", "true");
  // The menu is placed on the page, not on the screen, so that it scrolls with its button.
  const at = opener.getBoundingClientRect();
  const room = document.documentElement.clientWidth - menu.element.offsetWidth - MENU_EDGE;
  const left = Math.max(MENU_EDGE, Math.min(at.left, room));
  menu.element.style.left = `${left + window.scrollX}px`;
  menu.element.style.top = `${at.bottom + MENU_GAP + window.scrollY}px`;
  const items = Array.from(menu.element.querySelectorAll("button"));
  (items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
}

/** Makes `opener` a button of `menu`: a press opens the menu under it, or closes it there. */
function opens(opener: HTMLButtonElement, menu: Menu, opened: () => void = () => {}) {
  opener.addEventListener("click", (event) => {
    // The browser would toggle the menu by itself, before it has been placed.
    event.preventDefault();
    if (menu.opener === opener) {
      menu.element.hidePopover();
      return;
    }
    openMenu(menu, opener);
    opened();
  });
  // To the browser, a press on a menu's own button is not a press outside the menu.
  opener.popoverTargetElement = menu.element;
  opener.setAttribute("aria-haspopup", "menu");
  opener.setAttribute("aria-expanded", "false");
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
  // The spec's buttons that send an event, by event, in the order the spec lists them.
  const senders = new Map<string, EventButton[]>();
  for (const spec of demo.buttons) {
    if (!("event" in spec)) continue;
    const list = senders.get(spec.event.type);
    if (list) list.push(spec);
    else senders.set(spec.event.type, [spec]);
  }
  // Each element that sends an event, with the buttons it stands for: a name with a menu stands for all of its menu's.
  const sendButtons: { readonly specs: readonly EventButton[]; readonly node: HTMLElement }[] = [];
  // Every event name the diagram draws, by event, whichever box it is in.
  const names = new Map<string, HTMLElement[]>();
  const menus = new Map<string, Menu>();
  let pointed: { readonly node: HTMLElement; readonly type: string } | undefined;
  let focused: string | undefined;
  let dirty = true;
  let playing = true;
  let speed = demo.speed ?? 1;
  // The time the machine has been given: it runs at the speed that is set and stands still
  // while the clock is paused or the machine is stopped.
  let elapsed = 0;

  const log = el("ol", "hsm-log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-label", "What the machine did");
  // What the spec's script printed. Only a spec with a script prints, so only it gets the list.
  const heard = demo.script === undefined ? undefined : el("ol", "hsm-heard");
  heard?.setAttribute("aria-live", "polite");
  heard?.setAttribute("aria-label", "What the listeners heard");
  const readout = el("div", "hsm-readout");
  const visual = demo.visual ? el("div", "hsm-visual") : undefined;

  const trace = (entry: TraceEntry) => {
    // A used chip counts too: a routine step that starts in a promise continuation logs no line.
    dirty = true;
    if (entry.kind === "fire") {
      flash(entry.chip);
      return;
    }
    const list = entry.kind === "heard" && heard !== undefined ? heard : log;
    list.append(el("li", `hsm-l-${entry.kind}`, entry.text));
    while (list.childElementCount > LOG_CAP) list.firstElementChild?.remove();
    list.scrollTop = list.scrollHeight;
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

  // An event is marked wherever it is named while one of its names is pointed at or reached
  // with the keyboard, or while its menu is open. The same name in a parent's box and in a
  // child's is the same event.
  function markSame() {
    for (const [type, nodes] of names) {
      const same =
        type === pointed?.type || type === focused || menus.get(type)?.opener !== undefined;
      for (const node of nodes) node.classList.toggle("hsm-same", same);
    }
  }

  function link(node: HTMLElement, type: string) {
    node.addEventListener("pointerenter", () => {
      pointed = { node, type };
      markSame();
    });
    node.addEventListener("pointerleave", () => {
      if (pointed?.node === node) pointed = undefined;
      markSame();
    });
    // A press focuses a name too, and a name that was only pressed is not marked for it.
    node.addEventListener("focus", () => {
      if (!node.matches(":focus-visible")) return;
      focused = type;
      markSame();
    });
    node.addEventListener("blur", () => {
      if (focused === type) focused = undefined;
      markSame();
    });
  }

  /** The buttons of one event, listed under whichever of its names was pressed. */
  function variantMenu(type: string, specs: readonly EventButton[]): Menu {
    const menu = createMenu(() => {
      // A hidden item is not left by the pointer, so it would stay pointed at.
      if (pointed !== undefined && menu.element.contains(pointed.node)) pointed = undefined;
      markSame();
    });
    for (const spec of specs) {
      const item = button("", "hsm-item", () => {
        menu.element.hidePopover();
        pressButton(spec);
      });
      item.setAttribute("role", "menuitem");
      item.append(span("hsm-item-name", spec.label));
      link(item, type);
      sendButtons.push({ specs: [spec], node: item });
      menu.element.append(item);
    }
    menus.set(type, menu);
    return menu;
  }

  function menuButton(type: string, specs: readonly EventButton[]): HTMLButtonElement {
    const menu = menus.get(type) ?? variantMenu(type, specs);
    const node = button(type, "hsm-ev hsm-name hsm-send hsm-pick", () => {});
    opens(node, menu, markSame);
    sendButtons.push({ specs, node });
    return node;
  }

  /**
   * An event's name in a rule line. A name that says all its one button sends is that button. A
   * name with several buttons, or with one that sends more than the name says, opens a menu of
   * them. An event with no button is one the machine sends itself, and its name is only a name.
   */
  function eventName(type: string): HTMLElement {
    const specs = senders.get(type) ?? [];
    const [only] = specs;
    let node: HTMLElement;
    if (only === undefined) {
      node = span("hsm-ev hsm-name", type);
    } else if (specs.length === 1 && only.label === type) {
      node = button(type, "hsm-ev hsm-name hsm-send", () => pressButton(only));
      sendButtons.push({ specs, node });
    } else {
      node = menuButton(type, specs);
    }
    link(node, type);
    const same = names.get(type);
    if (same) same.push(node);
    else names.set(type, [node]);
    return node;
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
    const quietUpdate = demo.quietUpdates?.includes(path) ?? false;
    const hooks = hooksOf(config, quietUpdate);
    const title = el("div", "hsm-state-name", name);
    // What a state is, has or does belongs to the state and not to a rule, so it sits by the name.
    if (parent.initial === path) {
      title.append(markGlyph(starIcon, "initial", "hsm-initial"));
    }
    for (const hook of hooks) {
      const glyph = HOOK_GLYPHS[hook];
      if (glyph === undefined) continue;
      title.append(markGlyph(glyph.svg, glyph.words ?? hookWords([hook]), glyph.tint));
    }
    if (config.restoreDepth !== undefined) {
      title.append(markGlyph(historyIcon, "remembers its last child"));
    }
    if (parallel) title.append(markGlyph(regionsIcon, "keeps every region active"));
    if (region) title.append(" ", span("hsm-init", "region"));
    for (const tag of config.tags ?? []) {
      const pill = el("span", "hsm-tag");
      pill.append(wordGlyph(tagIcon, "hsm-icon", "tag"), tag);
      pill.tabIndex = 0;
      tooltip(pill, `tag: hasTag("${tag}") is true while this state is active`);
      title.append(" ", pill);
    }
    box.append(title);

    const rules = el("ul", "hsm-rules");
    const routine = el("ol", "hsm-steps");
    const note = (id: string) => demo.notes?.[id];
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
          eventName(chip.type),
          " ",
          arrow(),
          ` ${chip.to ?? "stay here"}`,
        ];
        if (chip.to === path) parts.push(" ", markGlyph(reenterIcon, "restarts this state"));
        const why = note(chip.id);
        if (why) parts.push(" ", span("hsm-why", why));
        addChip(rules, chip.id, parts);
      } else if (chip.kind === "always") {
        const parts: (string | Node)[] = [span("hsm-ev", "at once"), " ", arrow(), ` ${chip.to}`];
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
        if (chip.kind === "after") parts.push(" ", arrow(), ` ${chip.to ?? "stay here"}`);
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

    const worded = hooks.filter((hook) => HOOK_GLYPHS[hook] === undefined);
    if (worded.length > 0) box.append(el("div", "hsm-hooks", hookWords(worded)));

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
  diagram.append(level, ...Array.from(menus.values(), (menu) => menu.element));

  let run: DemoRun = startDemo(demo, trace);

  /** A new machine starts with empty lists and its time at zero. */
  function startFresh() {
    log.replaceChildren();
    heard?.replaceChildren();
    elapsed = 0;
  }

  /** With a `glyph`, the words sit in an element of their own after it. */
  function button(
    label: string,
    className: string,
    onClick: (event: MouseEvent) => void,
    glyph?: string,
  ): HTMLButtonElement {
    const node = el("button", className, glyph === undefined ? label : undefined);
    if (glyph !== undefined) node.append(icon(glyph), span("hsm-label", label));
    node.type = "button";
    node.addEventListener("click", (event) => {
      onClick(event);
      refresh();
    });
    return node;
  }

  function pressButton(spec: DemoButton) {
    if ("restartWith" in spec || "startSaved" in spec) startFresh();
    const answer = reactionTo(run, spec);
    run = press(run, spec);
    if (answer !== undefined) react(answer);
    dirty = true;
  }

  // Everything that drives the machine from outside its diagram is in one row at the top: the
  // restart, the clock and the speeds that every diagram has, a rule, then a lesson's own buttons.
  const controls = el("div", "hsm-controls");
  // The restart is a glyph alone. Its words are its label, and the page's tooltip shows them.
  const restartButton = button("", "hsm-button hsm-square", () => {
    startFresh();
    run = restart(run);
    dirty = true;
  });
  restartButton.append(icon(restartIcon));
  nameGlyph(restartButton, "Restart machine");

  // The clock's button is a glyph alone too. Its name is what the next press does.
  const pauseGlyph = icon(pauseIcon);
  const pause = button("", "hsm-button hsm-square", () => {
    playing = !playing;
    showClock();
  });
  pause.append(pauseGlyph);
  function showClock() {
    pauseGlyph.innerHTML = playing ? pauseIcon : playIcon;
    nameGlyph(pause, playing ? "Pause time" : "Resume time");
  }
  showClock();
  const transport = el("div", "hsm-transport");

  // The speeds are a menu, and its button reads the speed that is set.
  const speedWords = span("hsm-label", "");
  const speedButton = button("", "hsm-button hsm-speed", () => {});
  speedButton.append(icon(speedIcon), speedWords, icon(caretIcon, "hsm-icon hsm-caret"));
  const speedMenu = createMenu();
  speedMenu.element.setAttribute("aria-label", "Speed");
  const speedItems = SPEEDS.map(([value, label]) => {
    const item = button(label, "hsm-item", () => {
      speed = value;
      speedMenu.element.hidePopover();
      showSpeed();
    });
    item.setAttribute("role", "menuitemradio");
    speedMenu.element.append(item);
    return { value, label, item };
  });
  function showSpeed() {
    for (const { value, item } of speedItems) {
      item.setAttribute("aria-checked", String(value === speed));
    }
    speedWords.textContent = speedItems.find(({ value }) => value === speed)?.label ?? "Speed";
  }
  showSpeed();
  opens(speedButton, speedMenu);
  // The machine's time sits on the row's lower edge, under the restart and the clock's button.
  const timer = el("div", "hsm-timer");
  timer.setAttribute("role", "timer");
  timer.setAttribute("aria-label", "Machine time");
  const timerText = document.createTextNode(clockText(0));
  timer.append(timerText);
  transport.append(restartButton, pause, speedButton, speedMenu.element, timer);
  controls.append(transport);

  // An event is sent from its name in the diagram. A button here does something else, or sends
  // an event that no box names.
  const others = demo.buttons.filter((spec) => !("event" in spec) || !names.has(spec.event.type));
  // A button that changes the code is a switch, and shows whether its piece of the code is in.
  const switches: { readonly spec: CodeSwitch; readonly node: HTMLButtonElement; on: boolean }[] =
    [];
  // The rule is drawn between the two parts, so a row with one part has none.
  const extras = el("div", "hsm-extras");
  for (const spec of others) {
    const flips = "change" in spec;
    const node = button(
      spec.label,
      flips ? "hsm-switch" : "hsm-button",
      () => pressButton(spec),
      glyphOf(spec),
    );
    if (flips) {
      node.setAttribute("role", "switch");
      node.setAttribute("aria-checked", "true");
      switches.push({ spec, node, on: true });
    }
    // A button's words say what it does, and its hint says what that means for the buddy.
    if (spec.hint !== undefined) {
      node.dataset.slot = TOOLTIP_TRIGGER_SLOT;
      node.dataset.tooltipContent = spec.hint;
    }
    extras.append(node);
  }
  if (others.length > 0) controls.append(extras);

  const side = el("div", "hsm-side");
  if (visual) side.append(visual);
  if (heard === undefined) {
    side.append(readout, log);
  } else {
    // The two lists stack: the side column is too narrow for two columns of paths.
    const captioned = (caption: string, list: HTMLElement) => {
      const part = el("div");
      part.append(el("div", "hsm-group-label", caption), list);
      return part;
    };
    side.append(
      readout,
      captioned("What the machine did", log),
      captioned("What the listeners heard", heard),
    );
  }

  const body = el("div", "hsm-body");
  body.append(diagram, side);
  const frame = el("div", "hsm-demo not-prose");
  frame.append(controls, body);
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
    const taken = new Set<EventButton>();
    for (const specs of senders.values()) {
      for (const spec of specs) if (takes(run, spec)) taken.add(spec);
    }
    for (const { specs, node } of sendButtons) {
      node.classList.toggle(
        "hsm-can",
        specs.some((spec) => taken.has(spec)),
      );
    }
    // A restart gives the machine fresh data, so a switch is read back and not kept from its press.
    for (const item of switches) {
      const on = item.spec.on(run.ctx);
      if (on === item.on) continue;
      item.node.setAttribute("aria-checked", String(on));
      item.on = on;
    }
    updateReadout();
    const time = clockText(elapsed);
    if (timerText.data !== time) timerText.data = time;
    // The time is lit while it runs: with the clock going and the machine not stopped.
    timer.classList.toggle("hsm-timer-on", playing && !run.stopped);
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
      if (playing && !run.stopped && dt > 0) {
        step(run, dt * speed);
        elapsed += dt * speed;
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

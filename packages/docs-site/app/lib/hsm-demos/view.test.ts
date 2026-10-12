import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sequence } from "@defold-typescript/hsm/async";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { TOOLTIP_TRIGGER_SLOT } from "../../components/ui/tooltip";
import type { Demo, DemoCtx, DemoSpec } from "./demos";
import { clockText, mountDemos } from "./view";

// Happy DOM has no popover. These stand in for the two calls the diagram makes: a shown menu
// carries `data-shown`, and a menu that is hidden says so first and lets go of the focus, as a
// browser's does.
function standInForPopover() {
  const element = HTMLElement.prototype as unknown as {
    showPopover: (this: HTMLElement) => void;
    hidePopover: (this: HTMLElement) => void;
  };
  element.showPopover = function () {
    this.setAttribute("data-shown", "");
  };
  element.hidePopover = function () {
    this.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState: "closed" }));
    this.removeAttribute("data-shown");
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.contains(active)) active.blur();
  };
}

beforeAll(() => {
  GlobalRegistrator.register();
  standInForPopover();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

// The spec is not on the tutorial page, and every DEMOS entry must be placed there, so it stays
// local to this file. Its wait is filed while the diagram is mounted.
const waiter: Demo = {
  config: {
    initial: "/hello",
    states: {
      hello: {
        task: sequence(async (_ctx, signal) => {
          await signal.wait(1);
        }),
      },
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

// A parallel state beside a compound one, to tell a region from an ordinary child.
const pair: Demo = {
  config: {
    initial: "/both",
    states: {
      both: {
        type: "parallel",
        states: {
          left: { initial: "/both/left/a", states: { a: {}, b: {} } },
          right: { initial: "/both/right/c", states: { c: {}, d: {} } },
        },
      },
      plain: { initial: "/plain/e", states: { e: {} } },
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

// A state with two tags beside one with none, to tell a tagged box from a plain one.
const tagged: Demo = {
  config: {
    initial: "/a",
    states: {
      a: { tags: ["busy", "loud"], on: { GO: "/b" } },
      b: {},
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

// A script that prints each move, to tell what it printed from the machine's own log.
const chatty: Demo = {
  config: {
    initial: "/a",
    states: {
      a: { on: { GO: "/b" } },
      b: {},
    },
  },
  ctx: () => ({}),
  buttons: [{ label: "GO", event: { type: "GO" } }],
  readout: () => [],
  script: (buddy, print) => {
    buddy.onMove((from, to) => print(`${from} to ${to}`));
  },
};

// A save button and a load button, to tell the run a load returns from the one it stopped.
const vault: Demo = {
  config: {
    initial: "/a",
    states: {
      a: { on: { GO: "/b" } },
      b: {},
    },
  },
  ctx: () => ({}),
  buttons: [
    { label: "GO", event: { type: "GO" } },
    { label: "save", save: true },
    { label: "load", startSaved: true },
  ],
  readout: (m) => [["saved", m.saved === undefined ? "none" : m.saved.join(", ")]],
};

// One event named in a parent's box, a child's and another state's, beside an event that only
// the parent takes and an event with no button, which the machine would send itself.
const layered: Demo = {
  config: {
    initial: "/off",
    states: {
      off: { on: { GO: "/on" } },
      on: {
        initial: "/on/a",
        on: { GO: "/off", HALT: "/off", DONE: "/off" },
        states: {
          a: { on: { GO: "/on/b" } },
          b: {},
        },
      },
    },
  },
  ctx: () => ({}),
  buttons: [
    { label: "GO", event: { type: "GO" } },
    { label: "HALT", event: { type: "HALT" } },
  ],
  readout: () => [],
};

type Push = { readonly type: "PUSH"; readonly force: number };

// One event with two buttons. `a` takes only the harder push, and `b` takes either.
const pushes: DemoSpec<DemoCtx, Push> = {
  config: {
    initial: "/a",
    states: {
      a: { on: { PUSH: { to: "/b", when: (_ctx, event) => event.force === 3 } } },
      b: { on: { PUSH: "/a" } },
    },
  },
  ctx: () => ({}),
  buttons: [
    { label: "PUSH (force 1)", event: { type: "PUSH", force: 1 } },
    { label: "PUSH (force 3)", event: { type: "PUSH", force: 3 } },
  ],
  readout: () => [],
};
const pushy = pushes as unknown as Demo;

// A rule on an event, one on a timer and one taken at once: every kind of line that leads somewhere.
const kinds: Demo = {
  config: {
    initial: "/a",
    states: {
      a: { on: { GO: "/b" }, after: { 1: "/b" } },
      b: { always: [{ to: "/c" }] },
      c: {},
    },
  },
  ctx: () => ({}),
  buttons: [{ label: "GO", event: { type: "GO" } }],
  readout: () => [],
};

// A state with an enter and an exit hook, one with two more hooks beside them, and one with none.
const hooked: Demo = {
  config: {
    initial: "/a",
    states: {
      a: { enter: () => {}, exit: () => {}, on: { GO: "/b" } },
      b: { enter: () => {}, exit: () => {}, task: () => {}, unhandled: () => {} },
      c: {},
    },
  },
  ctx: () => ({}),
  buttons: [{ label: "GO", event: { type: "GO" } }],
  readout: () => [],
};

// A state that remembers its child, whose child has a rule that names the child itself.
const returning: Demo = {
  config: {
    initial: "/keeps",
    states: {
      keeps: {
        restoreDepth: 1,
        initial: "/keeps/a",
        states: {
          a: { on: { AGAIN: "/keeps/a", ON: "/keeps/b" } },
          b: {},
        },
      },
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

// Happy DOM's observer reports no host on screen, so no frame steps the run.
function mount(spec: Demo) {
  const host = document.createElement("div");
  host.dataset.hsmDemo = "local";
  document.body.append(host);
  const dispose = mountDemos([host], { local: spec });
  const log = host.querySelector(".hsm-log") as HTMLElement;
  return { host, log, dispose };
}

/** The box of the state with that name; a name element may hold a mark such as "region" too. */
function box(host: HTMLElement, name: string): HTMLElement {
  const title = Array.from(host.querySelectorAll(".hsm-state-name")).find(
    (node) => node.firstChild?.textContent === name,
  );
  return title?.parentElement as HTMLElement;
}

function added(log: HTMLElement, from: number): (string | null)[] {
  return Array.from(log.children)
    .slice(from)
    .map((entry) => entry.textContent);
}

/** What a button is called: its label where it is a glyph alone, and its words otherwise. */
function nameOf(node: Element): string | null {
  return node.getAttribute("aria-label") ?? node.textContent;
}

function click(host: HTMLElement, label: string): void {
  const button = Array.from(host.querySelectorAll("button")).find(
    (node) => nameOf(node) === label,
  ) as HTMLButtonElement;
  button.click();
}

describe("the function mountDemos returns", () => {
  test("it discards a run that waits in a routine", () => {
    const { host, log, dispose } = mount(waiter);
    const mark = log.childElementCount;
    dispose();
    const lines = added(log, mark);
    expect(lines).toContain("/hello: task cleanup ran");
    expect(lines).toContain("timer.cancel: the 1 s wait was cancelled");
    expect(host.childElementCount).toBe(0);
    expect(() => timer.delay(1, false, () => {})).toThrow(
      "timer.delay was called with no demo running",
    );
  });

  test("a restarted diagram discards the run it has now", () => {
    const { host, log, dispose } = mount(waiter);
    click(host, "Restart machine");
    const mark = log.childElementCount;
    dispose();
    expect(added(log, mark)).toContain("timer.cancel: the 1 s wait was cancelled");
  });
});

describe("what a spec's script printed", () => {
  test("it is listed apart from the log, and starts over with the machine", () => {
    const { host, log, dispose } = mount(chatty);
    const heard = host.querySelector(".hsm-heard");
    expect(heard).not.toBeNull();
    const printed = () => added(heard as HTMLElement, 0);
    expect(printed()).toEqual([]);
    click(host, "GO");
    expect(printed()).toEqual(["/a to /b"]);
    expect(added(log, 0)).not.toContain("/a to /b");
    click(host, "Restart machine");
    expect(printed()).toEqual([]);
    dispose();
  });

  test("a spec with no script gets no second list", () => {
    const { host, dispose } = mount(tagged);
    expect(host.querySelector(".hsm-heard")).toBeNull();
    dispose();
  });
});

describe("a diagram's save and load buttons", () => {
  test("the readout follows the save, and a load starts the log over", () => {
    const { host, log, dispose } = mount(vault);
    click(host, "GO");
    click(host, "save");
    expect(host.querySelector(".hsm-readout")?.textContent).toContain("saved /b");
    click(host, "load");
    expect(log.firstElementChild?.textContent).toBe('start(ctx, ["/b"])');
    expect(box(host, "b").classList.contains("hsm-on")).toBe(true);
    expect(box(host, "a").classList.contains("hsm-on")).toBe(false);
    dispose();
  });
});

describe("a parallel state on the diagram", () => {
  test("its children are marked as regions, and an ordinary state's are not", () => {
    const { host, dispose } = mount(pair);
    expect(box(host, "left").parentElement?.classList.contains("hsm-regions")).toBe(true);
    expect(box(host, "left").classList.contains("hsm-region")).toBe(true);
    expect(box(host, "right").classList.contains("hsm-region")).toBe(true);
    expect(box(host, "e").parentElement?.classList.contains("hsm-regions")).toBe(false);
    expect(box(host, "e").classList.contains("hsm-region")).toBe(false);
    dispose();
  });

  test("every active state in every region glows", () => {
    const { host, dispose } = mount(pair);
    const glowing = (name: string) => box(host, name).classList.contains("hsm-on");
    expect(["both", "left", "right", "a", "c"].filter(glowing)).toEqual([
      "both",
      "left",
      "right",
      "a",
      "c",
    ]);
    expect(["b", "d", "plain", "e"].filter(glowing)).toEqual([]);
    dispose();
  });
});

describe("a state's tags on the diagram", () => {
  test("a box names the tags its state carries, in the order the config gives", () => {
    const { host, dispose } = mount(tagged);
    const tags = (name: string) =>
      Array.from(box(host, name).querySelectorAll(".hsm-tag")).map((node) => node.textContent);
    expect(tags("a")).toEqual(["busy", "loud"]);
    expect(tags("b")).toEqual([]);
    // A glyph ahead of the name says what the pill is, and adds nothing to its text.
    const glyphs = Array.from(box(host, "a").querySelectorAll(".hsm-tag > .hsm-icon"));
    expect(glyphs.map((node) => node.getAttribute("aria-label"))).toEqual(["tag", "tag"]);
    expect(glyphs.every((node) => node.querySelector("svg") !== null)).toBe(true);
    dispose();
  });

  test("a pill says what its tag means in the page's tooltip, by pointer or keyboard", () => {
    const { host, dispose } = mount(tagged);
    const pills = Array.from(box(host, "a").querySelectorAll<HTMLElement>(".hsm-tag"));
    expect(pills.map((node) => node.dataset.tooltipContent)).toEqual([
      'tag: hasTag("busy") is true while this state is active',
      'tag: hasTag("loud") is true while this state is active',
    ]);
    expect(pills.map((node) => [node.dataset.slot, node.tabIndex])).toEqual([
      [TOOLTIP_TRIGGER_SLOT, 0],
      [TOOLTIP_TRIGGER_SLOT, 0],
    ]);
    dispose();
  });
});

/** The name of an event in the rules of the state with that name, and not in a child's. */
function eventName(host: HTMLElement, state: string, type: string): HTMLElement {
  const rules = Array.from(box(host, state).children).find((node) =>
    node.classList.contains("hsm-rules"),
  );
  return Array.from(rules?.querySelectorAll(".hsm-name") ?? []).find(
    (node) => node.textContent === type,
  ) as HTMLElement;
}

function glows(host: HTMLElement, state: string): boolean {
  return box(host, state).classList.contains("hsm-on");
}

/** The buttons of the row at the top, without the items of a menu one of them opens. */
function controlButtons(host: HTMLElement): (string | null)[] {
  return Array.from(host.querySelectorAll(".hsm-controls button:not(.hsm-item)")).map(nameOf);
}

describe("an event's name in a rule line", () => {
  test("it sends its event from any box that names it", () => {
    const { host, dispose } = mount(layered);
    eventName(host, "off", "GO").click();
    expect(glows(host, "a")).toBe(true);
    // The parent's GO is pressed, and the child's rule is the one that takes the event.
    eventName(host, "on", "GO").click();
    expect(glows(host, "b")).toBe(true);
    eventName(host, "a", "GO").click();
    expect(glows(host, "off")).toBe(true);
    dispose();
  });

  test("the row at the top holds what is not an event, and an event no box names", () => {
    const named = mount(vault);
    expect(controlButtons(named.host)).toEqual([
      "Restart machine",
      "Pause time",
      "Normal speed",
      "save",
      "load",
    ]);
    named.dispose();
    const unnamed = mount({ ...tagged, buttons: [{ label: "NOPE", event: { type: "NOPE" } }] });
    expect(controlButtons(unnamed.host)).toEqual([
      "Restart machine",
      "Pause time",
      "Normal speed",
      "NOPE",
    ]);
    unnamed.dispose();
  });

  test("pointing at one marks every name of its event, in a parent's box and a child's", () => {
    const { host, dispose } = mount(layered);
    const marked = () =>
      Array.from(host.querySelectorAll(".hsm-same")).map((node) => node.textContent);
    const child = eventName(host, "a", "GO");
    child.dispatchEvent(new Event("pointerenter"));
    expect(marked()).toEqual(["GO", "GO", "GO"]);
    child.dispatchEvent(new Event("pointerleave"));
    expect(marked()).toEqual([]);
    dispose();
  });

  test("an event with no button is named and marked, and its name is not a button", () => {
    const { host, dispose } = mount(layered);
    const done = eventName(host, "on", "DONE");
    expect(done.tagName).toBe("SPAN");
    expect(eventName(host, "on", "HALT").tagName).toBe("BUTTON");
    done.dispatchEvent(new Event("pointerenter"));
    expect(done.classList.contains("hsm-same")).toBe(true);
    dispose();
  });

  test("it is marked as taken while an active state takes its event", () => {
    const { host, dispose } = mount(layered);
    const taken = (state: string, type: string) =>
      eventName(host, state, type).classList.contains("hsm-can");
    expect(taken("off", "GO")).toBe(true);
    expect(taken("on", "HALT")).toBe(false);
    eventName(host, "off", "GO").click();
    expect(taken("on", "HALT")).toBe(true);
    dispose();
  });
});

describe("the arrow in a rule line", () => {
  test('it is a glyph that reads as "to", in every kind of line that leads somewhere', () => {
    const { host, dispose } = mount(kinds);
    const arrows = Array.from(host.querySelectorAll("li.hsm-rule")).map((line) => {
      const glyph = line.querySelector(".hsm-arrow");
      return [
        glyph?.getAttribute("role"),
        glyph?.getAttribute("aria-label"),
        glyph?.querySelector("svg") !== null,
      ];
    });
    expect(arrows).toEqual([
      ["img", "to", true],
      ["img", "to", true],
      ["img", "to", true],
    ]);
    const line = eventName(host, "a", "GO").parentElement;
    expect(line?.textContent?.replace(/\s+/g, " ")).toBe("GO /b");
    dispose();
  });
});

describe("a state's hooks on the diagram", () => {
  /** What the page's tooltip says for each glyph by the state's name, and the hooks left in words. */
  function hooksIn(host: HTMLElement, state: string) {
    const [title, ...rest] = Array.from(box(host, state).children);
    const glyphs = Array.from(title?.querySelectorAll<HTMLElement>(".hsm-mark") ?? []);
    return {
      glyphs: glyphs.map((node) => node.dataset.tooltipContent),
      words: rest.find((node) => node.classList.contains("hsm-hooks"))?.textContent,
    };
  }

  test("enter, exit and task are glyphs by the state's name, and other hooks stay in words", () => {
    const { host, dispose } = mount(hooked);
    const both = ["has enter hook", "has exit hook"];
    // `a` is where the machine starts, and that glyph comes first.
    expect(hooksIn(host, "a")).toEqual({ glyphs: ["initial", ...both], words: undefined });
    const task = "has a task: work that takes time and reports when it is done";
    expect(hooksIn(host, "b")).toEqual({ glyphs: [...both, task], words: "has unhandled hook" });
    expect(hooksIn(host, "c")).toEqual({ glyphs: [], words: undefined });
    dispose();
  });

  test("a task's glyph has a tint of its own", () => {
    const { host, dispose } = mount(hooked);
    const tinted = box(host, "b").querySelectorAll(".hsm-state-name > .hsm-mark.hsm-task");
    expect(Array.from(tinted).map((node) => node.getAttribute("aria-label"))).toEqual([
      "has a task: work that takes time and reports when it is done",
    ]);
    dispose();
  });

  test("a glyph adds nothing to the text its state's name is found by", () => {
    const { host, dispose } = mount(hooked);
    expect(box(host, "a").firstElementChild?.textContent).toBe("a");
    expect(box(host, "b").firstElementChild?.textContent).toBe("b");
    dispose();
  });

  test("a hook's glyph is reached with the keyboard and read out by its words", () => {
    const { host, dispose } = mount(hooked);
    const glyph = box(host, "b").querySelector(".hsm-mark") as HTMLElement;
    expect(glyph.querySelector("svg")).not.toBeNull();
    expect(glyph.tabIndex).toBe(0);
    expect(glyph.getAttribute("role")).toBe("img");
    expect(glyph.getAttribute("aria-label")).toBe("has enter hook");
    expect(glyph.dataset.slot).toBe(TOOLTIP_TRIGGER_SLOT);
    dispose();
  });
});

describe("the marks that are glyphs", () => {
  /** What the page's tooltip says for each glyph inside that element. */
  function tips(root: Element | null | undefined) {
    const glyphs = Array.from(root?.querySelectorAll<HTMLElement>(".hsm-mark") ?? []);
    return glyphs.map((node) => node.dataset.tooltipContent);
  }
  const title = (host: HTMLElement, state: string) => box(host, state).firstElementChild;

  test("the state a machine or a parent starts in is marked as initial, in a tint of its own", () => {
    const { host, dispose } = mount(layered);
    expect(tips(title(host, "off"))).toEqual(["initial"]);
    expect(tips(title(host, "a"))).toEqual(["initial"]);
    expect(tips(title(host, "on"))).toEqual([]);
    expect(tips(title(host, "b"))).toEqual([]);
    const star = title(host, "off")?.querySelector(".hsm-mark");
    expect(star?.classList.contains("hsm-initial")).toBe(true);
    dispose();
  });

  test("a state that remembers its child says so by its name, and its child does not", () => {
    const { host, dispose } = mount(returning);
    expect(tips(title(host, "keeps"))).toEqual(["initial", "remembers its last child"]);
    expect(tips(title(host, "a"))).toEqual(["initial"]);
    dispose();
  });

  test("a parallel state says so by its name, and a compound one does not", () => {
    const { host, dispose } = mount(pair);
    expect(tips(title(host, "both"))).toEqual(["initial", "keeps every region active"]);
    expect(tips(title(host, "plain"))).toEqual([]);
    dispose();
  });

  test("only a rule that names its own state is marked as a restart", () => {
    const { host, dispose } = mount(returning);
    const line = (type: string) => eventName(host, "a", type).parentElement;
    expect(tips(line("AGAIN"))).toEqual(["restarts this state"]);
    expect(tips(line("ON"))).toEqual([]);
    dispose();
  });
});

describe("the name of an event with several buttons", () => {
  function parts(host: HTMLElement) {
    const menu = host.querySelector(".hsm-diagram .hsm-menu") as HTMLElement;
    const [soft, hard] = Array.from(menu.querySelectorAll("button"));
    return { menu, soft: soft as HTMLButtonElement, hard: hard as HTMLButtonElement };
  }

  test("it opens a menu of them and sends nothing itself", () => {
    const { host, log, dispose } = mount(pushy);
    const { menu, soft, hard } = parts(host);
    expect([soft.textContent, hard.textContent]).toEqual(["PUSH (force 1)", "PUSH (force 3)"]);
    expect(menu.hasAttribute("data-shown")).toBe(false);
    const name = eventName(host, "a", "PUSH");
    const mark = log.childElementCount;
    name.click();
    expect(menu.hasAttribute("data-shown")).toBe(true);
    expect(name.getAttribute("aria-expanded")).toBe("true");
    expect(added(log, mark)).toEqual([]);
    name.click();
    expect(menu.hasAttribute("data-shown")).toBe(false);
    expect(name.getAttribute("aria-expanded")).toBe("false");
    dispose();
  });

  test("a pick sends that button's event and closes the menu", () => {
    const { host, dispose } = mount(pushy);
    const { menu, soft, hard } = parts(host);
    const name = eventName(host, "a", "PUSH");
    name.click();
    soft.click();
    expect(menu.hasAttribute("data-shown")).toBe(false);
    expect(name.getAttribute("aria-expanded")).toBe("false");
    expect(glows(host, "a")).toBe(true);
    name.click();
    hard.click();
    expect(glows(host, "b")).toBe(true);
    dispose();
  });

  test("one menu serves every line that names the event, and moves to the name pressed", () => {
    const { host, dispose } = mount(pushy);
    expect(host.querySelectorAll(".hsm-diagram .hsm-menu").length).toBe(1);
    const first = eventName(host, "a", "PUSH");
    const second = eventName(host, "b", "PUSH");
    first.click();
    second.click();
    expect(parts(host).menu.hasAttribute("data-shown")).toBe(true);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
    dispose();
  });

  test("an item is marked as taken by itself, and the name while any item is", () => {
    const { host, dispose } = mount(pushy);
    const { soft, hard } = parts(host);
    const name = eventName(host, "a", "PUSH");
    const taken = (node: HTMLElement) => node.classList.contains("hsm-can");
    expect([taken(soft), taken(hard), taken(name)]).toEqual([false, true, true]);
    name.click();
    hard.click();
    expect([taken(soft), taken(hard), taken(name)]).toEqual([true, true, true]);
    dispose();
  });

  test("its names stay marked while the menu is open, and pointing at an item marks them", () => {
    const { host, dispose } = mount(pushy);
    const { soft } = parts(host);
    const names = [eventName(host, "a", "PUSH"), eventName(host, "b", "PUSH")];
    const marked = () => names.map((node) => node.classList.contains("hsm-same"));
    soft.dispatchEvent(new Event("pointerenter"));
    expect(marked()).toEqual([true, true]);
    soft.dispatchEvent(new Event("pointerleave"));
    expect(marked()).toEqual([false, false]);
    names[0]?.click();
    expect(marked()).toEqual([true, true]);
    // The pointer is on the item that is pressed, and a hidden item is never left.
    soft.dispatchEvent(new Event("pointerenter"));
    soft.click();
    expect(marked()).toEqual([false, false]);
    dispose();
  });

  test("a lone button that sends more than the name says is listed in a menu too", () => {
    const [, hard] = pushy.buttons;
    const { host, dispose } = mount({ ...pushy, buttons: hard === undefined ? [] : [hard] });
    const items = Array.from(parts(host).menu.querySelectorAll("button"));
    expect(items.map((node) => node.textContent)).toEqual(["PUSH (force 3)"]);
    expect(eventName(host, "a", "PUSH").hasAttribute("aria-expanded")).toBe(true);
    dispose();
  });
});

// One piece of the code that can be taken out, beside a button that is not a switch.
const fickle: Demo = {
  config: { initial: "/a", states: { a: {} } },
  ctx: () => ({ tidy: true }),
  buttons: [
    {
      label: "exit tidies",
      change: (ctx) => {
        ctx.tidy = !ctx.tidy;
      },
      on: (ctx) => ctx.tidy === true,
    },
    { label: "stop()", stop: true },
  ],
  readout: () => [],
};

describe("a button that changes the code", () => {
  function controlButton(host: HTMLElement, label: string): HTMLButtonElement {
    return Array.from(host.querySelectorAll(".hsm-controls button")).find(
      (node) => node.textContent === label,
    ) as HTMLButtonElement;
  }

  test("it is a switch that shows whether its piece of the code is in", () => {
    const { host, dispose } = mount(fickle);
    const node = controlButton(host, "exit tidies");
    expect(node.getAttribute("role")).toBe("switch");
    expect(node.getAttribute("aria-checked")).toBe("true");
    expect(controlButton(host, "stop()").hasAttribute("role")).toBe(false);
    node.click();
    expect(node.getAttribute("aria-checked")).toBe("false");
    node.click();
    expect(node.getAttribute("aria-checked")).toBe("true");
    dispose();
  });

  test("a restart puts the code back, and the switch follows it", () => {
    const { host, dispose } = mount(fickle);
    const node = controlButton(host, "exit tidies");
    node.click();
    click(host, "Restart machine");
    expect(node.getAttribute("aria-checked")).toBe("true");
    dispose();
  });
});

describe("the row at the top of a diagram", () => {
  test("it is the first thing in the frame, and the side holds no button", () => {
    const { host, dispose } = mount(vault);
    const frame = host.querySelector(".hsm-demo") as HTMLElement;
    expect(Array.from(frame.children).map((node) => node.className)).toEqual([
      "hsm-controls",
      "hsm-body",
    ]);
    expect(host.querySelectorAll(".hsm-side button").length).toBe(0);
    dispose();
  });

  test("the restart comes first, as a glyph that the page's tooltip names", () => {
    const { host, dispose } = mount(vault);
    const restart = host.querySelector(".hsm-controls button") as HTMLButtonElement;
    expect(restart.getAttribute("aria-label")).toBe("Restart machine");
    expect(restart.textContent).toBe("");
    expect(restart.dataset.slot).toBe(TOOLTIP_TRIGGER_SLOT);
    expect(restart.dataset.tooltipContent).toBe("Restart machine");
    dispose();
  });

  test("the restart, the clock and the speeds sit apart from the rest, ahead of a rule", () => {
    const { host, dispose } = mount(vault);
    const row = host.querySelector(".hsm-controls") as HTMLElement;
    const set = row.firstElementChild as HTMLElement;
    expect(set.className).toBe("hsm-transport");
    expect(Array.from(set.querySelectorAll("button:not(.hsm-item)")).map(nameOf)).toEqual([
      "Restart machine",
      "Pause time",
      "Normal speed",
    ]);
    expect((row.lastElementChild as HTMLElement).className).toBe("hsm-extras");
    dispose();
    // A diagram with no button of its own has the one part, and so no rule after it.
    const plain = mount(tagged);
    expect(plain.host.querySelector(".hsm-controls")?.childElementCount).toBe(1);
    plain.dispose();
  });

  test("a button's hint is the tooltip the page shows over it, and its words stay", () => {
    const hinted: Demo = {
      ...vault,
      buttons: [
        { label: "save", hint: "Keep a copy", save: true },
        { label: "stop()", stop: true },
      ],
    };
    const { host, dispose } = mount(hinted);
    const [save, stop] = Array.from(host.querySelectorAll<HTMLElement>(".hsm-extras > button"));
    expect(save?.textContent).toBe("save");
    expect(save?.dataset.slot).toBe(TOOLTIP_TRIGGER_SLOT);
    expect(save?.dataset.tooltipContent).toBe("Keep a copy");
    expect(stop?.dataset.tooltipContent).toBeUndefined();
    dispose();
  });

  test("it holds the clock of every diagram, straight after the restart", () => {
    const { host, dispose } = mount(tagged);
    expect(controlButtons(host)).toEqual(["Restart machine", "Pause time", "Normal speed"]);
    click(host, "Pause time");
    expect(controlButtons(host)).toEqual(["Restart machine", "Resume time", "Normal speed"]);
    dispose();
  });
});

describe("a diagram's speeds", () => {
  function parts(host: HTMLElement) {
    const button = host.querySelector(".hsm-speed") as HTMLButtonElement;
    const menu = host.querySelector(".hsm-controls .hsm-menu") as HTMLElement;
    const items = Array.from(menu.querySelectorAll("button"));
    const checked = () =>
      items.filter((item) => item.getAttribute("aria-checked") === "true").map(nameOf);
    return { button, menu, items, checked };
  }

  test("they are a menu under a button that reads the speed that is set", () => {
    const { host, dispose } = mount({ ...tagged, speed: 0.5 });
    const { button, menu, items, checked } = parts(host);
    expect(button.textContent).toBe("Half speed");
    expect(items.map(nameOf)).toEqual(["Normal speed", "Half speed", "Quarter speed", "Very slow"]);
    expect(checked()).toEqual(["Half speed"]);
    expect(menu.hasAttribute("data-shown")).toBe(false);
    button.click();
    expect(menu.hasAttribute("data-shown")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    dispose();
  });

  test("a pick sets the speed, closes the menu and shows on the button", () => {
    const { host, dispose } = mount(tagged);
    const { button, menu, checked } = parts(host);
    button.click();
    click(host, "Very slow");
    expect(menu.hasAttribute("data-shown")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toBe("Very slow");
    expect(checked()).toEqual(["Very slow"]);
    dispose();
  });

  test("the arrow keys walk the items, round the ends", () => {
    const { host, dispose } = mount(tagged);
    const { button, menu, items } = parts(host);
    button.click();
    expect(document.activeElement).toBe(items[0] as HTMLElement);
    const press = (key: string) =>
      menu.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    press("ArrowDown");
    expect(document.activeElement).toBe(items[1] as HTMLElement);
    press("ArrowUp");
    press("ArrowUp");
    expect(document.activeElement).toBe(items[3] as HTMLElement);
    press("Home");
    expect(document.activeElement).toBe(items[0] as HTMLElement);
    dispose();
  });
});

describe("the machine's time", () => {
  test("it reads as hours, minutes and seconds", () => {
    expect(clockText(0)).toBe("00:00:00");
    expect(clockText(1.5)).toBe("00:00:01");
    expect(clockText(3725.07)).toBe("01:02:05");
    // Sixty frames of a sixtieth of a second add up to a hair under one second.
    expect(clockText(0.9999999999)).toBe("00:00:01");
  });

  test("a diagram shows it beside the restart and the clock, from zero", () => {
    const { host, dispose } = mount(tagged);
    const timer = host.querySelector('.hsm-transport [role="timer"]');
    expect(timer?.getAttribute("aria-label")).toBe("Machine time");
    expect(timer?.textContent).toBe("00:00:00");
    dispose();
  });

  test("it is lit while time runs, and dim while the clock is held or the machine is stopped", () => {
    const { host, dispose } = mount(fickle);
    const lit = () => host.querySelector(".hsm-timer")?.classList.contains("hsm-timer-on");
    expect(lit()).toBe(true);
    click(host, "Pause time");
    expect(lit()).toBe(false);
    click(host, "Resume time");
    expect(lit()).toBe(true);
    click(host, "stop()");
    expect(lit()).toBe(false);
    click(host, "Restart machine");
    expect(lit()).toBe(true);
    dispose();
  });
});

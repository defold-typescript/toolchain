import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sequence } from "@defold-typescript/hsm/async";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Demo } from "./demos";
import { mountDemos } from "./view";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

// The spec is not on the tutorial page, and every DEMOS entry must be placed there, so it stays
// local to this file. Its wait is filed while the diagram is mounted.
const waiter: Demo = {
  title: "Waiter",
  subtitle: "A routine that waits.",
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
  title: "Pair",
  subtitle: "Two regions and a plain parent.",
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
  title: "Tagged",
  subtitle: "One state carries two tags.",
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
  title: "Chatty",
  subtitle: "A script prints each move.",
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
  title: "Vault",
  subtitle: "A machine that can be saved and loaded.",
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

// Happy DOM's observer reports no host on screen, so no frame steps the run.
function mount(spec: Demo) {
  const host = document.createElement("div");
  host.dataset.hsmDemo = "local";
  document.body.append(host);
  const dispose = mountDemos([host], { local: spec });
  const log = host.querySelector(".hsm-log") as HTMLElement;
  return { host, log, dispose };
}

/** The box of the state with that name; a name element may hold a mark such as "starts here" too. */
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

function click(host: HTMLElement, label: string): void {
  const button = Array.from(host.querySelectorAll("button")).find(
    (node) => node.textContent === label,
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
    const restart = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Restart machine",
    ) as HTMLButtonElement;
    restart.click();
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
    dispose();
  });
});

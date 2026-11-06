import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// A document must exist before a component loads Radix; see test-dom.ts.
import "./test-dom";
import { SidePanel } from "./app";
import { Bar } from "./bar";
import {
  act,
  cleanup,
  fireEvent,
  registerDom,
  render,
  unregisterDom,
  waitFor,
  within,
} from "./test-dom";
import { CRITTERS, startViewer, type TestViewer } from "./test-viewer";

const PAIR = `import { defineMachine } from "@defold-typescript/types/hsm";
export const guard = defineMachine("guard")({
  initial: "/patrol",
  states: { patrol: { on: { SEE: "/chase" } }, chase: {} },
});
export const dog = defineMachine("dog")({
  initial: "/sit",
  states: { sit: {} },
});
`;

let dir: string;
let viewer: TestViewer;

beforeAll(registerDom);
afterAll(unregisterDom);

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-bar-"));
  const file = path.join(dir, "pair.ts");
  writeFileSync(file, PAIR);
  viewer = await startViewer(file, "{}");
});

afterEach(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

function control<T extends HTMLElement>(container: HTMLElement, selector: string): T {
  const found = container.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`no control at ${selector}`);
  }
  return found;
}

function field(container: HTMLElement, label: string): HTMLInputElement {
  return control<HTMLInputElement>(container, `input[aria-label="${label}"]`);
}

/** The text of the element `input` names as its description. */
function described(input: HTMLInputElement): string | undefined {
  const id = input.getAttribute("aria-describedby");
  if (id === null) {
    return undefined;
  }
  return input.ownerDocument.getElementById(id)?.textContent ?? undefined;
}

describe("Bar", () => {
  test("picks the machine chosen in the dropdown, which follows the store", async () => {
    const { container } = render(<Bar store={viewer.store} />);
    const machine = control<HTMLSelectElement>(container, 'select[aria-label="machine"]');
    expect(machine.value).toBe("guard");

    fireEvent.change(machine, { target: { value: "dog" } });

    await waitFor(() =>
      expect(viewer.requests).toEqual([{ route: "/api/pick", body: { name: "dog" } }]),
    );
    await waitFor(() => expect(machine.value).toBe("dog"));

    await act(() => viewer.store.getState().pick("guard"));
    expect(machine.value).toBe("guard");
  });

  test("steps by the dt typed into the field", async () => {
    const view = render(<Bar store={viewer.store} />);

    fireEvent.change(control(view.container, 'input[aria-label="dt"]'), {
      target: { value: "0.5" },
    });
    fireEvent.click(view.getByRole("button", { name: "Step" }));

    await waitFor(() =>
      expect(viewer.requests).toEqual([{ route: "/api/update", body: { dt: 0.5 } }]),
    );
  });

  test("sends the event of the button clicked", async () => {
    const view = render(<Bar store={viewer.store} />);

    fireEvent.click(view.getByRole("button", { name: "SEE" }));

    await waitFor(() =>
      expect(viewer.requests).toEqual([{ route: "/api/send", body: { event: { type: "SEE" } } }]),
    );
  });

  test("marks a field that cannot be read and names its message, until the text reads", () => {
    const view = render(<Bar store={viewer.store} />);
    const startCtx = field(view.container, "start ctx");
    expect(startCtx.getAttribute("aria-invalid")).toBe("false");

    fireEvent.change(startCtx, { target: { value: "{enter: }" } });
    expect(startCtx.getAttribute("aria-invalid")).toBe("true");
    expect(described(startCtx)).toBe("the start ctx cannot be read: expected a value at column 9");

    fireEvent.change(startCtx, { target: { value: "{}" } });
    expect(startCtx.getAttribute("aria-invalid")).toBe("false");
    expect(startCtx.getAttribute("aria-describedby")).toBeNull();
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("reads each field with its own reader, and shows every message at once", () => {
    const view = render(<Bar store={viewer.store} />);
    const payload = field(view.container, "payload");
    const dt = field(view.container, "dt");

    fireEvent.change(payload, { target: { value: "[1]" } });
    fireEvent.change(dt, { target: { value: "abc" } });

    expect(payload.getAttribute("aria-invalid")).toBe("true");
    expect(described(payload)).toBe("the payload must be an object");
    expect(dt.getAttribute("aria-invalid")).toBe("true");
    expect(described(dt)).toBe("dt must be a number");
    expect(Array.from(view.getByRole("alert").children, (line) => line.textContent)).toEqual([
      "the payload must be an object",
      "dt must be a number",
    ]);
  });

  test("sends the payload typed into the field with the event", async () => {
    const view = render(<Bar store={viewer.store} />);

    fireEvent.change(field(view.container, "payload"), { target: { value: "{enter: true}" } });
    fireEvent.click(view.getByRole("button", { name: "SEE" }));

    await waitFor(() =>
      expect(viewer.requests).toEqual([
        { route: "/api/send", body: { event: { enter: true, type: "SEE" } } },
      ]),
    );
  });

  test("starts with the ctx typed into the field", async () => {
    const view = render(<Bar store={viewer.store} />);

    fireEvent.change(field(view.container, "start ctx"), { target: { value: "{ fuel: 2 }" } });
    fireEvent.click(view.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(viewer.requests).toEqual([{ route: "/api/start", body: { ctx: { fuel: 2 } } }]),
    );
  });

  test("shows the start ctx the store holds when the bar mounts", async () => {
    const started = await startViewer(path.join(dir, "pair.ts"), "{ fuel: 1 }");

    const view = render(<Bar store={started.store} />);

    expect(field(view.container, "start ctx").value).toBe("{ fuel: 1 }");
  });

  test("marks a field the bar mounts over text that cannot be read, until the text reads", () => {
    viewer.store.getState().setPayload("[1]");
    const view = render(<Bar store={viewer.store} />);
    const payload = field(view.container, "payload");
    expect(payload.getAttribute("aria-invalid")).toBe("true");
    expect(described(payload)).toBe("the payload must be an object");

    fireEvent.change(payload, { target: { value: "{enter: }" } });
    expect(Array.from(view.getByRole("alert").children, (line) => line.textContent)).toEqual([
      "the payload cannot be read: expected a value at column 9",
    ]);

    fireEvent.change(payload, { target: { value: "{}" } });
    expect(payload.getAttribute("aria-invalid")).toBe("false");
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("draws one icon in Start, Restart, Play and Step, and hides every icon from the names", () => {
    const view = render(<Bar store={viewer.store} />);

    for (const name of ["Start", "Restart", "Play", "Step"]) {
      expect(view.getByRole("button", { name }).querySelectorAll("svg").length).toBe(1);
    }
    const icons = [...view.container.querySelectorAll("svg")];
    expect(icons.map((icon) => icon.getAttribute("aria-hidden"))).toEqual(icons.map(() => "true"));
  });

  test("switches to the stacked layout and keeps it when Stacked is clicked again", () => {
    const view = render(<Bar store={viewer.store} />);
    const stacked = (): HTMLElement => view.getByRole("radio", { name: "Stacked" });

    fireEvent.click(stacked());
    expect(viewer.store.getState().layout).toBe("stacked");
    expect(stacked().getAttribute("aria-checked")).toBe("true");

    fireEvent.click(stacked());
    expect(viewer.store.getState().layout).toBe("stacked");
    expect(stacked().getAttribute("aria-checked")).toBe("true");
  });
});

describe("Bar tabs", () => {
  let critters: TestViewer;

  beforeEach(async () => {
    const file = path.join(dir, "critters.ts");
    writeFileSync(file, CRITTERS);
    critters = await startViewer(file, "{}");
  });

  const page = (store: TestViewer["store"]) =>
    render(
      <>
        <Bar store={store} />
        <SidePanel store={store} />
      </>,
    );

  /** A control by its role and accessible name, or a clock readout by its `data-clock`. */
  type Control =
    | readonly [role: "button" | "textbox" | "combobox", name: string]
    | `clock:${string}`;

  const shown = (container: HTMLElement, controls: readonly Control[]): Control[] =>
    controls.filter((entry) =>
      typeof entry === "string"
        ? container.querySelector(`[data-clock="${entry.slice("clock:".length)}"]`) !== null
        : within(container).queryByRole(entry[0], { name: entry[1] }) !== null,
    );

  const CLOCK: readonly Control[] = [
    ["button", "Restart"],
    ["button", "Play"],
    ["button", "Step"],
    ["textbox", "dt"],
    ["combobox", "speed"],
    "clock:t",
    "clock:frame",
  ];
  const SCARE: Control = ["button", "SCARE"];
  const MACHINE_CONTROLS: readonly Control[] = [
    ["combobox", "machine"],
    ["combobox", "instance"],
    ["textbox", "start ctx"],
    ["button", "Start"],
    SCARE,
    ["textbox", "payload"],
    ["combobox", "live instance"],
  ];
  const WORLD_CONTROLS: readonly Control[] = [["combobox", "world"]];
  const ALL = [...CLOCK, ...MACHINE_CONTROLS, ...WORLD_CONTROLS];

  const options = (select: HTMLSelectElement): string[] =>
    [...select.options].map((option) => option.textContent ?? "");

  test("shows the clock on both tabs, the machine controls on Machines and the world picker on Worlds", () => {
    const view = page(critters.store);
    expect(view.getByRole("tab", { name: "Machines" }).getAttribute("aria-selected")).toBe("true");
    expect(shown(view.container, ALL)).toEqual([...CLOCK, ...MACHINE_CONTROLS]);

    fireEvent.click(view.getByRole("tab", { name: "Worlds" }));

    expect(critters.store.getState().tab).toBe("worlds");
    expect(view.getByRole("tab", { name: "Worlds" }).getAttribute("aria-selected")).toBe("true");
    expect(shown(view.container, ALL)).toEqual([...CLOCK, ...WORLD_CONTROLS]);
    expect(options(control(view.container, 'select[aria-label="world"]'))).toEqual(["herd", "pen"]);
  });

  test("follows the instance picked in the instance picker, and returns to the simulated one", async () => {
    const view = page(critters.store);
    const instance = control<HTMLSelectElement>(view.container, 'select[aria-label="instance"]');
    expect(options(instance)).toEqual(["simulated", "herd entity 1"]);

    fireEvent.change(instance, { target: { value: "1" } });
    await waitFor(() => expect(critters.store.getState().snapshot?.following).toBe(1));
    expect(instance.value).toBe("1");

    fireEvent.change(instance, { target: { value: "" } });
    await waitFor(() => expect(critters.store.getState().snapshot?.following).toBeUndefined());
    expect(critters.requests).toEqual([
      { route: "/api/follow", body: { instance: 1 } },
      { route: "/api/follow", body: { instance: null } },
    ]);
  });

  test("picks the world chosen in the world picker", async () => {
    act(() => critters.store.getState().setTab("worlds"));
    const view = page(critters.store);

    fireEvent.change(control(view.container, 'select[aria-label="world"]'), {
      target: { value: "pen" },
    });

    await waitFor(() => expect(critters.store.getState().snapshot?.world).toBe("pen"));
    expect(critters.requests).toEqual([{ route: "/api/pick-world", body: { name: "pen" } }]);
  });

  test("counts frames, and Restart reruns the file from frame 0", async () => {
    const view = page(critters.store);
    const frame = () => control(view.container, "[data-clock=frame]").textContent;
    expect(frame()).toBe("frame=0");

    fireEvent.click(view.getByRole("button", { name: "Step" }));
    await waitFor(() => expect(frame()).toBe("frame=1"));

    fireEvent.click(view.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(frame()).toBe("frame=0"));
    expect(critters.requests.map((request) => request.route)).toEqual([
      "/api/update",
      "/api/restart",
    ]);
  });

  test("a file with only machines or only worlds shows no tab switch", async () => {
    const machinesOnly = page(viewer.store);
    expect(machinesOnly.queryByRole("tablist")).toBeNull();
    expect(shown(machinesOnly.container, ALL)).toEqual([
      ...CLOCK,
      ...MACHINE_CONTROLS.filter((entry) => entry !== SCARE),
    ]);
    cleanup();

    const pond = path.join(dir, "pond.ts");
    writeFileSync(
      pond,
      `import { system, world } from "@defold-typescript/types/ecs";
export const pond = world(system("ripple")({ update() {} }));
`,
    );
    const worldsOnly = page((await startViewer(pond, undefined)).store);
    expect(worldsOnly.queryByRole("tablist")).toBeNull();
    expect(shown(worldsOnly.container, ALL)).toEqual([...CLOCK, ...WORLD_CONTROLS]);
  });
});

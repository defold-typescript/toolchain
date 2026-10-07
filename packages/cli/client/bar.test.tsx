import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// A document must exist before a component loads Radix; see test-dom.ts.
import "./test-dom";
import { Bar } from "./bar";
import { act, cleanup, fireEvent, registerDom, render, unregisterDom, waitFor } from "./test-dom";
import { startViewer, type TestViewer } from "./test-viewer";

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

  test("draws one icon in Start, Play and Step, and hides every icon from the names", () => {
    const view = render(<Bar store={viewer.store} />);

    for (const name of ["Start", "Play", "Step"]) {
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

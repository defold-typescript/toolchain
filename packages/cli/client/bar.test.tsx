import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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

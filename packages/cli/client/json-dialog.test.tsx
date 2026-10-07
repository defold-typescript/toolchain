import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// A document must exist before a component loads Radix; see test-dom.ts.
import "./test-dom";
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
import { startViewer, type TestViewer } from "./test-viewer";

const GUARD = `import { defineMachine } from "@defold-typescript/types/hsm";
export const guard = defineMachine("guard")({
  initial: "/patrol",
  states: { patrol: { on: { SEE: "/chase" } }, chase: {} },
});
`;

let dir: string;
let viewer: TestViewer;

beforeAll(registerDom);
afterAll(unregisterDom);

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-dialog-"));
  const file = path.join(dir, "guard.ts");
  writeFileSync(file, GUARD);
  viewer = await startViewer(file, "{ fuel: 1 }");
});

afterEach(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

type View = ReturnType<typeof render>;

function barField(view: View, label: string): HTMLInputElement {
  const found = view.container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (found === null) {
    throw new Error(`no bar field labelled ${label}`);
  }
  return found;
}

// A boolean keeps a failed check cheap: Bun prints the whole document for an element it compares.
const isOpen = (view: View): boolean => view.queryByRole("dialog") !== null;

/** Opens the dialog of the opener named `opener` and returns queries bound to it. */
function openDialog(view: View, opener: string) {
  fireEvent.click(view.getByRole("button", { name: opener }));
  const dialog = within(view.getByRole("dialog"));
  return {
    ...dialog,
    editor: dialog.getByRole<HTMLTextAreaElement>("textbox"),
    button: (name: string) => dialog.getByRole<HTMLButtonElement>("button", { name }),
  };
}

const type = (editor: HTMLTextAreaElement, text: string): void => {
  fireEvent.change(editor, { target: { value: text } });
};

/** Lets a submit the form refused, or one still on its way, finish before a test reads the page. */
const settle = (): Promise<void> =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe("JsonDialog", () => {
  test("opens on the text of the bar's start ctx field", () => {
    const view = render(<Bar store={viewer.store} />);
    expect(isOpen(view)).toBe(false);

    const dialog = openDialog(view, "edit start ctx");

    expect(dialog.editor.value).toBe("{ fuel: 1 }");
  });

  test("says where a multi-line value stops reading, and does not confirm it", async () => {
    const view = render(<Bar store={viewer.store} />);
    const dialog = openDialog(view, "edit start ctx");

    type(dialog.editor, "{\n  fuel: \n}");
    expect(dialog.getByRole("alert").textContent).toBe(
      "the start ctx cannot be read: expected a value at line 3, column 1",
    );
    expect(dialog.editor.getAttribute("aria-invalid")).toBe("true");
    expect(dialog.button("Start").disabled).toBe(true);

    fireEvent.keyDown(dialog.editor, { key: "Enter", ctrlKey: true });
    await settle();
    expect(isOpen(view)).toBe(true);
    expect(viewer.requests).toEqual([]);

    type(dialog.editor, "{ fuel: 2 }");
    expect(dialog.queryByRole("alert")).toBeNull();
    expect(dialog.editor.getAttribute("aria-invalid")).toBe("false");
    expect(dialog.button("Start").disabled).toBe(false);
  });

  test("starts the machine with the confirmed start ctx and writes it to the bar's field", async () => {
    const view = render(<Bar store={viewer.store} />);
    const dialog = openDialog(view, "edit start ctx");

    type(dialog.editor, "{ fuel: 2 }");
    fireEvent.click(dialog.button("Start"));

    await waitFor(() =>
      expect(viewer.requests).toEqual([{ route: "/api/start", body: { ctx: { fuel: 2 } } }]),
    );
    expect(isOpen(view)).toBe(false);
    expect(barField(view, "start ctx").value).toBe("{ fuel: 2 }");
  });

  test("reads the payload with the payload's reader, and applies it without sending an event", async () => {
    const view = render(<Bar store={viewer.store} />);
    const dialog = openDialog(view, "edit payload");

    type(dialog.editor, "[1]");
    expect(dialog.getByRole("alert").textContent).toBe("the payload must be an object");

    type(dialog.editor, "{ enter: true }");
    fireEvent.click(dialog.button("Apply"));

    await waitFor(() => expect(isOpen(view)).toBe(false));
    await settle();
    expect(viewer.requests).toEqual([]);
    expect(barField(view, "payload").value).toBe("{ enter: true }");

    fireEvent.click(view.getByRole("button", { name: "SEE" }));
    await waitFor(() =>
      expect(viewer.requests).toEqual([
        { route: "/api/send", body: { event: { enter: true, type: "SEE" } } },
      ]),
    );
  });

  test("discards the text on Cancel", async () => {
    const view = render(<Bar store={viewer.store} />);
    const dialog = openDialog(view, "edit start ctx");

    type(dialog.editor, "{ fuel: 9 }");
    fireEvent.click(dialog.button("Cancel"));

    await waitFor(() => expect(isOpen(view)).toBe(false));
    await settle();
    expect(viewer.requests).toEqual([]);
    expect(barField(view, "start ctx").value).toBe("{ fuel: 1 }");
    expect(viewer.store.getState().startCtx).toBe("{ fuel: 1 }");
    expect(openDialog(view, "edit start ctx").editor.value).toBe("{ fuel: 1 }");
  });

  test("confirms on Ctrl+Enter and on Cmd+Enter in the editor, and not on Enter alone", async () => {
    const view = render(<Bar store={viewer.store} />);
    const startCtx = openDialog(view, "edit start ctx");

    type(startCtx.editor, "{ fuel: 3 }");
    fireEvent.keyDown(startCtx.editor, { key: "Enter" });
    await settle();
    expect(isOpen(view)).toBe(true);
    expect(viewer.requests).toEqual([]);

    fireEvent.keyDown(startCtx.editor, { key: "Enter", ctrlKey: true });
    await waitFor(() =>
      expect(viewer.requests).toEqual([{ route: "/api/start", body: { ctx: { fuel: 3 } } }]),
    );
    expect(isOpen(view)).toBe(false);
    expect(barField(view, "start ctx").value).toBe("{ fuel: 3 }");

    const payload = openDialog(view, "edit payload");
    type(payload.editor, "{ enter: true }");
    fireEvent.keyDown(payload.editor, { key: "Enter", metaKey: true });
    await waitFor(() => expect(isOpen(view)).toBe(false));
    expect(barField(view, "payload").value).toBe("{ enter: true }");
  });
});

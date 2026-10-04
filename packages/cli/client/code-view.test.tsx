import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Snapshot } from "../src/hsm-view-session";
import { CodeView } from "./code-view";
import { act, cleanup, fireEvent, registerDom, render, unregisterDom, waitFor } from "./test-dom";
import { startViewer, type TestViewer } from "./test-viewer";

const LAMP = `import { defineMachine } from "@defold-typescript/types/hsm";
export const lamp = defineMachine("lamp")({
  initial: "/off",
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: { on: { TOGGLE: "/off" } },
  },
});
`;

const lineOf = (state: string): string =>
  String(LAMP.split("\n").findIndex((line) => line.trimStart().startsWith(`${state}: {`)));

let dir: string;
let viewer: TestViewer;

beforeAll(registerDom);
afterAll(unregisterDom);

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-code-"));
  const file = path.join(dir, "main.ts");
  writeFileSync(file, LAMP);
  viewer = await startViewer(file, "{}");
});

afterEach(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

function keyButtons(container: HTMLElement): { text: string; line: string | undefined }[] {
  return [...container.querySelectorAll("button")].map((button) => ({
    text: button.textContent ?? "",
    line: button.closest<HTMLElement>("[data-line]")?.dataset.line,
  }));
}

describe("CodeView", () => {
  test("sends the clicked key's event with the bar's payload", async () => {
    const { container } = render(<CodeView store={viewer.store} file={0} />);
    expect(keyButtons(container)).toEqual([{ text: "TOGGLE", line: lineOf("off") }]);

    act(() => viewer.store.getState().setPayload('{ "brightness": 3 }'));
    fireEvent.click(container.querySelector("button") as HTMLButtonElement);

    await waitFor(() => expect(viewer.store.getState().snapshot?.active).toEqual(["/on"]));
    expect(viewer.requests).toEqual([
      { route: "/api/send", body: { event: { brightness: 3, type: "TOGGLE" } } },
    ]);
  });

  test("moves the clickable key to the state a snapshot makes active", () => {
    const { container } = render(<CodeView store={viewer.store} file={0} />);

    act(() =>
      viewer.store
        .getState()
        .receive(JSON.parse(JSON.stringify(viewer.session.send({ type: "TOGGLE" }))) as Snapshot),
    );

    expect(keyButtons(container)).toEqual([{ text: "TOGGLE", line: lineOf("on") }]);
    const offLine = container.querySelector(`[data-line="${lineOf("off")}"]`);
    expect(offLine?.textContent).toContain("TOGGLE");
  });
});

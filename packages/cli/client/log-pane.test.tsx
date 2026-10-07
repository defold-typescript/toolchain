import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LogPane } from "./log-pane";
import { cleanup, fireEvent, registerDom, render, unregisterDom } from "./test-dom";
import { startViewer, type TestViewer } from "./test-viewer";

const HERO = `import { defineMachine } from "@defold-typescript/types/hsm";
export const hero = defineMachine("hero")({
  initial: "/alive",
  states: { alive: { on: { HIT: "/down" } }, down: {} },
});
`;

let dir: string;
let viewer: TestViewer;

beforeAll(registerDom);
afterAll(unregisterDom);

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-log-"));
  const file = path.join(dir, "main.ts");
  writeFileSync(file, HERO);
  viewer = await startViewer(file, "{}");
});

afterEach(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

describe("LogPane", () => {
  test("a kind checkbox hides that kind and shows it again", () => {
    const view = render(<LogPane store={viewer.store} />);
    const events = (): HTMLElement => view.getByRole("checkbox", { name: "events" });
    expect(events().getAttribute("aria-checked")).toBe("true");

    fireEvent.click(events());
    expect(viewer.store.getState().hidden.has("event")).toBe(true);
    expect(events().getAttribute("aria-checked")).toBe("false");

    fireEvent.click(events());
    expect(viewer.store.getState().hidden.has("event")).toBe(false);
    expect(events().getAttribute("aria-checked")).toBe("true");
  });
});

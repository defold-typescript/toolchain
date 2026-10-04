import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CtxTree } from "./ctx-tree";
import { act, cleanup, fireEvent, registerDom, render, unregisterDom, waitFor } from "./test-dom";
import { startViewer, type TestViewer } from "./test-viewer";

const HERO = `import { defineMachine } from "@defold-typescript/types/hsm";
type Ctx = { lives: number; name: string; pos: { x: number; y: number }; items: number[] };
export const hero = defineMachine("hero")({
  initial: "/alive",
  states: {
    alive: {
      on: {
        HIT: { actions: (ctx: Ctx) => { ctx.lives -= 1; } },
      },
    },
  },
});
`;

const START = JSON.stringify({ lives: 3, name: "ada", pos: { x: 0, y: 5 }, items: [1, 2] });

let dir: string;
let viewer: TestViewer;

beforeAll(registerDom);
afterAll(unregisterDom);

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-ctx-"));
  const file = path.join(dir, "main.ts");
  writeFileSync(file, HERO);
  viewer = await startViewer(file, START);
});

afterEach(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

function row(container: HTMLElement, ...ctxPath: string[]): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-ctx-path='${JSON.stringify(ctxPath)}']`,
  );
  if (found === null) {
    throw new Error(`no ctx row at ${ctxPath.join(".")}`);
  }
  return found;
}

const valueCell = (element: HTMLElement): HTMLElement =>
  element.querySelector<HTMLElement>("[data-ctx-value]") as HTMLElement;

const glowOf = (element: HTMLElement): string | undefined => element.dataset.glow;

describe("CtxTree", () => {
  test("edits a number leaf in place, sending its path and the parsed value", async () => {
    const { container } = render(<CtxTree store={viewer.store} />);
    const x = row(container, "pos", "x");

    fireEvent.click(valueCell(x));
    const input = x.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("0");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(viewer.requests).toEqual([
        { route: "/api/edit", body: { path: ["pos", "x"], value: 3 } },
      ]),
    );
    await waitFor(() => expect(valueCell(row(container, "pos", "x")).textContent).toBe("3"));
    expect(row(container, "pos", "x").querySelector("input")).toBeNull();
  });

  test("cancels an edit on Escape without sending it", () => {
    const { container } = render(<CtxTree store={viewer.store} />);
    const lives = row(container, "lives");

    fireEvent.click(valueCell(lives));
    const input = lives.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(lives.querySelector("input")).toBeNull();
    expect(valueCell(lives).textContent).toBe("3");
    expect(viewer.requests).toEqual([]);
  });

  test("lets an object or array expand and collapse, but never edit", () => {
    const { container } = render(<CtxTree store={viewer.store} />);

    for (const [key, child] of [
      ["pos", "x"],
      ["items", "0"],
    ] as const) {
      const node = row(container, key);
      fireEvent.click(valueCell(node));
      expect(node.querySelector("input")).toBeNull();

      const toggle = node.querySelector("button[aria-expanded]") as HTMLButtonElement;
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(row(container, key, child)).toBeDefined();
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(() => row(container, key, child)).toThrow();
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    }
    expect(valueCell(row(container, "items", "1")).textContent).toBe("2");
    expect(valueCell(row(container, "pos", "y")).textContent).toBe("5");
  });

  test("restarts the glow of a leaf whose value changed, and keeps it on the rest", async () => {
    const { container } = render(<CtxTree store={viewer.store} />);
    const before = {
      lives: glowOf(row(container, "lives")),
      name: glowOf(row(container, "name")),
      y: glowOf(row(container, "pos", "y")),
    };

    await act(() => viewer.store.getState().send("HIT"));

    expect(valueCell(row(container, "lives")).textContent).toBe("2");
    expect(Number(glowOf(row(container, "lives")))).toBe(Number(before.lives) + 1);
    expect(glowOf(row(container, "name"))).toBe(before.name);
    expect(glowOf(row(container, "pos", "y"))).toBe(before.y);
  });
});

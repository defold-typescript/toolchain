import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// A document must exist before a component loads Radix; see test-dom.ts.
import "./test-dom";
import type { Snapshot } from "../src/hsm-view-session";
import { act, cleanup, fireEvent, registerDom, render, unregisterDom, waitFor } from "./test-dom";
import { CRITTERS, startViewer, type TestViewer } from "./test-viewer";
import { WorldsPanel } from "./worlds-panel";

let dir: string;
let viewer: TestViewer;

beforeAll(registerDom);
afterAll(unregisterDom);

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-worlds-"));
  const file = path.join(dir, "critters.ts");
  writeFileSync(file, CRITTERS);
  viewer = await startViewer(file, undefined, { opening: { tab: "worlds" } });
});

afterEach(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

const CELLS = ["index", "name", "count", "ms", "avg", "note"] as const;

function rows(container: HTMLElement): Record<(typeof CELLS)[number], string>[] {
  return [...container.querySelectorAll<HTMLElement>("[data-system]")].map((row) => {
    const cells = CELLS.map((cell) => [
      cell,
      row.querySelector(`[data-cell="${cell}"]`)?.textContent ?? "",
    ]);
    return Object.fromEntries(cells) as Record<(typeof CELLS)[number], string>;
  });
}

function systemRow(container: HTMLElement, index: number): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-system="${index}"]`);
  if (found === null) {
    throw new Error(`no row for system ${index}`);
  }
  return found;
}

const toggle = (container: HTMLElement, index: number): HTMLButtonElement =>
  systemRow(container, index).querySelector("button[aria-expanded]") as HTMLButtonElement;

const nameButton = (container: HTMLElement, index: number): HTMLButtonElement =>
  systemRow(container, index).querySelector('[data-cell="name"] button') as HTMLButtonElement;

function entities(container: HTMLElement, index: number): string[] {
  return [
    ...container.querySelectorAll<HTMLElement>(`[data-system-entities="${index}"] [data-entity]`),
  ].map((entity) => entity.dataset.entity ?? "");
}

function entity(container: HTMLElement, index: number, id: number): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-system-entities="${index}"] [data-entity="${id}"]`,
  );
  if (found === null) {
    throw new Error(`no entity ${id} under system ${index}`);
  }
  return found;
}

/** Each shown component row of an entity, as `key: value`, in order. */
function components(element: HTMLElement): string[] {
  return [...element.querySelectorAll<HTMLElement>("[data-component]")].map(
    (row) => row.textContent ?? "",
  );
}

function branch(element: HTMLElement, ...componentPath: string[]): HTMLButtonElement {
  const found = element.querySelector<HTMLButtonElement>(
    `[data-component='${JSON.stringify(componentPath)}'] button[aria-expanded]`,
  );
  if (found === null) {
    throw new Error(`no branch at ${componentPath.join(".")}`);
  }
  return found;
}

describe("WorldsPanel", () => {
  test("lists the picked world's systems in index order with counts, timings, state and interval", () => {
    const snapshot = viewer.store.getState().snapshot as Snapshot;
    const timings = [
      [0.5, 0.25],
      [1.236, 0.004],
      [0, 0],
      [2, 3.456],
    ] as const;
    act(() =>
      viewer.store.getState().receive({
        ...snapshot,
        entries: [],
        systems: snapshot.systems.map((system, at) => ({
          ...system,
          ms: timings[at]?.[0] ?? Number.NaN,
          avgMs: timings[at]?.[1] ?? Number.NaN,
        })),
      }),
    );

    const { container } = render(<WorldsPanel store={viewer.store} />);

    expect(rows(container)).toEqual([
      {
        index: "1",
        name: "tally",
        count: "0",
        ms: "0.50",
        avg: "0.25",
        note: "inactive, every 0.5 s",
      },
      { index: "2", name: "drift", count: "2", ms: "1.24", avg: "0.00", note: "" },
      { index: "3", name: "system 3", count: "1", ms: "0.00", avg: "0.00", note: "" },
      { index: "4", name: "scan", count: "-", ms: "2.00", avg: "3.46", note: "" },
    ]);
  });

  test("opens a row's entities as read-only component trees, one nested level per click, and closes on a second click", () => {
    const { container } = render(<WorldsPanel store={viewer.store} />);
    expect(entities(container, 2)).toEqual([]);

    fireEvent.click(toggle(container, 2));
    expect(toggle(container, 2).getAttribute("aria-expanded")).toBe("true");
    expect(entities(container, 2)).toEqual(["1", "2"]);
    const bo = entity(container, 2, 2);
    expect(components(bo)).toEqual(['name: "bo"', "pos: {2}"]);

    fireEvent.click(branch(bo, "pos"));
    expect(components(bo)).toEqual(['name: "bo"', "pos: {2}", "x: 5", "at: {1}"]);
    fireEvent.click(branch(bo, "pos", "at"));
    expect(components(bo)).toEqual(['name: "bo"', "pos: {2}", "x: 5", "at: {1}", "row: 2"]);
    fireEvent.click(branch(bo, "pos"));
    expect(components(bo)).toEqual(['name: "bo"', "pos: {2}"]);
    expect(container.querySelectorAll("input")).toHaveLength(0);

    fireEvent.click(toggle(container, 3));
    expect(entities(container, 3)).toEqual(["1"]);

    fireEvent.click(toggle(container, 2));
    expect(toggle(container, 2).getAttribute("aria-expanded")).toBe("false");
    expect(entities(container, 2)).toEqual([]);
    expect(entities(container, 3)).toEqual(["1"]);
  });

  test("a nocache system lists no entities", () => {
    const { container } = render(<WorldsPanel store={viewer.store} />);

    fireEvent.click(toggle(container, 4));

    expect(entities(container, 4)).toEqual([]);
    expect(container.querySelector('[data-system-entities="4"]')?.textContent).toBe(
      "a nocache system keeps no entity list",
    );
  });

  test("clicking a system's name selects it and brings its definition into the code view", () => {
    const { container } = render(<WorldsPanel store={viewer.store} />);
    const driftLine = CRITTERS.split("\n").findIndex((line) =>
      line.includes('processingSystem<Critter>("drift")'),
    );

    fireEvent.click(nameButton(container, 2));

    const state = viewer.store.getState();
    expect(state.selectedSystem).toBe(2);
    expect(state.openFile).toBe(0);
    expect(state.scrollTarget).toMatchObject({ file: 0, line: driftLine });
    expect(systemRow(container, 2).getAttribute("aria-current")).toBe("true");
    expect(systemRow(container, 1).getAttribute("aria-current")).toBe("false");
  });

  test("an entity holding a machine shows its instance's label, and a click follows it on the Machines tab", async () => {
    const { container } = render(<WorldsPanel store={viewer.store} />);
    fireEvent.click(toggle(container, 2));
    const machineLinks = (id: number) =>
      [...entity(container, 2, id).querySelectorAll("button[data-machine]")].map(
        (button) => button.textContent,
      );
    expect(machineLinks(1)).toEqual(["herd entity 1"]);
    expect(machineLinks(2)).toEqual([]);

    fireEvent.click(entity(container, 2, 1).querySelector("button[data-machine]") as HTMLElement);

    await waitFor(() =>
      expect(viewer.requests).toEqual([{ route: "/api/follow", body: { instance: 1 } }]),
    );
    await waitFor(() => expect(viewer.store.getState().tab).toBe("machines"));
    expect(viewer.store.getState().snapshot).toMatchObject({ following: 1, path: "/wander" });
  });
});

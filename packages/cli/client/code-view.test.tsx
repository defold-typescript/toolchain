import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// A document must exist before a component loads Radix; see test-dom.ts.
import "./test-dom";
import type { Snapshot } from "../src/hsm-view-session";
import { CodeView } from "./code-view";
import { act, cleanup, fireEvent, registerDom, render, unregisterDom, waitFor } from "./test-dom";
import { CRITTERS, startViewer, type TestViewer } from "./test-viewer";

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

  test("glows a rule whose when rejected the event dimmer than the rule that fired", async () => {
    const guarded = `import { defineMachine } from "@defold-typescript/types/hsm";
export const lamp = defineMachine("lamp")({
  initial: "/off",
  states: {
    off: {
      on: {
        TOGGLE: [
          { to: "/on", when: () => false },
          { to: "/on" },
        ],
      },
    },
    on: {},
  },
});
`;
    const file = path.join(dir, "guarded.ts");
    writeFileSync(file, guarded);
    const lines = guarded.split("\n");
    const rejectedLine = String(lines.findIndex((line) => line.includes("when: () => false")));
    const firedLine = String(lines.findIndex((line) => line.trim() === '{ to: "/on" },'));
    const guardedViewer = await startViewer(file, "{}");
    const { container } = render(<CodeView store={guardedViewer.store} file={0} />);

    act(() =>
      guardedViewer.store
        .getState()
        .receive(
          JSON.parse(JSON.stringify(guardedViewer.session.send({ type: "TOGGLE" }))) as Snapshot,
        ),
    );

    const overlays = (line: string, className: string): number =>
      container.querySelectorAll(`[data-line="${line}"] .${className}`).length;
    expect(overlays(rejectedLine, "animate-glow-dim")).toBeGreaterThan(0);
    expect(overlays(rejectedLine, "animate-glow")).toBe(0);
    expect(overlays(firedLine, "animate-glow")).toBeGreaterThan(0);
    expect(overlays(firedLine, "animate-glow-dim")).toBe(0);
  });
});

describe("CodeView systems", () => {
  let critters: TestViewer;

  beforeEach(async () => {
    const file = path.join(dir, "critters.ts");
    writeFileSync(file, CRITTERS);
    critters = await startViewer(file, "{}");
  });

  const linesOf = (text: string): string[] => {
    const lines = CRITTERS.split("\n");
    const first = lines.findIndex((line) => line.includes(text));
    const last = lines.findIndex((line, at) => at > first && line.startsWith("});"));
    return lines.slice(first, last + 1).map((_, at) => String(first + at));
  };

  const systemButtons = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLButtonElement>("button[data-system]")].map((button) => ({
      system: button.dataset.system,
      line: button.closest<HTMLElement>("[data-line]")?.dataset.line,
    }));

  const systemTinted = (container: HTMLElement): string[] => [
    ...new Set(
      [...container.querySelectorAll<HTMLElement>(".bg-system-tint")].map(
        (segment) => segment.closest<HTMLElement>("[data-line]")?.dataset.line ?? "",
      ),
    ),
  ];

  test("a system's definition opens it on the Worlds tab, selected and open, and tints it", () => {
    const { container } = render(<CodeView store={critters.store} file={0} />);
    const drift = linesOf('processingSystem<Critter>("drift")');
    expect(
      systemButtons(container)
        .filter((button) => button.system === "2")
        .map((button) => button.line),
    ).toEqual(drift);
    expect(systemTinted(container)).toEqual([]);

    fireEvent.click(container.querySelector('button[data-system="2"]') as HTMLButtonElement);

    const state = critters.store.getState();
    expect(state.tab).toBe("worlds");
    expect(state.selectedSystem).toBe(2);
    expect([...state.openSystems]).toEqual([2]);
    expect(systemTinted(container)).toEqual(drift);
    expect(critters.requests).toEqual([]);
  });

  test("keeps the machine's state tint and glow on the Worlds tab", async () => {
    const { container } = render(<CodeView store={critters.store} file={0} />);
    const keyLine = (state: string) =>
      container.querySelector<HTMLElement>(
        `[data-line="${CRITTERS.split("\n").findIndex((line) => line.includes(`${state}: {`))}"]`,
      );
    act(() => critters.store.getState().setTab("worlds"));

    await act(() => critters.store.getState().send("SCARE"));

    expect(critters.store.getState().tab).toBe("worlds");
    expect(keyLine("flee")?.querySelector(".bg-tint")?.textContent).toBe("flee");
    expect(keyLine("flee")?.querySelectorAll(".animate-glow").length).toBeGreaterThan(0);
  });
});

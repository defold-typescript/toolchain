import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { createHsmViewApp, type HsmViewIndex } from "../src/hsm-view-server";
import { createSession, type HsmViewSession, type Snapshot } from "../src/hsm-view-session";
import { onKeySpanId, ruleSpanId, stateSpanId } from "./highlight";
import { createViewerStore, type ViewerStore } from "./store";

const hsmSourceDir = requireHsmSourceDir();

// CRLF line breaks, so a column computed as if every break were one character is off.
const HERO = `import { defineMachine } from "@defold-typescript/types/hsm";
import { landing } from "./landing";
export const hero = defineMachine("hero")({
  initial: "/ground",
  states: {
    ground: {
      initial: "/ground/idle",
      on: {
        JUMP: [
          { target: "/air", guard: (ctx: { fuel: number }) => ctx.fuel > 99 },
          {
            target: "/air",
          },
        ],
      },
      states: {
        idle: {},
        ...landing,
      },
    },
    air: { on: { LAND: "/ground/landing" } },
  },
});
`.replaceAll("\n", "\r\n");

const LANDING = `export const landing = {
  landing: { always: "/ground/idle" },
};
`;

let dir: string;
let session: HsmViewSession;
let store: ViewerStore;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-store-"));
  writeFileSync(path.join(dir, "landing.ts"), LANDING);
  writeFileSync(path.join(dir, "main.ts"), HERO);
  session = createSession({ file: path.join(dir, "main.ts"), hsmSourceDir });
  const app = createHsmViewApp({ session, client: { js: "", css: "" } });
  store = createViewerStore();
  store.getState().setIndex((await (await app.request("/api/index")).json()) as HsmViewIndex);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function receive(snapshot: Snapshot): void {
  store.getState().receive(JSON.parse(JSON.stringify(snapshot)) as Snapshot);
}

function tinted(): string[] {
  return [...store.getState().highlight.tinted].sort();
}

function stamp(id: string): number {
  return store.getState().highlight.stamps[id] ?? 0;
}

function litFiles(): string[] {
  const { index, highlight } = store.getState();
  return [...highlight.litFiles].map((file) => index?.files[file]?.path ?? "?").sort();
}

function lineText(file: number, line: number): string {
  const lines = store.getState().index?.files[file]?.lines ?? [];
  return (lines[line] ?? []).map((run) => run.text).join("");
}

function pieces(file: number, id: string): string[] {
  const perLine = store.getState().lineSpans[file] ?? [];
  return perLine.flatMap((ranges, line) =>
    ranges
      .filter((range) => range.id === id)
      .map((range) => {
        const text = lineText(file, line);
        expect(range.end).toBeLessThanOrEqual(text.length);
        return text.slice(range.start, range.end);
      }),
  );
}

describe("viewer store", () => {
  test("tints exactly the active states after each snapshot", () => {
    receive(session.start({ fuel: 0 }));
    expect(tinted()).toEqual([stateSpanId("/ground"), stateSpanId("/ground/idle")]);

    receive(session.send({ type: "JUMP" }));
    expect(tinted()).toEqual([stateSpanId("/air")]);
  });

  test("restarts the glow on each entry and fired rule, and stamps a pass-through state without tinting it", () => {
    receive(session.start({ fuel: 0 }));
    receive(session.send({ type: "JUMP" }));
    expect(stamp(stateSpanId("/air"))).toBe(1);
    expect(stamp(ruleSpanId("/ground|on|JUMP|1"))).toBe(1);
    expect(stamp(onKeySpanId("/ground", "JUMP"))).toBe(1);
    expect(stamp(ruleSpanId("/ground|on|JUMP|0"))).toBe(0);

    receive(session.send({ type: "LAND" }));
    expect(stamp(stateSpanId("/ground/landing"))).toBe(1);
    expect(stamp(ruleSpanId("/ground/landing|always|0"))).toBe(1);
    expect(stamp(ruleSpanId("/air|on|LAND|0"))).toBe(1);
    expect(tinted()).toEqual([stateSpanId("/ground"), stateSpanId("/ground/idle")]);

    receive(session.send({ type: "JUMP" }));
    expect(stamp(stateSpanId("/air"))).toBe(2);
    expect(stamp(ruleSpanId("/ground|on|JUMP|1"))).toBe(2);
  });

  test("lights each file with a tinted or freshly stamped span, and unlights it after", () => {
    receive(session.start({ fuel: 0 }));
    receive(session.send({ type: "JUMP" }));
    expect(litFiles()).toEqual(["main.ts"]);

    receive(session.send({ type: "LAND" }));
    expect(litFiles()).toEqual(["landing.ts", "main.ts"]);

    receive(session.send({ type: "JUMP" }));
    expect(litFiles()).toEqual(["main.ts"]);
  });

  test("cuts a span that crosses line breaks into one range per line", () => {
    expect(pieces(0, ruleSpanId("/ground|on|JUMP|1"))).toEqual([
      "{",
      '            target: "/air",',
      "          }",
    ]);
    expect(pieces(0, stateSpanId("/ground/idle"))).toEqual(["idle"]);
    expect(pieces(0, onKeySpanId("/air", "LAND"))).toEqual(["LAND"]);
    expect(pieces(1, stateSpanId("/ground/landing"))).toEqual(["landing"]);
  });

  test("offers the on keys of active states only, with their event types", () => {
    receive(session.start({ fuel: 0 }));
    expect(store.getState().clickable.map(({ statePath, event }) => [statePath, event])).toEqual([
      ["/ground", "JUMP"],
    ]);
    expect(pieces(0, onKeySpanId("/ground", "JUMP"))).toEqual(["JUMP"]);

    receive(session.send({ type: "JUMP" }));
    expect(store.getState().clickable.map(({ statePath, event }) => [statePath, event])).toEqual([
      ["/air", "LAND"],
    ]);
  });
});

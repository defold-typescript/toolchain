import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { ruleId } from "../src/hsm-view-index";
import { createHsmViewApp, type HsmViewIndex } from "../src/hsm-view-server";
import { createSession, type HsmViewSession, type Snapshot } from "../src/hsm-view-session";
import { onKeySpanId, ruleSpanId, stateSpanId } from "./highlight";
import { createViewerStore, type FrameScheduler, type ViewerStore } from "./store";
import { startViewer, type TestViewer } from "./test-viewer";

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
    air: { on: { LAND: "/ground/landing", "A|on|B": "/ground" } },
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
    expect(stamp(ruleSpanId(ruleId("/ground", "on", "JUMP", 1)))).toBe(1);
    expect(stamp(onKeySpanId("/ground", "JUMP"))).toBe(1);
    expect(stamp(ruleSpanId(ruleId("/ground", "on", "JUMP", 0)))).toBe(0);

    receive(session.send({ type: "LAND" }));
    expect(stamp(stateSpanId("/ground/landing"))).toBe(1);
    expect(stamp(ruleSpanId(ruleId("/ground/landing", "always", 0)))).toBe(1);
    expect(stamp(ruleSpanId(ruleId("/air", "on", "LAND", 0)))).toBe(1);
    expect(tinted()).toEqual([stateSpanId("/ground"), stateSpanId("/ground/idle")]);

    receive(session.send({ type: "JUMP" }));
    expect(stamp(stateSpanId("/air"))).toBe(2);
    expect(stamp(ruleSpanId(ruleId("/ground", "on", "JUMP", 1)))).toBe(2);
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
    expect(pieces(0, ruleSpanId(ruleId("/ground", "on", "JUMP", 1)))).toEqual([
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
      ["/air", "A|on|B"],
    ]);
  });

  test("lights the exact on key of a fired rule whose event contains |on|", () => {
    receive(session.start({ fuel: 0 }));
    receive(session.send({ type: "JUMP" }));
    receive(session.send({ type: "A|on|B" }));
    expect(stamp(ruleSpanId(ruleId("/air", "on", "A|on|B", 0)))).toBe(1);
    expect(stamp(onKeySpanId("/air", "A|on|B"))).toBe(1);
    expect(tinted()).toEqual([stateSpanId("/ground"), stateSpanId("/ground/idle")]);
  });
});

const COLLIDING = `import { defineMachine } from "@defold-typescript/types/hsm";
export const colliding = defineMachine("colliding")({
  initial: "/a",
  states: {
    a: { on: { "b|on|c": "/a|on|b", "on|b|c": "/a|on|b" } },
    "a|on|b": { on: { c: "/a" } },
  },
});
`;

describe("colliding state names and event types", () => {
  beforeEach(async () => {
    writeFileSync(path.join(dir, "colliding.ts"), COLLIDING);
    session = createSession({ file: path.join(dir, "colliding.ts"), hsmSourceDir });
    const app = createHsmViewApp({ session, client: { js: "", css: "" } });
    store = createViewerStore();
    store.getState().setIndex((await (await app.request("/api/index")).json()) as HsmViewIndex);
  });

  test("lights only the fired rule and its own on key", () => {
    const first = ruleSpanId(ruleId("/a", "on", "b|on|c", 0));
    const second = ruleSpanId(ruleId("/a|on|b", "on", "c", 0));
    receive(session.start({}));

    receive(session.send({ type: "b|on|c" }));
    expect(stamp(first)).toBe(1);
    expect(stamp(onKeySpanId("/a", "b|on|c"))).toBe(1);
    expect(stamp(second)).toBe(0);
    expect(stamp(onKeySpanId("/a|on|b", "c"))).toBe(0);

    receive(session.send({ type: "c" }));
    expect(stamp(second)).toBe(1);
    expect(stamp(onKeySpanId("/a|on|b", "c"))).toBe(1);
    expect(stamp(first)).toBe(1);
    expect(stamp(onKeySpanId("/a", "b|on|c"))).toBe(1);

    receive(session.send({ type: "on|b|c" }));
    expect(stamp(onKeySpanId("/a", "on|b|c"))).toBe(1);
    expect(stamp(onKeySpanId("/a|on|b", "c"))).toBe(1);
  });
});

const HALTING = `import { defineMachine } from "@defold-typescript/types/hsm";
export const halting = defineMachine("halting")({
  initial: "/idle",
  states: {
    idle: { after: { 0.05: "/broken" } },
    broken: { enter: () => { throw new Error("boom"); } },
  },
});
`;

/** Lets every pending request run as far as it can. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function manualFrames() {
  let next = 0;
  const queued = new Map<number, (time: number) => void>();
  const scheduler: FrameScheduler = {
    request: (callback) => {
      next += 1;
      queued.set(next, callback);
      return next;
    },
    cancel: (id) => {
      queued.delete(id);
    },
  };
  return {
    scheduler,
    queued: () => queued.size,
    /** Runs every queued frame at `ms`, then waits until those ticks settle or stall on a hold. */
    async frame(ms: number): Promise<void> {
      const callbacks = [...queued.values()];
      queued.clear();
      const ticks = callbacks.map((callback) => Promise.resolve(callback(ms) as unknown));
      await Promise.race([Promise.all(ticks), settle()]);
    },
  };
}

function holds() {
  let pending: { route: string; promise: Promise<void> } | undefined;
  return {
    hold: (route: string): Promise<void> | undefined => {
      if (pending?.route !== route) {
        return undefined;
      }
      const { promise } = pending;
      pending = undefined;
      return promise;
    },
    /**
     * Keeps the next request on `route` off the server until the returned release is called.
     * Releasing with a `failure` makes that request throw it before it reaches the server.
     */
    next(route: string): (failure?: string) => void {
      let release: (failure?: string) => void = () => {};
      const promise = new Promise<void>((resolve, reject) => {
        release = (failure) => (failure === undefined ? resolve() : reject(new Error(failure)));
      });
      pending = { route, promise };
      return release;
    },
    /** Makes the next request on `route` throw `message` before it reaches the server. */
    fail(route: string, message: string): void {
      const promise = Promise.reject(new Error(message));
      promise.catch(() => {});
      pending = { route, promise };
    },
  };
}

describe("play loop", () => {
  let frames: ReturnType<typeof manualFrames>;
  let held: ReturnType<typeof holds>;

  beforeEach(() => {
    frames = manualFrames();
    held = holds();
  });

  const play = (file: string) =>
    startViewer(path.join(dir, file), "{}", { frames: frames.scheduler, hold: held.hold });

  const routes = (viewer: TestViewer) => viewer.requests.map((request) => request.route);

  test("Start stops Play and runs after the in-flight update", async () => {
    const viewer = await play("main.ts");
    viewer.store.getState().setPlaying(true);
    await frames.frame(0);
    const release = held.next("/api/update");
    await frames.frame(50);

    const started = viewer.store.getState().start();
    expect(viewer.store.getState().playing).toBe(false);
    await settle();
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);

    release();
    await started;
    expect(routes(viewer)).toEqual(["/api/update", "/api/update", "/api/start"]);
    expect(viewer.session.snapshot().t).toBe(0);
    expect(viewer.store.getState().snapshot?.t).toBe(0);

    await frames.frame(100);
    await frames.frame(150);
    expect(routes(viewer)).toHaveLength(3);
  });

  test("Start after Pause and Play waits for the paused loop's update", async () => {
    const viewer = await play("main.ts");
    viewer.store.getState().setPlaying(true);
    await frames.frame(0);
    const release = held.next("/api/update");
    await frames.frame(50);
    viewer.store.getState().setPlaying(false);
    viewer.store.getState().setPlaying(true);
    await frames.frame(100);
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);

    const started = viewer.store.getState().start();
    await settle();
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);
    expect(viewer.store.getState().playing).toBe(false);

    release();
    await started;
    expect(routes(viewer)).toEqual(["/api/update", "/api/update", "/api/start"]);
    expect(viewer.session.snapshot().t).toBe(0);
    expect(viewer.store.getState().snapshot?.t).toBe(0);

    await frames.frame(150);
    await frames.frame(200);
    expect(routes(viewer)).toHaveLength(3);
    expect(frames.queued()).toBe(0);
  });

  test("stops after Pause and Play when the paused loop's update fails", async () => {
    const viewer = await play("main.ts");
    viewer.store.getState().setPlaying(true);
    await frames.frame(0);
    const release = held.next("/api/update");
    await frames.frame(50);
    viewer.store.getState().setPlaying(false);
    viewer.store.getState().setPlaying(true);
    await frames.frame(100);
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);

    release("offline");
    await settle();
    const state = viewer.store.getState();
    expect(state.error).toBe("offline");
    expect(state.playing).toBe(false);
    expect(frames.queued()).toBe(0);
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);

    await frames.frame(150);
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);
  });

  test("keeps playing after Pause and Play when the paused loop's update succeeds", async () => {
    const viewer = await play("main.ts");
    viewer.store.getState().setPlaying(true);
    await frames.frame(0);
    const release = held.next("/api/update");
    await frames.frame(50);
    viewer.store.getState().setPlaying(false);
    viewer.store.getState().setPlaying(true);
    await frames.frame(100);
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);

    release();
    await settle();
    const state = viewer.store.getState();
    expect(routes(viewer)).toEqual(["/api/update", "/api/update", "/api/update"]);
    expect(state.error).toBeUndefined();
    expect(state.playing).toBe(true);
    expect(frames.queued()).toBe(1);
  });

  test("caps a frame's time and scales it by the speed", async () => {
    const viewer = await play("main.ts");
    viewer.store.getState().setSpeed(0.5);
    viewer.store.getState().setPlaying(true);
    await frames.frame(0);
    await frames.frame(1000);
    expect(viewer.requests.map((request) => request.body)).toEqual([{ dt: 0 }, { dt: 0.05 }]);
  });

  test("sends no update while the last one is unanswered", async () => {
    const viewer = await play("main.ts");
    viewer.store.getState().setPlaying(true);
    const release = held.next("/api/update");
    await frames.frame(0);
    await frames.frame(16);
    await frames.frame(32);
    expect(routes(viewer)).toEqual(["/api/update"]);

    release();
    await settle();
    await frames.frame(48);
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);
  });

  test("stops when the machine halts", async () => {
    writeFileSync(path.join(dir, "halting.ts"), HALTING);
    const viewer = await play("halting.ts");
    viewer.store.getState().setPlaying(true);
    for (
      let ms = 0;
      ms <= 500 && viewer.store.getState().snapshot?.error === undefined;
      ms += 100
    ) {
      await frames.frame(ms);
    }
    expect(viewer.store.getState().snapshot?.error).toBe("boom");
    expect(viewer.store.getState().playing).toBe(false);

    const sent = viewer.requests.length;
    await frames.frame(1000);
    expect(viewer.requests).toHaveLength(sent);
    expect(frames.queued()).toBe(0);
  });

  test("stops when an update request fails", async () => {
    const viewer = await play("main.ts");
    viewer.store.getState().setPlaying(true);
    await frames.frame(0);
    held.fail("/api/update", "offline");
    await frames.frame(50);
    const state = viewer.store.getState();
    expect(state.error).toBe("offline");
    expect(state.snapshot?.running).toBe(true);
    expect(state.snapshot?.error).toBeUndefined();
    expect(state.playing).toBe(false);
    expect(frames.queued()).toBe(0);

    await frames.frame(100);
    expect(routes(viewer)).toEqual(["/api/update", "/api/update"]);
  });
});

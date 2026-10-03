import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type SequenceSignal, sequence } from "./async";
import { defineMachine } from "./index";

type Ev = { type: "DONE" } | { type: "LEAVE" };

interface Ctx {
  log: string[];
  signal?: SequenceSignal;
}

type TimerCallback = (self: unknown, handle: number, elapsed: number) => void;

interface Delay {
  readonly handle: number;
  readonly seconds: number;
  readonly callback: TimerCallback;
}

const globals = globalThis as unknown as { timer?: unknown };
let savedTimer: unknown;
let delays: Delay[];
let cancelled: number[];

beforeEach(() => {
  savedTimer = globals.timer;
  delays = [];
  cancelled = [];
  globals.timer = {
    delay: (seconds: number, _repeating: boolean, callback: TimerCallback) => {
      const handle = delays.length + 1;
      delays.push({ handle, seconds, callback });
      return handle;
    },
    cancel: (handle: number) => {
      cancelled.push(handle);
      return true;
    },
  };
});

afterEach(() => {
  globals.timer = savedTimer;
});

function fire(index: number): void {
  const delay = delays[index];
  if (delay === undefined) {
    throw new Error(`no timer at ${index}`);
  }
  delay.callback(undefined, delay.handle, delay.seconds);
}

function settleMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function waitThenDone() {
  return defineMachine<Ctx, Ev>()({
    initial: "/run",
    states: {
      run: {
        invoke: sequence(async (ctx, signal) => {
          ctx.signal = signal;
          ctx.log.push("start");
          await signal.wait(1);
          ctx.log.push("woke");
          return { type: "DONE" };
        }),
        on: { DONE: "/done", LEAVE: "/away" },
      },
      done: {},
      away: {},
    },
  });
}

function signalOf(ctx: Ctx): SequenceSignal {
  if (ctx.signal === undefined) {
    throw new Error("the sequence did not start");
  }
  return ctx.signal;
}

describe("sequence", () => {
  test("a wait resumes when its timer fires, and the returned event moves the machine", async () => {
    const ctx: Ctx = { log: [] };
    const m = waitThenDone().start(ctx);
    expect(ctx.log).toEqual(["start"]);
    expect(delays.map((d) => d.seconds)).toEqual([1]);
    expect(m.path).toBe("/run");
    fire(0);
    await settleMicrotasks();
    expect(ctx.log).toEqual(["start", "woke"]);
    expect(m.path).toBe("/done");
    expect(cancelled).toEqual([]);
  });

  test("leaving the state cancels the pending timer, and a stale callback resumes nothing", async () => {
    const ctx: Ctx = { log: [] };
    const m = waitThenDone().start(ctx);
    m.send({ type: "LEAVE" });
    expect(cancelled).toEqual([1]);
    fire(0);
    await settleMicrotasks();
    expect(ctx.log).toEqual(["start"]);
    expect(m.path).toBe("/away");
  });

  test("aborted is false while the state is active and true once it is left or stopped", () => {
    const leaving: Ctx = { log: [] };
    const left = waitThenDone().start(leaving);
    expect(signalOf(leaving).aborted).toBe(false);
    left.send({ type: "LEAVE" });
    expect(signalOf(leaving).aborted).toBe(true);

    const stopping: Ctx = { log: [] };
    const stopped = waitThenDone().start(stopping);
    expect(signalOf(stopping).aborted).toBe(false);
    stopped.stop();
    expect(signalOf(stopping).aborted).toBe(true);
    expect(cancelled).toEqual([1, 2]);
  });

  test("a wait started after the state is left schedules no timer", () => {
    const ctx: Ctx = { log: [] };
    const m = waitThenDone().start(ctx);
    m.send({ type: "LEAVE" });
    void signalOf(ctx).wait(2);
    expect(delays.length).toBe(1);
  });

  test("a returned event outside the machine's union fails to compile", () => {
    defineMachine<Ctx, Ev>()({
      initial: "/run",
      states: {
        run: {
          // @ts-expect-error NOPE is not one of the machine's events
          invoke: sequence(async () => ({ type: "NOPE" })),
        },
      },
    });
  });

  test("a sequence that throws leaves the machine in place and rethrows from a fresh timer", async () => {
    const failure = new Error("boom");
    const def = defineMachine<Ctx, Ev>()({
      initial: "/run",
      states: {
        run: {
          invoke: sequence<Ctx, Ev>(async (_ctx, signal) => {
            await signal.wait(1);
            throw failure;
          }),
          on: { DONE: "/done" },
        },
        done: {},
      },
    });
    const m = def.start({ log: [] });
    fire(0);
    await settleMicrotasks();
    expect(m.path).toBe("/run");
    expect(delays.map((d) => d.seconds)).toEqual([1, 0]);
    expect(() => fire(1)).toThrow(failure);
  });
});

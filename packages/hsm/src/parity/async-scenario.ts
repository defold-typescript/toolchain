import { type SequenceSignal, sequence } from "../async";
import { defineMachine } from "../index";

type Ev = { type: "DONE" } | { type: "LEAVE" } | { type: "AGAIN" };

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

function logged(name: string) {
  return {
    enter: (ctx: Ctx) => {
      ctx.log.push(`enter ${name}`);
    },
    exit: (ctx: Ctx) => {
      ctx.log.push(`exit ${name}`);
    },
  };
}

function shown(path: string | undefined): string {
  return path === undefined ? "(stopped)" : path;
}

function scripted(ctx: Ctx, delays: Delay[]): void {
  const def = defineMachine<Ctx, Ev>()({
    initial: "/run",
    states: {
      run: {
        ...logged("run"),
        invoke: sequence(async (c, signal) => {
          c.signal = signal;
          c.log.push("wait");
          await signal.wait(1);
          c.log.push("resumed");
          return { type: "DONE" };
        }),
        on: { DONE: "/done", LEAVE: "/away" },
      },
      done: { ...logged("done"), on: { AGAIN: "/run" } },
      away: logged("away"),
    },
  });
  const m = def.start(ctx);
  fire(delays, 0);
  ctx.log.push(`path=${shown(m.path)}`);
  m.send({ type: "AGAIN" });
  m.send({ type: "LEAVE" });
  ctx.log.push(`aborted=${ctx.signal?.aborted}`);
  fire(delays, 1);
  ctx.log.push(`path=${shown(m.path)}`);
}

function failing(ctx: Ctx, delays: Delay[]): void {
  const def = defineMachine<Ctx, Ev>()({
    initial: "/fail",
    states: {
      fail: {
        invoke: sequence<Ctx, Ev>(async (_c, signal) => {
          await signal.wait(1);
          throw "boom";
        }),
        on: { DONE: "/done" },
      },
      done: {},
    },
  });
  const m = def.start(ctx);
  fire(delays, 2);
  ctx.log.push(`path=${shown(m.path)}`);
  try {
    fire(delays, 3);
    ctx.log.push("no rethrow");
  } catch (error) {
    ctx.log.push(`error: ${String(error)}`);
  }
}

function fire(delays: Delay[], index: number): void {
  const delay = delays[index] as Delay;
  delay.callback(undefined, delay.handle, delay.seconds);
}

export function runAsyncScenario(): string {
  const ctx: Ctx = { log: [] };
  const delays: Delay[] = [];
  const globals = globalThis as unknown as { timer: unknown };
  const saved = globals.timer;
  globals.timer = {
    delay: (seconds: number, _repeating: boolean, callback: TimerCallback) => {
      const handle = delays.length + 1;
      delays.push({ handle, seconds, callback });
      ctx.log.push(`timer.delay ${seconds} -> ${handle}`);
      return handle;
    },
    cancel: (handle: number) => {
      ctx.log.push(`timer.cancel ${handle}`);
      return true;
    },
  };
  try {
    scripted(ctx, delays);
    failing(ctx, delays);
  } finally {
    globals.timer = saved;
  }
  return ctx.log.join("\n");
}

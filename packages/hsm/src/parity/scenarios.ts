import { defineMachine } from "../index";

type Ev =
  | { type: "GO" }
  | { type: "BACK" }
  | { type: "HIT" }
  | { type: "PING" }
  | { type: "NOPE" }
  | { type: "TO2" }
  | { type: "UP" }
  | { type: "AGAIN" }
  | { type: "LOADED" }
  | { type: "10" }
  | { type: "STEP"; n: number };

interface Ctx {
  log: string[];
  flag: boolean;
  settles: ((event: Ev) => void)[];
}

function newCtx(log: string[], flag = false): Ctx {
  return { log, flag, settles: [] };
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

function settleHeld(ctx: Ctx, index: number, event: Ev): void {
  const settle = ctx.settles[index];
  if (settle === undefined) {
    ctx.log.push(`no settle ${index}`);
    return;
  }
  settle(event);
}

function recordDefinitionError(log: string[], define: () => unknown): void {
  try {
    define();
    log.push("defined");
  } catch (error) {
    log.push(`error: ${String(error)}`);
  }
}

function start(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "a",
    states: {
      a: {
        ...logged("a"),
        initial: "b",
        states: { b: { ...logged("a.b"), initial: "c", states: { c: logged("a.b.c") } } },
        on: { GO: "ab" },
      },
      ab: logged("ab"),
    },
  });
  const m = def.start(newCtx(log));
  log.push(`path=${m.path}`);
  log.push(`matches(a)=${m.matches("a")}`);
  log.push(`matches(a.b)=${m.matches("a.b")}`);
  m.send({ type: "GO" });
  log.push(`path=${m.path}`);
  log.push(`matches(ab)=${m.matches("ab")}`);
  log.push(`matches(a)=${m.matches("a")}`);
  return log;
}

function numericNames(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "0",
    states: {
      "0": { ...logged("0"), on: { "10": "1" } },
      "1": { ...logged("1"), initial: "0", states: { "0": logged("1.0") } },
    },
  });
  const m = def.start(newCtx(log));
  log.push(`path=${m.path}`);
  m.send({ type: "10" });
  log.push(`path=${m.path}`);
  log.push(`matches(1)=${m.matches("1")}`);
  log.push(`matches(0)=${m.matches("0")}`);
  return log;
}

function guardsAndBubbling(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "p",
    states: {
      p: {
        ...logged("p"),
        initial: "c",
        states: {
          c: {
            ...logged("p.c"),
            on: {
              HIT: [
                {
                  guard: (ctx) => {
                    ctx.log.push("guard 1");
                    return false;
                  },
                  target: "c",
                },
                {
                  guard: (ctx) => {
                    ctx.log.push("guard 2");
                    return ctx.flag;
                  },
                  target: "d",
                },
                {
                  guard: (ctx) => {
                    ctx.log.push("guard 3");
                    return false;
                  },
                  target: "c",
                },
              ],
            },
          },
          d: logged("p.d"),
        },
        on: { HIT: "z" },
      },
      z: logged("z"),
    },
  });
  const first = def.start(newCtx(log, true));
  first.send({ type: "HIT" });
  log.push(`path=${first.path}`);
  log.push("second instance");
  const second = def.start(newCtx(log, false));
  second.send({ type: "HIT" });
  log.push(`path=${second.path}`);
  second.send({ type: "NOPE" });
  log.push(`path=${second.path}`);
  return log;
}

function targetlessAndReentry(): string[] {
  const log: string[] = [];
  const self = defineMachine<Ctx, Ev>()({
    initial: "s",
    on: { HIT: "s" },
    states: {
      s: {
        ...logged("s"),
        on: {
          PING: {
            actions: (ctx) => {
              ctx.log.push("ping");
            },
          },
        },
      },
    },
  });
  const m = self.start(newCtx(log));
  m.send({ type: "PING" });
  log.push(`path=${m.path}`);
  m.send({ type: "HIT" });
  log.push(`path=${m.path}`);

  const build = (reenter: boolean) =>
    defineMachine<Ctx, Ev>()({
      initial: "p",
      states: {
        p: {
          ...logged("p"),
          initial: "c1",
          states: { c1: logged("p.c1"), c2: logged("p.c2") },
          on: { TO2: { target: "#p.c2", reenter } },
        },
      },
    });
  const keep = build(false).start(newCtx(log));
  keep.send({ type: "TO2" });
  log.push(`path=${keep.path}`);
  const reentered = build(true).start(newCtx(log));
  reentered.send({ type: "TO2" });
  log.push(`path=${reentered.path}`);
  return log;
}

function queuedSends(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "a",
    on: {
      STEP: {
        actions: (ctx, event) => {
          ctx.log.push(`step ${event.n}`);
        },
      },
    },
    states: {
      a: { ...logged("a"), on: { GO: "b" } },
      b: {
        enter: (ctx, m) => {
          ctx.log.push("enter b");
          m.send({ type: "STEP", n: 1 });
          m.send({ type: "STEP", n: 2 });
        },
        initial: "b1",
        states: {
          b1: {
            enter: (ctx, m) => {
              ctx.log.push("enter b.b1");
              m.send({ type: "STEP", n: 3 });
            },
          },
        },
      },
    },
  });
  const m = def.start(newCtx(log));
  m.send({ type: "GO" });
  m.send({ type: "STEP", n: 4 });
  log.push(`path=${m.path}`);
  return log;
}

function updateAndAfter(): string[] {
  const log: string[] = [];
  const updating = defineMachine<Ctx, Ev>()({
    initial: "p",
    states: {
      p: {
        update: (ctx, dt) => {
          ctx.log.push(`update p ${dt}`);
          return undefined;
        },
        initial: "c",
        states: {
          c: {
            ...logged("p.c"),
            update: (ctx, dt) => {
              ctx.log.push(`update p.c ${dt}`);
              return ctx.flag ? "c2" : undefined;
            },
          },
          c2: logged("p.c2"),
        },
      },
    },
  });
  const ctx = newCtx(log);
  const u = updating.start(ctx);
  u.update(0.25);
  ctx.flag = true;
  u.update(0.5);
  log.push(`path=${u.path}`);

  const timed = defineMachine<Ctx, Ev>()({
    initial: "a",
    states: {
      a: { ...logged("a"), after: { 1: "x", 0.5: "y" }, on: { GO: "b" } },
      b: { ...logged("b"), on: { BACK: "a" } },
      x: logged("x"),
      y: logged("y"),
    },
  });
  const t = timed.start(newCtx(log));
  t.update(0.25);
  log.push(`path=${t.path}`);
  t.send({ type: "GO" });
  t.send({ type: "BACK" });
  t.update(0.25);
  log.push(`path=${t.path}`);
  t.update(0.25);
  log.push(`path=${t.path}`);
  log.push("second instance");
  const both = timed.start(newCtx(log));
  both.update(1);
  log.push(`path=${both.path}`);
  return log;
}

function stop(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "a",
    on: {
      PING: {
        actions: (ctx) => {
          ctx.log.push("ping");
        },
      },
    },
    states: {
      a: { ...logged("a"), after: { 0.5: "b" }, on: { GO: "b" } },
      b: {
        enter: (ctx, m) => {
          ctx.log.push("enter b");
          m.send({ type: "PING" });
          m.stop();
        },
        exit: (ctx) => {
          ctx.log.push("exit b");
        },
        initial: "b1",
        states: { b1: logged("b.b1") },
      },
    },
  });
  const m = def.start(newCtx(log));
  m.send({ type: "GO" });
  log.push(`path=${m.path}`);
  m.send({ type: "GO" });
  m.update(10);
  m.stop();
  log.push(`path=${m.path}`);
  log.push(`matches(a)=${m.matches("a")}`);
  return log;
}

function invoke(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "loading",
    states: {
      loading: {
        invoke: (ctx, settle) => {
          ctx.log.push("invoke loading");
          ctx.settles.push(settle);
        },
        on: {
          PING: {
            actions: (ctx) => {
              ctx.log.push("ping");
            },
          },
          LOADED: "ready",
          AGAIN: { target: "loading", reenter: true },
          UP: "idle",
        },
      },
      ready: logged("ready"),
      idle: { on: { BACK: "loading" } },
    },
  });
  const ctx = newCtx(log);
  const m = def.start(ctx);
  m.send({ type: "AGAIN" });
  settleHeld(ctx, 0, { type: "LOADED" });
  log.push(`path=${m.path}`);
  settleHeld(ctx, 1, { type: "PING" });
  settleHeld(ctx, 1, { type: "PING" });
  settleHeld(ctx, 1, { type: "LOADED" });
  log.push(`path=${m.path}`);
  m.send({ type: "UP" });
  log.push(`path=${m.path}`);
  m.send({ type: "BACK" });
  m.send({ type: "UP" });
  settleHeld(ctx, 2, { type: "LOADED" });
  log.push(`path=${m.path}`);
  m.send({ type: "BACK" });
  m.stop();
  settleHeld(ctx, 3, { type: "LOADED" });
  log.push(`path=${m.path}`);
  return log;
}

function definitionErrors(): string[] {
  const log: string[] = [];
  const define = defineMachine<Ctx, Ev>();
  recordDefinitionError(log, () =>
    define({
      initial: "attack",
      states: { attack: { initial: "recover", states: { recover: { on: { GO: "nope" } } } } },
    }),
  );
  recordDefinitionError(log, () =>
    define({
      initial: "outer",
      states: { outer: { initial: "inner", states: { inner: { states: { leaf: {} } } } } },
    }),
  );
  recordDefinitionError(log, () =>
    define({ initial: "outer", states: { outer: { initial: "ghost", states: { leaf: {} } } } }),
  );
  recordDefinitionError(log, () =>
    define({ initial: "a", states: { a: { after: { abc: "a" } as never } } }),
  );
  recordDefinitionError(log, () =>
    define({ initial: "a", states: { a: { after: { "": "a" } as never } } }),
  );
  recordDefinitionError(log, () =>
    define({ initial: "a", states: { a: { after: { "-1": "a" } as never } } }),
  );
  return log;
}

export const scenarios: { name: string; run: () => string[] }[] = [
  { name: "start", run: () => start() },
  { name: "numeric names", run: () => numericNames() },
  { name: "guards and bubbling", run: () => guardsAndBubbling() },
  { name: "targetless and reentry", run: () => targetlessAndReentry() },
  { name: "queued sends", run: () => queuedSends() },
  { name: "update and after", run: () => updateAndAfter() },
  { name: "stop", run: () => stop() },
  { name: "invoke", run: () => invoke() },
  { name: "definition errors", run: () => definitionErrors() },
];

export function runScenario(name: string): string {
  for (const scenario of scenarios) {
    if (scenario.name === name) {
      return scenario.run().join("\n");
    }
  }
  return `unknown scenario ${name}`;
}

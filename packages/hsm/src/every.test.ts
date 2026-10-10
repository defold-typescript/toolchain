import { describe, expect, test } from "bun:test";
import { defineMachine, type MachineInstance } from "./index";

interface Ctx {
  ready: boolean;
  rate: number;
  log: string[];
}

type Ev = { type: "GO" } | { type: "BACK" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

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

function note(text: string) {
  return (ctx: Ctx) => {
    ctx.log.push(text);
  };
}

function newCtx(): Ctx {
  return { ready: false, rate: 1, log: [] };
}

const NOT_POSITIVE = 'hsm: state "/a" has an every delay "0" that is not a positive number';

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  return "";
}

describe("every at run time", () => {
  test("an entry runs each time its delay passes on the state's clock, and a run is not a move", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { ...logged("a"), every: { 1: note("tick") }, on: { GO: "/b" } },
        b: { on: { BACK: "/a" } },
      },
    }).start(ctx);
    let moves = 0;
    m.onMove(() => {
      moves += 1;
    });
    m.update(0.5);
    expect(ctx.log).toEqual(["enter a"]);
    m.update(0.5);
    expect(ctx.log).toEqual(["enter a", "tick"]);
    m.update(1);
    expect(ctx.log).toEqual(["enter a", "tick", "tick"]);
    expect(moves).toBe(0);
    expect(m.path).toBe("/a");
    m.send({ type: "GO" });
    m.update(5);
    m.send({ type: "BACK" });
    m.update(0.5);
    expect(ctx.log).toEqual(["enter a", "tick", "tick", "exit a", "enter a"]);
    m.update(0.5);
    expect(ctx.log).toEqual(["enter a", "tick", "tick", "exit a", "enter a", "tick"]);
  });

  test("a call that covers several delays runs the entry once, and later runs stay on multiples", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { every: { 1: note("tick") } } },
    }).start(ctx);
    m.update(2.5);
    expect(ctx.log).toEqual(["tick"]);
    m.update(0.25);
    expect(ctx.log).toEqual(["tick"]);
    m.update(0.25);
    expect(ctx.log).toEqual(["tick", "tick"]);
  });

  test("a delay function is read once per entry, after the enter hook, and a run list runs in order", () => {
    let reads = 0;
    const ctx = newCtx();
    ctx.rate = 4;
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          enter: (ctx) => {
            ctx.rate = 0.5;
          },
          every: [
            {
              delay: (ctx) => {
                reads += 1;
                return ctx.rate;
              },
              run: [note("one"), note("two")],
            },
          ],
          on: { GO: "/b" },
        },
        b: { on: { BACK: "/a" } },
      },
    }).start(ctx);
    m.update(0.5);
    expect(ctx.log).toEqual(["one", "two"]);
    expect(reads).toBe(1);
    ctx.rate = 4;
    m.update(0.5);
    expect(ctx.log).toEqual(["one", "two", "one", "two"]);
    expect(reads).toBe(1);
    m.send({ type: "GO" });
    m.send({ type: "BACK" });
    expect(reads).toBe(2);
  });

  test("a run receives the instance, and an event it sends or a stop it asks for lands in that update", () => {
    let runSaw: unknown;
    const stored = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          every: {
            1: (_ctx, machine) => {
              runSaw = machine;
            },
          },
        },
      },
    }).start(newCtx());
    stored.update(1);
    expect(runSaw).toBe(stored);
    const sender = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { every: { 1: (_ctx, machine) => machine.send({ type: "GO" }) }, on: { GO: "/b" } },
        b: {},
      },
    }).start(newCtx());
    sender.update(1);
    expect(sender.path).toBe("/b");
    const ctx = newCtx();
    const stopper = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          every: { 1: (_ctx, machine) => machine.stop() },
          after: { 1: { run: note("late") } },
        },
      },
    }).start(ctx);
    stopper.update(1);
    expect(stopper.path).toBeUndefined();
    expect(ctx.log).toEqual([]);
  });

  test("entries run deepest state first and before that state's timers, a list in list order and a record by delay", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/a",
          every: { 1: note("p") },
          after: { 1: { run: note("p after") } },
          states: {
            a: {
              every: [
                { delay: 2, run: note("a2") },
                { delay: 1, run: note("a1") },
              ],
              after: { 2: { run: note("a after") } },
            },
          },
        },
      },
    }).start(ctx);
    m.update(2);
    expect(ctx.log).toEqual(["a2", "a1", "a after", "p", "p after"]);
    const record = newCtx();
    const byDelay = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { every: { 2: note("two"), 0.5: note("half"), 1: note("one") } } },
    }).start(record);
    byDelay.update(2);
    expect(record.log).toEqual(["half", "one", "two"]);
  });

  test("a run does not recheck always, and in a region it leaves the parallel state's update hook running", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/s",
      states: {
        s: {
          always: { to: "/t", when: (ctx) => ctx.ready },
          every: {
            1: (ctx) => {
              ctx.ready = true;
            },
          },
        },
        t: {},
      },
    }).start(newCtx());
    m.update(1);
    expect(m.path).toBe("/s");
    m.update(1);
    expect(m.path).toBe("/s");
    const ctx = newCtx();
    const regions = defineMachine<Ctx, Ev>()({
      initial: "/both",
      states: {
        both: {
          type: "parallel",
          update: (ctx) => {
            ctx.log.push("tick");
            return undefined;
          },
          states: { region: { every: { 1: note("region") } } },
        },
      },
    }).start(ctx);
    regions.update(1);
    expect(ctx.log).toEqual(["region", "tick"]);
  });

  test("an entry due on a call an update hook or a deeper timer moved runs on the next call", () => {
    const ctx = newCtx();
    ctx.ready = true;
    const hooked = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/a",
          every: { 1: note("p") },
          states: { a: { update: (ctx) => (ctx.ready ? "/p/b" : undefined) }, b: {} },
        },
      },
    }).start(ctx);
    hooked.update(1);
    expect(hooked.path).toBe("/p/b");
    expect(ctx.log).toEqual([]);
    hooked.update(0.25);
    expect(ctx.log).toEqual(["p"]);
    hooked.update(0.5);
    expect(ctx.log).toEqual(["p"]);
    hooked.update(0.25);
    expect(ctx.log).toEqual(["p", "p"]);
    const timed = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/a",
          every: { 1: note("p") },
          states: { a: { after: { 1: "/p/b" } }, b: {} },
        },
      },
    }).start(newCtx());
    timed.update(1);
    expect(timed.path).toBe("/p/b");
    expect(timed.ctx.log).toEqual([]);
    timed.update(0);
    expect(timed.ctx.log).toEqual(["p"]);
  });

  test("the root takes every, and its clock keeps counting while its children change", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      every: { 1: note("root") },
      states: { a: { on: { GO: "/b" } }, b: {} },
    }).start(ctx);
    m.update(0.5);
    m.send({ type: "GO" });
    m.update(0.5);
    expect(ctx.log).toEqual(["root"]);
  });

  test("a hot reload keeps the state's clock, and each entry next runs at the first multiple of its delay above it", () => {
    const define = () =>
      defineMachine<Ctx, Ev>("every reload")({
        initial: "/a",
        states: { a: { every: { 1: note("tick") } } },
      });
    const ctx = newCtx();
    const m = define().start(ctx);
    m.update(0.5);
    define();
    m.update(0.5);
    expect(ctx.log).toEqual(["tick"]);
    defineMachine<Ctx, Ev>("every reload")({
      initial: "/a",
      states: { a: { every: { 2: note("slow") } } },
    });
    m.update(0.5);
    expect(ctx.log).toEqual(["tick"]);
    m.update(0.5);
    expect(ctx.log).toEqual(["tick", "slow"]);
    defineMachine<Ctx, Ev>("every reload")({
      initial: "/a",
      states: { a: { every: [{ delay: (ctx) => ctx.rate, run: note("rate") }] } },
    });
    ctx.rate = 0.5;
    m.update(0.5);
    expect(ctx.log).toEqual(["tick", "slow", "rate"]);
  });
});

describe("every at define time and on entry", () => {
  test("a delay that is not a positive number and an entry with no run throw, naming the state", () => {
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { every: { 0: note("x") } } } }),
      ),
    ).toBe(NOT_POSITIVE);
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({
          initial: "/a",
          states: { a: { every: [{ delay: 0, run: note("x") }] } },
        }),
      ),
    ).toBe(NOT_POSITIVE);
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({
          initial: "/a",
          states: { a: { every: [{ delay: -1, run: note("x") }] } },
        }),
      ),
    ).toBe('hsm: state "/a" has an every delay "-1" that is not a positive number');
    const fromCtx = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { every: [{ delay: (ctx) => ctx.rate, run: note("x") }] } },
    });
    const ctx = newCtx();
    ctx.rate = 0;
    expect(thrownMessage(() => fromCtx.start(ctx))).toBe(NOT_POSITIVE);
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({
          initial: "/a",
          states: { a: { every: [{ delay: 1 } as never] } },
        }),
      ),
    ).toBe('hsm: state "/a" has an every entry with no "run"');
  });
});

describe("every types", () => {
  test("an unannotated run and delay are typed in both forms", () => {
    const seen: boolean[] = [];
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          every: {
            1: (ctx, machine) => {
              const ctxExact: Equal<typeof ctx, Ctx> = true;
              const machineExact: Equal<typeof machine, MachineInstance<Ctx, Ev>> = true;
              seen.push(ctxExact, machineExact);
            },
          },
          initial: "/a/b",
          states: {
            b: {
              every: [
                {
                  delay: (ctx) => {
                    const ctxExact: Equal<typeof ctx, Ctx> = true;
                    seen.push(ctxExact);
                    return ctx.rate;
                  },
                  run: (ctx, machine) => {
                    const ctxExact: Equal<typeof ctx, Ctx> = true;
                    const machineExact: Equal<typeof machine, MachineInstance<Ctx, Ev>> = true;
                    seen.push(ctxExact, machineExact);
                  },
                },
              ],
            },
          },
        },
      },
    }).start(newCtx());
    m.update(1);
    expect(seen).toEqual([true, true, true, true, true]);
  });

  test("a delay and a run read the private fields with no annotation, on a top-level and a nested state", () => {
    const first = defineMachine<Ctx, Ev>()({
      privateCtx: () => ({ extra: 1 }),
      initial: "/patrol",
      states: {
        patrol: {
          every: [
            {
              delay: (ctx) => ctx.extra,
              run: (ctx) => {
                ctx.extra += 1;
                ctx.log.push(`patrol ${ctx.extra}`);
              },
            },
          ],
          initial: "/patrol/walk",
          states: {
            walk: {
              every: [
                {
                  delay: (ctx) => ctx.extra,
                  run: (ctx) => {
                    ctx.extra += 1;
                    ctx.log.push(`walk ${ctx.extra}`);
                  },
                },
              ],
            },
          },
        },
      },
    }).start(newCtx());
    first.update(1);
    expect(first.ctx.log).toEqual(["walk 2", "patrol 3"]);
    const after = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: {
          every: [
            {
              delay: (ctx) => ctx.extra,
              run: (ctx) => {
                ctx.extra += 1;
                ctx.log.push(`patrol ${ctx.extra}`);
              },
            },
          ],
          initial: "/patrol/walk",
          states: {
            walk: {
              every: [
                {
                  delay: (ctx) => ctx.extra,
                  run: (ctx) => {
                    ctx.extra += 1;
                    ctx.log.push(`walk ${ctx.extra}`);
                  },
                },
              ],
            },
          },
        },
      },
      privateCtx: (ctx: Ctx) => ({ extra: ctx.rate + 1 }),
    }).start(newCtx());
    after.update(1);
    expect(after.ctx.log).toEqual([]);
    after.update(1);
    expect(after.ctx.log).toEqual(["walk 3", "patrol 4"]);
  });

  test("a path, a missing run, a to, a when and a delay that is not a number are compile errors", () => {
    // Never called: the definitions hold what the types reject, and only the compiler reads them.
    const rejected = () => {
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error an entry runs code; a path belongs on an after timer
            every: { 1: "/b" },
          },
          b: {},
        },
      });
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error an entry needs a run
            every: [{ delay: 1 }],
          },
        },
      });
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error an entry takes no to
            every: [{ delay: 1, run: note("x"), to: "/b" }],
          },
          b: {},
        },
      });
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error an entry takes no when
            every: [{ delay: 1, run: note("x"), when: () => true }],
          },
        },
      });
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error a delay is a number of seconds
            every: [{ delay: () => "soon", run: note("x") }],
          },
        },
      });
      // An entry built outside the config gets no excess-property check, so only the entry
      // type's own `to` and `when` members reject these two.
      const moving = { delay: 1, run: note("x"), to: "/b" };
      const guarded = { delay: 1, run: note("x"), when: () => true };
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error an entry takes no to
            every: [moving],
          },
          b: {
            // @ts-expect-error an entry takes no when
            every: [guarded],
          },
        },
      });
    };
    expect(rejected).toBeFunction();
  });
});

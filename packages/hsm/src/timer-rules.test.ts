import { describe, expect, test } from "bun:test";
import {
  type AfterConfig,
  defineMachine,
  type MachineInstance,
  type MachineView,
  type MoveCause,
} from "./index";

interface Ctx {
  ready: boolean;
  wait: number;
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
  return { ready: false, wait: 1, log: [] };
}

const NO_TO_NO_RUN = 'hsm: state "/a" has an after timer with no "to" and no "run"';

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  return "";
}

describe("timer rules at run time", () => {
  test("a timer with a run and no to runs once per stay and is not a move", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/charge",
      states: {
        charge: { ...logged("charge"), after: { 1: { run: note("beep") }, 3: "/fired" } },
        fired: {},
      },
    }).start(ctx);
    const causes: MoveCause[] = [];
    m.onMove((_from, _to, cause) => {
      causes.push(cause);
    });
    m.update(1);
    expect(ctx.log).toEqual(["enter charge", "beep"]);
    expect(m.path).toBe("/charge");
    expect(causes).toEqual([]);
    m.update(1);
    expect(ctx.log).toEqual(["enter charge", "beep"]);
    m.update(1);
    expect(m.path).toBe("/fired");
    expect(causes).toEqual(["after"]);
  });

  test("the run of a timer with a to runs between the exit and enter hooks", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { ...logged("a"), after: [{ delay: 1, to: "/b", run: [note("one"), note("two")] }] },
        b: logged("b"),
      },
    }).start(ctx);
    m.update(1);
    expect(ctx.log).toEqual(["enter a", "exit a", "one", "two", "enter b"]);
  });

  test("a timer's when and run receive the instance", () => {
    let whenSaw: unknown;
    let runSaw: unknown;
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          after: {
            1: {
              when: (_ctx, machine) => {
                whenSaw = machine;
                return true;
              },
              run: (_ctx, machine) => {
                runSaw = machine;
              },
            },
          },
        },
      },
    }).start(newCtx());
    m.update(1);
    expect(whenSaw).toBe(m);
    expect(runSaw).toBe(m);
  });

  test("a when is first called once the delay has passed, then on every update until it passes", () => {
    let calls = 0;
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/land",
      states: {
        land: {
          after: {
            0.3: {
              to: "/idle",
              when: (ctx) => {
                calls += 1;
                return ctx.ready;
              },
            },
          },
        },
        idle: {},
      },
    }).start(ctx);
    m.update(0.2);
    expect(calls).toBe(0);
    m.update(0.1);
    m.update(0.1);
    expect(m.path).toBe("/land");
    expect(calls).toBe(2);
    ctx.ready = true;
    m.update(0);
    expect(m.path).toBe("/idle");
  });

  test("a timer whose when fails stays pending while the timers after it are tried", () => {
    const machine = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          after: [
            { delay: 1, to: "/x", when: (ctx) => ctx.ready },
            { delay: 2, run: note("two") },
            { delay: 3, to: "/y" },
          ],
        },
        x: {},
        y: {},
      },
    });
    const first = machine.start(newCtx());
    first.update(2);
    expect(first.ctx.log).toEqual(["two"]);
    expect(first.path).toBe("/a");
    first.ctx.ready = true;
    first.update(0);
    expect(first.path).toBe("/x");
    const second = machine.start(newCtx());
    second.update(3);
    expect(second.ctx.log).toEqual(["two"]);
    expect(second.path).toBe("/y");
  });

  test("the deepest state's timers are tried first, then its parent's", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/a",
          after: { 1: { run: note("p") } },
          states: { a: { after: { 1: { run: note("a") } } } },
        },
      },
    }).start(ctx);
    m.update(1);
    expect(ctx.log).toEqual(["a", "p"]);
  });

  test("a timer that moves ends the timers of that call, and the parent's waits for the next", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/a",
          after: { 1: "/out" },
          states: { a: { after: { 1: "/p/b" } }, b: {} },
        },
        out: {},
      },
    }).start(newCtx());
    m.update(1);
    expect(m.path).toBe("/p/b");
    m.update(0);
    expect(m.path).toBe("/out");
  });

  test("a timer with no to in a region leaves the parallel state's update hook running", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/both",
      states: {
        both: {
          type: "parallel",
          update: (ctx) => {
            ctx.log.push("tick");
            return undefined;
          },
          states: { region: { after: { 1: { run: note("region") } } } },
        },
      },
    }).start(ctx);
    m.update(1);
    expect(ctx.log).toEqual(["region", "tick"]);
  });

  test("a timer with no to is not a move, so always is not rechecked", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/s",
      states: {
        s: {
          always: { to: "/t", when: (ctx) => ctx.ready },
          after: {
            1: {
              run: (ctx) => {
                ctx.ready = true;
              },
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
  });

  test("a run that stops the machine ends the timers of that call", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          after: { 1: { run: (_ctx, machine) => machine.stop() }, 2: { run: note("late") } },
        },
      },
    }).start(ctx);
    m.update(2);
    expect(m.path).toBeUndefined();
    expect(ctx.log).toEqual([]);
  });

  test("an event a timer's run sends is handled in the same update", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          after: { 1: { run: (_ctx, machine) => machine.send({ type: "GO" }) } },
          on: { GO: "/b" },
        },
        b: {},
      },
    }).start(newCtx());
    m.update(1);
    expect(m.path).toBe("/b");
  });

  test("a rule under the delay 0 or 1 is a rule, not a list entry", () => {
    const zero = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { after: { 0: { run: note("zero") } } } },
    }).start(newCtx());
    zero.update(0);
    expect(zero.ctx.log).toEqual(["zero"]);
    const one = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { after: { 1: { run: note("one") } } } },
    });
    const early = one.start(newCtx());
    early.update(0.5);
    expect(early.ctx.log).toEqual([]);
    const due = one.start(newCtx());
    due.update(1);
    expect(due.ctx.log).toEqual(["one"]);
  });

  test("a hot reload keeps which timers fired, by position in delay order", () => {
    const define = (later: boolean) =>
      defineMachine<Ctx, Ev>("timer rules reload")({
        initial: "/a",
        states: {
          a: {
            after: later
              ? { 1: { run: note("beep") }, 4: "/b" }
              : { 1: { run: note("beep") }, 3: "/b" },
          },
          b: {},
        },
      });
    const ctx = newCtx();
    const m = define(false).start(ctx);
    m.update(1.5);
    define(false);
    m.update(0.5);
    expect(ctx.log).toEqual(["beep"]);
    define(true);
    m.update(1.5);
    expect(ctx.log).toEqual(["beep"]);
    expect(m.path).toBe("/a");
    m.update(1);
    expect(m.path).toBe("/b");
  });

  test("a hot reload keeps each mark on its list entry when the delays change order", () => {
    const define = () =>
      defineMachine<Ctx, Ev>("timer marks swap")({
        initial: "/a",
        states: {
          a: {
            after: [
              { delay: (ctx) => ctx.wait, run: note("first") },
              { delay: (ctx) => 4 - ctx.wait, run: note("second") },
            ],
          },
        },
      });
    const ctx = newCtx();
    const m = define().start(ctx);
    m.update(1);
    expect(ctx.log).toEqual(["first"]);
    ctx.wait = 3;
    define();
    m.update(0);
    expect(ctx.log).toEqual(["first", "second"]);
    m.update(2);
    expect(ctx.log).toEqual(["first", "second"]);
    expect(m.path).toBe("/a");
  });

  test("a hot reload that adds a list entry starts it unfired and keeps the other marks", () => {
    const define = (extra: boolean) =>
      defineMachine<Ctx, Ev>("timer marks grow")({
        initial: "/a",
        states: {
          a: {
            after: [
              { delay: (ctx) => ctx.wait, run: note("first") },
              { delay: (ctx) => 4 - ctx.wait, run: note("second") },
              ...(extra ? [{ delay: 0, run: note("third") }] : []),
            ],
          },
        },
      });
    const ctx = newCtx();
    const m = define(false).start(ctx);
    m.update(1);
    ctx.wait = 3;
    define(true);
    m.update(0);
    expect(ctx.log).toEqual(["first", "third", "second"]);
    define(false);
    m.update(2);
    expect(ctx.log).toEqual(["first", "third", "second"]);
    define(true);
    m.update(0);
    expect(ctx.log).toEqual(["first", "third", "second", "third"]);
  });

  test("a hot reload that changes the form of after keeps the marks by position in delay order", () => {
    const define = (list: boolean) =>
      defineMachine<Ctx, Ev>("timer marks form")({
        initial: "/a",
        states: {
          a: {
            after: list
              ? [
                  { delay: (ctx) => ctx.wait, run: note("first") },
                  { delay: 3, run: note("second") },
                ]
              : { 1: { run: note("first") }, 3: { run: note("second") } },
          },
        },
      });
    const ctx = newCtx();
    const m = define(true).start(ctx);
    m.update(1);
    expect(ctx.log).toEqual(["first"]);
    define(false);
    m.update(1);
    expect(ctx.log).toEqual(["first"]);
    define(true);
    m.update(1);
    expect(ctx.log).toEqual(["first", "second"]);
    m.update(1);
    expect(ctx.log).toEqual(["first", "second"]);
  });
});

describe("timer rules at define time", () => {
  test("a rule with neither a to nor a run throws, and a to beside a run is still checked", () => {
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { after: { 1: {} } } } }),
      ),
    ).toBe(NO_TO_NO_RUN);
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({
          initial: "/a",
          states: { a: { after: { 1: { when: () => true } } } },
        }),
      ),
    ).toBe(NO_TO_NO_RUN);
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { after: [{ delay: 1 }] } } }),
      ),
    ).toBe(NO_TO_NO_RUN);
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({
          initial: "/a",
          states: { a: { after: { 1: { to: "/nope" as never, run: note("x") } } } },
        }),
      ),
    ).toBe('hsm: state "/a" targets unknown state "/nope"');
  });
});

describe("timer rule types", () => {
  test("an unannotated when and run are typed in both forms", () => {
    type HookPath = "/a" | "/b" | "/c" | `/b/${string}`;
    const seen: boolean[] = [];
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          after: {
            1: {
              to: "/b",
              when: (ctx, machine) => {
                const ctxExact: Equal<typeof ctx, Readonly<Ctx>> = true;
                const viewExact: Equal<typeof machine, MachineView<HookPath>> = true;
                const hidden: unknown[] = [];
                // @ts-expect-error a when reads the machine and cannot send to it
                hidden.push(machine.send);
                seen.push(ctxExact, viewExact);
                return hidden.length === 1;
              },
              run: (ctx, machine) => {
                const ctxExact: Equal<typeof ctx, Ctx> = true;
                const machineExact: Equal<
                  typeof machine,
                  MachineInstance<Ctx, Ev, HookPath>
                > = true;
                seen.push(ctxExact, machineExact);
              },
            },
          },
        },
        b: {
          after: [
            {
              delay: (ctx) => ctx.wait,
              to: "/c",
              when: (ctx, machine) => {
                const ctxExact: Equal<typeof ctx, Readonly<Ctx>> = true;
                const viewExact: Equal<typeof machine, MachineView<HookPath>> = true;
                const hidden: unknown[] = [];
                // @ts-expect-error a when reads the machine and cannot send to it
                hidden.push(machine.send);
                seen.push(ctxExact, viewExact);
                return hidden.length === 1;
              },
              run: (ctx, machine) => {
                const ctxExact: Equal<typeof ctx, Ctx> = true;
                const machineExact: Equal<
                  typeof machine,
                  MachineInstance<Ctx, Ev, HookPath>
                > = true;
                seen.push(ctxExact, machineExact);
              },
            },
          ],
        },
        c: {},
      },
    }).start(newCtx());
    m.update(1);
    m.update(1);
    expect(m.path).toBe("/c");
    expect(seen).toEqual([true, true, true, true, true, true, true, true]);
  });

  test("a when and a run read the private fields with no annotation, on a top-level and a nested state", () => {
    const first = defineMachine<Ctx, Ev>()({
      privateCtx: () => ({ extra: 0 }),
      initial: "/patrol",
      states: {
        patrol: {
          after: {
            1: {
              when: (ctx) => ctx.extra >= 0,
              run: (ctx) => {
                ctx.extra += 1;
              },
            },
          },
          initial: "/patrol/walk",
          states: {
            walk: {
              after: [
                {
                  delay: 2,
                  to: "/rest",
                  when: (ctx) => ctx.extra >= 1,
                  run: (ctx) => {
                    ctx.extra += 1;
                  },
                },
              ],
            },
          },
        },
        rest: {},
      },
    }).start(newCtx());
    first.update(2);
    expect(first.path).toBe("/patrol/walk");
    first.update(0);
    expect(first.path).toBe("/rest");
    const after = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: {
          after: {
            1: {
              when: (ctx) => ctx.extra >= 0,
              run: (ctx) => {
                ctx.extra += 1;
              },
            },
          },
          initial: "/patrol/walk",
          states: {
            walk: {
              after: [
                {
                  delay: 2,
                  to: "/rest",
                  when: (ctx) => ctx.extra >= 3,
                  run: (ctx) => {
                    ctx.extra += 1;
                  },
                },
              ],
            },
          },
        },
        rest: {},
      },
      privateCtx: (ctx: Ctx) => ({ extra: ctx.wait + 1 }),
    }).start(newCtx());
    after.update(2);
    expect(after.path).toBe("/patrol/walk");
    after.update(0);
    expect(after.path).toBe("/rest");
  });

  test("a rule's to that is not a path is an error in both forms", () => {
    expect(() =>
      defineMachine<Ctx, Ev>()({
        initial: "/patrol",
        states: {
          patrol: {
            // @ts-expect-error "/nope" is not a path of this machine
            after: { 1: { to: "/nope" } },
          },
          rest: {
            // @ts-expect-error "/nope" is not a path of this machine
            after: [{ delay: 1, to: "/nope", run: note("x") }],
          },
        },
      }),
    ).toThrow();
  });

  test("a timer typed without the event type fits a machine's after list", () => {
    const timer: AfterConfig<Ctx, "/rest"> = { delay: 1, to: "/rest" };
    const m = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: { patrol: { after: [timer] }, rest: {} },
    }).start(newCtx());
    m.update(1);
    expect(m.path).toBe("/rest");
  });
});

import { describe, expect, test } from "bun:test";
import { defineMachine } from "./index";

interface Ctx {
  health: number;
  log: string[];
  finishes: ((event: Ev) => void)[];
}

type Ev =
  | { type: "TOGGLE" }
  | { type: "DIM" }
  | { type: "HIT"; damage: number }
  | { type: "PING" }
  | { type: "GO" }
  | { type: "NEXT" }
  | { type: "LATE" }
  | { type: "NOPE" }
  | { type: "CROUCH" }
  | { type: "DIE" }
  | { type: "LOADED" }
  | { type: "SKIP" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const newCtx = (): Ctx => ({ health: 3, log: [], finishes: [] });

const logged = (name: string) => ({
  enter: (ctx: Ctx) => {
    ctx.log.push(`enter ${name}`);
  },
  exit: (ctx: Ctx) => {
    ctx.log.push(`exit ${name}`);
  },
});

const loader = () =>
  defineMachine<Ctx, Ev>()({
    initial: "/load",
    states: {
      load: {
        task: (ctx, finish) => {
          ctx.finishes.push(finish);
        },
        on: { SKIP: "/done" },
      },
      done: {},
    },
  });

const lone = () =>
  defineMachine<Ctx, Ev>()({
    initial: "/a",
    states: { a: {} },
  });

describe("onUnhandled at run time", () => {
  test("the listener gets the one event no rule took, and can calls no listener", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/off",
      states: { off: { on: { TOGGLE: "/on" } }, on: {} },
    }).start(newCtx());
    const calls: unknown[][] = [];
    m.onUnhandled((...args) => {
      calls.push(args);
    });
    const DIM: Ev = { type: "DIM" };
    expect(m.can(DIM)).toBe(false);
    expect(calls).toEqual([]);
    m.send(DIM);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(DIM);
    m.send({ type: "TOGGLE" });
    expect(calls).toHaveLength(1);
    expect(m.path).toBe("/on");
  });

  test("an event whose guard fails is reported, and one whose guard passes is not", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: {
          on: { HIT: { to: "/dead", when: (ctx, event) => ctx.health <= event.damage } },
        },
        dead: {},
      },
    }).start(newCtx());
    const seen: Ev[] = [];
    m.onUnhandled((event) => {
      seen.push(event);
    });
    m.send({ type: "HIT", damage: 1 });
    expect(seen).toEqual([{ type: "HIT", damage: 1 }]);
    m.send({ type: "HIT", damage: 3 });
    expect(seen).toHaveLength(1);
    expect(m.path).toBe("/dead");
  });

  test("a rule with no to takes its event", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { on: { PING: {}, GO: "/b" } }, b: {} },
    }).start(newCtx());
    const seen: string[] = [];
    m.onUnhandled((event) => {
      seen.push(event.type);
    });
    m.send({ type: "PING" });
    expect(seen).toEqual([]);
    m.send({ type: "GO" });
    m.send({ type: "PING" });
    expect(seen).toEqual(["PING"]);
  });

  test("an event a parent of the current state takes is not reported", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: { initial: "/alive/patrol", states: { patrol: {} }, on: { DIE: "/dead" } },
        dead: {},
      },
    }).start(newCtx());
    const seen: string[] = [];
    m.onUnhandled((event) => {
      seen.push(event.type);
    });
    expect(m.path).toBe("/alive/patrol");
    m.send({ type: "DIE" });
    expect(seen).toEqual([]);
    expect(m.path).toBe("/dead");
  });

  test("an event one region takes is not reported, and one no region takes is reported once", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: {
          type: "parallel",
          states: {
            move: { initial: "/alive/move/idle", states: { idle: {} } },
            posture: {
              initial: "/alive/posture/standing",
              states: {
                standing: { on: { CROUCH: "/alive/posture/crouching" } },
                crouching: {},
              },
            },
          },
        },
      },
    }).start(newCtx());
    const seen: string[] = [];
    m.onUnhandled((event) => {
      seen.push(event.type);
    });
    m.send({ type: "CROUCH" });
    expect(seen).toEqual([]);
    m.send({ type: "NOPE" });
    expect(seen).toEqual(["NOPE"]);
  });

  test("the listener runs inside the step, before the next queued event, and its send queues", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { ...logged("a"), on: { GO: "/b" } },
        b: {
          enter: (ctx, machine) => {
            ctx.log.push("enter b");
            machine.send({ type: "NOPE" });
            machine.send({ type: "NEXT" });
          },
          exit: (ctx) => {
            ctx.log.push("exit b");
          },
          on: { NEXT: "/c" },
        },
        c: {
          ...logged("c"),
          on: {
            LATE: {
              run: (ctx) => {
                ctx.log.push("late");
              },
            },
          },
        },
      },
    }).start(newCtx());
    m.onUnhandled((event) => {
      m.ctx.log.push(`unhandled ${event.type} at ${m.path}`);
      m.send({ type: "LATE" });
    });
    m.send({ type: "GO" });
    expect(m.ctx.log).toEqual([
      "enter a",
      "exit a",
      "enter b",
      "unhandled NOPE at /b",
      "exit b",
      "enter c",
      "late",
    ]);
  });

  test("a stop from the listener drops the events still queued without reporting them", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            GO: {
              run: (_ctx, _event, machine) => {
                machine.send({ type: "NOPE" });
                machine.send({ type: "PING" });
              },
            },
          },
        },
      },
    }).start(newCtx());
    const seen: string[] = [];
    m.onUnhandled((event) => {
      seen.push(event.type);
      m.stop();
    });
    m.send({ type: "GO" });
    expect(seen).toEqual(["NOPE"]);
    expect(m.path).toBeUndefined();
  });

  test("a send to a stopped machine, or to one with a stop pending, is not reported", () => {
    const seen: string[] = [];
    const stopped = lone().start(newCtx());
    stopped.onUnhandled((event) => {
      seen.push(event.type);
    });
    stopped.stop();
    stopped.send({ type: "NOPE" });
    expect(seen).toEqual([]);

    const stopping = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: "/b" } },
        b: {
          enter: (_ctx, machine) => {
            machine.stop();
            machine.send({ type: "NOPE" });
          },
        },
      },
    }).start(newCtx());
    stopping.onUnhandled((event) => {
      seen.push(event.type);
    });
    stopping.send({ type: "GO" });
    expect(seen).toEqual([]);
    expect(stopping.path).toBeUndefined();
  });

  test("a finish no rule takes is reported once, and a late finish is not", () => {
    const LOADED: Ev = { type: "LOADED" };
    const seen: string[] = [];
    const first = loader().start(newCtx());
    first.onUnhandled((event) => {
      seen.push(event.type);
    });
    const finish = first.ctx.finishes[0] as (event: Ev) => void;
    expect(first.path).toBe("/load");
    finish(LOADED);
    expect(seen).toEqual(["LOADED"]);
    finish(LOADED);
    expect(seen).toEqual(["LOADED"]);

    const late: string[] = [];
    const second = loader().start(newCtx());
    second.onUnhandled((event) => {
      late.push(event.type);
    });
    second.send({ type: "SKIP" });
    expect(second.path).toBe("/done");
    (second.ctx.finishes[0] as (event: Ev) => void)(LOADED);
    expect(late).toEqual([]);
  });

  test("each call adds a listener, and a remover takes out only the one it was returned for", () => {
    const m = lone().start(newCtx());
    const ran: string[] = [];
    const removeFirst = m.onUnhandled(() => {
      ran.push("first");
      removeFirst();
    });
    m.onUnhandled(() => {
      ran.push("second");
    });
    m.send({ type: "NOPE" });
    expect(ran).toEqual(["first", "second"]);
    m.send({ type: "NOPE" });
    expect(ran).toEqual(["first", "second", "second"]);

    const twice = lone().start(newCtx());
    let count = 0;
    const counter = () => {
      count++;
    };
    const removeOne = twice.onUnhandled(counter);
    twice.onUnhandled(counter);
    twice.send({ type: "NOPE" });
    expect(count).toBe(2);
    removeOne();
    removeOne();
    twice.send({ type: "NOPE" });
    expect(count).toBe(3);
  });

  test("an event an update hook sends is reported once", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          update: (_ctx, _dt, machine) => {
            machine.send({ type: "NOPE" });
            return undefined;
          },
        },
      },
    }).start(newCtx());
    const seen: string[] = [];
    m.onUnhandled((event) => {
      seen.push(event.type);
    });
    m.update(0);
    expect(seen).toEqual(["NOPE"]);
  });

  test("a pending hot reload is picked up before the event is offered", () => {
    const m = defineMachine<Ctx, Ev>("unhandled reload")({
      initial: "/a",
      states: { a: {} },
    }).start(newCtx());
    const seen: string[] = [];
    m.onUnhandled((event) => {
      seen.push(event.type);
    });
    m.send({ type: "GO" });
    expect(seen).toEqual(["GO"]);
    defineMachine<Ctx, Ev>("unhandled reload")({
      initial: "/a",
      states: { a: { on: { GO: {} } } },
    });
    m.send({ type: "GO" });
    expect(seen).toEqual(["GO"]);
  });
});

describe("onUnhandled types", () => {
  test("the listener's event is the machine's event union, and the result is exactly a remover", () => {
    const m = lone().start(newCtx());
    const checks: boolean[] = [];
    const remove = m.onUnhandled((event) => {
      const exactEvent: Equal<typeof event, Ev> = true;
      checks.push(exactEvent);
    });
    const exactRemover: Equal<typeof remove, () => void> = true;
    m.send({ type: "NOPE" });
    expect([exactRemover, checks]).toEqual([true, [true]]);
  });

  test("the view a when receives has no onUnhandled", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            GO: {
              to: "/b",
              when: (_ctx, _event, machine) => {
                const hidden: unknown[] = [];
                // @ts-expect-error the view has no onUnhandled
                hidden.push(machine.onUnhandled);
                return hidden.length === 1;
              },
            },
          },
        },
        b: {},
      },
    }).start(newCtx());
    m.send({ type: "GO" });
    expect(m.path).toBe("/b");
  });
});

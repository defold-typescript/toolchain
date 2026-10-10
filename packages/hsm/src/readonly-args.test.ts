import { describe, expect, test } from "bun:test";
import { defineMachine } from "./index";

interface HitEvent {
  type: "HIT";
  damage: number;
}

type Ev = HitEvent | { type: "GO" };

interface Ctx {
  count: number;
  list: number[];
  last?: HitEvent;
}

interface Priv {
  heat: number;
}

class Tank {
  private armor = 1;
  hp = 3;

  armored(): boolean {
    return this.armor > 0;
  }
}

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const newCtx = (count = 0): Ctx => ({ count, list: [] });

describe("argument writes that fail to compile", () => {
  test("a when cannot assign to a field of ctx, under on, always and both forms of after", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            on: {
              HIT: {
                to: "/b",
                when: (ctx) => {
                  // @ts-expect-error a when reads ctx and cannot assign to it
                  ctx.count = 1;
                  return true;
                },
              },
            },
            always: {
              to: "/b",
              when: (ctx) => {
                // @ts-expect-error a when reads ctx and cannot assign to it
                ctx.count = 1;
                return true;
              },
            },
            after: {
              1: {
                to: "/b",
                when: (ctx) => {
                  // @ts-expect-error a when reads ctx and cannot assign to it
                  ctx.count = 1;
                  return true;
                },
              },
            },
          },
          b: {
            after: [
              {
                delay: 1,
                to: "/a",
                when: (ctx) => {
                  // @ts-expect-error a when reads ctx and cannot assign to it
                  ctx.count = 1;
                  return true;
                },
              },
            ],
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("a delay function cannot assign to a field of ctx, under after and every", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            after: [
              {
                delay: (ctx) => {
                  // @ts-expect-error a delay reads ctx and cannot assign to it
                  ctx.count = 1;
                  return 1;
                },
                to: "/b",
              },
            ],
            every: [
              {
                delay: (ctx) => {
                  // @ts-expect-error a delay reads ctx and cannot assign to it
                  ctx.count = 1;
                  return 1;
                },
                run: (ctx) => {
                  ctx.count += 1;
                },
              },
            ],
          },
          b: {},
        },
      });
    expect(rejected).toBeFunction();
  });

  test("no callback can assign to a field of its event", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () => {
      const m = defineMachine<Ctx, Ev>()({
        initial: "/a",
        unhandled: (_ctx, event) => {
          if (event.type === "HIT") {
            // @ts-expect-error an event is read-only
            event.damage = 0;
          }
        },
        states: {
          a: {
            on: {
              HIT: {
                when: (_ctx, event) => {
                  // @ts-expect-error an event is read-only
                  event.damage = 0;
                  return true;
                },
                run: (_ctx, event) => {
                  // @ts-expect-error an event is read-only
                  event.damage = 0;
                },
              },
            },
          },
        },
      }).start(newCtx());
      m.onMove((_from, _to, _cause, event) => {
        if (event?.type === "HIT") {
          // @ts-expect-error an event is read-only
          event.damage = 0;
        }
      });
      m.onUnhandled((event) => {
        if (event.type === "HIT") {
          // @ts-expect-error an event is read-only
          event.damage = 0;
        }
      });
      return m;
    };
    expect(rejected).toBeFunction();
  });

  test("a when cannot assign to a private field, in both ways of typing them, and an enter can", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () => [
      defineMachine<Ctx, Ev>()({
        privateCtx: () => ({ heat: 0 }),
        initial: "/a",
        enter: (ctx) => {
          ctx.heat += 1;
        },
        states: {
          a: {
            on: {
              GO: {
                to: "/b",
                when: (ctx) => {
                  // @ts-expect-error a when reads the private fields and cannot assign to them
                  ctx.heat = 1;
                  return ctx.heat > 0;
                },
              },
            },
          },
          b: {},
        },
      }),
      defineMachine<Ctx, Ev>()({
        privateCtx: (): Priv => ({ heat: 0 }),
        initial: "/a",
        enter: (ctx) => {
          ctx.heat += 1;
        },
        states: {
          a: {
            on: {
              GO: {
                to: "/b",
                when: (ctx) => {
                  // @ts-expect-error a when reads the private fields and cannot assign to them
                  ctx.heat = 1;
                  return ctx.heat > 0;
                },
              },
            },
          },
          b: {},
        },
      }),
    ];
    expect(rejected).toBeFunction();
  });

  test("a helper typed with a context class that has a private member takes Readonly of the class", () => {
    const alive = (ctx: Tank) => ctx.hp > 0 && ctx.armored();
    const aliveReadOnly = (ctx: Readonly<Tank>) => ctx.hp > 0 && ctx.armored();
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Tank, Ev>()({
        initial: "/a",
        states: {
          a: {
            on: {
              GO: {
                to: "/b",
                // @ts-expect-error the read-only context drops the private member, so Tank does not fit
                when: alive,
              },
            },
          },
          b: {},
        },
      });
    const m = defineMachine<Tank, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: { to: "/b", when: aliveReadOnly } } },
        b: { on: { GO: { to: "/a", when: (ctx) => ctx.hp > 0 && ctx.armored() } } },
      },
    }).start(new Tank());
    m.send({ type: "GO" });
    m.send({ type: "GO" });
    expect(rejected).toBeFunction();
    expect(m.path).toBe("/a");
  });
});

describe("argument types", () => {
  test("a when reads a read-only ctx and event, and a run writes ctx and reads its event", () => {
    const seen: boolean[] = [];
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            HIT: {
              when: (ctx, event) => {
                const ctxExact: Equal<typeof ctx, Readonly<Ctx>> = true;
                const eventExact: Equal<typeof event, Readonly<HitEvent>> = true;
                seen.push(ctxExact, eventExact);
                return true;
              },
              run: (ctx, event) => {
                const ctxExact: Equal<typeof ctx, Ctx> = true;
                const eventExact: Equal<typeof event, Readonly<HitEvent>> = true;
                seen.push(ctxExact, eventExact);
              },
            },
          },
        },
      },
    }).start(newCtx());
    m.send({ type: "HIT", damage: 1 });
    expect(seen).toEqual([true, true, true, true]);
  });
});

describe("what still compiles and runs", () => {
  test("helpers declared outside the config with writable parameters fill every slot", () => {
    const guard = (ctx: Ctx, event: HitEvent) => ctx.count > 0 && event.damage > 0;
    const act = (ctx: Ctx, event: HitEvent) => {
      ctx.count += event.damage;
    };
    const ready = (ctx: Ctx) => ctx.count > 5;
    const seconds = (ctx: Ctx) => ctx.count;
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { on: { HIT: { to: "/b", when: guard, run: act } } },
        b: {
          always: { to: "/c", when: ready },
          after: [{ delay: seconds, to: "/a", when: ready }],
          every: [
            {
              delay: seconds,
              run: (ctx) => {
                ctx.count += 1;
              },
            },
          ],
        },
        c: {},
      },
    }).start(newCtx(1));
    m.send({ type: "HIT", damage: 2 });
    expect(m.ctx.count).toBe(3);
    expect(m.path).toBe("/b");
  });

  test("a read-only event is still a value, and a list held in a read-only ctx still takes a push", () => {
    const hit: HitEvent = { type: "HIT", damage: 2 };
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            HIT: {
              when: (ctx, event) => {
                ctx.list.push(event.damage);
                return true;
              },
              run: (ctx, event, machine) => {
                ctx.last = event;
                machine.can(event);
              },
            },
          },
        },
      },
    }).start(newCtx());
    m.send(hit);
    expect(m.ctx.last).toBe(hit);
    expect(m.ctx.list).toContain(2);
  });
});

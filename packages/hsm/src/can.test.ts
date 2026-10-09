import { describe, expect, test } from "bun:test";
import { defineMachine } from "./index";

interface Ctx {
  health: number;
  taken: number;
  asked: boolean | undefined;
  log: string[];
}

type Ev =
  | { type: "TOGGLE" }
  | { type: "DIM" }
  | { type: "HIT"; damage: number }
  | { type: "PING" }
  | { type: "JUMP" }
  | { type: "LAND" }
  | { type: "CROUCH" }
  | { type: "STAND" }
  | { type: "DIE" }
  | { type: "GO" }
  | { type: "BACK" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const newCtx = (): Ctx => ({ health: 3, taken: 0, asked: undefined, log: [] });

const logged = (name: string) => ({
  enter: (ctx: Ctx) => {
    ctx.log.push(`enter ${name}`);
  },
  exit: (ctx: Ctx) => {
    ctx.log.push(`exit ${name}`);
  },
});

const bump = (ctx: Ctx) => {
  ctx.taken += 1;
};

const knight = () =>
  defineMachine<Ctx, Ev>()({
    initial: "/alive",
    states: {
      alive: {
        type: "parallel",
        on: { DIE: "/dead" },
        states: {
          move: {
            initial: "/alive/move/idle",
            states: {
              idle: {
                on: {
                  JUMP: {
                    to: "/alive/move/jump",
                    when: (_ctx, _event, machine) => machine.matches("/alive/posture/standing"),
                  },
                },
              },
              jump: { on: { LAND: "/alive/move/idle" } },
            },
          },
          posture: {
            initial: "/alive/posture/standing",
            states: {
              standing: { on: { CROUCH: "/alive/posture/crouching" } },
              crouching: { on: { STAND: "/alive/posture/standing" } },
            },
          },
        },
      },
      dead: {},
    },
  });

describe("can at run time", () => {
  test("it answers for the current state and moves nothing", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/off",
      states: {
        off: { ...logged("off"), on: { TOGGLE: "/on" } },
        on: { ...logged("on"), on: { TOGGLE: "/off", DIM: "/on" } },
      },
    }).start(newCtx());
    let moves = 0;
    m.onMove(() => {
      moves++;
    });
    expect(m.can({ type: "TOGGLE" })).toBe(true);
    expect(m.can({ type: "DIM" })).toBe(false);
    expect(m.path).toBe("/off");
    expect(m.ctx.log).toEqual(["enter off"]);
    expect(moves).toBe(0);
  });

  test("a guard decides, and it reads the event asked about", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: {
          on: { HIT: { to: "/dead", when: (ctx, event) => ctx.health <= event.damage } },
        },
        dead: {},
      },
    }).start(newCtx());
    expect(m.can({ type: "HIT", damage: 3 })).toBe(true);
    expect(m.can({ type: "HIT", damage: 1 })).toBe(false);
  });

  test("a later rule of a list answers without its run being called", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: {
          on: {
            HIT: [{ to: "/dead", when: (ctx, event) => ctx.health <= event.damage }, { run: bump }],
          },
        },
        dead: {},
      },
    }).start(newCtx());
    expect(m.can({ type: "HIT", damage: 1 })).toBe(true);
    expect(m.ctx.taken).toBe(0);
  });

  test("a rule with no to counts", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { on: { PING: {} } } },
    }).start(newCtx());
    expect(m.can({ type: "PING" })).toBe(true);
  });

  test("a rule on a parent of the current state counts", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: { initial: "/alive/patrol", states: { patrol: {} }, on: { DIE: "/dead" } },
        dead: {},
      },
    }).start(newCtx());
    expect(m.path).toBe("/alive/patrol");
    expect(m.can({ type: "DIE" })).toBe(true);
  });

  test("every region is asked, then the parallel state itself", () => {
    const m = knight().start(newCtx());
    expect(m.can({ type: "CROUCH" })).toBe(true);
    expect(m.can({ type: "DIE" })).toBe(true);
    expect(m.can({ type: "LAND" })).toBe(false);
    m.send({ type: "CROUCH" });
    expect(m.can({ type: "JUMP" })).toBe(false);
  });

  test("a guard is handed the instance start returned", () => {
    let seen: unknown;
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            GO: {
              to: "/b",
              when: (_ctx, _event, machine) => {
                seen = machine;
                return true;
              },
            },
          },
        },
        b: {},
      },
    }).start(newCtx());
    m.can({ type: "GO" });
    expect(seen).toBe(m);
  });

  test("a stopped machine, or one with a stop pending, answers false", () => {
    const stopped = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { on: { GO: "/b" } }, b: {} },
    }).start(newCtx());
    stopped.stop();
    expect(stopped.can({ type: "GO" })).toBe(false);

    const stopping = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: "/b" } },
        b: {
          enter: (ctx, machine) => {
            machine.stop();
            ctx.asked = machine.can({ type: "BACK" });
          },
          on: { BACK: "/a" },
        },
      },
    }).start(newCtx());
    stopping.send({ type: "GO" });
    expect(stopping.ctx.asked).toBe(false);
  });

  test("inside a hook it answers for the state just entered and queues nothing", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: "/b" } },
        b: {
          enter: (ctx, machine) => {
            ctx.asked = machine.can({ type: "BACK" });
          },
          on: { BACK: "/a" },
        },
      },
    }).start(newCtx());
    m.send({ type: "GO" });
    expect(m.ctx.asked).toBe(true);
    expect(m.path).toBe("/b");
  });

  test("a region that is not entered yet does not answer", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: {
          type: "parallel",
          enter: (ctx, machine) => {
            ctx.asked = machine.can({ type: "PING" });
          },
          states: {
            move: { initial: "/alive/move/idle", states: { idle: {} } },
            posture: {
              initial: "/alive/posture/standing",
              states: { standing: {} },
              on: { PING: {} },
            },
          },
        },
      },
    }).start(newCtx());
    expect(m.ctx.asked).toBe(false);
    expect(m.can({ type: "PING" })).toBe(true);
  });

  test("a pending hot reload is not picked up, and no state is entered", () => {
    const m = defineMachine<Ctx, Ev>("can reload")({
      initial: "/a",
      states: { a: {}, b: {} },
    }).start(newCtx());
    defineMachine<Ctx, Ev>("can reload")({
      initial: "/a",
      states: {
        a: { initial: "/a/x", states: { x: logged("x") }, on: { GO: "/b" } },
        b: {},
      },
    });
    expect(m.can({ type: "GO" })).toBe(false);
    expect(m.ctx.log).toEqual([]);
    m.update(0);
    expect(m.ctx.log).toEqual(["enter x"]);
    expect(m.can({ type: "GO" })).toBe(true);
  });
});

describe("can agrees with send", () => {
  test("can answers true exactly when the send that follows takes a rule", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        alive: {
          type: "parallel",
          on: {
            HIT: { to: "/dead", when: (ctx, event) => ctx.health <= event.damage, run: bump },
          },
          states: {
            move: {
              initial: "/alive/move/idle",
              states: {
                idle: {
                  on: {
                    JUMP: {
                      to: "/alive/move/jump",
                      when: (_ctx, _event, machine) => machine.matches("/alive/posture/standing"),
                      run: bump,
                    },
                  },
                },
                jump: { on: { LAND: { to: "/alive/move/idle", run: bump } } },
              },
            },
            posture: {
              initial: "/alive/posture/standing",
              on: { PING: { run: bump } },
              states: {
                standing: { on: { CROUCH: { to: "/alive/posture/crouching", run: bump } } },
                crouching: { on: { STAND: { to: "/alive/posture/standing", run: bump } } },
              },
            },
          },
        },
        dead: {
          on: {
            HIT: [
              { to: "/alive", when: (_ctx, event) => event.damage > 5, run: bump },
              { when: (_ctx, event) => event.damage > 1, run: bump },
            ],
          },
        },
      },
    }).start(newCtx());
    const events: Ev[] = [
      { type: "LAND" },
      { type: "JUMP" },
      { type: "CROUCH" },
      { type: "LAND" },
      { type: "JUMP" },
      { type: "PING" },
      { type: "STAND" },
      { type: "HIT", damage: 1 },
      { type: "HIT", damage: 3 },
      { type: "HIT", damage: 2 },
      { type: "HIT", damage: 1 },
      { type: "HIT", damage: 9 },
    ];
    const visited = new Set<string>(m.leaves);
    for (const event of events) {
      const before = m.ctx.taken;
      const expected = m.can(event);
      m.send(event);
      expect([event, m.ctx.taken > before]).toEqual([event, expected]);
      for (const leaf of m.leaves) {
        visited.add(leaf);
      }
    }
    expect([...visited].sort()).toEqual([
      "/alive/move/idle",
      "/alive/move/jump",
      "/alive/posture/crouching",
      "/alive/posture/standing",
      "/dead",
    ]);
  });
});

describe("can types", () => {
  test("the event is checked as send checks it, and the result is exactly boolean", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: { alive: { on: { HIT: "/dead" } }, dead: {} },
    }).start(newCtx());
    // @ts-expect-error "NOPE" is not an event of this machine
    m.can({ type: "NOPE" });
    // @ts-expect-error a HIT carries its damage
    m.can({ type: "HIT" });
    const answer = m.can({ type: "HIT", damage: 1 });
    const exact: Equal<typeof answer, boolean> = true;
    expect([exact, answer]).toEqual([true, true]);
  });

  test("the view a when receives has no can", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            GO: {
              to: "/b",
              when: (_ctx, _event, machine) => {
                const hidden: unknown[] = [];
                // @ts-expect-error the view has no can
                hidden.push(machine.can);
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

  test("the machine a hook receives has can", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          update: (ctx, _dt, machine) => {
            ctx.asked = machine.can({ type: "BACK" });
            return undefined;
          },
          on: { BACK: "/b" },
        },
        b: {},
      },
    }).start(newCtx());
    m.update(0);
    expect(m.ctx.asked).toBe(true);
  });
});

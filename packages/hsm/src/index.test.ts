import { describe, expect, test } from "bun:test";
import { defineMachine, type MachineInstance, type StatePath } from "./index";

interface Ctx {
  log: string[];
  flag?: boolean;
}

type Ev =
  | { type: "GO" }
  | { type: "BACK" }
  | { type: "LEAVE" }
  | { type: "HIT" }
  | { type: "TO2" }
  | { type: "PING" }
  | { type: "NOPE" }
  | { type: "STEP"; n: number };

type M = MachineInstance<Ctx, Ev>;

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

function newCtx(): Ctx {
  return { log: [] };
}

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  return "";
}

function notAFullPath(source: string, target: string): string {
  return `hsm: state "${source}" targets "${target}", which is not a full path starting with "/"`;
}

function badName(parent: string, name: string): string {
  return `hsm: state "${parent}" has a child named "${name}"; state names must be non-empty and contain no "/"`;
}

describe("defineMachine and start", () => {
  test("start enters the initial chain top-down and reports the leaf path", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/on",
      states: { on: { ...logged("on"), initial: "/on/dim", states: { dim: logged("dim") } } },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    expect(ctx.log).toEqual(["enter on", "enter dim"]);
    expect(m.path).toBe("/on/dim");
    expect(m.matches("/on")).toBe(true);
    // @ts-expect-error a path without the leading slash is not a path
    expect(m.matches("on")).toBe(false);
  });

  test("instances started from one definition keep separate ctx and paths", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { ...logged("a"), on: { GO: "/b" } }, b: logged("b") },
    });
    const c1 = newCtx();
    const c2 = newCtx();
    const m1 = def.start(c1);
    const m2 = def.start(c2);
    m1.send({ type: "GO" });
    expect(m1.path).toBe("/b");
    expect(m2.path).toBe("/a");
    expect(m1.ctx).toBe(c1);
    expect(m2.ctx).toBe(c2);
    expect(c1.log).toEqual(["enter a", "exit a", "enter b"]);
    expect(c2.log).toEqual(["enter a"]);
  });

  test("matches compares whole path prefixes, never partial segments", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { initial: "/a/a1", states: { a1: {} }, on: { GO: "/ab" } },
        ab: {},
        b: {},
      },
    });
    const m = def.start(newCtx());
    expect(m.matches("/a")).toBe(true);
    expect(m.matches("/a/a1")).toBe(true);
    // @ts-expect-error a1 is a segment, not a path
    expect(m.matches("/a1")).toBe(false);
    expect(m.matches("/b")).toBe(false);
    m.send({ type: "GO" });
    expect(m.matches("/ab")).toBe(true);
    expect(m.matches("/a")).toBe(false);
  });

  test("an unknown target throws at definition, naming the declaring state and the target", () => {
    const message = thrownMessage(() =>
      defineMachine<Ctx, Ev>()({
        initial: "/attack",
        states: {
          attack: {
            initial: "/attack/recover",
            states: { recover: { on: { GO: "/nope" } } },
          },
        },
      }),
    );
    expect(message).toBe('hsm: state "/attack/recover" targets unknown state "/nope"');
  });

  test("a target without a leading slash throws, naming the declaring state", () => {
    const withTarget = (target: string) => () =>
      defineMachine<Ctx, Ev>()({
        initial: "/alive",
        states: {
          alive: { initial: "/alive/idle", states: { idle: { on: { GO: target } }, patrol: {} } },
        },
      });
    expect(thrownMessage(withTarget("patrol"))).toBe(notAFullPath("/alive/idle", "patrol"));
    expect(thrownMessage(withTarget("./patrol"))).toBe(notAFullPath("/alive/idle", "./patrol"));
    expect(thrownMessage(withTarget("../patrol"))).toBe(notAFullPath("/alive/idle", "../patrol"));

    const after = thrownMessage(() =>
      defineMachine<Ctx, Ev>()({
        initial: "/idle",
        states: { idle: { after: { 1: "patrol" } }, patrol: {} },
      }),
    );
    expect(after).toBe(notAFullPath("/idle", "patrol"));

    const m = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: { idle: { update: () => "patrol" }, patrol: {} },
    }).start(newCtx());
    expect(thrownMessage(() => m.update(0.1))).toBe(notAFullPath("/idle", "patrol"));
  });

  test("a slash alone names no state", () => {
    const message = thrownMessage(() =>
      defineMachine<Ctx, Ev>()({ initial: "/idle", states: { idle: { on: { GO: "/" } } } }),
    );
    expect(message).toBe('hsm: state "/idle" targets unknown state "/"');
  });

  test("a compound state without initial throws, naming its path", () => {
    const message = thrownMessage(() =>
      defineMachine<Ctx, Ev>()({
        initial: "/outer",
        states: {
          outer: { initial: "/outer/inner", states: { inner: { states: { leaf: {} } } } },
        },
      }),
    );
    expect(message).toBe('hsm: compound state "/outer/inner" has no initial');
  });

  test("an initial naming anything but a direct child's full path throws", () => {
    const withInitial = (initial: string) => () =>
      defineMachine<Ctx, Ev>()({
        initial: "/on",
        states: {
          on: {
            initial,
            states: { dim: { initial: "/on/dim/low", states: { low: {} } } },
          },
          off: {},
        },
      });
    for (const initial of ["/on/ghost", "dim", "/off", "/on/dim/low"]) {
      expect(thrownMessage(withInitial(initial))).toBe(
        `hsm: state "/on" has initial "${initial}", which is not one of its children`,
      );
    }
  });

  test("a state name that is empty or contains a slash throws, naming the parent", () => {
    const empty = thrownMessage(() =>
      defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: {}, "": {} } }),
    );
    expect(empty).toBe(badName("(root)", ""));
    const slashed = thrownMessage(() =>
      defineMachine<Ctx, Ev>()({
        initial: "/p",
        states: { p: { initial: "/p/c", states: { c: {}, "a/b": {} } } },
      }),
    );
    expect(slashed).toBe(badName("/p", "a/b"));
  });

  test("dots and hashes are ordinary characters in state names", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/v1.2",
      states: { "v1.2": { on: { GO: "/#x" } }, "#x": {} },
    }).start(newCtx());
    expect(m.path).toBe("/v1.2");
    m.send({ type: "GO" });
    expect(m.path).toBe("/#x");
  });

  test("a target is a full path from the root, whatever the source's depth", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/alive",
      states: {
        dead: {},
        alive: {
          initial: "/alive/patrol",
          on: { BACK: "/alive/patrol" },
          states: {
            patrol: { on: { STEP: "/alive/attack" } },
            attack: {
              initial: "/alive/attack/recover",
              states: { recover: { on: { GO: "/dead" } } },
            },
          },
        },
      },
    });
    const deep = def.start(newCtx());
    deep.send({ type: "STEP", n: 1 });
    expect(deep.path).toBe("/alive/attack/recover");
    deep.send({ type: "GO" });
    expect(deep.path).toBe("/dead");

    const own = def.start(newCtx());
    own.send({ type: "STEP", n: 1 });
    own.send({ type: "BACK" });
    expect(own.path).toBe("/alive/patrol");
  });
});

describe("events", () => {
  test("a transition exits leaf-first, runs actions, then enters top-down to a leaf", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          ...logged("a"),
          initial: "/a/a1",
          states: { a1: logged("a1") },
          on: {
            GO: {
              target: "/b",
              actions: (ctx) => {
                ctx.log.push("action");
              },
            },
          },
        },
        b: { ...logged("b"), initial: "/b/b1", states: { b1: logged("b1") } },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.send({ type: "GO" });
    expect(ctx.log).toEqual(["exit a1", "exit a", "action", "enter b", "enter b1"]);
    expect(m.path).toBe("/b/b1");
  });

  test("the first passing guard wins", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          on: { HIT: [{ guard: (ctx) => ctx.flag === true, target: "/x" }, { target: "/y" }] },
        },
        x: {},
        y: {},
      },
    });
    const passing = def.start({ log: [], flag: true });
    passing.send({ type: "HIT" });
    expect(passing.path).toBe("/x");
    const failing = def.start({ log: [], flag: false });
    failing.send({ type: "HIT" });
    expect(failing.path).toBe("/y");
  });

  test("guards after the first passing candidate are never evaluated", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          on: {
            HIT: [
              {
                guard: (ctx) => {
                  ctx.log.push("guard 1");
                  return true;
                },
                target: "/x",
              },
              {
                guard: (ctx) => {
                  ctx.log.push("guard 2");
                  return true;
                },
                target: "/y",
              },
            ],
          },
        },
        x: {},
        y: {},
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    m.send({ type: "HIT" });
    expect(ctx.log).toEqual(["guard 1"]);
    expect(m.path).toBe("/x");
  });

  test("an event no candidate in the leaf accepts bubbles to the parent", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/c",
          states: { c: { on: { HIT: { guard: () => false, target: "/p/c" } } } },
          on: { HIT: "/z" },
        },
        z: {},
      },
    });
    const m = def.start(newCtx());
    m.send({ type: "HIT" });
    expect(m.path).toBe("/z");
  });

  test("an event no state handles changes nothing and does not throw", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { ...logged("a"), on: { GO: "/b" } }, b: {} },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    m.send({ type: "NOPE" });
    expect(m.path).toBe("/a");
    expect(ctx.log).toEqual(["enter a"]);
  });

  test("a targetless transition runs its actions with no exit or enter", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          ...logged("a"),
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
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.send({ type: "PING" });
    expect(ctx.log).toEqual(["ping"]);
    expect(m.path).toBe("/a");
  });

  test("transition lists must be non-empty, while {} stays a targetless handler", () => {
    defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          on: {
            // @ts-expect-error an empty transition list would consume HIT
            HIT: [],
            GO: [{ target: "/x" }],
            STEP: [{ guard: (_ctx, event) => event.n > 0, target: "/x" }, { target: "/idle" }],
          },
        },
        x: {},
      },
    });

    const def = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/c",
          states: { c: { on: { HIT: {} } } },
          on: { HIT: "/z" },
        },
        z: logged("z"),
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    m.send({ type: "HIT" });
    expect(m.path).toBe("/p/c");
    expect(ctx.log).toEqual([]);
  });

  test("a root-level transition to the active state exits and re-enters it", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/stunned",
      on: { HIT: "/stunned" },
      states: { stunned: logged("stunned") },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.send({ type: "HIT" });
    expect(ctx.log).toEqual(["exit stunned", "enter stunned"]);
  });

  test("a state targeting its own child keeps itself active unless reenter is set", () => {
    const build = (reenter: boolean) =>
      defineMachine<Ctx, Ev>()({
        initial: "/p",
        states: {
          p: {
            ...logged("p"),
            initial: "/p/c1",
            states: { c1: logged("c1"), c2: logged("c2") },
            on: { TO2: { target: "/p/c2", reenter } },
          },
        },
      });

    const keepCtx = newCtx();
    const keep = build(false).start(keepCtx);
    keepCtx.log.length = 0;
    keep.send({ type: "TO2" });
    expect(keepCtx.log).toEqual(["exit c1", "enter c2"]);
    expect(keep.path).toBe("/p/c2");

    const reenterCtx = newCtx();
    const reentered = build(true).start(reenterCtx);
    reenterCtx.log.length = 0;
    reentered.send({ type: "TO2" });
    expect(reenterCtx.log).toEqual(["exit c1", "exit p", "enter p", "enter c2"]);
    expect(reentered.path).toBe("/p/c2");
  });

  test("sends from a hook queue until the step's last enter and run in send order", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      on: {
        STEP: {
          actions: (ctx, event) => {
            ctx.log.push(`step ${event.n}`);
          },
        },
      },
      states: {
        a: { ...logged("a"), on: { GO: "/b" } },
        b: {
          enter: (ctx, m) => {
            ctx.log.push("enter b");
            m.send({ type: "STEP", n: 1 });
            m.send({ type: "STEP", n: 2 });
          },
          initial: "/b/b1",
          states: { b1: logged("b1") },
        },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.send({ type: "GO" });
    expect(ctx.log).toEqual(["exit a", "enter b", "enter b1", "step 1", "step 2"]);
  });

  test("on keys are limited to event types and handlers see their own variant", () => {
    type Combat = { type: "HIT"; damage: number } | { type: "HEAL"; amount: number };
    const def = defineMachine<{ hp: number }, Combat>()({
      initial: "/alive",
      states: {
        alive: {
          on: {
            HIT: {
              actions: (ctx, event) => {
                ctx.hp -= event.damage;
              },
            },
            HEAL: {
              guard: (_ctx, event) => event.amount > 0,
              actions: (ctx, event) => {
                ctx.hp += event.amount;
              },
            },
          },
        },
      },
    });
    const bogus = defineMachine<{ hp: number }, Combat>()({
      initial: "/alive",
      states: {
        alive: {
          on: {
            HIT: {
              actions: (ctx, event) => {
                ctx.hp -= event.damage;
              },
            },
            BOGUS: "/alive",
          },
        },
      },
    });
    // @ts-expect-error BOGUS is not a Combat event type; with a callback in the config the
    // error lands on start rather than on the key
    bogus.start({ hp: 10 });
    const m = def.start({ hp: 10 });
    m.send({ type: "HIT", damage: 3 });
    m.send({ type: "HEAL", amount: 1 });
    // @ts-expect-error BOGUS is not a Combat event type
    m.send({ type: "BOGUS" });
    expect(m.ctx.hp).toBe(8);
  });
});

describe("update, after and stop", () => {
  test("update runs active hooks innermost-first and stops at the first returned target", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          update: (ctx, dt) => {
            ctx.log.push(`update p ${dt}`);
            return undefined;
          },
          initial: "/p/c",
          states: {
            c: {
              ...logged("c"),
              update: (ctx, dt) => {
                ctx.log.push(`update c ${dt}`);
                return ctx.flag === true ? "/p/c2" : undefined;
              },
            },
            c2: logged("c2"),
          },
        },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.update(0.1);
    expect(ctx.log).toEqual(["update c 0.1", "update p 0.1"]);
    ctx.log.length = 0;
    ctx.flag = true;
    m.update(0.2);
    expect(ctx.log).toEqual(["update c 0.2", "exit c", "enter c2"]);
    expect(m.path).toBe("/p/c2");
  });

  test("an after timer counts dt and restarts on re-entry", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { after: { 0.5: "/b" }, on: { LEAVE: "/c" } },
        b: {},
        c: { on: { BACK: "/a" } },
      },
    });
    const m = def.start(newCtx());
    m.update(0.25);
    expect(m.path).toBe("/a");
    m.update(0.25);
    expect(m.path).toBe("/b");

    const again = def.start(newCtx());
    again.update(0.25);
    again.send({ type: "LEAVE" });
    again.send({ type: "BACK" });
    again.update(0.25);
    expect(again.path).toBe("/a");
    again.update(0.25);
    expect(again.path).toBe("/b");
  });

  test("a parent's after timer counts the dt of a tick whose update hook transitions below it", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/airborne",
      states: {
        airborne: {
          initial: "/airborne/rising",
          after: { 0.75: "/timeout" },
          states: {
            rising: { update: (ctx) => (ctx.flag ? "/airborne/falling" : undefined) },
            falling: { after: { 0.5: "/landed" } },
          },
        },
        timeout: {},
        landed: {},
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    m.update(0.25);
    ctx.flag = true;
    m.update(0.25);
    expect(m.path).toBe("/airborne/falling");
    m.update(0.25);
    expect(m.path).toBe("/timeout");
  });

  test("a timer due on a tick whose update hook transitions waits for the next update", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/a",
          after: { 0.5: "/out" },
          states: {
            a: { update: (ctx) => (ctx.flag ? "/p/b" : undefined) },
            b: {},
          },
        },
        out: {},
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    m.update(0.25);
    ctx.flag = true;
    m.update(0.25);
    expect(m.path).toBe("/p/b");
    m.update(0.25);
    expect(m.path).toBe("/out");
  });

  test("the shortest expired after entry fires first regardless of declaration order", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { after: { 1: "/x", 0.5: "/y" } }, x: {}, y: {} },
    });
    const exact = def.start(newCtx());
    exact.update(0.5);
    expect(exact.path).toBe("/y");
    const both = def.start(newCtx());
    both.update(1);
    expect(both.path).toBe("/y");
  });

  test("events never advance a timer; only update does", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { after: { 0.5: "/b" }, on: { PING: {} } }, b: {} },
    });
    const m = def.start(newCtx());
    for (let i = 0; i < 100; i++) {
      m.send({ type: "PING" });
    }
    expect(m.path).toBe("/a");
    m.update(0.5);
    expect(m.path).toBe("/b");
  });

  test("stop exits leaf-first and turns later calls into no-ops", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          ...logged("a"),
          initial: "/a/a1",
          states: { a1: logged("a1") },
          after: { 0.5: "/b" },
          on: { GO: "/b" },
        },
        b: logged("b"),
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.stop();
    expect(ctx.log).toEqual(["exit a1", "exit a"]);
    m.send({ type: "GO" });
    m.update(10);
    m.stop();
    expect(ctx.log).toEqual(["exit a1", "exit a"]);
    expect(m.path).toBeUndefined();
    expect(m.matches("/a")).toBe(false);
  });

  test("stop inside an enter hook takes effect when the step ends and drops queued events", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      on: {
        PING: {
          actions: (ctx) => {
            ctx.log.push("ping");
          },
        },
      },
      states: {
        a: { ...logged("a"), on: { GO: "/b" } },
        b: {
          enter: (ctx: Ctx, m: M) => {
            ctx.log.push("enter b");
            m.send({ type: "PING" });
            m.stop();
          },
          exit: (ctx: Ctx) => {
            ctx.log.push("exit b");
          },
          initial: "/b/b1",
          states: { b1: logged("b1") },
        },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.send({ type: "GO" });
    expect(ctx.log).toEqual(["exit a", "enter b", "enter b1", "exit b1", "exit b"]);
    expect(m.path).toBeUndefined();
  });
});

describe("invoke", () => {
  type LoadEv =
    | { type: "LOADED" }
    | { type: "PING" }
    | { type: "RELOAD" }
    | { type: "UP" }
    | { type: "SIDE" }
    | { type: "AGAIN" };

  interface LoadCtx {
    log: string[];
    settles: ((event: LoadEv) => void)[];
  }

  function loadCtx(): LoadCtx {
    return { log: [], settles: [] };
  }

  function holdSettle(name: string) {
    return (ctx: LoadCtx, settle: (event: LoadEv) => void) => {
      ctx.log.push(`invoke ${name}`);
      ctx.settles.push(settle);
    };
  }

  function settleAt(ctx: LoadCtx, index: number): (event: LoadEv) => void {
    const settle = ctx.settles[index];
    if (settle === undefined) {
      throw new Error(`no settle at ${index}`);
    }
    return settle;
  }

  test("settle moves the machine through the entered state's on, after its enter hook", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          enter: (ctx) => {
            ctx.log.push("enter loading");
          },
          invoke: holdSettle("loading"),
          on: { LOADED: "/ready" },
        },
        ready: {},
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    expect(ctx.log).toEqual(["enter loading", "invoke loading"]);
    expect(m.path).toBe("/loading");
    settleAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/ready");
    expect(ctx.settles.length).toBe(1);
  });

  test("settle is one-shot, and a later entry's settle replaces the earlier one", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          invoke: holdSettle("loading"),
          on: {
            LOADED: "/ready",
            PING: {
              actions: (ctx) => {
                ctx.log.push("ping");
              },
            },
          },
        },
        ready: { on: { RELOAD: "/loading" } },
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    settleAt(ctx, 0)({ type: "PING" });
    settleAt(ctx, 0)({ type: "PING" });
    expect(ctx.log).toEqual(["ping"]);
    settleAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/loading");

    m.send({ type: "LOADED" });
    m.send({ type: "RELOAD" });
    expect(m.path).toBe("/loading");
    settleAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/loading");
    settleAt(ctx, 1)({ type: "LOADED" });
    expect(m.path).toBe("/ready");
  });

  test("a settle held from an exited entry is ignored, whether the level empties or a sibling fills it", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/deep",
      states: {
        deep: {
          initial: "/deep/loading",
          states: {
            loading: {
              invoke: holdSettle("loading"),
              on: { UP: "/shallow", SIDE: "/deep/other" },
            },
            other: { on: { LOADED: "/done" } },
          },
        },
        shallow: { on: { LOADED: "/done", AGAIN: "/deep" } },
        done: {},
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    m.send({ type: "UP" });
    expect(m.path).toBe("/shallow");
    settleAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/shallow");

    m.send({ type: "AGAIN" });
    expect(m.path).toBe("/deep/loading");
    m.send({ type: "SIDE" });
    expect(m.path).toBe("/deep/other");
    settleAt(ctx, 1)({ type: "LOADED" });
    expect(m.path).toBe("/deep/other");
  });

  test("settle called inside invoke queues until the entry step completes", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          ...logged("loading"),
          invoke: (ctx, settle) => {
            settle({ type: "LOADED" });
            ctx.log.push("after settle");
          },
          initial: "/loading/inner",
          states: { inner: logged("inner") },
          on: { LOADED: "/ready" },
        },
        ready: logged("ready"),
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    expect(ctx.log).toEqual([
      "enter loading",
      "after settle",
      "enter inner",
      "exit inner",
      "exit loading",
      "enter ready",
    ]);
    expect(m.path).toBe("/ready");
  });

  test("a settle held across stop runs nothing", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          ...logged("loading"),
          invoke: holdSettle("loading"),
          on: { LOADED: "/ready" },
        },
        ready: logged("ready"),
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    m.stop();
    ctx.log.length = 0;
    settleAt(ctx, 0)({ type: "LOADED" });
    expect(ctx.log).toEqual([]);
    expect(m.path).toBeUndefined();
  });

  test("a reentering self-transition starts invoke again and drops the earlier settle", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          invoke: holdSettle("loading"),
          on: { LOADED: "/ready", AGAIN: { target: "/loading", reenter: true } },
        },
        ready: {},
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    m.send({ type: "AGAIN" });
    expect(ctx.log).toEqual(["invoke loading", "invoke loading"]);
    settleAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/loading");
    settleAt(ctx, 1)({ type: "LOADED" });
    expect(m.path).toBe("/ready");
  });
});

describe("typed paths", () => {
  const motion = defineMachine<Ctx, Ev>()({
    initial: "/grounded",
    states: {
      grounded: {
        initial: "/grounded/idle",
        on: {
          GO: {
            target: "/airborne/rising",
            guard: (ctx) => ctx.flag !== true,
            actions: (ctx) => {
              ctx.log.push("jump");
            },
          },
        },
        states: {
          idle: { on: { STEP: "/grounded/walk" } },
          walk: {
            update: (_ctx, dt) => (dt > 1 ? "/grounded/idle" : undefined),
            on: { BACK: "/airborne/falling" },
          },
        },
      },
      airborne: {
        initial: "/airborne/falling",
        after: { 0.5: "/grounded" },
        states: {
          rising: {},
          falling: {
            enter: (ctx) => {
              ctx.log.push("fall");
            },
          },
        },
      },
    },
  });

  test("on, guarded and after targets compile and the inferred paths reach runtime", () => {
    const ctx = newCtx();
    const m = motion.start(ctx);
    m.send({ type: "STEP", n: 1 });
    expect(m.matches("/grounded/walk")).toBe(true);
    m.send({ type: "BACK" });
    expect(m.matches("/airborne/falling")).toBe(true);
    m.update(0.5);
    expect(m.path).toBe("/grounded/idle");
    m.send({ type: "GO" });
    expect(m.path).toBe("/airborne/rising");
    expect(ctx.log).toEqual(["fall", "jump"]);
    // @ts-expect-error a misspelled path is not one of the machine's states
    expect(m.matches("/grounded/wlak")).toBe(false);
  });

  test("StatePath is the leading-slash union and a running path may be undefined", () => {
    const lampConfig = {
      initial: "/off",
      states: {
        off: { on: { GO: "/on" } },
        on: { initial: "/on/dim", states: { dim: {}, bright: {} }, on: { BACK: "/off" } },
      },
    } as const;
    type LampPath = "/off" | "/on" | "/on/dim" | "/on/bright";
    const unionMatches: Equal<StatePath<typeof lampConfig>, LampPath> = true;
    expect(unionMatches).toBe(true);

    const m = defineMachine<Ctx, Ev>()(lampConfig).start(newCtx());
    m.send({ type: "GO" });
    const maybe: LampPath | undefined = m.path;
    expect(maybe).toBe("/on/dim");
    // @ts-expect-error a stopped machine's path is undefined
    const always: LampPath = m.path;
    expect(always).toBe("/on/dim");
  });

  test("paths are typed four levels deep and fall back to string below that", () => {
    const deep = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: "/b/q/r/s", BACK: "/b/q/r/s/t" } },
        b: {
          initial: "/b/q",
          states: {
            q: {
              initial: "/b/q/r",
              states: {
                r: {
                  initial: "/b/q/r/s",
                  states: { s: { initial: "/b/q/r/s/t", states: { t: {} } } },
                },
              },
            },
          },
        },
      },
    });
    const m = deep.start(newCtx());
    m.send({ type: "GO" });
    expect(m.path).toBe("/b/q/r/s/t");
    expect(m.matches("/b/q/r/s")).toBe(true);
    expect(m.matches("/b/q/r/s/t")).toBe(true);
    expect(m.matches("/b/q/r/s/unchecked")).toBe(false);
    // @ts-expect-error the fourth level is still checked
    expect(m.matches("/b/q/r/x")).toBe(false);
  });

  test("an unknown on, guarded-list, after or initial target fails to compile at start", () => {
    const unknownOn = () =>
      defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { on: { GO: "/nope" } } } });
    const unknownInList = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            on: {
              STEP: [{ guard: (_ctx, event) => event.n > 0, target: "/b" }, { target: "/ghost" }],
            },
          },
          b: {},
        },
      });
    const unknownAfter = () =>
      defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { after: { 1: "/gone" } } } });
    const unknownInitial = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: { a: { initial: "/a/missing", states: { leaf: {} } } },
      });

    // @ts-expect-error GO targets a state the machine does not have
    expect(thrownMessage(() => unknownOn().start(newCtx()))).toContain("/nope");
    // @ts-expect-error the fallback transition targets a state the machine does not have
    expect(thrownMessage(() => unknownInList().start(newCtx()))).toContain("/ghost");
    // @ts-expect-error the timer targets a state the machine does not have
    expect(thrownMessage(() => unknownAfter().start(newCtx()))).toContain("/gone");
    // @ts-expect-error initial names no child of a
    expect(thrownMessage(() => unknownInitial().start(newCtx()))).toContain("/a/missing");
  });

  test("a bare target or a bare initial fails to compile at start", () => {
    const bareTarget = () =>
      defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { on: { GO: "b" } }, b: {} } });
    const bareInitial = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: { a: { initial: "leaf", states: { leaf: {} } } },
      });

    // @ts-expect-error GO names a state without the leading slash
    expect(thrownMessage(() => bareTarget().start(newCtx()))).toBe(notAFullPath("/a", "b"));
    // @ts-expect-error initial names its child without the leading slash
    expect(thrownMessage(() => bareInitial().start(newCtx()))).toContain('initial "leaf"');
  });
});

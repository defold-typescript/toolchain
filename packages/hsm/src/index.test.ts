import { describe, expect, test } from "bun:test";
import {
  defineMachine,
  type MachineConfig,
  type MachineInstance,
  type MoveCause,
  type StatePath,
} from "./index";

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
  test("a transition exits leaf-first, runs run, then enters top-down to a leaf", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          ...logged("a"),
          initial: "/a/a1",
          states: { a1: logged("a1") },
          on: {
            GO: {
              to: "/b",
              run: (ctx) => {
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

  test("the first candidate whose when passes wins", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          on: { HIT: [{ when: (ctx) => ctx.flag === true, to: "/x" }, { to: "/y" }] },
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

  test("when checks after the first passing candidate are never evaluated", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          on: {
            HIT: [
              {
                when: (ctx) => {
                  ctx.log.push("when 1");
                  return true;
                },
                to: "/x",
              },
              {
                when: (ctx) => {
                  ctx.log.push("when 2");
                  return true;
                },
                to: "/y",
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
    expect(ctx.log).toEqual(["when 1"]);
    expect(m.path).toBe("/x");
  });

  test("an event no candidate in the leaf accepts bubbles to the parent", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          initial: "/p/c",
          states: { c: { on: { HIT: { when: () => false, to: "/p/c" } } } },
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

  test("a transition with no to runs its run with no exit or enter", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          ...logged("a"),
          on: {
            PING: {
              run: (ctx) => {
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

  test("transition lists must be non-empty, while {} stays a handler with no to", () => {
    defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          on: {
            // @ts-expect-error an empty transition list would consume HIT
            HIT: [],
            GO: [{ to: "/x" }],
            STEP: [{ when: (_ctx, event) => event.n > 0, to: "/x" }, { to: "/idle" }],
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

  test("a state targeting its own child keeps itself active", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          ...logged("p"),
          initial: "/p/c1",
          states: { c1: logged("c1"), c2: logged("c2") },
          on: { TO2: { to: "/p/c2" } },
        },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.send({ type: "TO2" });
    expect(ctx.log).toEqual(["exit c1", "enter c2"]);
    expect(m.path).toBe("/p/c2");
  });

  test("a target naming the owning state restarts it", () => {
    const def = defineMachine<Ctx, { type: "AGAIN" }>()({
      initial: "/loading",
      states: {
        loading: { ...logged("loading"), after: { 2: "/ready" }, on: { AGAIN: "/loading" } },
        ready: logged("ready"),
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    m.update(1.5);
    ctx.log.length = 0;
    m.send({ type: "AGAIN" });
    expect(ctx.log).toEqual(["exit loading", "enter loading"]);
    m.update(1.5);
    expect(m.path).toBe("/loading");
  });

  test("a target below the owning state keeps it", () => {
    const def = defineMachine<Ctx, { type: "RESET" } | { type: "JUMP" }>()({
      initial: "/playing",
      states: {
        playing: {
          ...logged("playing"),
          initial: "/playing/ground",
          states: {
            ground: { ...logged("ground"), on: { JUMP: "/playing/air" } },
            air: logged("air"),
          },
          on: { RESET: "/playing/ground" },
        },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    m.send({ type: "JUMP" });
    ctx.log.length = 0;
    m.send({ type: "RESET" });
    expect(ctx.log).toEqual(["exit air", "enter ground"]);
    expect(m.path).toBe("/playing/ground");
  });

  test("a self-targeting after repeats", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/blink",
      states: { blink: { ...logged("blink"), after: { 1: "/blink" } } },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.update(1);
    m.update(1);
    expect(ctx.log).toEqual(["exit blink", "enter blink", "exit blink", "enter blink"]);
  });

  test("sends from a hook queue until the step's last enter and run in send order", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      on: {
        STEP: {
          run: (ctx, event) => {
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
              run: (ctx, event) => {
                ctx.hp -= event.damage;
              },
            },
            HEAL: {
              when: (_ctx, event) => event.amount > 0,
              run: (ctx, event) => {
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
              run: (ctx, event) => {
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
          run: (ctx) => {
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

describe("task", () => {
  type LoadEv =
    | { type: "LOADED" }
    | { type: "PING" }
    | { type: "RELOAD" }
    | { type: "UP" }
    | { type: "SIDE" }
    | { type: "AGAIN" };

  interface LoadCtx {
    log: string[];
    finishes: ((event: LoadEv) => void)[];
  }

  function loadCtx(): LoadCtx {
    return { log: [], finishes: [] };
  }

  function holdFinish(name: string) {
    return (ctx: LoadCtx, finish: (event: LoadEv) => void) => {
      ctx.log.push(`task ${name}`);
      ctx.finishes.push(finish);
    };
  }

  function finishAt(ctx: LoadCtx, index: number): (event: LoadEv) => void {
    const finish = ctx.finishes[index];
    if (finish === undefined) {
      throw new Error(`no finish at ${index}`);
    }
    return finish;
  }

  test("finish moves the machine through the entered state's on, after its enter hook", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          enter: (ctx) => {
            ctx.log.push("enter loading");
          },
          task: holdFinish("loading"),
          on: { LOADED: "/ready" },
        },
        ready: {},
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    expect(ctx.log).toEqual(["enter loading", "task loading"]);
    expect(m.path).toBe("/loading");
    finishAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/ready");
    expect(ctx.finishes.length).toBe(1);
  });

  test("finish is one-shot, and a later entry's finish replaces the earlier one", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          task: holdFinish("loading"),
          on: {
            LOADED: "/ready",
            PING: {
              run: (ctx) => {
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
    finishAt(ctx, 0)({ type: "PING" });
    finishAt(ctx, 0)({ type: "PING" });
    expect(ctx.log).toEqual(["ping"]);
    finishAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/loading");

    m.send({ type: "LOADED" });
    m.send({ type: "RELOAD" });
    expect(m.path).toBe("/loading");
    finishAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/loading");
    finishAt(ctx, 1)({ type: "LOADED" });
    expect(m.path).toBe("/ready");
  });

  test("a finish held from an exited entry is ignored, whether the level empties or a sibling fills it", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/deep",
      states: {
        deep: {
          initial: "/deep/loading",
          states: {
            loading: {
              task: holdFinish("loading"),
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
    finishAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/shallow");

    m.send({ type: "AGAIN" });
    expect(m.path).toBe("/deep/loading");
    m.send({ type: "SIDE" });
    expect(m.path).toBe("/deep/other");
    finishAt(ctx, 1)({ type: "LOADED" });
    expect(m.path).toBe("/deep/other");
  });

  test("finish called inside task queues until the entry step completes", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          ...logged("loading"),
          task: (ctx, finish) => {
            finish({ type: "LOADED" });
            ctx.log.push("after finish");
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
      "after finish",
      "enter inner",
      "exit inner",
      "exit loading",
      "enter ready",
    ]);
    expect(m.path).toBe("/ready");
  });

  test("a finish held across stop runs nothing", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          ...logged("loading"),
          task: holdFinish("loading"),
          on: { LOADED: "/ready" },
        },
        ready: logged("ready"),
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    m.stop();
    ctx.log.length = 0;
    finishAt(ctx, 0)({ type: "LOADED" });
    expect(ctx.log).toEqual([]);
    expect(m.path).toBeUndefined();
  });

  test("a self-transition starts task again and drops the earlier finish", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          task: holdFinish("loading"),
          on: { LOADED: "/ready", AGAIN: "/loading" },
        },
        ready: {},
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    m.send({ type: "AGAIN" });
    expect(ctx.log).toEqual(["task loading", "task loading"]);
    finishAt(ctx, 0)({ type: "LOADED" });
    expect(m.path).toBe("/loading");
    finishAt(ctx, 1)({ type: "LOADED" });
    expect(m.path).toBe("/ready");
  });

  function withCleanup(name: string) {
    let entries = 0;
    return (ctx: LoadCtx) => {
      entries++;
      const entry = entries;
      ctx.log.push(`task ${name} ${entry}`);
      return () => {
        ctx.log.push(`cleanup ${name} ${entry}`);
      };
    };
  }

  test("a returned cleanup runs once, after the exit hook, when a transition leaves the state", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          ...logged("loading"),
          task: withCleanup("loading"),
          on: { LOADED: "/ready" },
        },
        ready: { ...logged("ready"), on: { RELOAD: "/loading" } },
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    m.send({ type: "LOADED" });
    m.send({ type: "PING" });
    expect(ctx.log).toEqual([
      "enter loading",
      "task loading 1",
      "exit loading",
      "cleanup loading 1",
      "enter ready",
    ]);
  });

  test("stop runs the active entry's cleanup once", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/outer",
      states: {
        outer: {
          ...logged("outer"),
          task: withCleanup("outer"),
          initial: "/outer/loading",
          states: { loading: { ...logged("loading"), task: withCleanup("loading") } },
        },
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    m.stop();
    m.stop();
    expect(ctx.log).toEqual(["exit loading", "cleanup loading 1", "exit outer", "cleanup outer 1"]);
  });

  test("re-entering a state runs the old entry's cleanup before the new entry's task", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          task: withCleanup("loading"),
          on: { AGAIN: "/loading" },
        },
      },
    });
    const ctx = loadCtx();
    def.start(ctx).send({ type: "AGAIN" });
    expect(ctx.log).toEqual(["task loading 1", "cleanup loading 1", "task loading 2"]);
  });

  test("a task that returns nothing leaves the state as before", () => {
    const def = defineMachine<LoadCtx, LoadEv>()({
      initial: "/loading",
      states: {
        loading: {
          ...logged("loading"),
          task: (ctx) => {
            ctx.log.push("task loading");
          },
          on: { LOADED: "/ready" },
        },
        ready: logged("ready"),
      },
    });
    const ctx = loadCtx();
    const m = def.start(ctx);
    m.send({ type: "LOADED" });
    m.stop();
    expect(ctx.log).toEqual([
      "enter loading",
      "task loading",
      "exit loading",
      "enter ready",
      "exit ready",
    ]);
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
            to: "/airborne/rising",
            when: (ctx) => ctx.flag !== true,
            run: (ctx) => {
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
              STEP: [{ when: (_ctx, event) => event.n > 0, to: "/b" }, { to: "/ghost" }],
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

describe("onMove", () => {
  type Report = [string, string | undefined, string, string | undefined];

  function record<P extends string>(m: MachineInstance<Ctx, Ev, P>): Report[] {
    const reports: Report[] = [];
    m.onMove((from, to, cause, event) => {
      reports.push([from, to, cause, event?.type]);
    });
    return reports;
  }

  test("send reports the old leaf, the new leaf, the event cause and the event", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: { idle: { on: { GO: "/walk" } }, walk: {} },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    m.send({ type: "GO" });
    expect(reports).toEqual([["/idle", "/walk", "event", "GO"]]);
  });

  test("a compound target reports its deepest entered leaf", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: { on: { GO: "/move" } },
        move: { initial: "/move/walk", states: { walk: {}, run: {} } },
      },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    m.send({ type: "GO" });
    expect(reports).toEqual([["/idle", "/move/walk", "event", "GO"]]);
  });

  test("an after timer reports the after cause with no event", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/wait",
      states: { wait: { after: { 1: "/done" } }, done: {} },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    m.update(0.5);
    expect(reports).toEqual([]);
    m.update(0.6);
    expect(reports).toEqual([["/wait", "/done", "after", undefined]]);
  });

  test("an update hook's returned path reports the update cause with no event", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/run",
      states: { run: { update: () => "/rest" }, rest: {} },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    m.update(0.1);
    expect(reports).toEqual([["/run", "/rest", "update", undefined]]);
  });

  test("a task finish reports the event cause with the finished event", () => {
    const finishes: ((event: Ev) => void)[] = [];
    const def = defineMachine<Ctx, Ev>()({
      initial: "/loading",
      states: {
        loading: {
          task: (_ctx, finish) => {
            finishes.push(finish);
          },
          on: { PING: "/ready" },
        },
        ready: {},
      },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    const finish = finishes[0];
    if (finish === undefined) {
      throw new Error("task did not run");
    }
    finish({ type: "PING" });
    expect(reports).toEqual([["/loading", "/ready", "event", "PING"]]);
  });

  test("a transition with no to and an unhandled event report nothing", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            HIT: {
              run: (ctx) => {
                ctx.log.push("hit");
              },
            },
          },
        },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    const reports = record(m);
    m.send({ type: "HIT" });
    m.send({ type: "NOPE" });
    expect(ctx.log).toEqual(["hit"]);
    expect(reports).toEqual([]);
  });

  test("stop reports the leaf to undefined once, and a second stop reports nothing", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/on",
      states: { on: { initial: "/on/dim", states: { dim: {} } } },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    m.stop();
    m.stop();
    expect(reports).toEqual([["/on/dim", undefined, "stop", undefined]]);
  });

  test("stop from an enter hook reports once, after the step's transition", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: "/b" } },
        b: {
          enter: (_ctx, m) => {
            m.stop();
          },
        },
      },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    m.send({ type: "GO" });
    expect(reports).toEqual([
      ["/a", "/b", "event", "GO"],
      ["/b", undefined, "stop", undefined],
    ]);
    expect(m.path).toBeUndefined();
  });

  test("an enter hook that sends an event yields two reports in order", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: "/b" } },
        b: {
          enter: (_ctx, m) => {
            m.send({ type: "PING" });
          },
          on: { PING: "/c" },
        },
        c: {},
      },
    });
    const m = def.start(newCtx());
    const reports = record(m);
    m.send({ type: "GO" });
    expect(reports).toEqual([
      ["/a", "/b", "event", "GO"],
      ["/b", "/c", "event", "PING"],
    ]);
  });

  test("a listener's paths are the machine's typed state paths", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { on: { GO: "/b" } }, b: {} },
    });
    const m = def.start(newCtx());
    let compared = false;
    m.onMove((from, to) => {
      const sameTo: Equal<typeof to, "/a" | "/b" | undefined> = true;
      // @ts-expect-error "/nope" is not one of the machine's state paths
      compared = sameTo && from === "/nope";
    });
    m.send({ type: "GO" });
    expect(compared).toBe(false);
  });

  test("onMove returns a function that removes the listener", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { on: { GO: "/b" } }, b: { on: { BACK: "/a" } } },
    });
    const m = def.start(newCtx());
    const seen: string[] = [];
    const removeA = m.onMove((_from, to) => {
      seen.push(`A ${to}`);
    });
    m.onMove((_from, to) => {
      seen.push(`B ${to}`);
    });
    removeA();
    m.send({ type: "GO" });
    expect(seen).toEqual(["B /b"]);
    removeA();
    m.send({ type: "BACK" });
    expect(seen).toEqual(["B /b", "B /a"]);
  });

  test("a listener removed during a report still lets the others run", () => {
    const def = defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { on: { GO: "/b" } }, b: { on: { BACK: "/a" } } },
    });
    const m = def.start(newCtx());
    const seen: string[] = [];
    const removeA = m.onMove((_from, to) => {
      seen.push(`A ${to}`);
      removeA();
    });
    m.onMove((_from, to) => {
      seen.push(`B ${to}`);
    });
    m.send({ type: "GO" });
    expect(seen).toEqual(["A /b", "B /b"]);
    m.send({ type: "BACK" });
    expect(seen).toEqual(["A /b", "B /b", "B /a"]);
  });
});

describe("retired keys", () => {
  test("retired keys fail to compile", () => {
    // Type-checked but never called: the runtime ignores these keys. Each config also carries a
    // live key, so a dropped tombstone cannot hide behind TypeScript's weak-type check.
    const define = defineMachine<Ctx, Ev>();
    const retired = [
      () =>
        define({
          initial: "/a",
          // @ts-expect-error target is renamed to to
          states: { a: { on: { GO: { target: "/b", run: () => {} } } }, b: {} },
        }),
      () =>
        define({
          initial: "/a",
          // @ts-expect-error guard is renamed to when
          states: { a: { on: { GO: { to: "/b", guard: () => true } } }, b: {} },
        }),
      () =>
        define({
          initial: "/a",
          // @ts-expect-error actions is renamed to run
          states: { a: { on: { GO: { to: "/b", actions: () => {} } } }, b: {} },
        }),
      () =>
        define({
          initial: "/a",
          // @ts-expect-error reenter is removed; a to naming the owning state restarts it
          states: { a: { on: { GO: { to: "/a", reenter: true } } } },
        }),
      () =>
        define({
          initial: "/a",
          // @ts-expect-error invoke is renamed to task
          states: { a: { enter: () => {}, invoke: () => {} } },
        }),
    ];
    expect(retired.length).toBe(5);
  });
});

describe("hot reload", () => {
  type Report = [string, string | undefined, string, string | undefined];

  function record<P extends string>(m: MachineInstance<Ctx, Ev, P>): Report[] {
    const reports: Report[] = [];
    m.onMove((from, to, cause, event) => {
      reports.push([from, to, cause, event?.type]);
    });
    return reports;
  }

  function pathOf(m: { readonly path: string | undefined }): string | undefined {
    return m.path;
  }

  test("defining the same key twice returns the same Machine", () => {
    const first = defineMachine<Ctx, Ev>("reload-same")({ initial: "/a", states: { a: {} } });
    const second = defineMachine<Ctx, Ev>("reload-same")({ initial: "/b", states: { b: {} } });
    expect(second as unknown).toBe(first);
    expect(pathOf(second.start(newCtx()))).toBe("/b");
  });

  test("a live instance rebinds onto a redefinition under the same key", () => {
    const def = defineMachine<Ctx, Ev>("reload-rebind")({
      initial: "/idle",
      states: { idle: logged("idle") },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    const reports = record(m);
    defineMachine<Ctx, Ev>("reload-rebind")({
      initial: "/idle",
      states: { idle: { ...logged("idle"), on: { GO: "/run" } }, run: logged("run") },
    });
    m.update(0);
    expect(m.ctx).toBe(ctx);
    expect(pathOf(m)).toBe("/idle");
    expect(ctx.log).toEqual(["enter idle"]);
    expect(reports).toEqual([]);
    m.send({ type: "GO" });
    expect(pathOf(m)).toBe("/run");
    expect(ctx.log).toEqual(["enter idle", "exit idle", "enter run"]);
    expect(reports).toEqual([["/idle", "/run", "event", "GO"]]);
  });

  test("a removed leaf falls back to the surviving parent's initial chain", () => {
    const def = defineMachine<Ctx, Ev>("reload-removed-leaf")({
      initial: "/a",
      states: { a: { ...logged("a"), initial: "/a/b", states: { b: logged("a.b") } } },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    const reports = record(m);
    ctx.log.length = 0;
    defineMachine<Ctx, Ev>("reload-removed-leaf")({
      initial: "/a",
      states: { a: { ...logged("a"), initial: "/a/c", states: { c: logged("a.c") } } },
    });
    m.update(0);
    expect(pathOf(m)).toBe("/a/c");
    expect(ctx.log).toEqual(["enter a.c"]);
    expect(reports).toEqual([["/a/b", "/a/c", "reload", undefined]]);
  });

  test("a removed top-level state falls back to the root's initial", () => {
    const def = defineMachine<Ctx, Ev>("reload-removed-top")({
      initial: "/x",
      states: { x: logged("x") },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    defineMachine<Ctx, Ev>("reload-removed-top")({ initial: "/y", states: { y: logged("y") } });
    m.send({ type: "PING" });
    expect(pathOf(m)).toBe("/y");
    expect(ctx.log).toEqual(["enter y"]);
  });

  test("a kept leaf that gained children enters its initial chain", () => {
    const def = defineMachine<Ctx, Ev>("reload-gained-children")({
      initial: "/a",
      states: { a: logged("a") },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    const reports = record(m);
    ctx.log.length = 0;
    defineMachine<Ctx, Ev>("reload-gained-children")({
      initial: "/a",
      states: { a: { ...logged("a"), initial: "/a/b", states: { b: logged("a.b") } } },
    });
    m.update(0);
    expect(pathOf(m)).toBe("/a/b");
    expect(ctx.log).toEqual(["enter a.b"]);
    expect(reports).toEqual([["/a", "/a/b", "reload", undefined]]);
  });

  test("a kept state keeps its after-timer progress", () => {
    const config = { initial: "/a", states: { a: { after: { 2: "/b" } }, b: {} } } as const;
    const m = defineMachine<Ctx, Ev>("reload-timer")(config).start(newCtx());
    m.update(1.5);
    defineMachine<Ctx, Ev>("reload-timer")(config);
    m.update(0.6);
    expect(pathOf(m)).toBe("/b");
  });

  test("a rebind runs the cleanups of the states it drops, leaf first, and keeps the rest", () => {
    const taskLogging = (name: string) => (ctx: Ctx) => {
      ctx.log.push(`task ${name}`);
      return () => {
        ctx.log.push(`cleanup ${name}`);
      };
    };
    const def = defineMachine<Ctx, Ev>("reload-cleanup")({
      initial: "/a",
      states: {
        a: {
          task: taskLogging("a"),
          initial: "/a/b",
          states: {
            b: {
              task: taskLogging("a.b"),
              initial: "/a/b/c",
              states: { c: { task: taskLogging("a.b.c") } },
            },
          },
        },
      },
    });
    const ctx = newCtx();
    const m = def.start(ctx);
    ctx.log.length = 0;
    defineMachine<Ctx, Ev>("reload-cleanup")({
      initial: "/a",
      states: {
        a: {
          task: taskLogging("a"),
          initial: "/a/d",
          states: { d: { task: taskLogging("a.d") } },
        },
      },
    });
    m.update(0);
    expect(pathOf(m)).toBe("/a/d");
    expect(ctx.log).toEqual(["cleanup a.b.c", "cleanup a.b", "task a.d"]);
    ctx.log.length = 0;
    m.stop();
    expect(ctx.log).toEqual(["cleanup a.d", "cleanup a"]);
  });

  test("a redefinition that throws leaves the old definition live", () => {
    const def = defineMachine<Ctx, Ev>("reload-throws")({
      initial: "/idle",
      states: { idle: { on: { GO: "/walk" } }, walk: {} },
    });
    const m = def.start(newCtx());
    expect(() =>
      defineMachine<Ctx, Ev>("reload-throws")({
        initial: "/idle",
        states: { idle: { on: { GO: "/missing" as never } } },
      }),
    ).toThrow('hsm: state "/idle" targets unknown state "/missing"');
    m.send({ type: "GO" });
    expect(pathOf(m)).toBe("/walk");
    expect(pathOf(def.start(newCtx()))).toBe("/idle");
  });

  test("definitions without a key never rebind each other", () => {
    const config = { initial: "/idle", states: { idle: { on: { GO: "/a" } }, a: {} } } as const;
    const first = defineMachine<Ctx, Ev>()(config);
    expect(defineMachine<Ctx, Ev>()(config) as unknown).not.toBe(first);
    const m = first.start(newCtx());
    defineMachine<Ctx, Ev>()({ initial: "/idle", states: { idle: { on: { GO: "/b" } }, b: {} } });
    m.send({ type: "GO" });
    expect(pathOf(m)).toBe("/a");
  });
});

describe("restoreDepth", () => {
  type PlayEv =
    | { type: "JUMP" }
    | { type: "FALL" }
    | { type: "LAND" }
    | { type: "PAUSE" }
    | { type: "RESUME" }
    | { type: "MENU" }
    | { type: "BACK" }
    | { type: "RESTART" };

  function platformer(restoreDepth: 1 | 2 | "all" = 1) {
    return {
      initial: "/playing",
      states: {
        playing: {
          ...logged("playing"),
          restoreDepth,
          initial: "/playing/ground",
          on: { PAUSE: "/paused" },
          states: {
            ground: { ...logged("ground"), on: { JUMP: "/playing/air" } },
            air: {
              ...logged("air"),
              initial: "/playing/air/rise",
              on: { LAND: "/playing/ground" },
              states: {
                rise: { ...logged("rise"), on: { FALL: "/playing/air/fall" } },
                fall: logged("fall"),
              },
            },
          },
        },
        paused: { ...logged("paused"), on: { RESUME: "/playing", LAND: "/playing/ground" } },
      },
    } as const;
  }

  type GameEv = { type: "RUN" } | { type: "FIRE" } | { type: "MENU" } | { type: "BACK" };

  function arena(restoreDepth: 1 | 2) {
    return {
      initial: "/game",
      states: {
        game: {
          restoreDepth,
          initial: "/game/alive",
          on: { MENU: "/menu" },
          states: {
            alive: {
              type: "parallel",
              states: {
                move: {
                  initial: "/game/alive/move/walk",
                  states: { walk: { on: { RUN: "/game/alive/move/run" } }, run: {} },
                },
                weapon: {
                  initial: "/game/alive/weapon/idle",
                  states: { idle: { on: { FIRE: "/game/alive/weapon/fire" } }, fire: {} },
                },
              },
            },
            over: {},
          },
        },
        menu: { on: { BACK: "/game" } },
      },
    } as const;
  }

  test("a history state resumes its last active child", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, PlayEv>()(platformer()).start(ctx);
    expect(m.path).toBe("/playing/ground");
    m.send({ type: "JUMP" });
    expect(m.path).toBe("/playing/air/rise");
    m.send({ type: "PAUSE" });
    expect(m.path).toBe("/paused");
    ctx.log.length = 0;
    m.send({ type: "RESUME" });
    expect(m.path).toBe("/playing/air/rise");
    expect(ctx.log).toEqual(["exit paused", "enter playing", "enter air", "enter rise"]);
  });

  test("restoreDepth 1 stops at the child", () => {
    const m = defineMachine<Ctx, PlayEv>()(platformer()).start(newCtx());
    m.send({ type: "JUMP" });
    m.send({ type: "FALL" });
    expect(m.path).toBe("/playing/air/fall");
    m.send({ type: "PAUSE" });
    m.send({ type: "RESUME" });
    expect(m.path).toBe("/playing/air/rise");
  });

  test("a target naming a descendant bypasses restoreDepth", () => {
    const m = defineMachine<Ctx, PlayEv>()(platformer()).start(newCtx());
    m.send({ type: "JUMP" });
    m.send({ type: "PAUSE" });
    m.send({ type: "LAND" });
    expect(m.path).toBe("/playing/ground");
  });

  test("the first entry uses initial", () => {
    const def = defineMachine<Ctx, PlayEv>()(platformer());
    const first = def.start(newCtx());
    expect(first.path).toBe("/playing/ground");
    first.send({ type: "JUMP" });
    first.send({ type: "PAUSE" });
    const second = def.start(newCtx());
    expect(second.path).toBe("/playing/ground");
    first.send({ type: "RESUME" });
    expect(first.path).toBe("/playing/air/rise");
  });

  test("restoreDepth 2 resumes the grandchild", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, PlayEv>()(platformer(2)).start(ctx);
    m.send({ type: "JUMP" });
    m.send({ type: "FALL" });
    m.send({ type: "PAUSE" });
    ctx.log.length = 0;
    m.send({ type: "RESUME" });
    expect(m.path).toBe("/playing/air/fall");
    expect(ctx.log).toEqual(["exit paused", "enter playing", "enter air", "enter fall"]);
  });

  test('"all" restores every level', () => {
    const m = defineMachine<Ctx, PlayEv>()(platformer("all")).start(newCtx());
    m.send({ type: "JUMP" });
    m.send({ type: "FALL" });
    m.send({ type: "PAUSE" });
    m.send({ type: "RESUME" });
    expect(m.path).toBe("/playing/air/fall");
  });

  test("inner levels restore only through the flagged state", () => {
    const m = defineMachine<Ctx, PlayEv>()(platformer(2)).start(newCtx());
    m.send({ type: "JUMP" });
    m.send({ type: "FALL" });
    m.send({ type: "LAND" });
    expect(m.path).toBe("/playing/ground");
    m.send({ type: "JUMP" });
    expect(m.path).toBe("/playing/air/rise");
  });

  test("a parallel state is not a level", () => {
    const leavesAfterReentry = (restoreDepth: 1 | 2) => {
      const m = defineMachine<Ctx, GameEv>()(arena(restoreDepth)).start(newCtx());
      m.send({ type: "RUN" });
      m.send({ type: "FIRE" });
      expect(m.leaves).toEqual(["/game/alive/move/run", "/game/alive/weapon/fire"]);
      m.send({ type: "MENU" });
      expect(m.path).toBe("/menu");
      m.send({ type: "BACK" });
      return [...m.leaves];
    };
    expect(leavesAfterReentry(2)).toEqual(["/game/alive/move/run", "/game/alive/weapon/fire"]);
    expect(leavesAfterReentry(1)).toEqual(["/game/alive/move/walk", "/game/alive/weapon/idle"]);
  });

  function twoLevels(restoreDepth: number): MachineConfig<Ctx, PlayEv> {
    return {
      initial: "/playing",
      states: {
        playing: {
          restoreDepth,
          initial: "/playing/ground",
          states: {
            ground: {},
            air: { initial: "/playing/air/rise", states: { rise: {}, fall: {} } },
          },
        },
      },
    };
  }

  const notACount = (depth: number) =>
    `hsm: state "/playing" has restoreDepth ${depth}; use a whole number from 1, or "all"`;

  const invalidRestoreDepths: [string, MachineConfig<Ctx, PlayEv>, string][] = [
    ["0", twoLevels(0), notACount(0)],
    ["-1", twoLevels(-1), notACount(-1)],
    ["1.5", twoLevels(1.5), notACount(1.5)],
    [
      "3",
      twoLevels(3),
      'hsm: state "/playing" has restoreDepth 3, but only 2 levels of child states below it',
    ],
    [
      "on a leaf",
      { initial: "/leaf", states: { leaf: { restoreDepth: 1 } } },
      'hsm: state "/leaf" has restoreDepth but no child states',
    ],
    [
      "on a parallel state",
      {
        initial: "/alive",
        states: { alive: { type: "parallel", restoreDepth: 1, states: { move: {} } } },
      },
      'hsm: parallel state "/alive" has restoreDepth; only a compound state resumes a child',
    ],
  ];

  test.each(invalidRestoreDepths)("invalid restoreDepth throws: %s", (_label, config, message) => {
    expect(thrownMessage(() => defineMachine<Ctx, PlayEv>()(config))).toBe(message);
  });

  test("entry through an ancestor's initial chain resumes", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, PlayEv>()({
      initial: "/game",
      states: {
        game: {
          initial: "/game/playing",
          on: { MENU: "/menu" },
          states: {
            playing: {
              ...logged("playing"),
              restoreDepth: 1,
              initial: "/game/playing/ground",
              on: { RESTART: "/game/playing" },
              states: {
                ground: { ...logged("ground"), on: { JUMP: "/game/playing/air" } },
                air: logged("air"),
              },
            },
          },
        },
        menu: { on: { BACK: "/game" } },
      },
    }).start(ctx);
    m.send({ type: "JUMP" });
    m.send({ type: "MENU" });
    expect(m.path).toBe("/menu");
    m.send({ type: "BACK" });
    expect(m.path).toBe("/game/playing/air");
    ctx.log.length = 0;
    m.send({ type: "RESTART" });
    expect(m.path).toBe("/game/playing/air");
    expect(ctx.log).toEqual(["exit air", "exit playing", "enter playing", "enter air"]);
  });

  test("a remembered child survives a reload by path", () => {
    const key = "restore-depth-reload";
    const m = defineMachine<Ctx, PlayEv>(key)(platformer()).start(newCtx());
    m.send({ type: "JUMP" });
    m.send({ type: "PAUSE" });
    defineMachine<Ctx, PlayEv>(key)({
      initial: "/playing",
      states: {
        playing: {
          restoreDepth: 1,
          initial: "/playing/ground",
          on: { PAUSE: "/paused" },
          states: {
            ground: {},
            crouch: {},
            air: { initial: "/playing/air/rise", states: { rise: {}, fall: {} } },
          },
        },
        paused: { on: { RESUME: "/playing" } },
      },
    });
    m.send({ type: "RESUME" });
    expect(m.path).toBe("/playing/air/rise");
    m.send({ type: "PAUSE" });
    defineMachine<Ctx, PlayEv>(key)({
      initial: "/playing",
      states: {
        playing: {
          restoreDepth: 1,
          initial: "/playing/ground",
          on: { PAUSE: "/paused" },
          states: { ground: {} },
        },
        paused: { on: { RESUME: "/playing" } },
      },
    });
    m.send({ type: "RESUME" });
    expect(m.path).toBe("/playing/ground");
  });

  test("restoreDepth keeps typed paths and rejects counts the tree cannot hold", () => {
    const m = defineMachine<Ctx, PlayEv>()(platformer(2)).start(newCtx());
    const pathTyped: Equal<typeof m.path, StatePath<ReturnType<typeof platformer>> | undefined> =
      true;
    expect(pathTyped).toBe(true);
    // @ts-expect-error a misspelled path is not one of the machine's states
    const misspelled: typeof m.path = "/playing/aier";
    expect(misspelled as string).toBe("/playing/aier");
    expect(defineMachine<Ctx, PlayEv>()(platformer("all")).start(newCtx()).path).toBe(
      "/playing/ground",
    );
    expect(defineMachine<Ctx, GameEv>()(arena(2)).start(newCtx()).leaves).toHaveLength(2);

    const onPlaying = <const D extends number>(restoreDepth: D) =>
      defineMachine<Ctx, PlayEv>()({
        initial: "/playing",
        states: {
          playing: {
            restoreDepth,
            initial: "/playing/ground",
            states: {
              ground: {},
              air: { initial: "/playing/air/rise", states: { rise: {}, fall: {} } },
            },
          },
        },
      });
    const onLeaf = () =>
      defineMachine<Ctx, PlayEv>()({ initial: "/leaf", states: { leaf: { restoreDepth: 1 } } });
    const onParallel = () =>
      defineMachine<Ctx, PlayEv>()({
        initial: "/alive",
        states: {
          alive: {
            type: "parallel",
            restoreDepth: 1,
            states: { move: { initial: "/alive/move/walk", states: { walk: {} } } },
          },
        },
      });

    // @ts-expect-error a restore count starts at 1
    expect(thrownMessage(() => onPlaying(0).start(newCtx()))).toContain("restoreDepth 0");
    // @ts-expect-error a restore count is a whole number
    expect(thrownMessage(() => onPlaying(1.5).start(newCtx()))).toContain("restoreDepth 1.5");
    // @ts-expect-error /playing holds only two levels of child states
    expect(thrownMessage(() => onPlaying(3).start(newCtx()))).toContain("restoreDepth 3");
    // @ts-expect-error a leaf has no child to restore
    expect(thrownMessage(() => onLeaf().start(newCtx()))).toContain('"/leaf"');
    // @ts-expect-error a parallel state enters every child
    expect(thrownMessage(() => onParallel().start(newCtx()))).toContain('"/alive"');
  });
});

describe("always", () => {
  type Report = [string, string | undefined, string, string | undefined];

  function record<P extends string>(m: MachineInstance<Ctx, Ev, P>): Report[] {
    const reports: Report[] = [];
    m.onMove((from, to, cause, event) => {
      reports.push([from, to, cause, event?.type]);
    });
    return reports;
  }

  function loopMessage(path: string): string {
    return `hsm: state "${path}" took 10 always transitions in a row; check for an always loop`;
  }

  test("an always transition moves on right after entry", () => {
    const ctx = newCtx();
    ctx.flag = false;
    const m = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: { on: { GO: "/route" } },
        route: {
          ...logged("route"),
          always: [{ to: "/a", when: (ctx) => ctx.flag === true }, { to: "/b" }],
        },
        a: logged("a"),
        b: logged("b"),
      },
    }).start(ctx);
    const reports = record(m);
    m.send({ type: "GO" });
    expect(m.path).toBe("/b");
    expect(ctx.log).toEqual(["enter route", "exit route", "enter b"]);
    expect(reports).toEqual([
      ["/idle", "/route", "event", "GO"],
      ["/route", "/b", "always", undefined],
    ]);
  });

  test("a failing when stays put until the next move", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: { on: { GO: "/route" } },
        route: {
          always: { to: "/a", when: (ctx) => ctx.flag === true },
          on: {
            GO: "/route",
            PING: {
              run: (ctx) => {
                ctx.log.push("ping");
              },
            },
          },
        },
        a: {},
      },
    }).start(ctx);
    m.send({ type: "GO" });
    expect(m.path).toBe("/route");
    ctx.flag = true;
    m.update(0.1);
    expect(m.path).toBe("/route");
    m.send({ type: "PING" });
    expect(ctx.log).toEqual(["ping"]);
    expect(m.path).toBe("/route");
    m.send({ type: "GO" });
    expect(m.path).toBe("/a");
  });

  test("the deepest active state's always wins", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: { on: { GO: "/p" } },
        p: { initial: "/p/c", always: "/x", states: { c: { always: "/y" } } },
        x: {},
        y: {},
      },
    }).start(newCtx());
    m.send({ type: "GO" });
    expect(m.path).toBe("/y");
  });

  test("a chain of always moves runs before the next queued event", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      states: {
        idle: { on: { GO: "/r1" } },
        r1: {
          enter: (_ctx, m) => {
            m.send({ type: "LEAVE" });
          },
          always: "/r2",
          on: { LEAVE: "/wrong" },
        },
        r2: { always: "/r3", on: { LEAVE: "/wrong" } },
        r3: { on: { LEAVE: "/done" } },
        wrong: {},
        done: {},
      },
    }).start(newCtx());
    const reports = record(m);
    m.send({ type: "GO" });
    expect(m.path).toBe("/done");
    expect(reports).toEqual([
      ["/idle", "/r1", "event", "GO"],
      ["/r1", "/r2", "always", undefined],
      ["/r2", "/r3", "always", undefined],
      ["/r3", "/done", "event", "LEAVE"],
    ]);
  });

  test("start runs always", () => {
    const ctx = newCtx();
    const m = defineMachine<Ctx, Ev>()({
      initial: "/boot",
      states: { boot: { ...logged("boot"), always: "/ready" }, ready: logged("ready") },
    }).start(ctx);
    expect(m.path).toBe("/ready");
    expect(ctx.log).toEqual(["enter boot", "exit boot", "enter ready"]);
  });

  test("an always loop throws and leaves the instance usable", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/idle",
      on: { BACK: "/c" },
      states: {
        idle: { on: { GO: "/a" } },
        a: {
          enter: (_ctx, m) => {
            m.send({ type: "PING" });
          },
          always: "/b",
          on: { PING: "/c" },
        },
        b: { always: "/a" },
        c: {},
      },
    }).start(newCtx());
    expect(thrownMessage(() => m.send({ type: "GO" }))).toContain(loopMessage("/a"));
    expect(m.path).toBe("/a");
    const reports = record(m);
    m.send({ type: "BACK" });
    expect(m.path).toBe("/c");
    expect(reports).toEqual([["/a", "/c", "event", "BACK"]]);
  });

  test("always targets are checked at defineMachine", () => {
    const unknownAlways = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/route",
        states: { route: { always: "/nope" } },
      });
    const noTarget = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/route",
        states: {
          route: {
            // @ts-expect-error an always transition must name a to
            always: { when: () => true },
          },
        },
      });

    // @ts-expect-error the always transition targets a state the machine does not have
    expect(thrownMessage(() => unknownAlways().start(newCtx()))).toBe(
      'hsm: state "/route" targets unknown state "/nope"',
    );
    expect(thrownMessage(noTarget)).toBe(
      'hsm: state "/route" has an always transition with no "to"',
    );
  });

  test("an always when reads ctx as Ctx and the cause is typed", () => {
    defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: {
        a: {
          always: {
            to: "/b",
            when: (ctx) => {
              const typed: Equal<typeof ctx, Ctx> = true;
              return typed && ctx.flag === true;
            },
          },
        },
        b: {},
      },
    });
    const cause: MoveCause = "always";
    expect(cause).toBe("always");
  });
});

describe("parallel regions", () => {
  type PlayerEv =
    | { type: "START_FIRE" }
    | { type: "RUN" }
    | { type: "DIE" }
    | { type: "REVIVE" }
    | { type: "REVIVE_FIRING" }
    | { type: "WARP" }
    | { type: "JAM" };

  type Report = [string, string | undefined, string, string | undefined];

  function record<P extends string>(m: MachineInstance<Ctx, PlayerEv, P>): Report[] {
    const reports: Report[] = [];
    m.onMove((from, to, cause, event) => {
      reports.push([from, to, cause, event?.type]);
    });
    return reports;
  }

  function player() {
    return {
      initial: "/alive",
      states: {
        alive: {
          ...logged("alive"),
          type: "parallel",
          on: { DIE: "/dead" },
          states: {
            move: {
              ...logged("move"),
              initial: "/alive/move/idle",
              states: {
                idle: {
                  ...logged("idle"),
                  on: {
                    START_FIRE: "/alive/move/run",
                    RUN: "/alive/move/run",
                    WARP: "/alive/weapon/cooldown",
                  },
                },
                run: {
                  ...logged("run"),
                  update: (ctx: Ctx) => (ctx.flag === true ? "/alive/move/idle" : undefined),
                },
              },
            },
            weapon: {
              ...logged("weapon"),
              initial: "/alive/weapon/ready",
              states: {
                ready: {
                  ...logged("ready"),
                  on: { START_FIRE: "/alive/weapon/cooldown", JAM: "/alive/weapon/jammed" },
                },
                cooldown: { ...logged("cooldown"), after: { 0.5: "/alive/weapon/ready" } },
                jammed: {
                  always: { to: "/alive/weapon/ready", when: (ctx: Ctx) => ctx.flag === true },
                },
              },
            },
          },
        },
        dead: {
          ...logged("dead"),
          on: { REVIVE: "/alive", REVIVE_FIRING: "/alive/weapon/cooldown" },
        },
      },
    } as const;
  }

  function startPlayer(ctx: Ctx = newCtx()) {
    return defineMachine<Ctx, PlayerEv>()(player()).start(ctx);
  }

  test("parallel regions each take their own transition", () => {
    const m = startPlayer();
    m.send({ type: "START_FIRE" });
    expect(m.leaves).toEqual(["/alive/move/run", "/alive/weapon/cooldown"]);
    expect(m.path).toBe("/alive/move/run");
    for (const path of [
      "/alive",
      "/alive/move",
      "/alive/weapon",
      "/alive/move/run",
      "/alive/weapon/cooldown",
    ] as const) {
      expect(m.matches(path)).toBe(true);
    }
    expect(m.matches("/alive/move/idle")).toBe(false);
    expect(m.matches("/alive/weapon/ready")).toBe(false);
  });

  test("entering a parallel state enters every region", () => {
    const ctx = newCtx();
    const m = startPlayer(ctx);
    expect(ctx.log).toEqual([
      "enter alive",
      "enter move",
      "enter idle",
      "enter weapon",
      "enter ready",
    ]);
    expect(m.leaves).toEqual(["/alive/move/idle", "/alive/weapon/ready"]);
    m.send({ type: "DIE" });
    ctx.log.length = 0;
    m.send({ type: "REVIVE_FIRING" });
    expect(ctx.log).toEqual([
      "exit dead",
      "enter alive",
      "enter move",
      "enter idle",
      "enter weapon",
      "enter cooldown",
    ]);
    expect(m.leaves).toEqual(["/alive/move/idle", "/alive/weapon/cooldown"]);
  });

  test("an event bubbles above the regions only when none handled it", () => {
    const m = startPlayer();
    m.send({ type: "DIE" });
    expect(m.path).toBe("/dead");
    expect(m.leaves).toEqual(["/dead"]);

    const config = player();
    const handled = defineMachine<Ctx, PlayerEv>()({
      ...config,
      states: {
        ...config.states,
        alive: {
          ...config.states.alive,
          states: {
            ...config.states.alive.states,
            move: { ...config.states.alive.states.move, on: { DIE: "/alive/move/run" } },
          },
        },
      },
    }).start(newCtx());
    handled.send({ type: "DIE" });
    expect(handled.matches("/alive")).toBe(true);
    expect(handled.leaves).toEqual(["/alive/move/run", "/alive/weapon/ready"]);
  });

  test("a region's move that leaves the parallel state ends the offer", () => {
    const config = player();
    const m = defineMachine<Ctx, PlayerEv>()({
      ...config,
      states: {
        ...config.states,
        alive: {
          ...config.states.alive,
          states: {
            move: {
              ...config.states.alive.states.move,
              states: {
                ...config.states.alive.states.move.states,
                idle: { on: { START_FIRE: "/dead" } },
              },
            },
            weapon: {
              ...config.states.alive.states.weapon,
              on: { START_FIRE: "/alive/weapon/cooldown" },
            },
          },
        },
      },
    }).start(newCtx());
    m.send({ type: "START_FIRE" });
    expect(m.leaves).toEqual(["/dead"]);
    expect(m.matches("/alive/weapon/cooldown")).toBe(false);
  });

  test("leaving a parallel state exits regions in reverse order", () => {
    const ctx = newCtx();
    const m = startPlayer(ctx);
    ctx.log.length = 0;
    m.send({ type: "DIE" });
    expect(ctx.log).toEqual([
      "exit ready",
      "exit weapon",
      "exit idle",
      "exit move",
      "exit alive",
      "enter dead",
    ]);

    const stopped = newCtx();
    const s = startPlayer(stopped);
    const leaves = s.leaves;
    stopped.log.length = 0;
    s.stop();
    expect(stopped.log).toEqual([
      "exit ready",
      "exit weapon",
      "exit idle",
      "exit move",
      "exit alive",
    ]);
    expect(s.leaves).toEqual([]);
    expect(s.leaves.length).toBe(0);
    expect(s.leaves).toBe(leaves);
    expect(s.path).toBeUndefined();
  });

  test("a cross-region target re-enters the parallel state", () => {
    const ctx = newCtx();
    const m = startPlayer(ctx);
    ctx.log.length = 0;
    m.send({ type: "WARP" });
    expect(ctx.log).toEqual([
      "exit ready",
      "exit weapon",
      "exit idle",
      "exit move",
      "exit alive",
      "enter alive",
      "enter move",
      "enter idle",
      "enter weapon",
      "enter cooldown",
    ]);
    expect(m.leaves).toEqual(["/alive/move/idle", "/alive/weapon/cooldown"]);
  });

  test("ticks run per region", () => {
    const ctx = newCtx();
    const m = startPlayer(ctx);
    m.send({ type: "START_FIRE" });
    ctx.flag = true;
    m.update(0.6);
    expect(m.leaves).toEqual(["/alive/move/idle", "/alive/weapon/ready"]);

    const timers = newCtx();
    const t = startPlayer(timers);
    t.send({ type: "START_FIRE" });
    timers.flag = true;
    t.update(0.3);
    expect(t.leaves).toEqual(["/alive/move/idle", "/alive/weapon/cooldown"]);
    timers.flag = false;
    t.send({ type: "RUN" });
    t.update(0.3);
    expect(t.leaves).toEqual(["/alive/move/run", "/alive/weapon/ready"]);
  });

  test("always and restoreDepth inside a region", () => {
    const ctx = newCtx();
    const m = startPlayer(ctx);
    m.send({ type: "JAM" });
    expect(m.leaves).toEqual(["/alive/move/idle", "/alive/weapon/jammed"]);
    ctx.flag = true;
    m.send({ type: "RUN" });
    expect(m.leaves).toEqual(["/alive/move/run", "/alive/weapon/ready"]);

    const config = player();
    const remembering = defineMachine<Ctx, PlayerEv>()({
      ...config,
      states: {
        ...config.states,
        alive: {
          ...config.states.alive,
          states: {
            ...config.states.alive.states,
            move: { ...config.states.alive.states.move, restoreDepth: 1 },
          },
        },
      },
    }).start(newCtx());
    remembering.send({ type: "RUN" });
    remembering.send({ type: "DIE" });
    remembering.send({ type: "REVIVE" });
    expect(remembering.leaves).toEqual(["/alive/move/run", "/alive/weapon/ready"]);
  });

  test("onMove reports the moved region", () => {
    const m = startPlayer();
    const reports = record(m);
    m.send({ type: "START_FIRE" });
    m.send({ type: "DIE" });
    expect(reports).toEqual([
      ["/alive/move/idle", "/alive/move/run", "event", "START_FIRE"],
      ["/alive/weapon/ready", "/alive/weapon/cooldown", "event", "START_FIRE"],
      ["/alive/move/run", "/dead", "event", "DIE"],
    ]);
  });

  test("hot reload keeps live regions", () => {
    const config = player();
    const ctx = newCtx();
    const m = defineMachine<Ctx, PlayerEv>("parallel-reload")(config).start(ctx);
    m.send({ type: "START_FIRE" });
    m.update(0.3);
    const reports = record(m);
    ctx.log.length = 0;
    defineMachine<Ctx, PlayerEv>("parallel-reload")({
      ...config,
      states: {
        ...config.states,
        alive: {
          ...config.states.alive,
          states: {
            ...config.states.alive.states,
            shield: {
              ...logged("shield"),
              initial: "/alive/shield/up",
              states: { up: logged("up") },
            },
          },
        },
      },
    });
    m.update(0);
    // The instance keeps the first definition's path types; the reload added /alive/shield.
    const leaves: readonly string[] = m.leaves;
    expect(ctx.log).toEqual(["enter shield", "enter up"]);
    expect(leaves).toEqual(["/alive/move/run", "/alive/shield/up", "/alive/weapon/cooldown"]);
    expect(reports).toEqual([["/alive/move/run", "/alive/move/run", "reload", undefined]]);
    m.update(0.3);
    expect(leaves).toEqual(["/alive/move/run", "/alive/shield/up", "/alive/weapon/ready"]);
  });

  test("a parallel state redefined as compound keeps its first region", () => {
    const config = player();
    const ctx = newCtx();
    const m = defineMachine<Ctx, PlayerEv>("parallel-to-compound")(config).start(ctx);
    ctx.log.length = 0;
    const { type: _type, ...compound } = config.states.alive;
    defineMachine<Ctx, PlayerEv>("parallel-to-compound")({
      ...config,
      states: { ...config.states, alive: { ...compound, initial: "/alive/weapon" } },
    });
    m.update(0);
    expect(ctx.log).toEqual([]);
    expect(m.leaves).toEqual(["/alive/move/idle"]);
    expect(m.matches("/alive/weapon")).toBe(false);
  });

  test("invalid parallel definitions throw, naming the path", () => {
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, PlayerEv>()({
          initial: "/alive",
          states: {
            alive: { type: "parallel", initial: "/alive/move", states: { move: {}, weapon: {} } },
          },
        }),
      ),
    ).toBe('hsm: parallel state "/alive" has initial "/alive/move"; every child is entered');
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, PlayerEv>()({
          initial: "/alive",
          states: { alive: { type: "parallel" } },
        }),
      ),
    ).toBe('hsm: parallel state "/alive" has no child states');
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, PlayerEv>()({
          type: "parallel",
          initial: "/move",
          states: { move: {}, weapon: {} },
        }),
      ),
    ).toBe('hsm: state "(root)" is parallel; put the regions in a child state');
  });

  test("parallel configs keep typed paths, and a parallel initial fails to compile", () => {
    const config = player();
    type PlayerPath = StatePath<typeof config>;
    const regionPath: PlayerPath = "/alive/weapon/cooldown";
    expect(regionPath).toBe("/alive/weapon/cooldown");
    const m = defineMachine<Ctx, PlayerEv>()(config).start(newCtx());
    const leavesTyped: Equal<typeof m.leaves, readonly PlayerPath[]> = true;
    expect(leavesTyped).toBe(true);

    const withInitial = () =>
      defineMachine<Ctx, PlayerEv>()({
        initial: "/alive",
        states: {
          alive: { type: "parallel", initial: "/alive/move", states: { move: {}, weapon: {} } },
        },
      });
    // @ts-expect-error a parallel state enters every child, so it takes no initial
    expect(thrownMessage(() => withInitial().start(newCtx()))).toContain("every child is entered");
  });
});

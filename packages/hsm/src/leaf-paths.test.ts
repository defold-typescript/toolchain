import { describe, expect, test } from "bun:test";
import { defineMachine, type MachineInstance, type MachineView } from "./index";

interface Ctx {
  n: number;
  log: string[];
}

type Ev = { type: "GO" } | { type: "BACK" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type BasePath =
  | "/menu"
  | "/play"
  | "/play/idle"
  | "/play/run"
  | "/solo"
  | "/hooks"
  | `/hooks/${string}`;

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  return "";
}

function newCtx(): Ctx {
  return { n: 0, log: [] };
}

describe("a path below a leaf, in a config slot", () => {
  test("every slot kind rejects a path below a leaf and takes a state of the machine", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            on: {
              // @ts-expect-error solo has no child states
              GO: "/solo/x",
              BACK: {
                // @ts-expect-error solo has no child states
                to: "/solo/x",
              },
            },
            after: {
              // @ts-expect-error solo has no child states
              1: "/solo/x",
            },
            // @ts-expect-error solo has no child states
            always: "/solo/x",
            // @ts-expect-error solo has no child states
            update: () => "/solo/x",
          },
          play: {
            initial: "/play/idle",
            // @ts-expect-error solo has no child states
            after: [{ delay: 1, to: "/solo/x" }],
            always: {
              // @ts-expect-error solo has no child states
              to: "/solo/x",
            },
            states: { idle: {}, run: {} },
          },
          solo: {},
          hooks: {
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    // Never called: only the compiler reads it.
    const accepted = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            on: {
              GO: "/play/run",
              BACK: {
                to: "/play/run",
              },
            },
            after: {
              1: "/play/run",
            },
            always: "/play/run",
            update: () => "/play/run",
          },
          play: {
            initial: "/play/idle",
            after: [{ delay: 1, to: "/play/run" }],
            always: {
              to: "/play/run",
            },
            states: { idle: {}, run: {} },
          },
          solo: {},
          hooks: {
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(rejected).toBeFunction();
    expect(accepted).toBeFunction();
  });

  test("a leaf that holds a slot and a leaf inside a compound state take no path below them", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            on: {
              // @ts-expect-error menu has no child states
              GO: "/menu/x",
              // @ts-expect-error idle has no child states
              BACK: "/play/idle/x",
            },
          },
          play: { initial: "/play/idle", states: { idle: {}, run: {} } },
          solo: {},
          hooks: {
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("a path below a leaf that holds only an unannotated callback is the one error", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            on: {
              // @ts-expect-error hooks has no child states
              GO: "/hooks/x",
            },
          },
          play: { initial: "/play/idle", states: { idle: {}, run: {} } },
          solo: {},
          hooks: {
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("a target in a level of unannotated callbacks compiles and the paths stay exact", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/menu",
      states: {
        menu: { on: { GO: "/play/idle" } },
        play: {
          initial: "/play/idle",
          states: {
            idle: {
              enter: (ctx) => {
                ctx.n = 1;
              },
            },
            run: {
              update: (ctx) => {
                ctx.n += 1;
                return undefined;
              },
            },
          },
        },
      },
    }).start(newCtx());
    const exact: Equal<typeof m.path, "/menu" | "/play" | "/play/idle" | "/play/run" | undefined> =
      true;
    expect(exact).toBe(true);
    m.send({ type: "GO" });
    expect(m.path).toBe("/play/idle");
    expect(m.ctx.n).toBe(1);
  });

  test("a compound state that lacks only its initial puts no error on a target inside it", () => {
    const noInitial = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: { on: { GO: "/play/idle" } },
          play: {
            states: {
              idle: {
                enter: (ctx) => {
                  ctx.n = 1;
                },
              },
              run: {
                enter: (ctx) => {
                  ctx.n = 2;
                },
              },
            },
          },
        },
      });
    expect(thrownMessage(noInitial)).toBe('hsm: compound state "/play" has no initial');
  });
});

describe("initial and restoreDepth on a leaf", () => {
  test("initial on a state with no child states is an error on initial", () => {
    const alone = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error a has no child states
            initial: "/a/x",
          },
        },
      });
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const besideHook = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error a has no child states
            initial: "/a/x",
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(thrownMessage(alone)).toBe('hsm: state "/a" has initial "/a/x" but no child states');
    expect(besideHook).toBeFunction();
  });

  test("restoreDepth on a state with no child states is an error on restoreDepth", () => {
    const alone = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error a has no child states
            restoreDepth: "all",
          },
        },
      });
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const besideHook = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error a has no child states
            restoreDepth: 1,
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(thrownMessage(alone)).toBe('hsm: state "/a" has restoreDepth but no child states');
    expect(besideHook).toBeFunction();
  });

  test("initial and restoreDepth compile on a compound state of unannotated callbacks", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/play",
      states: {
        play: {
          initial: "/play/run",
          restoreDepth: 1,
          states: {
            idle: {
              enter: (ctx) => {
                ctx.log.push("idle");
              },
            },
            run: {
              enter: (ctx) => {
                ctx.log.push("run");
              },
            },
          },
        },
      },
    }).start(newCtx());
    expect(m.path).toBe("/play/run");
    expect(m.ctx.log).toEqual(["run"]);
  });
});

describe("a callback's machine", () => {
  test("an enter and a when take the machine's paths and any path below an unread leaf", () => {
    const checks: boolean[] = [];
    const m = defineMachine<Ctx, Ev>()({
      initial: "/menu",
      states: {
        menu: {
          enter: (_ctx, machine) => {
            const exact: Equal<typeof machine, MachineInstance<Ctx, Ev, BasePath>> = true;
            checks.push(exact, machine.matches("/hooks/anything"));
            // @ts-expect-error solo has no child states
            machine.matches("/solo/x");
            // @ts-expect-error menu has no child states
            machine.matches("/menu/x");
            // @ts-expect-error idle has no child states
            machine.matches("/play/idle/x");
          },
          on: {
            GO: {
              to: "/play",
              when: (_ctx, _event, machine) => {
                const exact: Equal<typeof machine, MachineView<BasePath>> = true;
                checks.push(exact, machine.matches("/hooks/anything"));
                // @ts-expect-error solo has no child states
                machine.matches("/solo/x");
                // @ts-expect-error menu has no child states
                machine.matches("/menu/x");
                // @ts-expect-error idle has no child states
                machine.matches("/play/idle/x");
                return true;
              },
            },
          },
        },
        play: { initial: "/play/idle", states: { idle: {}, run: {} } },
        solo: {},
        hooks: {
          enter: (ctx) => {
            ctx.n = 1;
          },
        },
      },
    }).start(newCtx());
    m.send({ type: "GO" });
    expect(checks).toEqual([true, false, true, false]);
    expect(m.path).toBe("/play/idle");
  });

  test("a root enter written above states takes no path below a leaf", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        enter: (_ctx, machine) => {
          machine.matches("/play/run");
          // @ts-expect-error solo has no child states
          machine.matches("/solo/x");
          // @ts-expect-error menu has no child states
          machine.matches("/menu/x");
          // @ts-expect-error idle has no child states
          machine.matches("/play/idle/x");
        },
        states: {
          menu: { on: { GO: "/play" } },
          play: { initial: "/play/idle", states: { idle: {}, run: {} } },
          solo: {},
          hooks: {
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("one annotated parameter closes a leaf that holds only a callback", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            enter: (_ctx, machine) => {
              machine.matches("/hooks");
              // @ts-expect-error hooks has no child states
              machine.matches("/hooks/x");
            },
            on: { GO: "/play" },
          },
          play: { initial: "/play/idle", states: { idle: {}, run: {} } },
          solo: {},
          hooks: {
            enter: (ctx: Ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(rejected).toBeFunction();
  });
});

describe("what a state may hold", () => {
  test("a key no state has is an error on that key", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            on: { GO: "/play" },
            // @ts-expect-error onn is not a key of a state
            onn: { GO: "/play" },
          },
          play: { initial: "/play/idle", states: { idle: {}, run: {} } },
          solo: {
            // @ts-expect-error entr is not a key of a state
            entr: (ctx: Ctx) => {
              ctx.n = 2;
            },
          },
          hooks: {
            enter: (ctx) => {
              ctx.n = 1;
            },
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("a state built ahead of the config fits and the paths stay exact", () => {
    const idle = {
      enter: (ctx: Ctx) => {
        ctx.log.push("idle");
      },
    };
    const m = defineMachine<Ctx, Ev>()({
      initial: "/play",
      states: {
        menu: { on: { GO: "/play" } },
        play: { initial: "/play/idle", states: { idle, run: {} } },
      },
    }).start(newCtx());
    const exact: Equal<typeof m.path, "/menu" | "/play" | "/play/idle" | "/play/run" | undefined> =
      true;
    expect(exact).toBe(true);
    expect(m.ctx.log).toEqual(["idle"]);
  });
});

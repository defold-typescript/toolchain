import { describe, expect, test } from "bun:test";
import {
  defineMachine,
  type MachineInstance,
  type MachineView,
  type MoveAction,
  type RunAction,
  type StateHook,
} from "./index";

interface Ctx {
  n: number;
  seen: boolean[];
}

interface Priv {
  hits: number[];
}

type Ev = { type: "GO" } | { type: "BACK" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type HookPath =
  | "/menu"
  | "/play"
  | "/play/idle"
  | "/play/run"
  | `/menu/${string}`
  | `/play/idle/${string}`
  | `/play/run/${string}`;

function newCtx(): Ctx {
  return { n: 0, seen: [] };
}

describe("paths a callback's machine rejects", () => {
  test("every callback kind takes a state of the machine and no other path", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            enter: (_ctx, machine) => {
              machine.matches("/play/run");
              // @ts-expect-error not one of the machine's paths
              machine.matches("/play/typo");
            },
            exit: (_ctx, machine) => {
              machine.matches("/play/run");
              // @ts-expect-error not one of the machine's paths
              machine.matches("/play/typo");
            },
            update: (_ctx, _dt, machine) => {
              machine.matches("/play/run");
              // @ts-expect-error not one of the machine's paths
              machine.matches("/play/typo");
              return undefined;
            },
            task: (_ctx, _finish, machine) => {
              machine.matches("/play/run");
              // @ts-expect-error not one of the machine's paths
              machine.matches("/play/typo");
            },
            unhandled: (_ctx, _event, machine) => {
              machine.matches("/play/run");
              // @ts-expect-error not one of the machine's paths
              machine.matches("/play/typo");
            },
            on: {
              GO: {
                to: "/play",
                when: (_ctx, _event, machine) => {
                  machine.matches("/play/run");
                  // @ts-expect-error not one of the machine's paths
                  return machine.matches("/play/typo");
                },
                run: (_ctx, _event, machine) => {
                  machine.matches("/play/run");
                  // @ts-expect-error not one of the machine's paths
                  machine.matches("/play/typo");
                },
              },
            },
            always: {
              to: "/play",
              when: (_ctx, machine) => {
                machine.matches("/play/run");
                // @ts-expect-error not one of the machine's paths
                return machine.matches("/play/typo");
              },
              run: (_ctx, machine) => {
                machine.matches("/play/run");
                // @ts-expect-error not one of the machine's paths
                machine.matches("/play/typo");
              },
            },
            after: {
              1: {
                to: "/play",
                when: (_ctx, machine) => {
                  machine.matches("/play/run");
                  // @ts-expect-error not one of the machine's paths
                  return machine.matches("/play/typo");
                },
                run: (_ctx, machine) => {
                  machine.matches("/play/run");
                  // @ts-expect-error not one of the machine's paths
                  machine.matches("/play/typo");
                },
              },
            },
            every: {
              1: (_ctx, machine) => {
                machine.matches("/play/run");
                // @ts-expect-error not one of the machine's paths
                machine.matches("/play/typo");
              },
            },
          },
          play: {
            initial: "/play/idle",
            after: [
              {
                delay: 1,
                to: "/menu",
                when: (_ctx, machine) => {
                  machine.matches("/play/run");
                  // @ts-expect-error not one of the machine's paths
                  return machine.matches("/play/typo");
                },
                run: (_ctx, machine) => {
                  machine.matches("/play/run");
                  // @ts-expect-error not one of the machine's paths
                  machine.matches("/play/typo");
                },
              },
            ],
            every: [
              {
                delay: 1,
                run: (_ctx, machine) => {
                  machine.matches("/play/run");
                  // @ts-expect-error not one of the machine's paths
                  machine.matches("/play/typo");
                },
              },
            ],
            states: { idle: { on: { GO: "/play/run" } }, run: {} },
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("a root hook written above states takes a state of the machine and no other path", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        enter: (_ctx, machine) => {
          machine.matches("/play/run");
          // @ts-expect-error not one of the machine's paths
          machine.matches("/nope");
        },
        states: {
          menu: { on: { GO: "/play" } },
          play: {
            initial: "/play/idle",
            states: { idle: { on: { GO: "/play/run" } }, run: {} },
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("a hook beside private fields and tags takes a state of the machine and no other path", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev, "busy">()({
        privateCtx: (): Priv => ({ hits: [] }),
        initial: "/a",
        states: {
          a: {
            tags: ["busy"],
            enter: (ctx, machine) => {
              ctx.hits.push(ctx.n);
              machine.hasTag("busy");
              machine.matches("/b");
              // @ts-expect-error not one of the machine's paths
              machine.matches("/c");
            },
            on: { GO: "/b" },
          },
          b: {},
        },
      });
    expect(rejected).toBeFunction();
  });

  test("a mistyped target beside a typed hook is the only error", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/menu",
        states: {
          menu: {
            enter: (_ctx, machine) => {
              machine.matches("/play");
            },
            // @ts-expect-error not one of the machine's paths
            on: { GO: "/plya" },
          },
          play: {
            initial: "/play/idle",
            states: { idle: { on: { GO: "/play/run" } }, run: {} },
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("one annotated callback makes a level of callbacks known", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            enter: (ctx: Ctx) => {
              ctx.n = 1;
            },
          },
          b: {
            enter: (_ctx, machine) => {
              machine.matches("/a");
              // @ts-expect-error not one of the machine's paths
              machine.matches("/typo");
            },
          },
        },
      });
    expect(rejected).toBeFunction();
  });
});

describe("path types", () => {
  test("a hook's machine and a when's view carry the machine's paths", () => {
    const checks: boolean[] = [];
    const m = defineMachine<Ctx, Ev>()({
      initial: "/menu",
      states: {
        menu: {
          enter: (_ctx, machine) => {
            const exact: Equal<typeof machine, MachineInstance<Ctx, Ev, HookPath>> = true;
            checks.push(exact);
          },
          on: {
            GO: {
              to: "/play",
              when: (_ctx, _event, machine) => {
                const exact: Equal<typeof machine, MachineView<HookPath>> = true;
                checks.push(exact);
                return true;
              },
            },
          },
        },
        play: {
          initial: "/play/idle",
          states: { idle: { on: { GO: "/play/run" } }, run: {} },
        },
      },
    }).start(newCtx());
    m.send({ type: "GO" });
    expect(checks).toEqual([true, true]);
  });

  const callbacksOnly = (checks: boolean[]) =>
    defineMachine<Ctx, Ev>()({
      initial: "/menu",
      states: {
        menu: { on: { GO: "/play" } },
        play: {
          initial: "/play/idle",
          states: {
            idle: {
              enter: (_ctx, machine) => {
                const exact: Equal<
                  typeof machine.path,
                  "/menu" | "/play" | `/menu/${string}` | `/play/${string}` | undefined
                > = true;
                checks.push(exact, machine.matches("/play/anything"));
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
    });

  test("a level whose states hold only callbacks takes any path below it", () => {
    const checks: boolean[] = [];
    const m = callbacksOnly(checks).start(newCtx());
    m.send({ type: "GO" });
    expect(checks).toEqual([true, false]);
  });

  test("the instance that config starts keeps its exact paths", () => {
    const m = callbacksOnly([]).start(newCtx());
    const exact: Equal<typeof m.path, "/menu" | "/play" | "/play/idle" | "/play/run" | undefined> =
      true;
    expect(exact).toBe(true);
    expect(m.path).toBe("/menu");
  });
});

describe("what still compiles and runs", () => {
  test("callbacks declared ahead of the config with exported types fill the slots", () => {
    const count: StateHook<Ctx, Ev> = (ctx) => {
      ctx.n += 1;
    };
    const act: MoveAction<Ctx, Ev> = (ctx) => {
      ctx.n += 10;
    };
    const tick: RunAction<Ctx, Ev> = (ctx) => {
      ctx.n += 100;
    };
    const open = (_ctx: Readonly<Ctx>, _event: Readonly<Ev>, machine: MachineView) =>
      machine.matches("/menu");
    const m = defineMachine<Ctx, Ev>()({
      initial: "/menu",
      states: {
        menu: { enter: count, on: { GO: { to: "/play", when: open, run: act } } },
        play: {
          initial: "/play/idle",
          every: { 1: tick },
          states: { idle: { on: { GO: "/play/run" } }, run: {} },
        },
      },
    }).start(newCtx());
    m.send({ type: "GO" });
    m.update(1);
    expect(m.ctx.n).toBe(111);
    expect(m.path).toBe("/play/idle");
  });

  test("a machine fits a function that takes string paths", () => {
    const inPlay = (machine: MachineInstance<Ctx, Ev>) => machine.matches("/play");
    const m = defineMachine<Ctx, Ev>()({
      initial: "/menu",
      states: {
        menu: { on: { GO: "/play" } },
        play: {
          initial: "/play/idle",
          enter: (ctx, machine) => {
            ctx.seen.push(inPlay(machine));
          },
          states: { idle: { on: { GO: "/play/run" } }, run: {} },
        },
      },
    }).start(newCtx());
    m.send({ type: "GO" });
    expect(m.ctx.seen).toEqual([true]);
    expect(inPlay(m)).toBe(true);
  });
});

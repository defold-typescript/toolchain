import { describe, expect, test } from "bun:test";
import { sequence } from "./async";
import { inspect } from "./debug";
import {
  type AfterRule,
  type AlwaysConfig,
  defineMachine,
  type MachineInstance,
  type MachineView,
  type StateHook,
} from "./index";

interface Ctx {
  hits: number;
}

type Ev =
  | { type: "ROLL" }
  | { type: "LAND" }
  | { type: "RAISE" }
  | { type: "LOWER" }
  | { type: "HIT" }
  | { type: "GO" };

type Tag = "invulnerable" | "busy" | "spawned" | "unused";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const knight = () =>
  defineMachine<Ctx, Ev, Tag>()({
    initial: "/alive",
    tags: ["spawned"],
    states: {
      alive: {
        type: "parallel",
        on: {
          HIT: {
            to: "/dead",
            when: (_ctx, _event, machine) => !machine.hasTag("invulnerable"),
          },
        },
        states: {
          body: {
            initial: "/alive/body/walk",
            states: {
              walk: { on: { ROLL: "/alive/body/roll" } },
              roll: {
                tags: ["invulnerable"],
                initial: "/alive/body/roll/start",
                states: { start: {} },
                on: { LAND: "/alive/body/walk" },
              },
            },
          },
          shield: {
            initial: "/alive/shield/down",
            states: {
              down: { on: { RAISE: "/alive/shield/up" } },
              up: { tags: ["invulnerable", "busy"], on: { LOWER: "/alive/shield/down" } },
            },
          },
        },
      },
      dead: {},
    },
  });

describe("tags at run time", () => {
  test("the root's tag holds from the start, and no other tag does", () => {
    const m = knight().start({ hits: 0 });
    expect(m.hasTag("spawned")).toBe(true);
    expect(m.hasTag("invulnerable")).toBe(false);
    expect(m.hasTag("busy")).toBe(false);
    expect(m.hasTag("unused")).toBe(false);
  });

  test("a parent's tag holds while its child is active, and ends when the parent is left", () => {
    const m = knight().start({ hits: 0 });
    m.send({ type: "ROLL" });
    expect(m.path).toBe("/alive/body/roll/start");
    expect(m.hasTag("invulnerable")).toBe(true);
    m.send({ type: "LAND" });
    expect(m.hasTag("invulnerable")).toBe(false);
  });

  test("a tag two regions carry holds until both have left it", () => {
    const m = knight().start({ hits: 0 });
    m.send({ type: "ROLL" });
    m.send({ type: "RAISE" });
    expect(m.hasTag("invulnerable")).toBe(true);
    expect(m.hasTag("busy")).toBe(true);
    m.send({ type: "LAND" });
    expect(m.hasTag("invulnerable")).toBe(true);
    m.send({ type: "LOWER" });
    expect(m.hasTag("invulnerable")).toBe(false);
    expect(m.hasTag("busy")).toBe(false);
  });

  test("a when reads a tag", () => {
    const m = knight().start({ hits: 0 });
    m.send({ type: "ROLL" });
    expect(m.can({ type: "HIT" })).toBe(false);
    m.send({ type: "HIT" });
    expect(m.path).toBe("/alive/body/roll/start");
    m.send({ type: "LAND" });
    m.send({ type: "HIT" });
    expect(m.path).toBe("/dead");
    expect(m.hasTag("spawned")).toBe(true);
  });

  test("a stopped machine has no tag", () => {
    const m = knight().start({ hits: 0 });
    m.send({ type: "ROLL" });
    m.send({ type: "RAISE" });
    m.stop();
    expect(m.hasTag("spawned")).toBe(false);
    expect(m.hasTag("invulnerable")).toBe(false);
    expect(m.hasTag("busy")).toBe(false);
    expect(m.hasTag("unused")).toBe(false);
  });

  test("a hot reload replaces the tags once the machine picks it up", () => {
    const define = (tagged: "a" | "b" | undefined) =>
      defineMachine<Ctx, Ev, "x">("tags reload")({
        initial: "/a",
        states: {
          a: { tags: tagged === "a" ? ["x"] : [], on: { GO: "/b" } },
          b: { tags: tagged === "b" ? ["x"] : [] },
        },
      });
    const m = define("a").start({ hits: 0 });
    expect(m.hasTag("x")).toBe(true);
    define("b");
    expect(m.hasTag("x")).toBe(true);
    m.update(0);
    expect(m.hasTag("x")).toBe(false);
    m.send({ type: "GO" });
    expect(m.hasTag("x")).toBe(true);
    define(undefined);
    m.update(0);
    expect(m.hasTag("x")).toBe(false);
  });

  test("a tag may share its name with a member every JavaScript object inherits", () => {
    const inherited = Object.getOwnPropertyNames(Object.prototype);
    expect(inherited).toContain("__proto__");
    expect(inherited).toContain("constructor");
    for (const name of inherited) {
      const others = inherited.filter((tag) => tag !== name);
      const m = defineMachine<Ctx, Ev, string>()({
        initial: "/a",
        states: {
          a: { tags: [name], on: { GO: "/b" } },
          b: { tags: others },
        },
      }).start({ hits: 0 });
      expect(inherited.filter((tag) => m.hasTag(tag))).toEqual([name]);
      m.send({ type: "GO" });
      expect(inherited.filter((tag) => m.hasTag(tag))).toEqual(others);
    }
    const plain = defineMachine<Ctx, Ev, string>()({
      initial: "/a",
      states: {
        a: { tags: ["plain"] },
      },
    }).start({ hits: 0 });
    expect(inherited.filter((tag) => plain.hasTag(tag))).toEqual([]);
  });
});

describe("tag types", () => {
  test("a tags entry, a hasTag argument and a path each take only the machine's names", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () => {
      const m = defineMachine<Ctx, Ev, Tag>()({
        initial: "/alive",
        // @ts-expect-error not one of the machine's tags
        tags: ["spawnd"],
        states: {
          alive: {
            // @ts-expect-error not one of the machine's tags
            tags: ["invulnerble"],
            initial: "/alive/walk",
            states: {
              walk: {
                // @ts-expect-error not one of the machine's tags
                tags: ["bsy"],
                // @ts-expect-error not one of the machine's paths
                on: { ROLL: "/nowhere" },
              },
            },
          },
          dead: { tags: ["busy"] },
        },
      }).start({ hits: 0 });
      // @ts-expect-error not one of the machine's tags
      m.hasTag("nope");
      // @ts-expect-error not one of the machine's paths
      m.matches("/nowhere");
      return m.hasTag("busy") && m.matches("/alive/walk");
    };
    expect(rejected).toBeFunction();
  });

  test("the machine every callback receives takes the machine's tags and no other name", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () =>
      defineMachine<Ctx, Ev, Tag>()({
        initial: "/a",
        enter: (_ctx, machine) => {
          machine.hasTag("invulnerable");
          // @ts-expect-error not one of the machine's tags
          machine.hasTag("nope");
        },
        exit: (_ctx, machine) => {
          machine.hasTag("invulnerable");
          // @ts-expect-error not one of the machine's tags
          machine.hasTag("nope");
        },
        update: (_ctx, _dt, machine) => {
          machine.hasTag("invulnerable");
          // @ts-expect-error not one of the machine's tags
          machine.hasTag("nope");
          return undefined;
        },
        task: (_ctx, _finish, machine) => {
          machine.hasTag("invulnerable");
          // @ts-expect-error not one of the machine's tags
          machine.hasTag("nope");
        },
        unhandled: (_ctx, _event, machine) => {
          machine.hasTag("invulnerable");
          // @ts-expect-error not one of the machine's tags
          machine.hasTag("nope");
        },
        states: {
          a: {
            on: {
              HIT: {
                to: "/b",
                when: (_ctx, _event, machine) => {
                  machine.hasTag("invulnerable");
                  // @ts-expect-error not one of the machine's tags
                  return machine.hasTag("nope");
                },
                run: (_ctx, _event, machine) => {
                  machine.hasTag("invulnerable");
                  // @ts-expect-error not one of the machine's tags
                  machine.hasTag("nope");
                },
              },
            },
            after: {
              1: {
                to: "/b",
                when: (_ctx, machine) => {
                  machine.hasTag("invulnerable");
                  // @ts-expect-error not one of the machine's tags
                  return machine.hasTag("nope");
                },
                run: (_ctx, machine) => {
                  machine.hasTag("invulnerable");
                  // @ts-expect-error not one of the machine's tags
                  machine.hasTag("nope");
                },
              },
            },
            always: {
              to: "/b",
              when: (_ctx, machine) => {
                machine.hasTag("invulnerable");
                // @ts-expect-error not one of the machine's tags
                return machine.hasTag("nope");
              },
              run: (_ctx, machine) => {
                machine.hasTag("invulnerable");
                // @ts-expect-error not one of the machine's tags
                machine.hasTag("nope");
              },
            },
            every: {
              1: (_ctx, machine) => {
                machine.hasTag("invulnerable");
                // @ts-expect-error not one of the machine's tags
                machine.hasTag("nope");
              },
            },
          },
          b: {
            after: [
              {
                delay: 1,
                to: "/a",
                when: (_ctx, machine) => {
                  machine.hasTag("invulnerable");
                  // @ts-expect-error not one of the machine's tags
                  return machine.hasTag("nope");
                },
                run: (_ctx, machine) => {
                  machine.hasTag("invulnerable");
                  // @ts-expect-error not one of the machine's tags
                  machine.hasTag("nope");
                },
              },
            ],
          },
        },
      });
    expect(rejected).toBeFunction();
  });

  test("an unannotated machine carries the tags, in a hook, in a when and on the instance", () => {
    type HookPath = "/a" | "/b" | `/a/${string}` | `/b/${string}`;
    const checks: boolean[] = [];
    const m = defineMachine<Ctx, Ev, Tag>()({
      initial: "/a",
      states: {
        a: {
          enter: (_ctx, machine) => {
            const exact: Equal<typeof machine, MachineInstance<Ctx, Ev, HookPath, Tag>> = true;
            checks.push(exact);
          },
          on: {
            GO: {
              to: "/b",
              when: (_ctx, _event, machine) => {
                const exact: Equal<typeof machine, MachineView<HookPath, Tag>> = true;
                checks.push(exact);
                return true;
              },
            },
          },
        },
        b: {},
      },
    }).start({ hits: 0 });
    m.send({ type: "GO" });
    const exactArgument: Equal<Parameters<typeof m.hasTag>[0], Tag> = true;
    checks.push(exactArgument);
    expect(checks).toEqual([true, true, true]);
  });

  test("a machine defined with two type arguments takes no tag", () => {
    // Never called: the definition holds what the types reject, and only the compiler reads it.
    const rejected = () => {
      const m = defineMachine<Ctx, Ev>()({
        initial: "/a",
        states: {
          a: {
            // @ts-expect-error the machine names no tags
            tags: ["invulnerable"],
            enter: (_ctx, machine) => {
              // @ts-expect-error the machine names no tags
              machine.hasTag("invulnerable");
            },
          },
        },
      }).start({ hits: 0 });
      // @ts-expect-error the machine names no tags
      m.hasTag("invulnerable");
    };
    expect(rejected).toBeFunction();
  });

  test("helpers typed without the tags fit a tagged machine, and private fields keep their types", () => {
    const count: StateHook<Ctx, Ev> = (ctx) => {
      ctx.hits += 1;
    };
    const alive = (_ctx: Ctx, _event: Ev, machine: MachineView): boolean =>
      machine.matches("/alive");
    const beaten: AlwaysConfig<Ctx, "/dead"> = { to: "/dead", when: (ctx) => ctx.hits > 2 };
    const timeout: AfterRule<Ctx, "/dead"> = { to: "/dead" };
    const m = defineMachine<Ctx, Ev, Tag>()({
      initial: "/alive",
      states: {
        alive: {
          tags: ["invulnerable"],
          enter: count,
          always: beaten,
          after: { 5: timeout },
          task: sequence(async (ctx, signal) => {
            if (!signal.aborted) {
              ctx.hits += 1;
            }
          }),
          on: { HIT: { to: "/dead", when: alive } },
        },
        dead: {},
      },
    }).start({ hits: 0 });
    // Never called: inspect reads the engine, and only the compiler checks the argument.
    const inspected = () => inspect(m, "knight");
    expect(inspected).toBeFunction();
    expect(m.ctx.hits).toBe(2);
    expect(m.hasTag("invulnerable")).toBe(true);
    m.send({ type: "HIT" });
    expect(m.path).toBe("/dead");

    const before = defineMachine<Ctx, Ev, Tag>()({
      privateCtx: () => ({ streak: 0 }),
      initial: "/roll",
      states: {
        roll: {
          tags: ["invulnerable"],
          enter: (ctx, machine) => {
            if (machine.hasTag("invulnerable")) {
              ctx.streak += 1;
            }
          },
        },
      },
    }).start({ hits: 0 });
    expect(before.ctx).toMatchObject({ streak: 1 });
    const after = defineMachine<Ctx, Ev, Tag>()({
      initial: "/roll",
      states: {
        roll: {
          tags: ["invulnerable"],
          enter: (ctx, machine) => {
            if (machine.hasTag("invulnerable")) {
              ctx.streak += 1;
            }
          },
        },
      },
      privateCtx: () => ({ streak: 0 }),
    }).start({ hits: 0 });
    expect(after.ctx).toMatchObject({ streak: 1 });
  });
});

import { describe, expect, test } from "bun:test";
import { defineMachine, type MachineView } from "./index";

type Ev =
  | { type: "JUMP" }
  | { type: "LAND" }
  | { type: "CROUCH" }
  | { type: "STAND" }
  | { type: "SWAP" }
  | { type: "BOTH" }
  | { type: "GO" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const knight = () =>
  defineMachine<object, Ev>()({
    initial: "/alive",
    states: {
      alive: {
        type: "parallel",
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
                  SWAP: {
                    to: "/alive/move/jump",
                    when: (_ctx, _event, machine) => machine.matches("/alive/posture/crouching"),
                  },
                  BOTH: "/alive/move/jump",
                },
              },
              jump: { on: { LAND: "/alive/move/idle" } },
            },
          },
          posture: {
            initial: "/alive/posture/standing",
            states: {
              standing: {
                on: {
                  CROUCH: "/alive/posture/crouching",
                  SWAP: "/alive/posture/crouching",
                  BOTH: {
                    to: "/alive/posture/crouching",
                    when: (_ctx, _event, machine) => machine.matches("/alive/move/jump"),
                  },
                },
              },
              crouching: { on: { STAND: "/alive/posture/standing" } },
            },
          },
        },
      },
    },
  });

describe("guards at run time", () => {
  test("a guard that reads another region lets the move through while that region allows it", () => {
    const m = knight().start({});
    m.send({ type: "JUMP" });
    expect([...m.leaves]).toEqual(["/alive/move/jump", "/alive/posture/standing"]);
  });

  test("the same guard drops the event once the other region has moved", () => {
    const m = knight().start({});
    m.send({ type: "CROUCH" });
    m.send({ type: "JUMP" });
    expect([...m.leaves]).toEqual(["/alive/move/idle", "/alive/posture/crouching"]);
  });

  test("an earlier region's guard reads a later region before it moves", () => {
    const m = knight().start({});
    m.send({ type: "SWAP" });
    expect([...m.leaves]).toEqual(["/alive/move/idle", "/alive/posture/crouching"]);
  });

  test("a later region's guard reads an earlier region after it moved", () => {
    const m = knight().start({});
    m.send({ type: "BOTH" });
    expect([...m.leaves]).toEqual(["/alive/move/jump", "/alive/posture/crouching"]);
  });

  test("an on guard is handed the instance start returned", () => {
    let seen: unknown;
    const m = defineMachine<object, Ev>()({
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
    }).start({});
    m.send({ type: "GO" });
    expect(seen).toBe(m);
  });

  test("a guard reads path and leaves", () => {
    const m = defineMachine<object, Ev>()({
      initial: "/a",
      states: {
        a: {
          initial: "/a/b",
          on: {
            GO: {
              to: "/c",
              when: (_ctx, _event, machine) =>
                machine.path === "/a/b" && machine.leaves.length === 1,
            },
          },
          states: { b: {} },
        },
        c: {},
      },
    }).start({});
    m.send({ type: "GO" });
    expect(m.path).toBe("/c");
  });

  test("an always guard reads another region", () => {
    const m = defineMachine<object, Ev>()({
      initial: "/hub",
      states: {
        hub: {
          type: "parallel",
          states: {
            a: {
              initial: "/hub/a/wait",
              states: {
                wait: {
                  always: {
                    to: "/hub/a/go",
                    when: (_ctx, machine) => machine.matches("/hub/b/on"),
                  },
                },
                go: {},
              },
            },
            b: {
              initial: "/hub/b/off",
              states: { off: { on: { GO: "/hub/b/on" } }, on: {} },
            },
          },
        },
      },
    }).start({});
    expect([...m.leaves]).toEqual(["/hub/a/wait", "/hub/b/off"]);
    m.send({ type: "GO" });
    expect([...m.leaves]).toEqual(["/hub/a/go", "/hub/b/on"]);
  });

  test("an always guard is handed the instance start returned", () => {
    let seen: unknown;
    const m = defineMachine<object, Ev>()({
      initial: "/a",
      states: {
        a: {
          always: {
            to: "/b",
            when: (_ctx, machine) => {
              seen = machine;
              return false;
            },
          },
        },
        b: {},
      },
    }).start({});
    expect(seen).toBe(m);
  });
});

describe("guard types", () => {
  test("an unannotated machine parameter is exactly MachineView with the machine's paths", () => {
    type HookPath = "/a" | "/b" | "/c" | `/a/${string}` | `/b/${string}` | `/c/${string}`;
    const seen: boolean[] = [];
    const m = defineMachine<object, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            GO: {
              to: "/b",
              when: (_ctx, _event, machine) => {
                const exact: Equal<typeof machine, MachineView<HookPath>> = true;
                seen.push(exact);
                return true;
              },
            },
          },
        },
        b: {
          always: {
            to: "/c",
            when: (_ctx, machine) => {
              const exact: Equal<typeof machine, MachineView<HookPath>> = true;
              seen.push(exact);
              return true;
            },
          },
        },
        c: {},
      },
    }).start({});
    m.send({ type: "GO" });
    expect(seen).toEqual([true, true]);
  });

  test("the view hides the context and everything that changes the machine", () => {
    const m = defineMachine<object, Ev>()({
      initial: "/a",
      states: {
        a: {
          on: {
            GO: {
              to: "/b",
              when: (_ctx, _event, machine) => {
                const hidden: unknown[] = [];
                // @ts-expect-error the view has no ctx
                hidden.push(machine.ctx);
                // @ts-expect-error the view has no send
                hidden.push(machine.send);
                // @ts-expect-error the view has no stop
                hidden.push(machine.stop);
                // @ts-expect-error the view has no update
                hidden.push(machine.update);
                // @ts-expect-error the view has no onMove
                hidden.push(machine.onMove);
                return hidden.length === 5;
              },
            },
          },
        },
        b: {},
      },
    }).start({});
    m.send({ type: "GO" });
    expect(m.path).toBe("/b");
  });

  test("a guard written with fewer parameters compiles and runs", () => {
    const m = defineMachine<{ open: boolean }, Ev>()({
      initial: "/a",
      states: {
        a: { on: { GO: { to: "/b", when: (ctx, event) => ctx.open && event.type === "GO" } } },
        b: { always: { to: "/c", when: (ctx) => ctx.open } },
        c: {},
      },
    }).start({ open: true });
    m.send({ type: "GO" });
    expect(m.path).toBe("/c");
  });

  test("an instance is a view of its own paths", () => {
    const m = knight().start({});
    const view: MachineView<NonNullable<(typeof m)["path"]>> = m;
    expect(view.matches("/alive/move/idle")).toBe(true);
  });
});

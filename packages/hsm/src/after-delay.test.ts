import { describe, expect, test } from "bun:test";
import { defineMachine, type MoveCause } from "./index";

interface Ctx {
  wait: number;
}

type Ev = { type: "GO" } | { type: "BACK" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const make = (key?: string) =>
  defineMachine<Ctx, Ev>(key)({
    initial: "/patrol",
    states: {
      patrol: { after: [{ delay: (ctx) => ctx.wait, to: "/rest" }], on: { GO: "/rest" } },
      rest: { on: { BACK: "/patrol" } },
    },
  });

const withDelay = (delay: number | ((ctx: Ctx) => number)) =>
  defineMachine<Ctx, Ev>()({
    initial: "/patrol",
    states: { patrol: { after: [{ delay, to: "/rest" }] }, rest: {} },
  });

const NOT_A_DELAY = 'hsm: state "/patrol" has an after delay';

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  return "";
}

describe("after delays at run time", () => {
  test("two instances of one machine each wait for their own delay", () => {
    const m = make();
    const quick = m.start({ wait: 2 });
    const slow = m.start({ wait: 5 });
    quick.update(3);
    slow.update(3);
    expect(quick.path).toBe("/rest");
    expect(slow.path).toBe("/patrol");
    slow.update(3);
    expect(slow.path).toBe("/rest");
  });

  test("a change to the context does not move a timer that is already running", () => {
    const a = make().start({ wait: 5 });
    a.ctx.wait = 1;
    a.update(2);
    expect(a.path).toBe("/patrol");
    a.update(3);
    expect(a.path).toBe("/rest");
  });

  test("the next entry reads the changed context", () => {
    const a = make().start({ wait: 5 });
    a.ctx.wait = 1;
    a.update(5);
    a.send({ type: "BACK" });
    expect(a.path).toBe("/patrol");
    a.update(1);
    expect(a.path).toBe("/rest");
  });

  test("the delay function is called once per entry of the state", () => {
    let calls = 0;
    const counted = (ctx: Ctx) => {
      calls++;
      return ctx.wait;
    };
    const a = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: { after: [{ delay: counted, to: "/rest" }], on: { GO: "/rest" } },
        rest: { on: { BACK: "/patrol" } },
      },
    }).start({ wait: 5 });
    a.update(0.1);
    a.update(0.1);
    a.update(0.1);
    expect(calls).toBe(1);
    a.send({ type: "GO" });
    a.send({ type: "BACK" });
    expect(calls).toBe(2);
  });

  test("the delay is read after the state's enter hook", () => {
    const a = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: {
          enter: (ctx) => {
            ctx.wait = 2;
          },
          after: [{ delay: (ctx) => ctx.wait, to: "/rest" }],
        },
        rest: {},
      },
    }).start({ wait: 99 });
    a.update(2);
    expect(a.path).toBe("/rest");
  });

  test("timers fire in delay order, and entries with one delay in list order", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: {
          after: [
            { delay: (ctx) => ctx.wait, to: "/a" },
            { delay: 1, to: "/b" },
          ],
        },
        a: {},
        b: {},
      },
    });
    const landsIn = (wait: number) => {
      const a = m.start({ wait });
      a.update(1);
      return a.path;
    };
    expect(landsIn(3)).toBe("/b");
    expect(landsIn(0.5)).toBe("/a");
    expect(landsIn(1)).toBe("/a");
  });

  test("a list of number delays counts like the number-key form", () => {
    const a = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: { patrol: { after: [{ delay: 1, to: "/b" }] }, b: {} },
    }).start({ wait: 0 });
    a.update(0.5);
    expect(a.path).toBe("/patrol");
    a.update(0.5);
    expect(a.path).toBe("/b");
  });

  test("a move listener hears the timer's move with the after cause", () => {
    const a = make().start({ wait: 1 });
    const heard: [string, string | undefined, MoveCause, Ev | undefined][] = [];
    a.onMove((from, to, cause, event) => {
      heard.push([from, to, cause, event]);
    });
    a.update(1);
    expect(heard).toEqual([["/patrol", "/rest", "after", undefined]]);
  });

  test("a hot reload reads the delay again and keeps the state's clock", () => {
    const a = make("after-delay-reload").start({ wait: 5 });
    a.update(1);
    a.ctx.wait = 2;
    make("after-delay-reload");
    a.update(1.5);
    expect(a.path).toBe("/rest");
  });

  test("a delay that is not a non-negative number throws, naming the state", () => {
    expect(thrownMessage(() => withDelay(() => -1).start({ wait: 0 }))).toBe(
      `${NOT_A_DELAY} "-1" that is not a non-negative number`,
    );
    expect(thrownMessage(() => withDelay(() => Number.NaN).start({ wait: 0 }))).toStartWith(
      NOT_A_DELAY,
    );
    expect(thrownMessage(() => withDelay((() => "2") as never).start({ wait: 0 }))).toStartWith(
      NOT_A_DELAY,
    );
    expect(thrownMessage(() => withDelay(-1))).toBe(
      `${NOT_A_DELAY} "-1" that is not a non-negative number`,
    );
    expect(
      thrownMessage(() =>
        defineMachine<Ctx, Ev>()({
          initial: "/patrol",
          states: {
            patrol: { after: [{ delay: (ctx) => ctx.wait, to: "/nope" as never }] },
            rest: {},
          },
        }),
      ),
    ).toBe('hsm: state "/patrol" targets unknown state "/nope"');
  });
});

describe("after delay types", () => {
  test("an unannotated delay parameter is exactly Ctx", () => {
    const seen: boolean[] = [];
    defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: {
          after: [
            {
              delay: (ctx) => {
                const exact: Equal<typeof ctx, Ctx> = true;
                seen.push(exact);
                return ctx.wait;
              },
              to: "/rest",
            },
          ],
        },
        rest: {},
      },
    }).start({ wait: 1 });
    expect(seen).toEqual([true]);
  });

  test("a delay reads the private fields with no annotation, on a top-level and a nested state", () => {
    const first = defineMachine<Ctx, Ev>()({
      privateCtx: () => ({ extra: 0 }),
      initial: "/patrol",
      states: {
        patrol: {
          after: [{ delay: (ctx) => ctx.extra + ctx.wait, to: "/rest" }],
          initial: "/patrol/walk",
          states: {
            walk: { after: [{ delay: (ctx) => ctx.extra + ctx.wait + 1, to: "/rest" }] },
          },
        },
        rest: {},
      },
    }).start({ wait: 1 });
    first.update(1);
    expect(first.path).toBe("/rest");
    const after = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: {
          after: [{ delay: (ctx) => ctx.extra + ctx.wait, to: "/rest" }],
          initial: "/patrol/walk",
          states: {
            walk: { after: [{ delay: (ctx) => ctx.extra + ctx.wait + 1, to: "/rest" }] },
          },
        },
        rest: {},
      },
      privateCtx: (ctx: Ctx) => ({ extra: ctx.wait }),
    }).start({ wait: 1 });
    after.update(1);
    expect(after.path).toBe("/patrol/walk");
    after.update(1);
    expect(after.path).toBe("/rest");
  });

  test("a target that is not a path is an error in both forms", () => {
    expect(() =>
      defineMachine<Ctx, Ev>()({
        initial: "/patrol",
        states: {
          patrol: {
            // @ts-expect-error "/nope" is not a path of this machine
            after: [{ delay: (ctx) => ctx.wait, to: "/nope" }],
          },
          rest: {
            // @ts-expect-error "/nope" is not a path of this machine
            after: { 2: "/nope" },
          },
        },
      }),
    ).toThrow();
  });

  test("a delay function that returns a string is an error", () => {
    const m = defineMachine<Ctx, Ev>()({
      initial: "/patrol",
      states: {
        patrol: {
          // @ts-expect-error a delay is a number of seconds
          after: [{ delay: (ctx) => `${ctx.wait}`, to: "/rest" }],
        },
        rest: {},
      },
    });
    expect(thrownMessage(() => m.start({ wait: 2 }))).toStartWith(NOT_A_DELAY);
  });
});

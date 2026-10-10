import { describe, expect, test } from "bun:test";
import { defineMachine, waitGroup } from "./index";

function logging(): { log: string[]; note: (text: string) => () => void } {
  const log: string[] = [];
  const note = (text: string) => () => {
    log.push(text);
  };
  return { log, note };
}

describe("a group alone", () => {
  test("wait runs its callback at once when nothing was added", () => {
    const { log, note } = logging();
    waitGroup().wait(note("done"));
    expect(log).toEqual(["done"]);
  });

  test("wait runs its callback inside the report that finishes the last piece", () => {
    const { log, note } = logging();
    const group = waitGroup();
    const a = group.add();
    const b = group.add();
    group.wait(note("done"));
    log.push("a");
    a();
    log.push("b");
    b();
    log.push("after");
    expect(log).toEqual(["a", "b", "done", "after"]);
  });

  test("a report counts once, and the callback runs once", () => {
    const { log, note } = logging();
    const group = waitGroup();
    const a = group.add();
    const b = group.add();
    group.wait(note("done"));
    a();
    a();
    expect(log).toEqual([]);
    b();
    expect(log).toEqual(["done"]);
    a();
    b();
    expect(log).toEqual(["done"]);
  });

  test("work reported before the wait still leaves the wait pending on the rest", () => {
    const { log, note } = logging();
    const group = waitGroup();
    const a = group.add();
    a();
    const b = group.add();
    group.wait(note("done"));
    expect(log).toEqual([]);
    b();
    expect(log).toEqual(["done"]);

    const second = logging();
    const other = waitGroup();
    const reported = other.add();
    reported();
    other.wait(second.note("done"));
    expect(second.log).toEqual(["done"]);
  });

  test("several waits run in the order registered, each once", () => {
    const { log, note } = logging();
    const group = waitGroup();
    const a = group.add();
    group.wait(note("first"));
    group.wait(note("second"));
    a();
    expect(log).toEqual(["first", "second"]);
    group.wait(note("late"));
    expect(log).toEqual(["first", "second", "late"]);
  });

  test("an add or a wait made by a waiting callback belongs to the next round", () => {
    const { log, note } = logging();
    const group = waitGroup();
    const a = group.add();
    let held: (() => void) | undefined;
    group.wait(() => {
      log.push("first");
      held = group.add();
      group.wait(note("next"));
    });
    group.wait(note("second"));
    a();
    expect(log).toEqual(["first", "second"]);
    held?.();
    expect(log).toEqual(["first", "second", "next"]);
  });

  test("two groups count apart", () => {
    const { log, note } = logging();
    const first = waitGroup();
    const second = waitGroup();
    const a = first.add();
    second.wait(note("second"));
    expect(log).toEqual(["second"]);
    first.wait(note("first"));
    expect(log).toEqual(["second"]);
    a();
    expect(log).toEqual(["second", "first"]);
  });
});

describe("a group in a task", () => {
  interface Ctx {
    count: number;
    reports: (() => void)[];
  }

  type Ev = { type: "LOADED" } | { type: "AGAIN" };

  const loader = () =>
    defineMachine<Ctx, Ev>()({
      initial: "/loading",
      states: {
        loading: {
          task: (ctx, finish) => {
            const group = waitGroup();
            for (let i = 0; i < ctx.count; i++) {
              ctx.reports.push(group.add());
            }
            group.wait(() => finish({ type: "LOADED" }));
          },
          on: { LOADED: "/ready", AGAIN: "/loading" },
        },
        ready: {},
      },
    });

  function reportAt(ctx: Ctx, index: number): void {
    const report = ctx.reports[index];
    if (report === undefined) {
      throw new Error(`no report at ${index}`);
    }
    report();
  }

  test("the machine moves once every piece has reported", () => {
    const ctx: Ctx = { count: 2, reports: [] };
    const m = loader().start(ctx);
    expect(m.path).toBe("/loading");
    reportAt(ctx, 0);
    expect(m.path).toBe("/loading");
    reportAt(ctx, 1);
    expect(m.path).toBe("/ready");
  });

  test("the group of an entry already left moves nothing", () => {
    const ctx: Ctx = { count: 2, reports: [] };
    const m = loader().start(ctx);
    reportAt(ctx, 0);
    m.send({ type: "AGAIN" });
    reportAt(ctx, 1);
    expect(m.path).toBe("/loading");
    expect(ctx.reports.length).toBe(4);
    reportAt(ctx, 2);
    reportAt(ctx, 3);
    expect(m.path).toBe("/ready");
  });

  test("no pieces means the machine has moved when start returns", () => {
    const ctx: Ctx = { count: 0, reports: [] };
    expect(loader().start(ctx).path).toBe("/ready");
  });
});

describe("types", () => {
  test("a report fits an engine callback slot, and add takes no count", () => {
    const { log, note } = logging();
    const group = waitGroup();
    const callback: (self: unknown, id: number, response: { status: number }) => void = group.add();
    group.wait(note("done"));
    callback(undefined, 1, { status: 200 });
    expect(log).toEqual(["done"]);

    const counted = () => {
      // @ts-expect-error add takes no count
      group.add(2);
    };
    expect(typeof counted).toBe("function");
  });
});

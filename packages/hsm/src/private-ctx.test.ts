import { describe, expect, test } from "bun:test";
import { sequence } from "./async";
import { defineMachine } from "./index";

interface Options {
  readonly name: string;
  readonly start?: number;
}

interface Internals {
  hits: number[];
  count: number;
}

type Ev = { type: "HIT" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const make = (key?: string) =>
  defineMachine<Options, Ev>(key)({
    privateCtx: (): Internals => ({ hits: [], count: 0 }),
    enter: (ctx) => {
      ctx.count = ctx.start ?? 0;
    },
    initial: "/idle",
    states: {
      idle: {
        enter: (ctx) => {
          ctx.count += 1;
        },
        on: {
          HIT: {
            run: (ctx) => {
              ctx.hits.push(ctx.hits.length);
            },
          },
        },
      },
    },
  });

// The instance hides the private fields from its type, so tests read them through this.
const internals = (ctx: Options): Internals => ctx as unknown as Internals;

describe("privateCtx at run time", () => {
  test("every start builds its own private fields before the root's enter hook", () => {
    const m = make();
    const a = m.start({ name: "a" });
    const b = m.start({ name: "b" });
    a.send({ type: "HIT" });
    a.send({ type: "HIT" });
    expect(internals(a.ctx).count).toBe(1);
    expect(internals(a.ctx).hits).toEqual([0, 1]);
    expect(internals(b.ctx).hits).toEqual([]);
    expect(internals(a.ctx).hits).not.toBe(internals(b.ctx).hits);
  });

  test("the root's enter hook can set a private field from a public one", () => {
    expect(internals(make().start({ name: "a", start: 10 }).ctx).count).toBe(11);
  });

  test("start keeps the object it is given and adds the private fields to it", () => {
    const options = { name: "x" };
    const a = make().start(options);
    expect(a.ctx).toBe(options);
    expect(internals(options).count).toBe(1);
  });

  test("restarting with the old ctx keeps the public fields and builds the private ones fresh", () => {
    const m = make();
    const first = m.start({ name: "a" });
    first.send({ type: "HIT" });
    first.stop();
    const second = m.start(first.ctx);
    expect(second.ctx.name).toBe("a");
    expect(internals(second.ctx).hits).toEqual([]);
    expect(internals(second.ctx).count).toBe(1);
  });

  test("a hot reload adds the fields a new factory introduces and keeps the values already there", () => {
    const a = make("private-reload").start({ name: "a" });
    a.send({ type: "HIT" });
    defineMachine<Options, Ev>("private-reload")({
      privateCtx: (): Internals & { armor: number } => ({ hits: [], count: 0, armor: 5 }),
      initial: "/idle",
      states: { idle: {} },
    });
    a.update(0);
    const after = a.ctx as unknown as Internals & { armor: number };
    expect(after.hits).toEqual([0]);
    expect(after.count).toBe(1);
    expect(after.armor).toBe(5);
  });
});

describe("privateCtx types", () => {
  test("inferred fields: hooks see them, and `as` sets the types inference gets wrong", () => {
    const m = defineMachine<Options, Ev>()({
      privateCtx: () => ({ count: 0, hits: [] as number[], mode: "cool" as "cool" | "hot" }),
      initial: "/idle",
      states: {
        idle: {
          enter: (ctx) => {
            ctx.count += ctx.name.length;
            ctx.hits.push(ctx.count);
            ctx.mode = "hot";
            // @ts-expect-error mode holds "cool" or "hot", not any string
            ctx.mode = "warm";
          },
        },
      },
    });
    expect(m.start({ name: "ab" }).matches("/idle")).toBe(true);
  });

  test("a named type: the factory's return type types the fields and checks them", () => {
    defineMachine<Options, Ev>()({
      // @ts-expect-error a field the named type does not declare
      privateCtx: (): Internals => ({ hits: [], count: 0, armor: 5 }),
      initial: "/idle",
      states: { idle: {} },
    });
    defineMachine<Options, Ev>()({
      // @ts-expect-error count is a number
      privateCtx: (): Internals => ({ hits: [], count: "0" }),
      initial: "/idle",
      states: { idle: {} },
    });
    const helper = (ctx: Options & Internals): boolean => ctx.hits.length > 0;
    const m = defineMachine<Options, Ev>()({
      privateCtx: (): Internals => ({ hits: [], count: 0 }),
      initial: "/idle",
      states: { idle: { always: { to: "/full", when: helper } }, full: {} },
    });
    expect(m.start({ name: "a" }).path).toBe("/idle");
  });

  test("callers neither pass nor see the private fields", () => {
    const m = make();
    // @ts-expect-error count is private
    m.start({ name: "a", count: 3 });
    const a = m.start({ name: "a" });
    expect(a.ctx.name).toBe("a");
    // @ts-expect-error count is private
    expect(a.ctx.count).toBe(1);
  });

  test("a private field may not share a name with a field of Ctx", () => {
    defineMachine<Options, Ev>()({
      // @ts-expect-error name is already a field of Options
      privateCtx: () => ({ name: "again" }),
      initial: "/idle",
      states: { idle: {} },
    });
  });

  test("without privateCtx a hook's ctx is exactly Ctx", () => {
    const seen: unknown[] = [];
    const m = defineMachine<Options, Ev>()({
      enter: (ctx) => {
        const exact: Equal<typeof ctx, Options> = true;
        seen.push(exact);
        // @ts-expect-error count is not a field of Options
        seen.push(ctx.count);
      },
      initial: "/idle",
      states: { idle: {} },
    });
    m.start({ name: "a" });
    expect(seen).toEqual([true, undefined]);
  });

  test("a sequence task reads the private fields with no annotation on ctx", () => {
    defineMachine<Options, Ev>()({
      privateCtx: () => ({ count: 0 }),
      initial: "/idle",
      states: {
        idle: {
          task: sequence(async (ctx, signal) => {
            ctx.count += ctx.name.length;
            await signal.wait(1);
          }),
        },
      },
    });
  });

  test("privateCtx written after states still types the hooks and stays out of the instance", () => {
    const m = defineMachine<Options, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          enter: (ctx) => {
            ctx.count += 1;
          },
        },
      },
      privateCtx: () => ({ count: 0 }),
    });
    const a = m.start({ name: "a" });
    const exact: Equal<typeof a.ctx, Options> = true;
    expect(exact).toBe(true);
    expect(internals(a.ctx).count).toBe(1);
  });

  test("without privateCtx annotated guards leave the unannotated bodies typed as Ctx", () => {
    const long = (ctx: Options): boolean => ctx.name.length > 3;
    const named = (ctx: { readonly name: string }): boolean => ctx.name !== "";
    const seen: string[] = [];
    defineMachine<Options, Ev>()({
      initial: "/idle",
      states: {
        idle: {
          always: [
            { to: "/idle", when: long },
            { to: "/idle", when: named },
          ],
          task: sequence(async (ctx, signal) => {
            seen.push(ctx.name);
            await signal.wait(1);
          }),
          enter: (ctx) => {
            seen.push(ctx.name);
          },
        },
      },
    });
  });

  test("a target that is not a path is reported on its own line beside privateCtx", () => {
    expect(() =>
      defineMachine<Options, Ev>()({
        privateCtx: () => ({ count: 0 }),
        initial: "/idle",
        states: {
          idle: {
            // @ts-expect-error "/nope" is not a path of this machine
            on: { HIT: "/nope" },
          },
        },
      }),
    ).toThrow();
  });
});

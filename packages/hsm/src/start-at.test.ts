import { describe, expect, test } from "bun:test";
import { defineMachine, type Machine } from "./index";

interface Ctx {
  log: string[];
  wait: number;
  flag: boolean;
}

type Ev = { type: "SHOP" } | { type: "BACK" } | { type: "GO" } | { type: "DONE" };

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const ctx = (): Ctx => ({ log: [], wait: 2, flag: false });

const logged = (name: string) => ({
  enter: (ctx: Ctx) => {
    ctx.log.push(`enter ${name}`);
  },
});

const game = () =>
  defineMachine<Ctx, Ev>()({
    initial: "/menu",
    states: {
      menu: { ...logged("menu"), on: { SHOP: "/shop" } },
      play: {
        ...logged("play"),
        type: "parallel",
        states: {
          move: {
            ...logged("move"),
            initial: "/play/move/idle",
            states: { idle: logged("idle"), run: logged("run") },
          },
          weapon: {
            ...logged("weapon"),
            initial: "/play/weapon/ready",
            states: {
              ready: logged("ready"),
              cooldown: { ...logged("cooldown"), after: { 1: "/play/weapon/ready" } },
            },
          },
        },
      },
      shop: {
        restoreDepth: 1,
        initial: "/shop/buy",
        on: { BACK: "/menu" },
        states: {
          buy: {},
          sell: { initial: "/shop/sell/list", states: { list: {}, confirm: {} } },
        },
      },
    },
  });

const entry = () =>
  defineMachine<Ctx, Ev>()({
    initial: "/idle",
    states: {
      idle: {},
      load: {
        task: (ctx) => {
          ctx.log.push("task");
          return () => {
            ctx.log.push("cleanup");
          };
        },
      },
      timed: { after: [{ delay: (ctx) => ctx.wait, to: "/idle" }] },
      gate: { always: { to: "/idle", when: (ctx) => ctx.flag } },
      hop: { enter: (_ctx, machine) => machine.send({ type: "GO" }), on: { GO: "/idle" } },
    },
  });

describe("start at a position", () => {
  test("no list and an empty list enter the root's initial chain", () => {
    const bare = ctx();
    expect([...game().start(bare).leaves]).toEqual(["/menu"]);
    expect(bare.log).toEqual(["enter menu"]);
    const empty = ctx();
    expect([...game().start(empty, []).leaves]).toEqual(["/menu"]);
    expect(empty.log).toEqual(["enter menu"]);
  });

  test("a path per region enters both regions in region order, whatever the list order", () => {
    const entered = ["enter play", "enter move", "enter run", "enter weapon", "enter cooldown"];
    const listed = ctx();
    const a = game().start(listed, ["/play/weapon/cooldown", "/play/move/run"]);
    expect([...a.leaves]).toEqual(["/play/move/run", "/play/weapon/cooldown"]);
    expect(a.path).toBe("/play/move/run");
    expect(listed.log).toEqual(entered);
    const reversed = ctx();
    const b = game().start(reversed, ["/play/move/run", "/play/weapon/cooldown"]);
    expect([...b.leaves]).toEqual(["/play/move/run", "/play/weapon/cooldown"]);
    expect(b.path).toBe("/play/move/run");
    expect(reversed.log).toEqual(entered);
  });

  test("a region no path names goes through its initial", () => {
    const m = game().start(ctx(), ["/play/weapon/cooldown"]);
    expect([...m.leaves]).toEqual(["/play/move/idle", "/play/weapon/cooldown"]);
  });

  test("below a path that names a parent, the entry goes through initial", () => {
    expect([...game().start(ctx(), ["/shop/sell"]).leaves]).toEqual(["/shop/sell/list"]);
    expect([...game().start(ctx(), ["/play"]).leaves]).toEqual([
      "/play/move/idle",
      "/play/weapon/ready",
    ]);
  });

  test("a path the machine lacks falls back to its closest parent", () => {
    const at = (path: string) => [...game().start(ctx(), [path] as never).leaves];
    expect(at("/shop/sell/gone")).toEqual(["/shop/sell/list"]);
    expect(at("/shop/gone/deeper")).toEqual(["/shop/buy"]);
    expect(at("/nowhere")).toEqual(["/menu"]);
    expect(at("nowhere")).toEqual(["/menu"]);
    expect(at("")).toEqual(["/menu"]);
  });

  test("of two paths that cannot be active together, the first wins", () => {
    expect([...game().start(ctx(), ["/shop/sell/confirm", "/menu"]).leaves]).toEqual([
      "/shop/sell/confirm",
    ]);
    expect([...game().start(ctx(), ["/menu", "/shop/sell/confirm"]).leaves]).toEqual(["/menu"]);
    expect([
      ...game().start(ctx(), ["/play/move/run", "/play/move/idle", "/play/weapon/cooldown"]).leaves,
    ]).toEqual(["/play/move/run", "/play/weapon/cooldown"]);
    expect([...game().start(ctx(), ["/shop/sell", "/shop/sell/confirm"]).leaves]).toEqual([
      "/shop/sell/confirm",
    ]);
    expect([...game().start(ctx(), ["/shop/gone", "/shop/sell/confirm"] as never).leaves]).toEqual([
      "/shop/sell/confirm",
    ]);
  });

  test("a timer of a state entered by path counts from zero", () => {
    const m = game().start(ctx(), ["/play/weapon/cooldown"]);
    m.update(0.5);
    expect(m.leaves[1]).toBe("/play/weapon/cooldown");
    m.update(0.5);
    expect(m.leaves[1]).toBe("/play/weapon/ready");
  });

  test("a start position leaves no remembered child, and a later stay does", () => {
    const dropped = game().start(ctx(), ["/menu", "/shop/sell"]);
    dropped.send({ type: "SHOP" });
    expect([...dropped.leaves]).toEqual(["/shop/buy"]);
    const stayed = game().start(ctx(), ["/shop/sell"]);
    stayed.send({ type: "BACK" });
    stayed.send({ type: "SHOP" });
    expect([...stayed.leaves]).toEqual(["/shop/sell/list"]);
  });

  test("the list belongs to one start, and leaves of another instance is a valid list", () => {
    const m = game();
    const first = m.start(ctx(), ["/shop/sell"]);
    expect([...m.start(ctx()).leaves]).toEqual(["/menu"]);
    const second = m.start(ctx(), first.leaves);
    expect([...second.leaves]).toEqual(["/shop/sell/list"]);
    expect(second.leaves).not.toBe(first.leaves);
  });

  test("the entry is an ordinary one", () => {
    const loading = ctx();
    const load = entry().start(loading, ["/load"]);
    expect(loading.log).toEqual(["task"]);
    load.stop();
    expect(loading.log).toEqual(["task", "cleanup"]);

    const timed = entry().start(ctx(), ["/timed"]);
    timed.update(1);
    expect(timed.path).toBe("/timed");
    timed.update(1);
    expect(timed.path).toBe("/idle");

    expect(entry().start({ ...ctx(), flag: true }, ["/gate"]).path).toBe("/idle");
    expect(entry().start({ ...ctx(), flag: false }, ["/gate"]).path).toBe("/gate");

    expect(entry().start(ctx(), ["/hop"]).path).toBe("/idle");

    const heated = defineMachine<Ctx, Ev>()({
      privateCtx: () => ({ heat: 5 }),
      initial: "/a",
      states: {
        a: {},
        b: {
          enter: (ctx) => {
            ctx.log.push(`heat ${ctx.heat}`);
          },
        },
      },
    });
    const warm = ctx();
    heated.start(warm, ["/b"]);
    expect(warm.log).toEqual(["heat 5"]);
  });
});

describe("start position types", () => {
  test("start takes a context alone, a list of the machine's paths, or leaves", () => {
    const m = game();
    const c = ctx();
    const other = m.start(c);
    const plain: (ctx: Ctx) => unknown = m.start;
    expect(plain).toBe(m.start);
    expect([...m.start(c, ["/play/move/run", "/shop"]).leaves]).toEqual([
      "/play/move/run",
      "/play/weapon/ready",
    ]);
    expect([...m.start(c, other.leaves).leaves]).toEqual(["/menu"]);
    expect([...m.start(c, [...other.leaves]).leaves]).toEqual(["/menu"]);
  });

  test("a path the machine lacks, a plain string list and a lone path are rejected", () => {
    const m = game();
    const c = ctx();
    const saved: string[] = [];
    // Never called: only the compiler reads it.
    const rejected = () => {
      // @ts-expect-error not one of the machine's paths
      m.start(c, ["/nowhere"]);
      // @ts-expect-error a string list may hold a path the machine lacks
      m.start(c, saved);
      // @ts-expect-error a list of paths, not one path
      m.start(c, "/menu");
    };
    expect(rejected).toBeFunction();
  });

  test("the list is typed as a read-only list of the paths the instance reports", () => {
    const m = game();
    const exact: Equal<
      Parameters<typeof m.start>[1],
      readonly NonNullable<ReturnType<typeof m.start>["path"]>[] | undefined
    > = true;
    expect(exact).toBe(true);
  });

  test("a machine held with plain string paths takes any list of strings", () => {
    const resume = (machine: Machine<Ctx, Ev>, saved: string[]) => [
      ...machine.start(ctx(), saved).leaves,
    ];
    expect(resume(game() as never, ["/shop/sell"])).toEqual(["/shop/sell/list"]);
  });
});

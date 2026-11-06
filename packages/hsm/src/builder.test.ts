import { describe, expect, test } from "bun:test";
import { buildMachine } from "./builder";

type LampEvent = { type: "TOGGLE" } | { type: "DIM" };

interface Hero {
  health: number;
}

type HitEvent = { type: "HIT"; damage: number };

interface Log {
  log: string[];
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

function lamp() {
  const m = buildMachine<object, LampEvent>()({
    initial: "/off",
    states: {
      off: {},
      on: { initial: "/on/bright", states: { bright: {}, dim: {} } },
    },
  });
  m.state("/off").on("TOGGLE").to("/on");
  m.state("/on").on("TOGGLE").to("/off");
  m.state("/on/bright").on("DIM").to("/on/dim");
  m.state("/on/dim").on("DIM").to("/on/bright");
  return m.build();
}

describe("statements", () => {
  test("on(...).to(...) statements move the machine as on rules do", () => {
    const light = lamp().start({});
    expect(light.path).toBe("/off");
    light.send({ type: "TOGGLE" });
    expect(light.path).toBe("/on/bright");
    light.send({ type: "DIM" });
    expect(light.path).toBe("/on/dim");
    light.send({ type: "TOGGLE" });
    expect(light.path).toBe("/off");
  });

  test("two on calls for one event are tried in call order", () => {
    function hero(fatalFirst: boolean) {
      const m = buildMachine<Hero, HitEvent>()({
        initial: "/alive",
        states: { alive: {}, dead: {} },
      });
      const alive = m.state("/alive");
      const fatal = () =>
        alive
          .on("HIT")
          .when((ctx, event) => event.damage >= ctx.health)
          .to("/dead");
      const damage = () =>
        alive.on("HIT").run((ctx, event) => {
          ctx.health -= event.damage;
        });
      if (fatalFirst) {
        fatal();
        damage();
      } else {
        damage();
        fatal();
      }
      return m.build();
    }

    const first = hero(true).start({ health: 3 });
    first.send({ type: "HIT", damage: 1 });
    expect(first.path).toBe("/alive");
    expect(first.ctx.health).toBe(2);
    first.send({ type: "HIT", damage: 2 });
    expect(first.path).toBe("/dead");

    const swapped = hero(false).start({ health: 3 });
    swapped.send({ type: "HIT", damage: 1 });
    swapped.send({ type: "HIT", damage: 2 });
    expect(swapped.path).toBe("/alive");
    expect(swapped.ctx.health).toBe(0);
  });

  test("ignore() takes the event before a parent's rule, and can() counts it", () => {
    const m = buildMachine<Log, { type: "PAUSE" }>()({
      initial: "/game",
      states: {
        game: { initial: "/game/menu", states: { menu: {}, play: {} } },
        paused: {},
      },
    });
    m.state("/game")
      .on("PAUSE")
      .to("/paused")
      .run((ctx) => {
        ctx.log.push("paused");
      });
    m.state("/game/menu").on("PAUSE").ignore();
    const machine = m.build();

    const menu = machine.start({ log: [] });
    expect(menu.can({ type: "PAUSE" })).toBe(true);
    menu.send({ type: "PAUSE" });
    expect(menu.path).toBe("/game/menu");
    expect(menu.ctx.log).toEqual([]);

    const play = machine.start({ log: [] }, ["/game/play"]);
    play.send({ type: "PAUSE" });
    expect(play.path).toBe("/paused");
    expect(play.ctx.log).toEqual(["paused"]);
  });

  test("after(...).to(...) moves once its delay has passed and not before", () => {
    const m = buildMachine<object, { type: "GO" }>()({
      initial: "/a",
      states: { a: {}, b: {} },
    });
    m.state("/a").after(0.1).to("/b");
    const timer = m.build().start({});
    timer.update(0.05);
    expect(timer.path).toBe("/a");
    timer.update(0.05);
    expect(timer.path).toBe("/b");
  });

  test("an after delay function reads the context on entry", () => {
    const m = buildMachine<{ wait: number }, { type: "GO" }>()({
      initial: "/a",
      states: { a: {}, b: {} },
    });
    m.state("/a")
      .after((ctx) => ctx.wait)
      .to("/b");
    const timer = m.build().start({ wait: 0.5 });
    timer.update(0.25);
    expect(timer.path).toBe("/a");
    timer.update(0.25);
    expect(timer.path).toBe("/b");
  });

  test("after(...).run(...) runs without moving", () => {
    const m = buildMachine<Log, { type: "GO" }>()({
      initial: "/a",
      states: { a: {}, b: {} },
    });
    m.state("/a")
      .after(1)
      .run((ctx) => {
        ctx.log.push("ran");
      });
    const timer = m.build().start({ log: [] });
    timer.update(1);
    expect(timer.path).toBe("/a");
    expect(timer.ctx.log).toEqual(["ran"]);
  });

  test("after(...).when(...).to(...) waits until its when passes", () => {
    const m = buildMachine<{ ready: boolean }, { type: "GO" }>()({
      initial: "/a",
      states: { a: {}, b: {} },
    });
    m.state("/a")
      .after(0.3)
      .when((ctx) => ctx.ready)
      .to("/b");
    const timer = m.build().start({ ready: false });
    timer.update(0.5);
    expect(timer.path).toBe("/a");
    timer.ctx.ready = true;
    timer.update(0.1);
    expect(timer.path).toBe("/b");
  });

  test("every(...).run(...) runs once per delay", () => {
    const m = buildMachine<Log, { type: "GO" }>()({
      initial: "/a",
      states: { a: {} },
    });
    m.state("/a")
      .every(0.5)
      .run((ctx) => {
        ctx.log.push("tick");
      });
    const ticker = m.build().start({ log: [] });
    ticker.update(0.5);
    ticker.update(0.5);
    expect(ticker.ctx.log).toEqual(["tick", "tick"]);
  });

  test("always() rules are tried in call order after the move that entered the state", () => {
    const m = buildMachine<Hero, { type: "HIT" }>()({
      initial: "/idle",
      states: { idle: {}, hurt: {}, dead: {}, fine: {} },
    });
    m.state("/idle").on("HIT").to("/hurt");
    const hurt = m.state("/hurt");
    hurt.enter((ctx) => {
      ctx.health -= 2;
    });
    hurt
      .always()
      .when((ctx) => ctx.health <= 0)
      .to("/dead");
    hurt.always().to("/fine");
    const machine = m.build();

    const weak = machine.start({ health: 2 });
    weak.send({ type: "HIT" });
    expect(weak.path).toBe("/dead");

    const strong = machine.start({ health: 3 });
    strong.send({ type: "HIT" });
    expect(strong.path).toBe("/fine");
  });

  test("enter, exit, task, unhandled, update and tags behave as their config slots", () => {
    type Ev = { type: "DONE" } | { type: "ODD" };
    const finishes: ((event: Ev) => void)[] = [];
    const m = buildMachine<Log, Ev, "busy">()({
      initial: "/work",
      states: { work: {}, rest: {}, end: {} },
    });
    const work = m.state("/work");
    work.enter((ctx) => {
      ctx.log.push("enter work");
    });
    work.exit((ctx) => {
      ctx.log.push("exit work");
    });
    work.task((ctx, finish) => {
      finishes.push(finish);
      return () => {
        ctx.log.push("cleanup");
      };
    });
    work.unhandled((ctx, event) => {
      ctx.log.push(`unhandled ${event.type}`);
    });
    work.tags("busy");
    work.on("DONE").to("/rest");
    m.state("/rest").update((_ctx, dt) => (dt > 1 ? "/end" : undefined));

    const worker = m.build().start({ log: [] });
    expect(worker.hasTag("busy")).toBe(true);
    worker.send({ type: "ODD" });
    (finishes[0] as (event: Ev) => void)({ type: "DONE" });
    expect(worker.path).toBe("/rest");
    expect(worker.hasTag("busy")).toBe(false);
    expect(worker.ctx.log).toEqual(["enter work", "unhandled ODD", "exit work", "cleanup"]);
    worker.update(0.5);
    expect(worker.path).toBe("/rest");
    worker.update(2);
    expect(worker.path).toBe("/end");
  });

  test("a parallel skeleton state moves every region, and m.root takes events anywhere", () => {
    const m = buildMachine<object, { type: "START_FIRE" } | { type: "DIE" }>()({
      initial: "/alive",
      states: {
        alive: {
          type: "parallel",
          states: {
            gun: { initial: "/alive/gun/idle", states: { idle: {}, firing: {} } },
            siren: { initial: "/alive/siren/off", states: { off: {}, on: {} } },
          },
        },
        dead: {},
      },
    });
    m.state("/alive/gun/idle").on("START_FIRE").to("/alive/gun/firing");
    m.state("/alive/siren/off").on("START_FIRE").to("/alive/siren/on");
    m.root.on("DIE").to("/dead");
    const machine = m.build();

    const tank = machine.start({});
    expect([...tank.leaves]).toEqual(["/alive/gun/idle", "/alive/siren/off"]);
    tank.send({ type: "START_FIRE" });
    expect([...tank.leaves]).toEqual(["/alive/gun/firing", "/alive/siren/on"]);
    tank.send({ type: "DIE" });
    expect(tank.path).toBe("/dead");

    const fresh = machine.start({});
    fresh.send({ type: "DIE" });
    expect(fresh.path).toBe("/dead");
  });

  test("privateCtx: hooks see the private fields, and start takes the public context alone", () => {
    interface Gun {
      readonly rate: number;
    }
    const m = buildMachine<Gun, { type: "FIRE" }>()({
      privateCtx: (): { heat: number } => ({ heat: 0 }),
      initial: "/ready",
      states: { ready: {} },
    });
    m.state("/ready")
      .on("FIRE")
      .run((ctx) => {
        ctx.heat += ctx.rate;
      });
    const gun = m.build().start({ rate: 2 });
    const publicCtx: Equal<typeof gun.ctx, Gun> = true;
    expect(publicCtx).toBe(true);
    gun.send({ type: "FIRE" });
    gun.send({ type: "FIRE" });
    expect((gun.ctx as Gun & { heat: number }).heat).toBe(4);
  });

  test("a key makes a second build return the same Machine, and live instances take the new rules", () => {
    function door(target: "/open" | "/locked") {
      const m = buildMachine<object, { type: "PUSH" }>("builder-hot-reload")({
        initial: "/closed",
        states: { closed: {}, open: {}, locked: {} },
      });
      m.state("/closed").on("PUSH").to(target);
      return m.build();
    }
    const first = door("/open");
    const live = first.start({});
    const second = door("/locked");
    expect(second as unknown).toBe(first);
    live.send({ type: "PUSH" });
    expect(live.path).toBe("/locked");
  });
});

describe("build() fills the skeleton in place", () => {
  test("rules and timers are written onto the skeleton's own state objects in list form", () => {
    const skeleton = {
      initial: "/off" as const,
      states: { off: {}, on: {}, x: {} },
    };
    const m = buildMachine<object, LampEvent>()(skeleton);
    m.state("/off").on("TOGGLE").to("/on");
    m.state("/on").after(0.5).to("/x");
    m.build();
    expect(skeleton.states.off).toEqual({ on: { TOGGLE: [{ to: "/on" }] } });
    expect(skeleton.states.on).toEqual({ after: [{ delay: 0.5, to: "/x" }] });
    expect(skeleton.states.x).toEqual({});
  });
});

describe("build() and statement errors", () => {
  function skeleton() {
    return buildMachine<Log, { type: "GO" }>()({
      initial: "/a",
      states: { a: {}, b: {} },
    });
  }

  test("an on rule with no ending throws at build, naming the state and the event", () => {
    const m = skeleton();
    m.state("/a")
      .on("GO")
      .when(() => true);
    expect(thrownMessage(() => m.build())).toBe(
      'hsm: state "/a" has an on("GO") rule with no to, run or ignore',
    );
  });

  test("the first unfinished entry in call order is the one named", () => {
    const m = skeleton();
    m.state("/b").on("GO");
    m.root.always();
    expect(thrownMessage(() => m.build())).toBe(
      'hsm: state "/b" has an on("GO") rule with no to, run or ignore',
    );
  });

  test("an always rule with no to throws at build", () => {
    const m = skeleton();
    m.root.always().when(() => true);
    expect(thrownMessage(() => m.build())).toBe(
      'hsm: state "(root)" has an always() rule with no to',
    );
  });

  test("an after timer with neither to nor run throws at build", () => {
    const m = skeleton();
    m.state("/a")
      .after(1)
      .when(() => true);
    expect(thrownMessage(() => m.build())).toBe(
      'hsm: state "/a" has an after() timer with no to and no run',
    );
  });

  test("an every entry with no run throws at build", () => {
    const m = skeleton();
    m.state("/b").every(1);
    expect(thrownMessage(() => m.build())).toBe('hsm: state "/b" has an every() entry with no run');
  });

  test("a second enter, exit, update, task or unhandled on one state throws", () => {
    const m = skeleton();
    const a = m.state("/a");
    const none = () => {};
    a.enter(none);
    expect(thrownMessage(() => a.enter(none))).toBe('hsm: state "/a" has a second enter');
    a.exit(none);
    expect(thrownMessage(() => a.exit(none))).toBe('hsm: state "/a" has a second exit');
    a.update(() => undefined);
    expect(thrownMessage(() => a.update(() => undefined))).toBe(
      'hsm: state "/a" has a second update',
    );
    a.task(none);
    expect(thrownMessage(() => a.task(none))).toBe('hsm: state "/a" has a second task');
    a.unhandled(none);
    expect(thrownMessage(() => a.unhandled(none))).toBe('hsm: state "/a" has a second unhandled');
    expect(thrownMessage(() => m.root.enter(none))).toBe("");
    expect(thrownMessage(() => m.root.enter(none))).toBe('hsm: state "(root)" has a second enter');
  });

  test("a path the skeleton lacks throws, naming it", () => {
    const m = skeleton();
    expect(thrownMessage(() => m.state("/nowhere" as "/a"))).toBe(
      'hsm: the machine has no state "/nowhere"',
    );
  });

  test("a statement after build() throws, naming the state, and so does a second build()", () => {
    const m = skeleton();
    const a = m.state("/a");
    const rule = a.on("GO");
    rule.to("/b");
    m.build();
    expect(thrownMessage(() => a.on("GO"))).toBe('hsm: state "/a" gets a statement after build()');
    expect(thrownMessage(() => m.state("/b").enter(() => {}))).toBe(
      'hsm: state "/b" gets a statement after build()',
    );
    expect(thrownMessage(() => m.root.tags())).toBe(
      'hsm: state "(root)" gets a statement after build()',
    );
    expect(thrownMessage(() => rule.run(() => {}))).toBe(
      'hsm: state "/a" gets a statement after build()',
    );
    expect(thrownMessage(() => m.build())).toBe("hsm: build() was already called");
  });
});

describe("types", () => {
  test("paths, events and the skeleton's structure are checked at compile time", () => {
    // Never called: the statements hold what the types reject, and only the compiler reads them.
    const rejected = () => {
      const m = buildMachine<Hero, HitEvent | { type: "GO" }>()({
        initial: "/a",
        states: { a: {}, b: { initial: "/b/c", states: { c: {} } } },
      });
      const paths: Equal<Parameters<typeof m.state>[0], "/a" | "/b" | "/b/c"> = true;
      // @ts-expect-error an unknown path in state
      m.state("/nowhere");
      // @ts-expect-error an unknown path in to
      m.state("/a").on("GO").to("/nowhere");
      // @ts-expect-error an unknown path in an after timer's to
      m.state("/a").after(1).to("/b/nowhere");
      // @ts-expect-error an unknown path in an always rule's to
      m.root.always().to("/c");
      // @ts-expect-error an unknown path returned by update
      m.state("/a").update(() => "/nowhere");
      // @ts-expect-error an unknown event in on
      m.state("/a").on("NOPE");
      m.state("/a")
        .on("GO")
        .when((ctx) => {
          // @ts-expect-error a when reads ctx and cannot assign to it
          ctx.health = 0;
          return true;
        })
        .to("/b");
      return paths;
    };
    expect(typeof rejected).toBe("function");
  });

  test("a skeleton holds structure only and keeps the structure checks", () => {
    const rejected = () => {
      buildMachine<object, { type: "GO" }>()({
        initial: "/a",
        // @ts-expect-error a skeleton state holds no on
        states: { a: { on: { GO: "/a" } } },
      });
      buildMachine<object, { type: "GO" }>()({
        initial: "/a",
        // @ts-expect-error a skeleton state holds no enter
        states: { a: { enter: () => {} } },
      });
      buildMachine<object, { type: "GO" }>()({
        initial: "/a",
        // @ts-expect-error a skeleton state holds no after
        states: { a: { after: { 1: "/a" } } },
      });
      buildMachine<object, { type: "GO" }>()({
        // @ts-expect-error the skeleton root holds no on
        on: { GO: "/a" },
        initial: "/a",
        states: { a: {} },
      });
      buildMachine<object, { type: "GO" }>()({
        initial: "/a",
        // @ts-expect-error an initial that is not a child
        states: { a: { initial: "/b", states: { c: {} } }, b: {} },
      });
      buildMachine<object, { type: "GO" }>()({
        initial: "/p",
        // @ts-expect-error a parallel state takes no initial
        states: { p: { type: "parallel", initial: "/p/x", states: { x: {}, y: {} } } },
      });
      buildMachine<object, { type: "GO" }>()({
        initial: "/a",
        // @ts-expect-error a restoreDepth deeper than the tree
        states: { a: { initial: "/a/b", restoreDepth: 2, states: { b: {} } } },
      });
    };
    expect(typeof rejected).toBe("function");
  });

  test("on narrows the event, and a when reads the machine's paths", () => {
    const m = buildMachine<Hero, HitEvent | { type: "GO" }>()({
      initial: "/off",
      states: { off: {}, on: {} },
    });
    m.state("/on")
      .on("HIT")
      .when((ctx, event, machine) => machine.matches("/on") && event.damage < ctx.health)
      .run((ctx, event) => {
        ctx.health -= event.damage;
      });
    m.state("/off").on("GO").to("/on");
    const hero = m.build().start({ health: 5 }, ["/on"]);
    hero.send({ type: "HIT", damage: 2 });
    expect(hero.ctx.health).toBe(3);
  });
});

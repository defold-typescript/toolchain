import { defineMachine } from "../index";

type Ev =
  | { type: "GO" }
  | { type: "BACK" }
  | { type: "HIT" }
  | { type: "PING" }
  | { type: "NOPE" }
  | { type: "TO2" }
  | { type: "UP" }
  | { type: "AGAIN" }
  | { type: "LOADED" }
  | { type: "10" }
  | { type: "STEP"; n: number };

interface Ctx {
  log: string[];
  flag: boolean;
  finishes: ((event: Ev) => void)[];
}

function newCtx(log: string[], flag = false): Ctx {
  return { log, flag, finishes: [] };
}

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

function finishHeld(ctx: Ctx, index: number, event: Ev): void {
  const finish = ctx.finishes[index];
  if (finish === undefined) {
    ctx.log.push(`no finish ${index}`);
    return;
  }
  finish(event);
}

// Lua cannot concatenate nil, so a stopped machine's path is written as a fixed token.
function shown(path: string | undefined): string {
  return path === undefined ? "(stopped)" : path;
}

function recordError(log: string[], run: () => unknown): void {
  try {
    run();
    log.push("ok");
  } catch (error) {
    log.push(`error: ${String(error)}`);
  }
}

function start(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "/a",
    states: {
      a: {
        ...logged("a"),
        initial: "/a/b",
        states: { b: { ...logged("a.b"), initial: "/a/b/c", states: { c: logged("a.b.c") } } },
        on: { GO: "/ab" },
      },
      ab: logged("ab"),
    },
  });
  const m = def.start(newCtx(log));
  log.push(`path=${shown(m.path)}`);
  log.push(`matches(/a)=${m.matches("/a")}`);
  log.push(`matches(/a/b)=${m.matches("/a/b")}`);
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)}`);
  log.push(`matches(/ab)=${m.matches("/ab")}`);
  log.push(`matches(/a)=${m.matches("/a")}`);
  return log;
}

function numericNames(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "/0",
    states: {
      "0": { ...logged("0"), on: { "10": "/1" } },
      "1": { ...logged("1"), initial: "/1/0", states: { "0": logged("1.0") } },
    },
  });
  const m = def.start(newCtx(log));
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "10" });
  log.push(`path=${shown(m.path)}`);
  log.push(`matches(/1)=${m.matches("/1")}`);
  log.push(`matches(/0)=${m.matches("/0")}`);
  return log;
}

function guardsAndBubbling(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "/p",
    states: {
      p: {
        ...logged("p"),
        initial: "/p/c",
        states: {
          c: {
            ...logged("p.c"),
            on: {
              HIT: [
                {
                  when: (ctx) => {
                    ctx.log.push("when 1");
                    return false;
                  },
                  to: "/p/c",
                },
                {
                  when: (ctx) => {
                    ctx.log.push("when 2");
                    return ctx.flag;
                  },
                  to: "/p/d",
                },
                {
                  when: (ctx) => {
                    ctx.log.push("when 3");
                    return false;
                  },
                  to: "/p/c",
                },
              ],
            },
          },
          d: logged("p.d"),
        },
        on: { HIT: "/z" },
      },
      z: logged("z"),
    },
  });
  const first = def.start(newCtx(log, true));
  first.send({ type: "HIT" });
  log.push(`path=${shown(first.path)}`);
  log.push("second instance");
  const second = def.start(newCtx(log, false));
  second.send({ type: "HIT" });
  log.push(`path=${shown(second.path)}`);
  second.send({ type: "NOPE" });
  log.push(`path=${shown(second.path)}`);
  return log;
}

function targetlessAndReentry(): string[] {
  const log: string[] = [];
  const self = defineMachine<Ctx, Ev>()({
    initial: "/s",
    on: { HIT: "/s" },
    states: {
      s: {
        ...logged("s"),
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
  const m = self.start(newCtx(log));
  m.send({ type: "PING" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "HIT" });
  log.push(`path=${shown(m.path)}`);

  const build = (to: "/p" | "/p/c2") =>
    defineMachine<Ctx, Ev>()({
      initial: "/p",
      states: {
        p: {
          ...logged("p"),
          initial: "/p/c1",
          states: { c1: logged("p.c1"), c2: logged("p.c2") },
          on: { TO2: { to } },
        },
      },
    });
  const keep = build("/p/c2").start(newCtx(log));
  keep.send({ type: "TO2" });
  log.push(`path=${shown(keep.path)}`);
  const restarted = build("/p").start(newCtx(log));
  restarted.send({ type: "TO2" });
  log.push(`path=${shown(restarted.path)}`);
  return log;
}

function queuedSends(): string[] {
  const log: string[] = [];
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
        states: {
          b1: {
            enter: (ctx, m) => {
              ctx.log.push("enter b.b1");
              m.send({ type: "STEP", n: 3 });
            },
          },
        },
      },
    },
  });
  const m = def.start(newCtx(log));
  m.send({ type: "GO" });
  m.send({ type: "STEP", n: 4 });
  log.push(`path=${shown(m.path)}`);
  return log;
}

function updateAndAfter(): string[] {
  const log: string[] = [];
  const updating = defineMachine<Ctx, Ev>()({
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
            ...logged("p.c"),
            update: (ctx, dt) => {
              ctx.log.push(`update p.c ${dt}`);
              return ctx.flag ? "/p/c2" : undefined;
            },
          },
          c2: logged("p.c2"),
        },
      },
    },
  });
  const ctx = newCtx(log);
  const u = updating.start(ctx);
  u.update(0.25);
  ctx.flag = true;
  u.update(0.5);
  log.push(`path=${shown(u.path)}`);

  const timed = defineMachine<Ctx, Ev>()({
    initial: "/a",
    states: {
      a: { ...logged("a"), after: { 1: "/x", 0.5: "/y" }, on: { GO: "/b" } },
      b: { ...logged("b"), on: { BACK: "/a" } },
      x: logged("x"),
      y: logged("y"),
    },
  });
  const t = timed.start(newCtx(log));
  t.update(0.25);
  log.push(`path=${shown(t.path)}`);
  t.send({ type: "GO" });
  t.send({ type: "BACK" });
  t.update(0.25);
  log.push(`path=${shown(t.path)}`);
  t.update(0.25);
  log.push(`path=${shown(t.path)}`);
  log.push("second instance");
  const both = timed.start(newCtx(log));
  both.update(1);
  log.push(`path=${shown(both.path)}`);
  return log;
}

function hookTickTimers(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "/airborne",
    states: {
      airborne: {
        ...logged("airborne"),
        initial: "/airborne/rising",
        after: { 0.75: "/timeout" },
        states: {
          rising: {
            ...logged("airborne.rising"),
            update: (ctx) => (ctx.flag ? "/airborne/falling" : undefined),
          },
          falling: { ...logged("airborne.falling"), after: { 0.5: "/landed" } },
        },
      },
      timeout: logged("timeout"),
      landed: logged("landed"),
    },
  });
  const ctx = newCtx(log);
  const m = def.start(ctx);
  m.update(0.25);
  log.push(`path=${shown(m.path)}`);
  ctx.flag = true;
  m.update(0.25);
  log.push(`path=${shown(m.path)}`);
  m.update(0.25);
  log.push(`path=${shown(m.path)}`);
  return log;
}

function stop(): string[] {
  const log: string[] = [];
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
      a: { ...logged("a"), after: { 0.5: "/b" }, on: { GO: "/b" } },
      b: {
        enter: (ctx, m) => {
          ctx.log.push("enter b");
          m.send({ type: "PING" });
          m.stop();
        },
        exit: (ctx) => {
          ctx.log.push("exit b");
        },
        initial: "/b/b1",
        states: { b1: logged("b.b1") },
      },
    },
  });
  const m = def.start(newCtx(log));
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "GO" });
  m.update(10);
  m.stop();
  log.push(`path=${shown(m.path)}`);
  log.push(`matches(/a)=${m.matches("/a")}`);
  return log;
}

function task(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "/loading",
    states: {
      loading: {
        task: (ctx, finish) => {
          ctx.log.push("task loading");
          ctx.finishes.push(finish);
        },
        on: {
          PING: {
            run: (ctx) => {
              ctx.log.push("ping");
            },
          },
          LOADED: "/ready",
          AGAIN: "/loading",
          UP: "/idle",
        },
      },
      ready: logged("ready"),
      idle: { on: { BACK: "/loading" } },
    },
  });
  const ctx = newCtx(log);
  const m = def.start(ctx);
  m.send({ type: "AGAIN" });
  finishHeld(ctx, 0, { type: "LOADED" });
  log.push(`path=${shown(m.path)}`);
  finishHeld(ctx, 1, { type: "PING" });
  finishHeld(ctx, 1, { type: "PING" });
  finishHeld(ctx, 1, { type: "LOADED" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "UP" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "BACK" });
  m.send({ type: "UP" });
  finishHeld(ctx, 2, { type: "LOADED" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "BACK" });
  m.stop();
  finishHeld(ctx, 3, { type: "LOADED" });
  log.push(`path=${shown(m.path)}`);
  return log;
}

function namesAndUpdateTargets(): string[] {
  const log: string[] = [];
  const m = defineMachine<Ctx, Ev>()({
    initial: "/v1.2",
    states: {
      "v1.2": { ...logged("v1.2"), on: { GO: "/#x" } },
      "#x": {
        ...logged("#x"),
        // @ts-expect-error update names a state without the leading slash
        update: () => "patrol",
      },
    },
  }).start(newCtx(log));
  log.push(`path=${shown(m.path)}`);
  log.push(`matches(/v1.2)=${m.matches("/v1.2")}`);
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)}`);
  recordError(log, () => m.update(0.1));
  return log;
}

function definitionErrors(): string[] {
  const log: string[] = [];
  const define = defineMachine<Ctx, Ev>();
  recordError(log, () =>
    define({
      initial: "/attack",
      states: {
        attack: {
          initial: "/attack/recover",
          states: {
            recover: {
              on: {
                // @ts-expect-error GO targets a state the machine does not have
                GO: "/nope",
              },
            },
          },
        },
      },
    }),
  );
  recordError(log, () =>
    define({
      initial: "/outer",
      states: {
        outer: { initial: "/outer/inner", states: { inner: { states: { leaf: {} } } } },
      },
    }),
  );
  for (const initial of ["/outer/ghost", "leaf", "/leaf"]) {
    recordError(log, () =>
      define({
        initial: "/outer",
        states: {
          outer: {
            // @ts-expect-error a plain string is not one of the machine's paths
            initial,
            states: { leaf: {} },
          },
        },
      }),
    );
  }
  for (const target of ["patrol", "./patrol", "../patrol", "/"]) {
    recordError(log, () =>
      define({
        initial: "/idle",
        states: {
          idle: {
            on: {
              // @ts-expect-error a plain string is not one of the machine's paths
              GO: target,
            },
          },
          patrol: {},
        },
      }),
    );
  }
  recordError(log, () =>
    define({
      initial: "/idle",
      states: {
        idle: {
          after: {
            // @ts-expect-error the timer names a state without the leading slash
            1: "patrol",
          },
        },
        patrol: {},
      },
    }),
  );
  recordError(log, () => define({ initial: "/a", states: { a: {}, "": {} } }));
  recordError(log, () =>
    define({ initial: "/p", states: { p: { initial: "/p/c", states: { c: {}, "a/b": {} } } } }),
  );
  recordError(log, () =>
    define({ initial: "/a", states: { a: { after: { abc: "/a" } as never } } }),
  );
  recordError(log, () =>
    define({ initial: "/a", states: { a: { after: { "": "/a" } as never } } }),
  );
  recordError(log, () =>
    define({ initial: "/a", states: { a: { after: { "-1": "/a" } as never } } }),
  );
  return log;
}

function onMoveReports(): string[] {
  const log: string[] = [];
  const def = defineMachine<Ctx, Ev>()({
    initial: "/idle",
    states: {
      idle: { on: { GO: "/move" } },
      move: {
        initial: "/move/walk",
        states: {
          walk: { after: { 0.5: "/move/run" } },
          run: { update: (ctx) => (ctx.flag ? "/rest" : undefined) },
        },
      },
      rest: {},
    },
  });
  const ctx = newCtx(log);
  const m = def.start(ctx);
  m.onMove((from, to, cause, event) => {
    log.push(`${shown(from)} -> ${shown(to)} ${cause} ${event === undefined ? "-" : event.type}`);
  });
  const removeSecond = m.onMove((from, to) => {
    log.push(`second ${shown(from)} -> ${shown(to)}`);
  });
  m.send({ type: "GO" });
  m.update(0.5);
  removeSecond();
  ctx.flag = true;
  m.update(0.1);
  m.stop();
  return log;
}

function hotReload(): string[] {
  const log: string[] = [];
  const first = defineMachine<Ctx, Ev>("parity hot reload")({
    initial: "/idle",
    states: {
      idle: logged("idle"),
      move: { ...logged("move"), initial: "/move/walk", states: { walk: logged("move.walk") } },
    },
  });
  const m = first.start(newCtx(log));
  m.onMove((from, to, cause, event) => {
    log.push(`${shown(from)} -> ${shown(to)} ${cause} ${event === undefined ? "-" : event.type}`);
  });
  const second = defineMachine<Ctx, Ev>("parity hot reload")({
    initial: "/idle",
    states: {
      idle: { ...logged("idle"), on: { GO: "/move" } },
      move: { ...logged("move"), initial: "/move/walk", states: { walk: logged("move.walk") } },
    },
  });
  log.push(`same=${(second as unknown) === first}`);
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)}`);
  defineMachine<Ctx, Ev>("parity hot reload")({
    initial: "/idle",
    states: {
      idle: logged("idle"),
      move: { ...logged("move"), initial: "/move/run", states: { run: logged("move.run") } },
    },
  });
  log.push(`path=${shown(m.path)}`);
  m.update(0);
  log.push(`path=${shown(m.path)}`);
  return log;
}

function platformer(restoreDepth: 1 | 2) {
  return defineMachine<Ctx, Ev>()({
    initial: "/playing",
    states: {
      playing: {
        ...logged("playing"),
        restoreDepth,
        initial: "/playing/ground",
        on: { BACK: "/paused" },
        states: {
          ground: { ...logged("ground"), on: { GO: "/playing/air" } },
          air: {
            ...logged("air"),
            initial: "/playing/air/rise",
            states: {
              rise: { ...logged("rise"), on: { UP: "/playing/air/fall" } },
              fall: logged("fall"),
            },
          },
        },
      },
      paused: { ...logged("paused"), on: { AGAIN: "/playing", HIT: "/playing/ground" } },
    },
  });
}

function arena(restoreDepth: 1 | 2) {
  return defineMachine<Ctx, Ev>()({
    initial: "/game",
    states: {
      game: {
        restoreDepth,
        initial: "/game/alive",
        on: { BACK: "/menu" },
        states: {
          alive: {
            type: "parallel",
            states: {
              move: {
                initial: "/game/alive/move/walk",
                states: { walk: { on: { GO: "/game/alive/move/run" } }, run: {} },
              },
              weapon: {
                initial: "/game/alive/weapon/idle",
                states: { idle: { on: { UP: "/game/alive/weapon/fire" } }, fire: {} },
              },
            },
          },
          over: {},
        },
      },
      menu: { on: { AGAIN: "/game" } },
    },
  });
}

function restoreDepth(): string[] {
  const log: string[] = [];
  const def = platformer(1);
  const m = def.start(newCtx(log));
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "GO" });
  m.send({ type: "UP" });
  m.send({ type: "BACK" });
  log.push(`path=${shown(m.path)}`);
  const fresh = def.start(newCtx(log));
  log.push(`fresh=${shown(fresh.path)}`);
  m.send({ type: "AGAIN" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "BACK" });
  m.send({ type: "HIT" });
  log.push(`path=${shown(m.path)}`);
  const deep = platformer(2).start(newCtx(log));
  deep.send({ type: "GO" });
  deep.send({ type: "UP" });
  deep.send({ type: "BACK" });
  deep.send({ type: "AGAIN" });
  log.push(`deep=${shown(deep.path)}`);
  for (const depth of [2, 1] as const) {
    const game = arena(depth).start(newCtx(log));
    game.send({ type: "GO" });
    game.send({ type: "UP" });
    game.send({ type: "BACK" });
    game.send({ type: "AGAIN" });
    log.push(`leaves ${depth}=${game.leaves.join(",")}`);
  }
  return log;
}

function alwaysTransitions(): string[] {
  const log: string[] = [];
  const ctx = newCtx(log);
  const m = defineMachine<Ctx, Ev>()({
    initial: "/boot",
    on: { BACK: "/idle" },
    states: {
      boot: { ...logged("boot"), always: "/idle" },
      idle: { ...logged("idle"), on: { GO: "/route", HIT: "/r1", UP: "/a" } },
      route: {
        ...logged("route"),
        always: [{ to: "/x", when: (ctx) => ctx.flag }, { to: "/y" }],
      },
      x: logged("x"),
      y: logged("y"),
      r1: {
        enter: (ctx, m) => {
          ctx.log.push("enter r1");
          m.send({ type: "PING" });
        },
        always: "/r2",
        on: { PING: "/y" },
      },
      r2: { always: "/r3", on: { PING: "/y" } },
      r3: { on: { PING: "/x" } },
      a: { always: "/b" },
      b: { always: "/a" },
    },
  }).start(ctx);
  log.push(`path=${shown(m.path)}`);
  m.onMove((from, to, cause, event) => {
    log.push(`${shown(from)} -> ${shown(to)} ${cause} ${event === undefined ? "-" : event.type}`);
  });
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)}`);
  ctx.flag = true;
  m.send({ type: "BACK" });
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "BACK" });
  m.send({ type: "HIT" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "BACK" });
  recordError(log, () => m.send({ type: "UP" }));
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "BACK" });
  log.push(`path=${shown(m.path)}`);
  return log;
}

// A concatenation loop, not join, so the scenario reads the same in both runtimes.
function shownLeaves(leaves: readonly string[]): string {
  let text = "";
  for (let i = 0; i < leaves.length; i++) {
    text = i === 0 ? (leaves[i] as string) : `${text}, ${leaves[i] as string}`;
  }
  return text;
}

function parallelRegions(): string[] {
  const log: string[] = [];
  const ctx = newCtx(log);
  const m = defineMachine<Ctx, Ev>()({
    initial: "/alive",
    states: {
      alive: {
        ...logged("alive"),
        type: "parallel",
        on: { HIT: "/dead" },
        states: {
          move: {
            ...logged("move"),
            initial: "/alive/move/idle",
            states: {
              idle: { ...logged("idle"), on: { GO: "/alive/move/run" } },
              run: {
                ...logged("run"),
                update: (ctx) => (ctx.flag ? "/alive/move/idle" : undefined),
              },
            },
          },
          weapon: {
            ...logged("weapon"),
            initial: "/alive/weapon/ready",
            states: {
              ready: { ...logged("ready"), on: { GO: "/alive/weapon/cooldown" } },
              cooldown: { ...logged("cooldown"), after: { 0.5: "/alive/weapon/ready" } },
            },
          },
        },
      },
      dead: { ...logged("dead"), on: { BACK: "/alive" } },
    },
  }).start(ctx);
  log.push(`leaves=${shownLeaves(m.leaves)}`);
  m.onMove((from, to, cause, event) => {
    log.push(`${shown(from)} -> ${shown(to)} ${cause} ${event === undefined ? "-" : event.type}`);
  });
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)} leaves=${shownLeaves(m.leaves)}`);
  log.push(`matches(/alive/weapon)=${m.matches("/alive/weapon")}`);
  ctx.flag = true;
  m.update(0.6);
  log.push(`leaves=${shownLeaves(m.leaves)}`);
  m.send({ type: "HIT" });
  log.push(`leaves=${shownLeaves(m.leaves)}`);
  m.send({ type: "BACK" });
  m.stop();
  log.push(`path=${shown(m.path)} leaves=${shownLeaves(m.leaves)}`);
  return log;
}

// The trace crosses the WASM bridge as ASCII, so each non-ASCII path is logged by alias.
const UNICODE_PATH_ALIASES: Record<string, string> = {
  "/r/\u{E000}/idle": "/r/U+E000/idle",
  "/r/\u{E000}/done": "/r/U+E000/done",
  "/r/\u{10000}/idle": "/r/U+10000/idle",
  "/r/\u{10000}/done": "/r/U+10000/done",
};

function aliased(path: string | undefined): string {
  if (path === undefined) {
    return "(stopped)";
  }
  const alias = UNICODE_PATH_ALIASES[path];
  return alias === undefined ? "?" : alias;
}

function aliasedLeaves(leaves: readonly string[]): string {
  const aliases: string[] = [];
  for (const leaf of leaves) {
    aliases.push(aliased(leaf));
  }
  return shownLeaves(aliases);
}

function unicodeRegionOrder(): string[] {
  const log: string[] = [];
  const ctx = newCtx(log);
  const m = defineMachine<Ctx, Ev>()({
    initial: "/r",
    states: {
      r: {
        ...logged("r"),
        type: "parallel",
        states: {
          "\u{10000}": {
            ...logged("U+10000"),
            initial: "/r/\u{10000}/idle",
            states: {
              idle: { ...logged("U+10000.idle"), on: { GO: "/r/\u{10000}/done" } },
              done: logged("U+10000.done"),
            },
          },
          "\u{E000}": {
            ...logged("U+E000"),
            initial: "/r/\u{E000}/idle",
            states: {
              idle: { ...logged("U+E000.idle"), on: { GO: "/r/\u{E000}/done" } },
              done: logged("U+E000.done"),
            },
          },
        },
      },
    },
  }).start(ctx);
  log.push(`path=${aliased(m.path)} leaves=${aliasedLeaves(m.leaves)}`);
  m.onMove((from, to, cause, event) => {
    log.push(
      `${aliased(from)} -> ${aliased(to)} ${cause} ${event === undefined ? "-" : event.type}`,
    );
  });
  m.send({ type: "GO" });
  log.push(`path=${aliased(m.path)} leaves=${aliasedLeaves(m.leaves)}`);
  m.stop();
  return log;
}

export const scenarios: { name: string; run: () => string[] }[] = [
  { name: "start", run: () => start() },
  { name: "numeric names", run: () => numericNames() },
  { name: "guards and bubbling", run: () => guardsAndBubbling() },
  { name: "targetless and reentry", run: () => targetlessAndReentry() },
  { name: "queued sends", run: () => queuedSends() },
  { name: "update and after", run: () => updateAndAfter() },
  { name: "hook tick timers", run: () => hookTickTimers() },
  { name: "stop", run: () => stop() },
  { name: "task", run: () => task() },
  { name: "names and update targets", run: () => namesAndUpdateTargets() },
  { name: "definition errors", run: () => definitionErrors() },
  { name: "onMove reports every cause", run: () => onMoveReports() },
  { name: "hot reload", run: () => hotReload() },
  { name: "restore depth", run: () => restoreDepth() },
  { name: "always transitions", run: () => alwaysTransitions() },
  { name: "parallel regions", run: () => parallelRegions() },
  { name: "unicode region order", run: () => unicodeRegionOrder() },
];

export function runScenario(name: string): string {
  for (const scenario of scenarios) {
    if (scenario.name === name) {
      return scenario.run().join("\n");
    }
  }
  return `unknown scenario ${name}`;
}

import { defineMachine, type UnhandledListener, waitGroup } from "../index";

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

interface PrivateFields {
  count: number;
  hits: number[];
}

interface ReloadedFields extends PrivateFields {
  armor: number;
}

// An instance's type hides the private fields, so the scenario reads them through this.
function privateOf(ctx: Ctx): PrivateFields {
  return ctx as unknown as PrivateFields;
}

function privateCtx(): string[] {
  const log: string[] = [];
  const machine = defineMachine<Ctx, Ev>("parity private ctx")({
    privateCtx: (ctx: Ctx): PrivateFields => ({ count: ctx.flag ? 10 : 0, hits: [] }),
    enter: (ctx) => {
      ctx.log.push(`enter root count=${ctx.count}`);
    },
    initial: "/idle",
    states: {
      idle: {
        on: {
          HIT: {
            run: (ctx) => {
              ctx.count += 1;
              ctx.hits.push(ctx.count);
            },
          },
        },
      },
    },
  });
  const first = machine.start(newCtx(log, true));
  const second = machine.start(newCtx(log));
  first.send({ type: "HIT" });
  first.send({ type: "HIT" });
  log.push(`first hits=${privateOf(first.ctx).hits.length} count=${privateOf(first.ctx).count}`);
  log.push(`second hits=${privateOf(second.ctx).hits.length} count=${privateOf(second.ctx).count}`);
  first.stop();
  const again = machine.start(first.ctx);
  log.push(`restarted hits=${privateOf(again.ctx).hits.length} flag=${again.ctx.flag}`);
  again.send({ type: "HIT" });
  defineMachine<Ctx, Ev>("parity private ctx")({
    privateCtx: (ctx: Ctx): ReloadedFields => ({ count: 0, hits: [], armor: ctx.flag ? 7 : 5 }),
    initial: "/idle",
    states: { idle: {} },
  });
  again.update(0);
  const reloaded = again.ctx as unknown as ReloadedFields;
  log.push(`reloaded armor=${reloaded.armor} hits=${reloaded.hits.length} count=${reloaded.count}`);
  return log;
}

function afterDelayFromCtx(): string[] {
  const log: string[] = [];
  const defineTimed = () =>
    defineMachine<Ctx, Ev>("parity after delay")({
      initial: "/a",
      states: {
        a: {
          ...logged("a"),
          after: [
            { delay: (ctx: Ctx) => (ctx.flag ? 0.5 : 2), to: "/x" },
            { delay: 1, to: "/y" },
          ],
          on: { GO: "/b" },
        },
        b: { ...logged("b"), on: { BACK: "/a" } },
        x: logged("x"),
        y: logged("y"),
      },
    });
  const timed = defineTimed();
  const fast = timed.start(newCtx(log, true));
  fast.update(0.5);
  log.push(`fast=${shown(fast.path)}`);

  const slowCtx = newCtx(log);
  const slow = timed.start(slowCtx);
  slowCtx.flag = true;
  slow.update(0.75);
  log.push(`slow=${shown(slow.path)}`);
  slow.send({ type: "GO" });
  slow.send({ type: "BACK" });
  slow.update(0.5);
  log.push(`slow=${shown(slow.path)}`);

  const keptCtx = newCtx(log);
  const kept = timed.start(keptCtx);
  kept.update(0.75);
  keptCtx.flag = true;
  defineTimed();
  kept.update(0.25);
  log.push(`kept=${shown(kept.path)}`);

  recordError(log, () =>
    defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { after: [{ delay: () => -1, to: "/a" }] } },
    }).start(newCtx(log)),
  );
  recordError(log, () =>
    defineMachine<Ctx, Ev>()({
      initial: "/a",
      states: { a: { after: [{ delay: -1, to: "/a" }] } },
    }),
  );
  return log;
}

function guardView(): string[] {
  const log: string[] = [];
  const m = defineMachine<Ctx, Ev>()({
    initial: "/alive",
    states: {
      alive: {
        type: "parallel",
        states: {
          move: {
            initial: "/alive/move/idle",
            states: {
              idle: {
                ...logged("idle"),
                on: {
                  GO: {
                    to: "/alive/move/jump",
                    when: (_ctx, _event, machine) => machine.matches("/alive/posture/standing"),
                  },
                  PING: "/alive/move/jump",
                },
              },
              jump: { ...logged("jump"), on: { BACK: "/alive/move/idle" } },
            },
          },
          posture: {
            initial: "/alive/posture/standing",
            states: {
              standing: { ...logged("standing"), on: { HIT: "/alive/posture/crouching" } },
              crouching: {
                ...logged("crouching"),
                always: {
                  to: "/alive/posture/standing",
                  when: (_ctx, machine) => machine.matches("/alive/move/jump"),
                },
              },
            },
          },
        },
      },
    },
  }).start(newCtx(log));
  log.push(`leaves=${shownLeaves(m.leaves)}`);
  m.send({ type: "GO" });
  m.send({ type: "BACK" });
  m.send({ type: "HIT" });
  m.send({ type: "GO" });
  log.push(`leaves=${shownLeaves(m.leaves)}`);
  m.send({ type: "PING" });
  log.push(`leaves=${shownLeaves(m.leaves)}`);
  return log;
}

function canQuery(): string[] {
  const log: string[] = [];
  const m = defineMachine<Ctx, Ev>()({
    initial: "/a",
    states: {
      a: {
        ...logged("a"),
        on: {
          GO: "/b",
          STEP: { to: "/b", when: (_ctx, event) => event.n > 1 },
          PING: {
            run: (ctx) => {
              ctx.log.push("ping");
            },
          },
        },
      },
      b: { ...logged("b"), on: { BACK: "/a" } },
    },
  }).start(newCtx(log));
  log.push(`GO=${m.can({ type: "GO" })}`);
  log.push(`BACK=${m.can({ type: "BACK" })}`);
  log.push(`NOPE=${m.can({ type: "NOPE" })}`);
  log.push(`STEP1=${m.can({ type: "STEP", n: 1 })}`);
  log.push(`STEP2=${m.can({ type: "STEP", n: 2 })}`);
  log.push(`PING=${m.can({ type: "PING" })}`);
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "GO" });
  log.push(`GO=${m.can({ type: "GO" })}`);
  log.push(`BACK=${m.can({ type: "BACK" })}`);
  m.stop();
  log.push(`BACK=${m.can({ type: "BACK" })}`);
  return log;
}

function unhandledEvents(): string[] {
  const log: string[] = [];
  const m = defineMachine<Ctx, Ev>()({
    initial: "/a",
    states: {
      a: {
        ...logged("a"),
        on: {
          GO: "/b",
          STEP: { to: "/b", when: (_ctx, event) => event.n > 1 },
          PING: {},
        },
      },
      b: {
        enter: (ctx, machine) => {
          ctx.log.push("enter b");
          if (ctx.flag) {
            ctx.flag = false;
            machine.send({ type: "HIT" });
            machine.send({ type: "BACK" });
          }
        },
        exit: (ctx) => {
          ctx.log.push("exit b");
        },
        on: { BACK: "/a" },
      },
    },
  }).start(newCtx(log, true));
  const listener: UnhandledListener<Ev> = (event) => {
    log.push(`unhandled ${event.type} at ${shown(m.path)}`);
  };
  const remove = m.onUnhandled(listener);
  m.send({ type: "NOPE" });
  m.send({ type: "STEP", n: 1 });
  m.send({ type: "PING" });
  m.send({ type: "STEP", n: 2 });
  m.send({ type: "GO" });
  m.send({ type: "GO" });
  remove();
  m.send({ type: "GO" });
  log.push("off");
  m.onUnhandled(listener);
  m.stop();
  m.send({ type: "GO" });
  log.push(`path=${shown(m.path)}`);
  return log;
}

function timerRules(): string[] {
  const log: string[] = [];
  const ctx = newCtx(log);
  const define = () =>
    defineMachine<Ctx, Ev>("parity timer rules")({
      initial: "/a",
      states: {
        a: {
          ...logged("a"),
          after: {
            1: {
              run: (ctx) => {
                ctx.log.push("beep");
              },
            },
            2: {
              to: "/b",
              when: (ctx) => ctx.flag,
              run: (ctx) => {
                ctx.log.push("leave a");
              },
            },
          },
        },
        b: {
          ...logged("b"),
          always: {
            to: "/c",
            run: [
              (ctx) => {
                ctx.log.push("one");
              },
              (ctx) => {
                ctx.log.push("two");
              },
            ],
          },
        },
        c: {
          ...logged("c"),
          after: [
            {
              delay: 0.5,
              run: (ctx, m) => {
                ctx.log.push("ping");
                m.send({ type: "BACK" });
              },
            },
          ],
          on: { BACK: "/a" },
        },
      },
    });
  const m = define().start(ctx);
  m.onMove((from, to, cause, event) => {
    log.push(`${shown(from)} -> ${shown(to)} ${cause} ${event === undefined ? "-" : event.type}`);
  });
  m.update(1);
  log.push(`path=${shown(m.path)}`);
  m.update(1);
  log.push(`path=${shown(m.path)}`);
  define();
  m.update(0.5);
  log.push(`path=${shown(m.path)}`);
  ctx.flag = true;
  m.update(0);
  log.push(`path=${shown(m.path)}`);
  m.update(0.5);
  log.push(`path=${shown(m.path)}`);
  m.update(1);
  recordError(log, () =>
    defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { after: { 1: {} } } } }),
  );
  return log;
}

function timerReload(): string[] {
  const log: string[] = [];
  const ctx = newCtx(log);
  const say = (text: string) => (ctx: Ctx) => {
    ctx.log.push(text);
  };
  const define = (extra: boolean) =>
    defineMachine<Ctx, Ev>("parity timer reload")({
      initial: "/a",
      states: {
        a: {
          after: [
            { delay: (ctx) => (ctx.flag ? 3 : 1), run: say("first") },
            { delay: (ctx) => (ctx.flag ? 1 : 3), run: say("second") },
            ...(extra ? [{ delay: 0, run: say("third") }] : []),
          ],
        },
      },
    });
  const m = define(false).start(ctx);
  m.update(1);
  ctx.flag = true;
  define(false);
  m.update(0);
  log.push("reloaded");
  m.update(2);
  define(true);
  m.update(0);
  log.push("end");
  return log;
}

function everyTimers(): string[] {
  const log: string[] = [];
  const ctx = newCtx(log);
  const say = (text: string) => (ctx: Ctx) => {
    ctx.log.push(text);
  };
  const define = () =>
    defineMachine<Ctx, Ev>("parity every")({
      initial: "/a",
      states: {
        a: { ...logged("a"), every: { 1: say("one"), 0.5: say("half") }, on: { GO: "/b" } },
        b: {
          ...logged("b"),
          every: [{ delay: (ctx) => (ctx.flag ? 0.5 : 2), run: [say("x"), say("y")] }],
        },
      },
    });
  const m = define().start(ctx);
  m.onMove((from, to, cause, event) => {
    log.push(`${shown(from)} -> ${shown(to)} ${cause} ${event === undefined ? "-" : event.type}`);
  });
  m.update(0.5);
  log.push(`path=${shown(m.path)}`);
  m.update(0.5);
  m.update(2.5);
  m.send({ type: "GO" });
  m.update(1);
  log.push(`path=${shown(m.path)}`);
  ctx.flag = true;
  define();
  m.update(0.5);
  recordError(log, () =>
    defineMachine<Ctx, Ev>()({ initial: "/a", states: { a: { every: { 0: say("never") } } } }),
  );
  return log;
}

function waitGroups(): string[] {
  const log: string[] = [];
  const say = (text: string) => () => {
    log.push(text);
  };

  const empty = waitGroup();
  empty.wait(say("empty done"));

  const group = waitGroup();
  const a = group.add();
  const b: (self: unknown, id: number) => void = group.add();
  group.wait(say("first"));
  group.wait(say("second"));
  a();
  a();
  log.push("a reported");
  b(undefined, 7);
  log.push("b reported");
  group.wait(say("late"));

  const reports: (() => void)[] = [];
  const report = (index: number) => {
    const reported = reports[index];
    if (reported !== undefined) {
      reported();
    }
  };
  const def = defineMachine<Ctx, Ev>()({
    initial: "/loading",
    states: {
      loading: {
        task: (_ctx, finish) => {
          const g = waitGroup();
          reports.push(g.add());
          reports.push(g.add());
          g.wait(() => finish({ type: "LOADED" }));
        },
        on: { LOADED: "/ready", AGAIN: "/loading" },
      },
      ready: logged("ready"),
    },
  });
  const m = def.start(newCtx(log));
  report(0);
  m.send({ type: "AGAIN" });
  report(1);
  log.push(`path=${shown(m.path)}`);
  report(2);
  report(3);
  log.push(`path=${shown(m.path)}`);
  return log;
}

function unhandledHooks(): string[] {
  const log: string[] = [];
  const hook = (name: string) => (ctx: Ctx, event: Ev) => {
    ctx.log.push(`${name} ${event.type}`);
  };
  const define = (label: string) =>
    defineMachine<Ctx, Ev>("parity unhandled hook")({
      initial: "/alive",
      unhandled: hook(label),
      states: {
        alive: {
          type: "parallel",
          unhandled: hook("alive"),
          on: { HIT: "/dead" },
          states: {
            weapon: {
              initial: "/alive/weapon/ready",
              states: {
                ready: {
                  unhandled: hook("ready"),
                  on: {
                    GO: {
                      run: (ctx) => {
                        ctx.log.push("took GO");
                      },
                    },
                  },
                },
              },
            },
            move: {
              initial: "/alive/move/idle",
              states: {
                idle: {
                  unhandled: (ctx, event, machine) => {
                    ctx.log.push(`idle ${event.type}`);
                    machine.send({ type: "GO" });
                  },
                },
              },
            },
          },
        },
        dead: { on: { BACK: "/alive" } },
      },
    });
  const m = define("root").start(newCtx(log));
  m.onUnhandled((event) => {
    log.push(`listener ${event.type} at ${shown(m.path)}`);
  });
  m.send({ type: "NOPE" });
  m.send({ type: "HIT" });
  log.push(`path=${shown(m.path)}`);
  m.send({ type: "NOPE" });
  define("reloaded");
  m.send({ type: "NOPE" });
  m.stop();
  m.send({ type: "NOPE" });
  log.push(`path=${shown(m.path)}`);
  return log;
}

function stateTags(): string[] {
  const log: string[] = [];
  type Tag = "safe" | "spawned" | "none";
  const define = (shielded: boolean) =>
    defineMachine<Ctx, Ev, Tag>("parity tags")({
      initial: "/alive",
      tags: ["spawned"],
      states: {
        alive: {
          type: "parallel",
          on: {
            HIT: { to: "/dead", when: (_ctx, _event, machine) => !machine.hasTag("safe") },
          },
          states: {
            body: {
              initial: "/alive/body/walk",
              states: {
                walk: { on: { GO: "/alive/body/roll" } },
                roll: {
                  tags: ["safe"],
                  initial: "/alive/body/roll/start",
                  states: { start: {} },
                  on: { BACK: "/alive/body/walk" },
                },
              },
            },
            shield: {
              initial: "/alive/shield/down",
              states: {
                down: { on: { UP: "/alive/shield/up" } },
                up: { tags: shielded ? ["safe"] : [] },
              },
            },
          },
        },
        dead: {},
      },
    });
  const m = define(true).start(newCtx(log));
  const show = (label: string) => {
    log.push(`${label} safe=${m.hasTag("safe")} spawned=${m.hasTag("spawned")}`);
  };
  show("start");
  m.send({ type: "GO" });
  show("GO");
  m.send({ type: "UP" });
  m.send({ type: "BACK" });
  show("BACK");
  m.send({ type: "HIT" });
  log.push(`path=${shown(m.path)}`);
  define(false);
  show("pending");
  m.update(0);
  show("reload");
  log.push(`none=${m.hasTag("none")}`);
  m.send({ type: "HIT" });
  log.push(`path=${shown(m.path)}`);
  m.stop();
  show("stop");
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
  { name: "private ctx", run: () => privateCtx() },
  { name: "after delay from ctx", run: () => afterDelayFromCtx() },
  { name: "guard reads the machine", run: () => guardView() },
  { name: "can asks without moving", run: () => canQuery() },
  { name: "unhandled events reach the listener", run: () => unhandledEvents() },
  { name: "timer rules", run: () => timerRules() },
  { name: "timer reload", run: () => timerReload() },
  { name: "every timers", run: () => everyTimers() },
  { name: "wait group", run: () => waitGroups() },
  { name: "unhandled hooks run before the listener", run: () => unhandledHooks() },
  { name: "tags follow the active states", run: () => stateTags() },
];

export function runScenario(name: string): string {
  for (const scenario of scenarios) {
    if (scenario.name === name) {
      return scenario.run().join("\n");
    }
  }
  return `unknown scenario ${name}`;
}

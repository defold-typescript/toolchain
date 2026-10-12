import { describe, expect, test } from "bun:test";
import { type EventObject, waitGroup } from "@defold-typescript/hsm";
import { sequence } from "@defold-typescript/hsm/async";
import type { Demo, DemoCtx } from "./demos";
import {
  afterChip,
  alwaysChip,
  diagramChips,
  discard,
  everyChip,
  listChip,
  ruleChip,
  send,
  startDemo,
  step,
  stepChip,
  stop,
  type TraceEntry,
  type TraceFire,
  type TraceLine,
  updateChip,
} from "./instrument";

function tick(ctx: DemoCtx): void {
  ctx.tick = (ctx.tick as number) + 1;
}

// None of these specs is on the tutorial page, and every DEMOS entry must be placed there,
// so they stay local to this file.
const airborne: Demo = {
  title: "Airborne",
  subtitle: "A parent timer over a child update hook.",
  config: {
    initial: "/airborne",
    states: {
      airborne: {
        initial: "/airborne/rising",
        after: { 0.75: "/timeout" },
        states: {
          rising: { update: (ctx) => (ctx.tick === 2 ? "/airborne/falling" : undefined) },
          falling: {},
        },
      },
      timeout: {},
    },
  },
  ctx: () => ({ tick: 0 }),
  buttons: [],
  readout: () => [],
  tick,
};

const spin: Demo = {
  title: "Spin",
  subtitle: "An update hook that re-enters its own state.",
  config: {
    initial: "/spin",
    states: {
      spin: { update: (ctx) => (ctx.tick === 2 ? "/spin" : undefined) },
      done: {},
    },
  },
  ctx: () => ({ tick: 0 }),
  buttons: [],
  readout: () => [],
  tick,
};

const knight: Demo = {
  title: "Knight",
  subtitle: "A jump allowed only while standing.",
  config: {
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
                },
              },
              jump: {},
            },
          },
          posture: {
            initial: "/alive/posture/standing",
            states: {
              standing: { on: { CROUCH: "/alive/posture/crouching" } },
              crouching: {},
            },
          },
        },
      },
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

const roller: Demo = {
  title: "Roller",
  subtitle: "A hit that lands only outside the tagged state.",
  config: {
    initial: "/walk",
    on: {
      HIT: {
        to: "/hurt",
        when: (_ctx, _event, machine) => !machine.hasTag("invulnerable"),
      },
    },
    states: {
      walk: { on: { ROLL: "/roll" } },
      roll: {
        tags: ["invulnerable"],
        on: {
          CHECK: {
            run: (ctx, _event, machine) => {
              ctx.safe = machine.hasTag("invulnerable");
            },
          },
        },
      },
      hurt: {},
    },
  },
  ctx: () => ({ safe: false }),
  buttons: [],
  readout: () => [],
};

const decider: Demo = {
  title: "Decider",
  subtitle: "A state that picks a rule the moment it is entered.",
  config: {
    initial: "/idle",
    states: {
      idle: { on: { GO: "/check" } },
      check: {
        always: [
          { to: "/low", when: (ctx) => (ctx.level as number) < 1 },
          {
            to: "/high",
            run: (ctx) => {
              ctx.count = (ctx.count as number) + 1;
            },
          },
        ],
      },
      low: { on: { FILL: "/check" } },
      high: {},
    },
  },
  ctx: () => ({ level: 3, count: 0 }),
  buttons: [],
  readout: () => [],
  notes: {
    "/check|always|0": "if the level is under 1",
    "/check|always|1|run": "count + 1",
  },
};

// The two differ in `restoreDepth` alone.
function lamp(memory: { readonly restoreDepth?: number }): Demo {
  return {
    title: "Lamp",
    subtitle: "A parent left in its second child.",
    config: {
      initial: "/off",
      states: {
        off: { on: { ON: "/on" } },
        on: {
          ...memory,
          initial: "/on/a",
          on: { OFF: "/off" },
          states: {
            a: { on: { NEXT: "/on/b" } },
            b: {},
          },
        },
      },
    },
    ctx: () => ({}),
    buttons: [],
    readout: () => [],
  };
}

const rememberer = lamp({ restoreDepth: 1 });
const forgetter = lamp({});

// The longer delay is written first, and its key sorts first too.
const drainer: Demo = {
  title: "Drainer",
  subtitle: "Two every entries, one a single function and one a list.",
  config: {
    initial: "/on",
    states: {
      on: {
        every: {
          1: (ctx) => {
            ctx.count = (ctx.count as number) + 1;
          },
          0.5: [
            (ctx) => {
              ctx.half = (ctx.half as number) + 1;
            },
          ],
        },
        on: { OFF: "/off" },
      },
      off: { on: { ON: "/on" } },
    },
  },
  ctx: () => ({ count: 0, half: 0 }),
  buttons: [],
  readout: () => [],
  notes: { "/on|every|1": "count + 1" },
};

const napper: Demo = {
  title: "Napper",
  subtitle: "A timer that carries a rule, then one that reads its delay and waits.",
  config: {
    initial: "/work",
    states: {
      work: {
        after: {
          1: {
            to: "/nap",
            run: (ctx) => {
              ctx.nap = (ctx.nap as number) + 1;
            },
          },
        },
      },
      nap: {
        update: (ctx, dt) => {
          ctx.rest = (ctx.rest as number) + dt;
          return undefined;
        },
        after: [
          {
            delay: (ctx) => ctx.nap as number,
            to: "/work",
            when: (ctx) => (ctx.rest as number) >= 3,
            run: (ctx) => {
              ctx.nap = 1;
            },
          },
        ],
      },
    },
  },
  ctx: () => ({ nap: 1, rest: 0 }),
  buttons: [],
  readout: () => [],
  quietUpdates: ["/nap"],
  notes: {
    "/work|after|1": "nap + 1",
    "/nap|after|#0": "if rested",
    "/nap|after|#0|run": "nap = 1",
  },
};

// The two reports are kept on the context, so a test plays the engine's part and calls them.
const loader: Demo = {
  title: "Loader",
  subtitle: "A task that counts two jobs and returns its cleanup.",
  config: {
    initial: "/loading",
    states: {
      loading: {
        task: (ctx, finish) => {
          const group = waitGroup();
          ctx.a = group.add();
          ctx.b = group.add();
          group.wait(() => finish({ type: "READY" }));
          return () => {
            ctx.cleaned = (ctx.cleaned as number) + 1;
          };
        },
        on: { READY: "/ready", CANCEL: "/idle" },
      },
      ready: {},
      idle: {},
    },
  },
  ctx: () => ({ a: undefined, b: undefined, cleaned: 0 }),
  buttons: [],
  readout: () => [],
};

function report(ctx: DemoCtx, job: "a" | "b"): void {
  (ctx[job] as () => void)();
}

// The routine is the library's own `sequence`, which waits through Defold's global `timer`.
const greeter: Demo = {
  title: "Greeter",
  subtitle: "A routine with two waits.",
  config: {
    initial: "/idle",
    states: {
      idle: { on: { GO: "/hello" } },
      hello: {
        task: sequence(async (ctx, signal) => {
          ctx.said = "one";
          await signal.wait(0.2);
          ctx.said = "two";
          await signal.wait(0.3);
          return { type: "DONE" };
        }),
        on: { DONE: "/idle", QUIT: "/idle" },
      },
    },
  },
  ctx: () => ({ said: "" }),
  buttons: [],
  readout: () => [],
  routines: { "/hello": ["start", "say one, wait 0.2 s", "say two, wait 0.3 s"] },
};

// `lamp` is listed ahead of `battery`: the library runs regions in name order, not in this one.
const rester: Demo = {
  title: "Rester",
  subtitle: "A parallel state with a timer in its second region.",
  config: {
    initial: "/rest",
    states: {
      rest: {
        type: "parallel",
        on: { WAKE: "/up" },
        states: {
          lamp: {
            initial: "/rest/lamp/shown",
            states: {
              shown: { after: { 0.5: "/rest/lamp/hidden" } },
              hidden: { after: { 0.5: "/rest/lamp/shown" } },
            },
          },
          battery: {
            initial: "/rest/battery/filling",
            states: {
              filling: { on: { FULL: "/rest/battery/full" } },
              full: {},
            },
          },
        },
      },
      up: {},
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

function hear(ctx: DemoCtx, state: "a" | "b"): void {
  (ctx.heard as string[]).push(state);
}

function see(ctx: DemoCtx, who: string, event: unknown): void {
  (ctx.seen as [string, unknown][]).push([who, event]);
}

const ignorer: Demo = {
  title: "Ignorer",
  subtitle: "A parent and its child both answer an event nobody took.",
  config: {
    initial: "/a",
    states: {
      a: {
        initial: "/a/b",
        on: {
          GO: { to: "/c", when: (ctx) => ctx.open === true },
          TWICE: {
            run: (ctx, _event, m) => {
              m.send(ctx.again as EventObject);
              m.send(ctx.again as EventObject);
            },
          },
        },
        unhandled: (ctx) => hear(ctx, "a"),
        states: {
          b: { unhandled: (ctx) => hear(ctx, "b") },
        },
      },
      c: {},
    },
  },
  ctx: () => ({ heard: [], open: false }),
  buttons: [],
  readout: () => [],
  notes: { "/a|unhandled": "note it" },
};

const halter: Demo = {
  title: "Halter",
  subtitle: "A rule stops the machine with events still queued.",
  config: {
    initial: "/a",
    states: {
      a: {
        on: {
          BURST: {
            run: (ctx, _event, m) => {
              m.send(ctx.lost as EventObject);
              m.send({ type: "HALT" });
              m.send(ctx.lost as EventObject);
            },
          },
          HALT: { run: (_ctx, _event, m) => m.stop() },
        },
      },
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

// Both regions have a PING rule, so one send of it fires two rules.
const splitter: Demo = {
  title: "Splitter",
  subtitle: "Two regions take one event, and their parent stops the machine.",
  config: {
    initial: "/both",
    states: {
      both: {
        type: "parallel",
        on: { HALT: { run: (_ctx, _event, m) => m.stop() } },
        states: {
          left: {
            on: {
              PING: {
                run: (_ctx, event, m) => {
                  m.send({ type: "HALT" });
                  m.send(event);
                },
              },
              PAIR: {
                run: (ctx, _event, m) => {
                  m.send(ctx.again as EventObject);
                  m.send(ctx.again as EventObject);
                  m.send({ type: "HALT" });
                },
              },
              KEEP: {},
            },
          },
          right: { on: { PING: {} } },
        },
      },
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

// Every place the library hands an event out records the object it was given.
const witness: Demo = {
  title: "Witness",
  subtitle: "Each hook and listener keeps the event it was handed.",
  config: {
    initial: "/a",
    states: {
      a: {
        enter: (ctx, m) => {
          m.onUnhandled((event) => see(ctx, "listener", event));
          m.onMove((_from, _to, _cause, event) => see(ctx, "move", event));
        },
        on: {
          GO: {
            to: "/b",
            when: (ctx, event) => {
              see(ctx, "when", event);
              return true;
            },
            run: (ctx, event) => see(ctx, "run", event),
          },
        },
        unhandled: (ctx, event) => see(ctx, "hook", event),
      },
      b: {},
    },
  },
  ctx: () => ({ seen: [] }),
  buttons: [],
  readout: () => [],
};

/** The lines a send logs when neither state of a region of `rester` has a rule for `type`. */
function regionLines(region: "battery" | "lamp", type: string): string[] {
  const leaf = region === "battery" ? "filling" : "shown";
  return [
    `/rest/${region}/${leaf} has no ${type} rule, asks its parent`,
    `/rest/${region} has no ${type} rule, so its region does not take it`,
  ];
}

// A routine goes on in a promise continuation, which runs before a zero timeout does.
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function start(spec: Demo, ctxOverride?: Partial<DemoCtx>) {
  const trace: TraceEntry[] = [];
  const run = startDemo(spec, (entry) => trace.push(entry), ctxOverride);
  return { run, trace };
}

function texts(trace: readonly TraceEntry[], from: number, ...kinds: TraceLine["kind"][]) {
  return trace
    .slice(from)
    .filter((entry): entry is TraceLine => entry.kind !== "fire" && kinds.includes(entry.kind))
    .map((line) => line.text);
}

function fired(trace: readonly TraceEntry[], from: number): string[] {
  return trace
    .slice(from)
    .filter((entry): entry is TraceFire => entry.kind === "fire")
    .map((entry) => entry.chip);
}

describe("step clocks across an update-hook move", () => {
  test("a state that stays active counts the tick where a child's update hook moves the machine", () => {
    const { run } = start(airborne);
    step(run, 0.25);
    step(run, 0.25);
    expect(run.path).toBe("/airborne/falling");
    expect(run.clock("/airborne")).toBe(0.5);
  });

  test("the timer line and chip lead the exits on the tick the library fires the parent's timer", () => {
    const { run, trace } = start(airborne);
    step(run, 0.25);
    step(run, 0.25);
    const mark = trace.length;
    step(run, 0.25);
    expect(run.path).toBe("/timeout");
    expect(trace.slice(mark)).toEqual([
      { kind: "timer", text: "/airborne: 0.75 s timer fired" },
      { kind: "fire", chip: afterChip("/airborne", 0.75) },
      { kind: "exit", text: "exit /airborne/falling" },
      { kind: "exit", text: "exit /airborne" },
      { kind: "enter", text: "enter /timeout" },
    ]);
  });

  test("a state its own update hook re-enters starts from zero", () => {
    const { run } = start(spin);
    const clocks: number[] = [];
    for (let i = 0; i < 3; i++) {
      step(run, 0.25);
      clocks.push(run.clock("/spin"));
    }
    expect(clocks).toEqual([0.25, 0, 0.25]);
  });
});

describe("a guard reads the machine", () => {
  test("a wrapped when is handed the machine and reads another region", () => {
    const crouched = start(knight).run;
    send(crouched, { type: "CROUCH" });
    send(crouched, { type: "JUMP" });
    expect(crouched.matches("/alive/move/idle")).toBe(true);

    const standing = start(knight).run;
    send(standing, { type: "JUMP" });
    expect(standing.matches("/alive/move/jump")).toBe(true);
  });
});

describe("a tagged demo", () => {
  test("a wrapped when and a wrapped run read a tag", () => {
    const rolling = start(roller).run;
    send(rolling, { type: "ROLL" });
    send(rolling, { type: "CHECK" });
    expect(rolling.ctx.safe).toBe(true);
    send(rolling, { type: "HIT" });
    expect(rolling.matches("/roll")).toBe(true);

    const walking = start(roller).run;
    send(walking, { type: "HIT" });
    expect(walking.matches("/hurt")).toBe(true);
  });
});

describe("an always rule", () => {
  test("the rules are narrated in the order the machine tries them, and the one taken glows", () => {
    const { run, trace } = start(decider);
    const mark = trace.length;
    send(run, { type: "GO" });
    expect(texts(trace, mark, "event", "when", "exit", "action", "enter")).toEqual([
      "send GO",
      "exit /idle",
      "enter /check",
      '/check: when "if the level is under 1" said no',
      '/check: always chose "/high"',
      "exit /check",
      "run: count + 1",
      "enter /high",
    ]);
    expect(fired(trace, mark)).toEqual([ruleChip("/idle", "GO", 0), alwaysChip("/check", 1)]);
    expect(run.ctx.count).toBe(1);
  });

  test("a rule whose when passes is taken first, and the run of the rule after it stays unrun", () => {
    const { run, trace } = start(decider, { level: 0 });
    const mark = trace.length;
    send(run, { type: "GO" });
    expect(texts(trace, mark, "event")).toContain('/check: always chose "/low"');
    expect(fired(trace, mark).at(-1)).toBe(alwaysChip("/check", 0));
    expect(run.ctx.count).toBe(0);
  });

  test("the diagram lists a state's always rules after its event rules", () => {
    expect(diagramChips(decider.config)).toEqual([
      ruleChip("/idle", "GO", 0),
      alwaysChip("/check", 0),
      alwaysChip("/check", 1),
      ruleChip("/low", "FILL", 0),
    ]);
  });
});

describe("an every entry", () => {
  const halfRan: TraceEntry[] = [
    { kind: "timer", text: "/on: every 0.5 s ran" },
    { kind: "fire", chip: everyChip("/on", 0.5) },
    { kind: "action", text: "run: run code" },
  ];

  test("each run is narrated shortest delay first, and its chip glows", () => {
    const { run, trace } = start(drainer);
    const first = trace.length;
    step(run, 0.5);
    expect(trace.slice(first)).toEqual(halfRan);
    expect(run.ctx.half).toBe(1);
    expect(run.ctx.count).toBe(0);

    const second = trace.length;
    step(run, 0.5);
    expect(trace.slice(second)).toEqual([
      ...halfRan,
      { kind: "timer", text: "/on: every 1 s ran" },
      { kind: "fire", chip: everyChip("/on", 1) },
      { kind: "action", text: "run: count + 1" },
    ]);
    expect(run.clock("/on")).toBe(1);
  });

  test("a bar fills over its delay, starts over, and is empty while its state is inactive", () => {
    const { run } = start(drainer);
    const whole = everyChip("/on", 1);
    const half = everyChip("/on", 0.5);
    step(run, 0.25);
    expect(run.progress(whole)).toBe(0.25);
    expect(run.progress(half)).toBe(0.5);
    for (let i = 0; i < 3; i++) step(run, 0.25);
    expect(run.progress(whole)).toBe(0);
    expect(run.progress(half)).toBe(0);
    step(run, 0.25);
    expect(run.progress(whole)).toBe(0.25);
    send(run, { type: "OFF" });
    expect(run.progress(whole)).toBe(0);
  });

  test("the diagram lists a state's every entries after its event rules, shortest delay first", () => {
    expect(diagramChips(drainer.config)).toEqual([
      ruleChip("/on", "OFF", 0),
      everyChip("/on", 0.5),
      everyChip("/on", 1),
      ruleChip("/off", "ON", 0),
    ]);
  });
});

describe("a timer that carries a rule", () => {
  const work = afterChip("/work", 1);
  const nap = listChip("/nap", "after", 0);

  // The second step fires work's timer, so the nap starts with a clock of zero.
  function napping() {
    const started = start(napper);
    step(started.run, 0.5);
    step(started.run, 0.5);
    return started;
  }

  test("its line and chip lead the exits, its run sits between exit and enter, and the next delay is read on entry", () => {
    const { run, trace } = start(napper);
    step(run, 0.5);
    expect(run.delayOf(nap)).toBeUndefined();
    expect(run.delayOf(work)).toBe(1);

    const mark = trace.length;
    step(run, 0.5);
    expect(trace.slice(mark)).toEqual([
      { kind: "timer", text: "/work: 1 s timer fired" },
      { kind: "fire", chip: work },
      { kind: "exit", text: "exit /work" },
      { kind: "action", text: "run: nap + 1" },
      { kind: "enter", text: "enter /nap" },
      { kind: "note", text: "/nap: after delay read: 2 s" },
    ]);
    expect(run.delayOf(nap)).toBe(2);
    expect(run.delayOf(work)).toBe(1);
  });

  test("a delay read on entry holds for the stay, whatever the context says later", () => {
    const { run } = napping();
    run.ctx.nap = 9;
    for (let i = 0; i < 3; i++) step(run, 0.5);
    expect(run.delayOf(nap)).toBe(2);
    expect(run.progress(nap)).toBe(0.75);
    expect(run.waiting(nap)).toBe(false);
  });

  test("a due timer its when holds back waits, says so once, and fires when the answer is yes", () => {
    const { run, trace } = napping();
    run.ctx.nap = 9;
    for (let i = 0; i < 3; i++) step(run, 0.5);

    const due = trace.length;
    step(run, 0.5);
    expect(run.waiting(nap)).toBe(true);
    expect(run.progress(nap)).toBe(1);
    expect(texts(trace, due, "when")).toEqual([
      '/nap: 2 s timer is due, but when "if rested" said no',
    ]);

    const again = trace.length;
    step(run, 0.5);
    expect(run.waiting(nap)).toBe(true);
    expect(texts(trace, again, "when")).toEqual([]);

    const rested = trace.length;
    step(run, 0.5);
    expect(trace.slice(rested)).toEqual([
      { kind: "timer", text: "/nap: 2 s timer fired" },
      { kind: "fire", chip: nap },
      { kind: "exit", text: "exit /nap" },
      { kind: "action", text: "run: nap = 1" },
      { kind: "enter", text: "enter /work" },
    ]);
    expect(run.waiting(nap)).toBe(false);
    expect(run.delayOf(nap)).toBeUndefined();
    expect(run.ctx.nap).toBe(1);
  });

  test("a state listed as quiet draws no update line", () => {
    expect(diagramChips(napper.config, napper.quietUpdates)).toEqual([work, nap]);
    expect(diagramChips(napper.config)).toEqual([work, updateChip("/nap"), nap]);
  });
});

describe("a task that returns its cleanup", () => {
  test("the cleanup is narrated after the exit line once the last job has reported", () => {
    const { run, trace } = start(loader);
    const mark = trace.length;
    report(run.ctx, "a");
    expect(trace.slice(mark)).toEqual([]);
    expect(run.path).toBe("/loading");

    report(run.ctx, "b");
    expect(trace.slice(mark)).toEqual([
      { kind: "note", text: "/loading: finish(READY)" },
      { kind: "exit", text: "exit /loading" },
      { kind: "note", text: "/loading: task cleanup ran" },
      { kind: "fire", chip: ruleChip("/loading", "READY", 0) },
      { kind: "enter", text: "enter /ready" },
    ]);
    expect(run.ctx.cleaned).toBe(1);
  });

  test("another way out runs it once, and the reports that come in later are ignored", () => {
    const { run, trace } = start(loader);
    const sent = trace.length;
    send(run, { type: "CANCEL" });
    expect(texts(trace, sent, "exit", "note", "enter")).toEqual([
      "exit /loading",
      "/loading: task cleanup ran",
      "enter /idle",
    ]);

    const late = trace.length;
    report(run.ctx, "a");
    report(run.ctx, "b");
    expect(texts(trace, late, "drop")).toEqual([
      "late finish(READY) ignored: /loading was already left",
    ]);
    expect(run.ctx.cleaned).toBe(1);
  });

  test("a stop runs it too", () => {
    const { run, trace } = start(loader);
    const mark = trace.length;
    stop(run);
    expect(texts(trace, mark, "exit", "note")).toEqual([
      "exit /loading",
      "/loading: task cleanup ran",
      "stopped, path = undefined",
    ]);
  });
});

describe("a remembered child", () => {
  test("the first entry reads initial child, and the entry after a leave reads remembered child", () => {
    const { run, trace } = start(rememberer);
    const first = trace.length;
    send(run, { type: "ON" });
    expect(texts(trace, first, "enter")).toEqual(["enter /on", "enter /on/a (initial child)"]);
    send(run, { type: "NEXT" });
    send(run, { type: "OFF" });
    const second = trace.length;
    send(run, { type: "ON" });
    expect(texts(trace, second, "enter")).toEqual(["enter /on", "enter /on/b (remembered child)"]);
  });

  test("without restoreDepth the child the parent was left in reads initial child", () => {
    const { run, trace } = start(forgetter);
    send(run, { type: "ON" });
    send(run, { type: "OFF" });
    const second = trace.length;
    send(run, { type: "ON" });
    expect(texts(trace, second, "enter")).toEqual(["enter /on", "enter /on/a (initial child)"]);
  });
});

describe("a sequence waits on the run's own clock", () => {
  test("a wait counts the run's clock and nothing else", async () => {
    const { run, trace } = start(greeter);
    send(run, { type: "GO" });
    expect(run.ctx.said).toBe("one");
    for (let i = 0; i < 3; i++) await settle();
    expect(run.ctx.said).toBe("one");

    step(run, 0.1);
    await settle();
    expect(run.ctx.said).toBe("one");
    step(run, 0.1);
    await settle();
    expect(run.ctx.said).toBe("two");

    const last = trace.length;
    step(run, 0.3);
    await settle();
    expect(run.path).toBe("/idle");
    expect(texts(trace, last, "note", "exit", "enter")).toEqual([
      "/hello: finish(DONE)",
      "exit /hello",
      "/hello: task cleanup ran",
      "enter /idle",
    ]);
  });

  test("leaving the state cancels the pending wait", async () => {
    const { run, trace } = start(greeter);
    send(run, { type: "GO" });
    step(run, 0.1);
    const sent = trace.length;
    send(run, { type: "QUIT" });
    expect(texts(trace, sent, "exit", "note", "enter")).toEqual([
      "exit /hello",
      "/hello: task cleanup ran",
      "timer.cancel: the 0.2 s wait was cancelled",
      "enter /idle",
    ]);

    const left = trace.length;
    step(run, 1);
    await settle();
    expect(run.ctx.said).toBe("one");
    expect(trace.slice(left)).toEqual([]);
  });

  test("each run keeps its own waits", async () => {
    const a = start(greeter);
    const b = start(greeter);
    send(a.run, { type: "GO" });
    step(a.run, 0.2);
    await settle();
    expect(a.run.ctx.said).toBe("two");

    step(b.run, 5);
    await settle();
    expect(a.run.path).toBe("/hello");

    step(a.run, 0.3);
    await settle();
    expect(a.run.path).toBe("/idle");
  });
});

describe("a routine's steps", () => {
  const hello = "/hello";

  test("the running step is the number of waits the stay has started", async () => {
    const { run, trace } = start(greeter);
    const sent = trace.length;
    send(run, { type: "GO" });
    expect(fired(trace, sent)).toEqual([
      ruleChip("/idle", "GO", 0),
      stepChip(hello, 0),
      stepChip(hello, 1),
    ]);
    expect(run.routine(hello)).toEqual({ step: 1, progress: 0 });
    expect(run.routine("/idle")).toBeUndefined();

    step(run, 0.1);
    expect(run.routine(hello)).toEqual({ step: 1, progress: 0.5 });

    const second = trace.length;
    step(run, 0.1);
    await settle();
    expect(run.routine(hello)).toEqual({ step: 2, progress: 0 });
    expect(fired(trace, second)).toEqual([stepChip(hello, 2)]);

    step(run, 0.3);
    await settle();
    expect(run.routine(hello)).toBeUndefined();
  });

  test("a state that was left has no running step, and the next stay counts from the top", () => {
    const { run } = start(greeter);
    send(run, { type: "GO" });
    step(run, 0.1);
    send(run, { type: "QUIT" });
    expect(run.routine(hello)).toBeUndefined();

    send(run, { type: "GO" });
    expect(run.routine(hello)).toEqual({ step: 1, progress: 0 });
  });

  test("a diagram lists a state's steps after its rules", () => {
    expect(diagramChips(greeter.config, [], greeter.routines)).toEqual([
      ruleChip("/idle", "GO", 0),
      ruleChip(hello, "DONE", 0),
      ruleChip(hello, "QUIT", 0),
      stepChip(hello, 0),
      stepChip(hello, 1),
      stepChip(hello, 2),
    ]);
  });
});

describe("a discarded run", () => {
  test("it leaves its routine, and the pending wait is cancelled", () => {
    const { run, trace } = start(greeter);
    send(run, { type: "GO" });
    const mark = trace.length;
    discard(run);
    expect(run.stopped).toBe(true);
    expect(texts(trace, mark, "exit", "note")).toEqual([
      "exit /hello",
      "/hello: task cleanup ran",
      "timer.cancel: the 0.2 s wait was cancelled",
      "stopped, path = undefined",
    ]);
  });

  test("no run is in scope after it", () => {
    const { run } = start(greeter);
    send(run, { type: "GO" });
    discard(run);
    expect(() => timer.delay(1, false, () => {})).toThrow(
      "timer.delay was called with no demo running",
    );
  });

  test("the other runs go on", async () => {
    const a = start(greeter);
    const b = start(greeter);
    send(a.run, { type: "GO" });
    send(b.run, { type: "GO" });
    discard(a.run);

    step(b.run, 0.2);
    await settle();
    expect(b.run.ctx.said).toBe("two");
    step(b.run, 0.3);
    await settle();
    expect(b.run.path).toBe("/idle");
  });
});

describe("a parallel state", () => {
  test("a timer in the second region counts the run's clock", () => {
    const { run } = start(rester);
    step(run, 0.25);
    expect(run.clock("/rest/lamp/shown")).toBe(0.25);
    expect(run.clock("/rest")).toBe(0.25);
    expect(run.progress(afterChip("/rest/lamp/shown", 0.5))).toBe(0.5);

    step(run, 0.25);
    expect(run.leaves).toEqual(["/rest/battery/filling", "/rest/lamp/hidden"]);
    expect(run.clock("/rest/lamp/hidden")).toBe(0);
    expect(run.clock("/rest/lamp")).toBe(0.5);
    expect(run.clock("/rest/battery/filling")).toBe(0.5);
  });

  test("each region is asked before the parallel state", () => {
    const { run, trace } = start(rester);
    const mark = trace.length;
    send(run, { type: "WAKE" });
    expect(texts(trace, mark, "bubble")).toEqual([
      ...regionLines("battery", "WAKE"),
      ...regionLines("lamp", "WAKE"),
    ]);
    expect(run.path).toBe("/up");
  });

  test("a region that takes the event leaves the parallel state unasked", () => {
    const { run, trace } = start(rester);
    const mark = trace.length;
    send(run, { type: "FULL" });
    expect(texts(trace, mark, "bubble")).toEqual(regionLines("lamp", "FULL"));
    expect(texts(trace, mark, "drop")).toEqual([]);
    expect(run.leaves).toEqual(["/rest/battery/full", "/rest/lamp/shown"]);
  });

  test("an event nobody takes climbs past the parallel state", () => {
    const { run, trace } = start(rester);
    const mark = trace.length;
    send(run, { type: "NOPE" });
    expect(texts(trace, mark, "bubble")).toEqual([
      ...regionLines("battery", "NOPE"),
      ...regionLines("lamp", "NOPE"),
      "/rest has no NOPE rule, asks its parent",
    ]);
    expect(texts(trace, mark, "drop")).toEqual(["nobody handles NOPE, so it is ignored"]);
  });

  test("a region's root says what it is", () => {
    const { trace } = start(rester);
    expect(texts(trace, 0, "enter")).toEqual([
      "enter /rest (initial child)",
      "enter /rest/battery (region)",
      "enter /rest/battery/filling (initial child)",
      "enter /rest/lamp (region)",
      "enter /rest/lamp/shown (initial child)",
    ]);
  });
});

describe("an unhandled hook", () => {
  const hooks = ["/a/b: unhandled hook: run code", "/a: unhandled hook: note it"];

  test("a dropped event is named once, ahead of the hooks it runs", () => {
    const { run, trace } = start(ignorer);
    const mark = trace.length;
    send(run, { type: "NOPE" });
    expect(texts(trace, mark, "drop", "action")).toEqual([
      "nobody handles NOPE, so it is ignored",
      ...hooks,
    ]);
    expect(run.ctx.heard).toEqual(["b", "a"]);
  });

  test("a when that says no drops the event too", () => {
    const { run, trace } = start(ignorer);
    const mark = trace.length;
    send(run, { type: "GO" });
    expect(texts(trace, mark, "when", "drop", "action")).toEqual([
      '/a: when "check" said no',
      "nobody handles GO, so it is ignored",
      ...hooks,
    ]);
  });

  test("an event a rule takes runs no hook", () => {
    const { run, trace } = start(ignorer, { open: true });
    const mark = trace.length;
    send(run, { type: "GO" });
    expect(run.path).toBe("/c");
    expect(texts(trace, mark, "drop", "action")).toEqual([]);
    expect(run.ctx.heard).toEqual([]);
  });

  test("asking adds no line and runs no hook", () => {
    const { run, trace } = start(ignorer);
    const logged = trace.length;
    expect(run.can({ type: "GO" })).toBe(false);
    expect(trace.length).toBe(logged);
    expect(run.ctx.heard).toEqual([]);
    expect(start(ignorer, { open: true }).run.can({ type: "GO" })).toBe(true);
  });

  test("one event object sent again is named on every send", () => {
    const { run, trace } = start(ignorer);
    const nope = { type: "NOPE" };
    for (let sends = 0; sends < 3; sends++) {
      const mark = trace.length;
      send(run, nope);
      expect(texts(trace, mark, "drop", "action")).toEqual([
        "nobody handles NOPE, so it is ignored",
        ...hooks,
      ]);
    }
    expect(run.ctx.heard).toEqual(["b", "a", "b", "a", "b", "a"]);
  });

  test("an object a rule took is named when it is ignored later", () => {
    const { run, trace } = start(ignorer);
    const go = { type: "GO" };
    let mark = trace.length;
    send(run, go);
    expect(texts(trace, mark, "when", "drop", "action")).toEqual([
      '/a: when "check" said no',
      "nobody handles GO, so it is ignored",
      ...hooks,
    ]);
    run.ctx.open = true;
    mark = trace.length;
    send(run, go);
    expect(run.path).toBe("/c");
    expect(texts(trace, mark, "drop", "action")).toEqual([]);
    for (let sends = 0; sends < 2; sends++) {
      mark = trace.length;
      send(run, go);
      expect(texts(trace, mark, "drop", "action")).toEqual(["nobody handles GO, so it is ignored"]);
    }
    expect(run.ctx.heard).toEqual(["b", "a"]);
  });

  test("one call that queues an object twice names it twice", () => {
    const nope = { type: "NOPE" };
    const { run, trace } = start(ignorer, { again: nope });
    const mark = trace.length;
    send(run, { type: "TWICE" });
    expect(texts(trace, mark, "queue", "drop", "action")).toEqual([
      "run: run code",
      "NOPE queued (machine is busy)",
      "NOPE queued (machine is busy)",
      "nobody handles NOPE, so it is ignored",
      ...hooks,
      "nobody handles NOPE, so it is ignored",
      ...hooks,
    ]);
    expect(run.ctx.heard).toEqual(["b", "a", "b", "a"]);
  });
});

describe("a stop with events still queued", () => {
  test("the log names what the stop dropped, and nothing else", () => {
    const nope = { type: "NOPE" };
    const { run, trace } = start(halter, { lost: nope });
    const mark = trace.length;
    send(run, { type: "BURST" });
    expect(run.stopped).toBe(true);
    expect(texts(trace, mark, "drop")).toEqual([
      "nobody handles NOPE, so it is ignored",
      "stop() dropped NOPE",
    ]);
  });

  test("a send two regions took is named when a stop drops it from the queue", () => {
    const { run, trace } = start(splitter);
    const ping = { type: "PING" };
    const mark = trace.length;
    send(run, ping);
    expect(run.stopped).toBe(true);
    expect(fired(trace, mark)).toEqual([
      ruleChip("/both/left", "PING", 0),
      ruleChip("/both/right", "PING", 0),
      ruleChip("/both", "HALT", 0),
    ]);
    expect(texts(trace, mark, "queue", "drop")).toEqual([
      "HALT queued (machine is busy)",
      "PING queued (machine is busy)",
      "stop() dropped PING",
    ]);
  });

  test("one object a rule takes twice in a row is not called dropped", () => {
    const keep = { type: "KEEP" };
    const { run, trace } = start(splitter, { again: keep });
    const mark = trace.length;
    send(run, { type: "PAIR" });
    expect(run.stopped).toBe(true);
    expect(fired(trace, mark)).toEqual([
      ruleChip("/both/left", "PAIR", 0),
      ruleChip("/both/left", "KEEP", 0),
      ruleChip("/both/left", "KEEP", 0),
      ruleChip("/both", "HALT", 0),
    ]);
    expect(texts(trace, mark, "drop")).toEqual([]);
  });
});

describe("the event a spec is handed", () => {
  test("a hook or listener is handed the event that was sent", () => {
    const { run } = start(witness);
    const nope = { type: "NOPE" };
    const go = { type: "GO" };
    send(run, nope);
    send(run, go);
    const seen = run.ctx.seen as [string, unknown][];
    expect(seen.map(([who]) => who)).toEqual(["hook", "listener", "when", "run", "move"]);
    // toEqual passes for any object with the same type, so each event is compared by identity.
    for (const [, event] of seen.slice(0, 2)) expect(event).toBe(nope);
    for (const [, event] of seen.slice(2)) expect(event).toBe(go);
  });
});

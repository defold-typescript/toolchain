import { describe, expect, test } from "bun:test";
import { waitGroup } from "@defold-typescript/hsm";
import type { Demo, DemoCtx } from "./demos";
import {
  afterChip,
  alwaysChip,
  diagramChips,
  everyChip,
  listChip,
  ruleChip,
  send,
  startDemo,
  step,
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

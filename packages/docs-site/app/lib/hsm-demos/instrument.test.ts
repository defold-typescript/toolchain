import { describe, expect, test } from "bun:test";
import type { Demo, DemoCtx } from "./demos";
import { afterChip, startDemo, step, type TraceEntry } from "./instrument";

function tick(ctx: DemoCtx): void {
  ctx.tick = (ctx.tick as number) + 1;
}

// Neither spec is on the tutorial page, and every DEMOS entry must be placed there,
// so both stay local to this file.
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

function start(spec: Demo) {
  const trace: TraceEntry[] = [];
  const run = startDemo(spec, (entry) => trace.push(entry));
  return { run, trace };
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

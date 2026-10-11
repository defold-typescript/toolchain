import { describe, expect, test } from "bun:test";
import { DEMOS, type DemoCtx, type DemoId } from "./demos";
import {
  activePaths,
  type DemoRun,
  diagramChips,
  press,
  startDemo,
  step,
  type TraceLine,
  takes,
} from "./instrument";

// Each scenario is a "try this" the tutorial page asks of the reader, driven
// through the same button and heartbeat entries the live diagram uses.
function drive(id: DemoId) {
  const demo = DEMOS[id];
  const lines: TraceLine[] = [];
  const fired = new Set<string>();
  let run: DemoRun = startDemo(demo, (entry) => {
    if (entry.kind === "fire") fired.add(entry.chip);
    else lines.push(entry);
  });
  return {
    lines,
    fired,
    get run() {
      return run;
    },
    get ctx(): DemoCtx {
      return run.ctx;
    },
    get visual() {
      return demo.visual?.(run);
    },
    /** The labels of the buttons the page would fill now, in button order. */
    get taking(): string[] {
      return demo.buttons.filter((b) => takes(run, b)).map((b) => b.label);
    },
    press(label: string) {
      const button = demo.buttons.find((b) => b.label === label);
      if (button === undefined) throw new Error(`${id} has no "${label}" button`);
      if (!("event" in button)) {
        run = press(run, button);
        return;
      }
      // The mark the page shows has to agree with what the machine then does with the event.
      const marked = takes(run, button);
      const mark = lines.length;
      run = press(run, button);
      const dropped = lines.slice(mark).some((line) => line.kind === "drop");
      expect(dropped, `${id}: "${label}" was ${marked ? "filled" : "outlined"}`).toBe(!marked);
    },
    step(dt: number) {
      // The page gives a diagram without a clock no way to pass time.
      if (!demo.timed) throw new Error(`${id} has no clock`);
      step(run, dt);
    },
    since(mark: number, ...kinds: TraceLine["kind"][]): string[] {
      return lines
        .slice(mark)
        .filter((line) => kinds.includes(line.kind))
        .map((line) => line.text);
    },
  };
}

describe("activePaths", () => {
  test("lists every active path from the outermost state down, and none when stopped", () => {
    expect(activePaths("/awake/follow")).toEqual(["/awake", "/awake/follow"]);
    expect(activePaths(undefined)).toEqual([]);
  });
});

describe("hsm tutorial demos", () => {
  test("every registry entry starts without throwing", () => {
    for (const id of Object.keys(DEMOS) as DemoId[]) {
      expect(() => drive(id), id).not.toThrow();
    }
  });

  test("buddy-nested: SEE_PLAYER while asleep is ignored", () => {
    const d = drive("buddy-nested");
    expect(d.run.path).toBe("/asleep");
    const mark = d.lines.length;
    d.press("SEE_PLAYER");
    expect(d.since(mark, "drop")).toEqual(["nobody handles SEE_PLAYER, so it is ignored"]);
    expect(d.run.path).toBe("/asleep");
  });

  test("buddy-nested: POKE in follow climbs to awake, then exits innermost first", () => {
    const d = drive("buddy-nested");
    d.press("POKE");
    d.press("SEE_PLAYER");
    expect(d.run.path).toBe("/awake/follow");
    const mark = d.lines.length;
    d.press("POKE");
    expect(d.since(mark, "bubble", "exit", "enter")).toEqual([
      "/awake/follow has no POKE rule, asks its parent",
      "exit /awake/follow",
      "exit /awake",
      "enter /asleep",
    ]);
    expect(d.run.path).toBe("/asleep");
  });

  test("buddy-energy: a bump that uses up the energy exits follow and awake, then enters resting", () => {
    const d = drive("buddy-energy");
    d.press("POKE");
    d.press("SEE_PLAYER");
    expect(d.run.path).toBe("/awake/follow");
    expect(d.ctx.energy).toBe(3);
    const mark = d.lines.length;
    d.press("BUMP (cost 3)");
    expect(d.since(mark, "exit", "action", "enter")).toEqual([
      "exit /awake/follow",
      "exit /awake",
      "run: energy = 0",
      "enter /resting",
    ]);
    expect(d.ctx.energy).toBe(0);
    expect(d.run.path).toBe("/resting");
  });

  test("buddy-energy: a small bump runs only its run", () => {
    const d = drive("buddy-energy");
    d.press("POKE");
    expect(d.run.path).toBe("/awake/wander");
    const mark = d.lines.length;
    d.press("BUMP (cost 1)");
    expect(d.since(mark, "exit", "enter")).toEqual([]);
    expect(d.since(mark, "action")).toEqual(["run: lose energy"]);
    expect(d.ctx.energy).toBe(2);
    expect(d.run.path).toBe("/awake/wander");
  });

  test("buddy-energy: RECHARGE runs between the exit and the enter, and refills the energy", () => {
    const d = drive("buddy-energy");
    d.press("POKE");
    d.press("BUMP (cost 3)");
    const mark = d.lines.length;
    d.press("RECHARGE");
    expect(d.since(mark, "exit", "action", "enter")).toEqual([
      "exit /resting",
      "run: energy = 3",
      "enter /awake",
      "enter /awake/wander (initial child)",
    ]);
    expect(d.ctx.energy).toBe(3);
  });

  test("buddy-time: follow returns to wander after 4 s", () => {
    const d = drive("buddy-time");
    d.press("POKE");
    d.press("SEE_PLAYER");
    for (let i = 0; i < 7; i++) d.step(0.5);
    expect(d.run.path).toBe("/awake/follow");
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.since(mark, "timer", "exit", "enter")).toEqual([
      "/awake/follow: 4 s timer fired",
      "exit /awake/follow",
      "enter /awake/wander",
    ]);
  });

  test("buddy-time: SEE_PLAYER at 3 s restarts follow's clock while awake's clock keeps its 3 s", () => {
    const d = drive("buddy-time");
    d.press("POKE");
    d.press("SEE_PLAYER");
    for (let i = 0; i < 6; i++) d.step(0.5);
    expect(d.run.clock("/awake/follow")).toBe(3);
    const mark = d.lines.length;
    d.press("SEE_PLAYER");
    expect(d.since(mark, "exit", "enter")).toEqual(["exit /awake/follow", "enter /awake/follow"]);
    expect(d.run.clock("/awake/follow")).toBe(0);
    expect(d.run.clock("/awake")).toBe(3);
    expect(d.ctx.wakes).toBe(1);
    for (let i = 0; i < 7; i++) d.step(0.5);
    expect(d.run.path).toBe("/awake/follow");
    d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
  });

  test("buddy-time: awake falls asleep at 30 s and its exit turns the light off", () => {
    const d = drive("buddy-time");
    d.press("POKE");
    expect(d.ctx.lit).toBe(true);
    for (let i = 0; i < 59; i++) d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.since(mark, "timer", "exit", "enter")).toEqual([
      "/awake: 30 s timer fired",
      "exit /awake/wander",
      "exit /awake",
      "enter /asleep",
    ]);
    expect(d.ctx.lit).toBe(false);
  });

  test("buddy-time: resting returns to awake once its update hook has filled the energy", () => {
    const d = drive("buddy-time");
    d.press("POKE");
    d.press("BUMP (cost 3)");
    expect(d.run.path).toBe("/resting");
    expect(d.ctx.energy).toBe(0);
    for (let i = 0; i < 5; i++) d.step(0.5);
    expect(d.run.path).toBe("/resting");
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.since(mark, "event")).toEqual(['/resting: update returned "/awake"']);
    expect(d.ctx.energy).toBe(3);
    expect(d.run.path).toBe("/awake/wander");
  });

  test("buddy-waking: the fade finishes with WOKEN and the buddy is awake", () => {
    const d = drive("buddy-waking");
    d.press("POKE");
    expect(d.run.path).toBe("/waking");
    d.step(0.5);
    expect(d.run.path).toBe("/waking");
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.since(mark, "note", "exit", "enter")).toEqual([
      "/waking: finish(WOKEN)",
      "exit /waking",
      "enter /awake",
      "enter /awake/wander (initial child)",
    ]);
    expect(d.ctx.lit).toBe(true);
  });

  test("buddy-waking: with cleanup in exit, POKE during the fade leaves the light off", () => {
    const d = drive("buddy-waking");
    expect(d.ctx.cleanup).toBe(true);
    d.press("POKE");
    d.step(0.5);
    expect(d.ctx.lit).toBe(true);
    d.press("POKE");
    expect(d.run.path).toBe("/asleep");
    expect(d.ctx.lit).toBe(false);
    const mark = d.lines.length;
    d.step(1);
    expect(d.run.path).toBe("/asleep");
    expect(d.ctx.lit).toBe(false);
    expect(d.since(mark, "drop")).toEqual([]);
  });

  test("buddy-waking: without cleanup the fade runs on and its late finish is ignored", () => {
    const d = drive("buddy-waking");
    d.press("Toggle cancel in exit");
    expect(d.ctx.cleanup).toBe(false);
    d.press("POKE");
    d.step(0.5);
    d.press("POKE");
    expect(d.run.path).toBe("/asleep");
    const mark = d.lines.length;
    d.step(1);
    expect(d.run.path).toBe("/asleep");
    expect(d.ctx.lit).toBe(true);
    expect(d.since(mark, "drop")).toEqual(["late finish(WOKEN) ignored: /waking was already left"]);
  });

  test("buddy-queue: a first start queues POKE and is in waking when start returns", () => {
    const d = drive("buddy-queue");
    d.press("start() with wakes = 0");
    expect(d.run.path).toBe("/waking");
    const texts = d.lines.map((line) => line.text);
    const queued = texts.lastIndexOf("POKE queued (machine is busy)");
    const returned = texts.lastIndexOf('start() returned, path = "/waking"');
    expect(queued).toBeGreaterThanOrEqual(0);
    expect(returned).toBeGreaterThan(queued);
  });

  test("buddy-queue: a buddy that has been awake before stays asleep at start", () => {
    const d = drive("buddy-queue");
    const mark = d.lines.length;
    d.press("start() with wakes = 1");
    expect(d.run.path).toBe("/asleep");
    expect(d.since(mark, "queue")).toEqual([]);
  });

  test("buddy-queue: stop exits the active state, and an event after it changes nothing", () => {
    const d = drive("buddy-queue");
    expect(d.run.path).toBe("/waking");
    expect(d.ctx.lit).toBe(true);
    const beforeStop = d.lines.length;
    d.press("stop()");
    expect(d.run.path).toBeUndefined();
    expect(d.run.stopped).toBe(true);
    expect(d.since(beforeStop, "exit", "note")).toEqual([
      "exit /waking",
      "stopped, path = undefined",
    ]);
    expect(d.ctx.lit).toBe(false);
    const mark = d.lines.length;
    d.press("POKE");
    expect(d.since(mark, "drop")).toEqual(["POKE ignored: machine is stopped"]);
    expect(d.run.path).toBeUndefined();
  });
});

// A string presses the button with that label; a number lets that many seconds pass in 0.5 s steps.
const AWAKE_TAIL = [
  "BUMP (cost 1)",
  "BUMP (cost 3)",
  "RECHARGE",
  "BUMP (cost 3)",
  3,
  "POKE",
  "POKE",
] as const;
const WALKS: Record<DemoId, readonly (string | number)[]> = {
  "buddy-first": ["POKE", "POKE"],
  "buddy-nested": ["POKE", "SEE_PLAYER", "LOSE_PLAYER", "POKE"],
  "buddy-energy": [
    "POKE",
    "SEE_PLAYER",
    "LOSE_PLAYER",
    "BUMP (cost 1)",
    "BUMP (cost 3)",
    "RECHARGE",
    "POKE",
  ],
  "buddy-time": [
    "POKE",
    "SEE_PLAYER",
    "SEE_PLAYER",
    "LOSE_PLAYER",
    "SEE_PLAYER",
    4,
    ...AWAKE_TAIL,
    30,
  ],
  "buddy-waking": [
    "POKE",
    "POKE",
    "POKE",
    1,
    "SEE_PLAYER",
    "SEE_PLAYER",
    "LOSE_PLAYER",
    "SEE_PLAYER",
    4,
    ...AWAKE_TAIL,
    1,
    30,
  ],
  "buddy-queue": [
    "POKE",
    1,
    "trigger_response (enter true)",
    "trigger_response (enter true)",
    "trigger_response (enter false)",
    "trigger_response (enter true)",
    4,
    ...AWAKE_TAIL,
    1,
    30,
  ],
};

describe("every rule a diagram draws can be used", () => {
  for (const id of Object.keys(WALKS) as DemoId[]) {
    test(id, () => {
      const d = drive(id);
      for (const move of WALKS[id]) {
        if (typeof move === "string") d.press(move);
        else for (let passed = 0; passed < move; passed += 0.5) d.step(0.5);
      }
      expect([...d.fired].sort()).toEqual(diagramChips(DEMOS[id].config).sort());
    });
  }
});

describe("which buttons the machine takes", () => {
  test("buddy-energy: the filled buttons follow the active states and their parents", () => {
    const d = drive("buddy-energy");
    expect(d.taking).toEqual(["POKE"]);
    d.press("POKE");
    expect(d.taking).toEqual(["POKE", "SEE_PLAYER", "BUMP (cost 1)", "BUMP (cost 3)"]);
    d.press("SEE_PLAYER");
    expect(d.taking).toEqual(["POKE", "LOSE_PLAYER", "BUMP (cost 1)", "BUMP (cost 3)"]);
    d.press("BUMP (cost 3)");
    expect(d.taking).toEqual(["RECHARGE"]);
  });

  test("buddy-queue: a when that says no leaves its button outlined and the log alone", () => {
    const d = drive("buddy-queue");
    expect(d.taking).toEqual(["POKE"]);
    d.step(0.5);
    d.step(0.5);
    const logged = d.lines.length;
    expect(d.taking).toEqual([
      "POKE",
      "trigger_response (enter true)",
      "BUMP (cost 1)",
      "BUMP (cost 3)",
    ]);
    expect(d.lines.length).toBe(logged);
    d.press("stop()");
    expect(d.taking).toEqual([]);
  });
});

describe("the buddy figure", () => {
  test("buddy-first: the pose follows the two states", () => {
    const d = drive("buddy-first");
    expect(d.visual).toEqual({ pose: "asleep" });
    d.press("POKE");
    expect(d.visual).toEqual({ pose: "awake" });
  });

  test("buddy-nested: follow is its own pose and wander draws as awake", () => {
    const d = drive("buddy-nested");
    d.press("POKE");
    expect(d.visual).toEqual({ pose: "awake" });
    d.press("SEE_PLAYER");
    expect(d.visual).toEqual({ pose: "follow" });
    d.press("LOSE_PLAYER");
    expect(d.visual).toEqual({ pose: "awake" });
    d.press("POKE");
    expect(d.visual).toEqual({ pose: "asleep" });
  });

  test("buddy-energy: a tired buddy rests until it is recharged", () => {
    const d = drive("buddy-energy");
    d.press("POKE");
    d.press("BUMP (cost 3)");
    expect(d.visual).toEqual({ pose: "resting" });
    d.press("RECHARGE");
    expect(d.visual).toEqual({ pose: "awake" });
  });

  test("buddy-time: the light is on only while the buddy is awake", () => {
    const d = drive("buddy-time");
    expect(d.visual).toEqual({ pose: "asleep", light: "off" });
    d.press("POKE");
    expect(d.visual).toEqual({ pose: "awake", light: "lit" });
    d.press("BUMP (cost 3)");
    expect(d.visual).toEqual({ pose: "resting", light: "off" });
  });

  test("buddy-waking: the light is dim through the fade and lit once awake", () => {
    const d = drive("buddy-waking");
    d.press("POKE");
    d.step(0.5);
    expect(d.visual).toEqual({ pose: "waking", light: "dim" });
    d.step(0.5);
    expect(d.visual).toEqual({ pose: "awake", light: "lit" });
  });

  test("buddy-waking: without cleanup the buddy sleeps with its light on", () => {
    const d = drive("buddy-waking");
    d.press("Toggle cancel in exit");
    d.press("POKE");
    d.step(0.5);
    d.press("POKE");
    d.step(1);
    expect(d.visual).toEqual({ pose: "asleep", light: "lit" });
  });

  test("buddy-waking: with cleanup the same presses leave the light off", () => {
    const d = drive("buddy-waking");
    d.press("POKE");
    d.step(0.5);
    d.press("POKE");
    d.step(1);
    expect(d.visual).toEqual({ pose: "asleep", light: "off" });
  });

  test("buddy-queue: a stopped machine draws the stopped pose", () => {
    const d = drive("buddy-queue");
    expect(d.visual).toEqual({ pose: "waking", light: "dim" });
    d.press("stop()");
    expect(d.visual).toEqual({ pose: "stopped", light: "off" });
  });
});

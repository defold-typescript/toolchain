import { describe, expect, test } from "bun:test";
import { DEMOS, type DemoCtx, type DemoId } from "./demos";
import { activePaths, type DemoRun, press, startDemo, step, type TraceLine } from "./instrument";

// Each scenario is a "try this" the tutorial page asks of the reader, driven
// through the same button and heartbeat entries the live diagram uses.
function drive(id: DemoId) {
  const demo = DEMOS[id];
  const lines: TraceLine[] = [];
  let run: DemoRun = startDemo(demo, (entry) => {
    if (entry.kind !== "fire") lines.push(entry);
  });
  return {
    lines,
    get run() {
      return run;
    },
    get ctx(): DemoCtx {
      return run.ctx;
    },
    get visual() {
      return demo.visual?.(run);
    },
    press(label: string) {
      const button = demo.buttons.find((b) => b.label === label);
      if (button === undefined) throw new Error(`${id} has no "${label}" button`);
      run = press(run, button);
    },
    step(dt: number) {
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

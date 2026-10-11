import { describe, expect, test } from "bun:test";
import { type BuddyReaction, DEMOS, type DemoCtx, type DemoId } from "./demos";
import {
  activePaths,
  afterChip,
  type DemoRun,
  diagramChips,
  everyChip,
  listChip,
  press,
  reactionTo,
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
  let reaction: BuddyReaction | undefined;
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
    /** The value the panel's readout shows under `key`. */
    readout(key: string): string | undefined {
      return demo.readout(run).find(([label]) => label === key)?.[1];
    },
    /** The labels of the buttons the page would fill now, in button order. */
    get taking(): string[] {
      return demo.buttons.filter((b) => takes(run, b)).map((b) => b.label);
    },
    /** How the figure answered the last press; `undefined` when that button sent no event. */
    get reaction() {
      return reaction;
    },
    press(label: string) {
      const button = demo.buttons.find((b) => b.label === label);
      if (button === undefined) throw new Error(`${id} has no "${label}" button`);
      reaction = reactionTo(run, button);
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
    /** Lets a routine go on: its promise continuations run before a zero timeout does. */
    settle(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 0));
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

  test("buddy-checkup: the fade ends in checkup, which moves on to awake at once and counts the wake-up", () => {
    const d = drive("buddy-checkup");
    d.step(0.5);
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    expect(d.ctx.wakes).toBe(1);
    expect(d.since(mark, "event", "exit", "enter")).toEqual([
      "exit /waking",
      "enter /checkup",
      '/checkup: always chose "/awake"',
      "exit /checkup",
      "enter /awake",
      "enter /awake/wander (initial child)",
    ]);
  });

  test("buddy-checkup: a buddy low on energy rests without being counted awake", () => {
    const d = drive("buddy-checkup");
    d.step(0.5);
    d.step(0.5);
    d.press("BUMP (cost 2.5)");
    d.press("POKE");
    d.press("POKE");
    d.step(0.5);
    d.step(0.5);
    expect(d.run.path).toBe("/resting");
    expect(d.ctx.wakes).toBe(1);
    expect(d.visual).toEqual({ pose: "resting", light: "off" });
    // The step that ends the fade also runs resting's update hook once.
    expect(d.ctx.energy).toBe(1);
    for (let i = 0; i < 4; i++) d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    expect(d.ctx.wakes).toBe(2);
  });

  // The buddy follows, tires out and rests until its energy is back; `mark` is where the last step starts.
  function restWhileFollowing(id: DemoId) {
    const d = drive(id);
    d.step(0.5);
    d.step(0.5);
    d.press("trigger_response (enter true)");
    d.press("BUMP (cost 3)");
    for (let i = 0; i < 5; i++) d.step(0.5);
    const mark = d.lines.length;
    d.step(0.5);
    return { d, mark };
  }

  test("buddy-memory: awake goes back to the child it was left in", () => {
    const { d, mark } = restWhileFollowing("buddy-memory");
    expect(d.run.path).toBe("/awake/follow");
    expect(d.visual?.pose).toBe("follow");
    expect(d.since(mark, "enter").at(-1)).toBe("enter /awake/follow (remembered child)");
  });

  test("buddy-checkup: without restoreDepth the same presses end in wander", () => {
    const { d } = restWhileFollowing("buddy-checkup");
    expect(d.run.path).toBe("/awake/wander");
  });

  // The fade ends on the second step, which leaves awake's clock at half a second;
  // `mark` is where the third step starts.
  function drainedOnce() {
    const d = drive("buddy-drain");
    d.step(0.5);
    d.step(0.5);
    const mark = d.lines.length;
    d.step(0.5);
    return { d, mark };
  }

  test("buddy-drain: each second awake sends a small bump that waits its turn", () => {
    const { d, mark } = drainedOnce();
    expect(d.since(mark, "timer", "action", "queue", "when")).toEqual([
      "/awake: every 1 s ran",
      "run: send BUMP, cost 1/16",
      "BUMP queued (machine is busy)",
      '/awake: when "if the bump uses up the energy" said no',
      "run: lose energy",
    ]);
    expect(d.ctx.energy).toBe(2.9375);
  });

  test("buddy-drain: four seconds awake cost four sixteenths and move nothing, and a sleeping buddy keeps its battery", () => {
    const { d, mark } = drainedOnce();
    for (let i = 0; i < 7; i++) d.step(0.5);
    expect(d.ctx.energy).toBe(2.75);
    expect(d.run.path).toBe("/awake/wander");
    expect(d.run.clock("/awake")).toBe(4.5);
    expect(d.since(mark, "exit", "enter")).toEqual([]);

    d.press("POKE");
    for (let i = 0; i < 4; i++) d.step(0.5);
    expect(d.ctx.energy).toBe(2.75);
    expect(d.run.progress(everyChip("/awake", 1))).toBe(0);
  });

  test("buddy-drain: the drain empties the battery through the BUMP rules", () => {
    const d = drive("buddy-drain");
    d.step(0.5);
    d.step(0.5);
    d.press("BUMP (cost 2.5)");
    for (let i = 0; i < 14; i++) d.step(0.5);
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.run.path).toBe("/resting");
    expect(d.ctx.energy).toBe(0);
    expect(d.since(mark, "action", "exit", "enter")).toEqual([
      "run: send BUMP, cost 1/16",
      "exit /awake/wander",
      "exit /awake",
      "run: energy = 0",
      "enter /resting",
    ]);
  });

  const nap = listChip("/resting", "after", 0);
  const drain = listChip("/awake", "every", 0);
  const hello = "/awake/greeting";

  test("buddy-nap: a nap whose two seconds are over waits for a full battery", () => {
    const d = drive("buddy-nap");
    d.step(0.5);
    d.step(0.5);
    const pressed = d.lines.length;
    d.press("BUMP (cost 3)");
    expect(d.since(pressed, "note")).toContain("/resting: after delay read: 2 s");

    for (let i = 0; i < 4; i++) d.step(0.5);
    expect(d.run.path).toBe("/resting");
    expect(d.ctx.energy).toBe(2);
    expect(d.run.waiting(nap)).toBe(true);
    const held = ['/resting: 2 s timer is due, but when "if the battery is full" said no'];
    expect(d.since(pressed, "when")).toEqual(held);
    d.step(0.5);
    expect(d.since(pressed, "when")).toEqual(held);

    const mark = d.lines.length;
    d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    expect(d.since(mark, "timer")).toEqual(["/resting: 2 s timer fired"]);
    expect(d.ctx.wakes).toBe(2);
    expect(d.run.waiting(nap)).toBe(false);
  });

  test("buddy-nap: a buddy that gave up following twice naps four seconds, battery full or not", () => {
    const d = drive("buddy-nap");
    d.step(0.5);
    d.step(0.5);
    for (let round = 0; round < 2; round++) {
      d.press("trigger_response (enter true)");
      for (let i = 0; i < 8; i++) d.step(0.5);
    }
    expect(d.ctx.napSeconds).toBe(4);
    expect(d.ctx.energy).toBe(2.5);

    d.press("BUMP (cost 3)");
    expect(d.run.delayOf(nap)).toBe(4);
    for (let i = 0; i < 6; i++) d.step(0.5);
    expect(d.run.path).toBe("/resting");
    expect(d.ctx.energy).toBe(3);
    expect(d.run.waiting(nap)).toBe(false);

    d.step(0.5);
    d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    expect(d.ctx.napSeconds).toBe(2);
  });

  test("buddy-nap: the drain's delay is read when awake is entered and holds for the stay", () => {
    const d = drive("buddy-nap");
    d.step(0.5);
    d.step(0.5);
    expect(d.run.delayOf(drain)).toBe(1);
    d.press("BUMP (cost 1)");
    d.press("BUMP (cost 1)");
    expect(d.run.delayOf(drain)).toBe(1);

    d.press("POKE");
    d.press("POKE");
    d.step(0.5);
    d.step(0.5);
    expect(d.run.delayOf(drain)).toBe(2);
    for (let i = 0; i < 3; i++) d.step(0.5);
    expect(d.ctx.energy).toBe(0.9375);
  });

  test("buddy-chirp: waking waits for both jobs", () => {
    const d = drive("buddy-chirp");
    expect(d.run.path).toBe("/waking");
    expect(d.readout("jobs pending")).toBe("2: fade, chirp");

    const chirped = d.lines.length;
    d.step(0.5);
    expect(d.readout("jobs pending")).toBe("1: fade");
    expect(d.run.path).toBe("/waking");
    expect(d.since(chirped, "note")).toEqual([]);

    const faded = d.lines.length;
    d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    expect(d.readout("jobs pending")).toBe("0");
    expect(d.visual).toEqual({ pose: "awake", light: "lit" });
    expect(d.since(faded, "exit", "note").slice(0, 3)).toEqual([
      "/waking: finish(WOKEN)",
      "exit /waking",
      "/waking: task cleanup ran",
    ]);
  });

  test("buddy-chirp: a poke during the fade stops both jobs", () => {
    const d = drive("buddy-chirp");
    d.step(0.5);
    d.step(0.5);
    d.press("POKE");
    d.press("POKE");
    expect(d.readout("jobs pending")).toBe("2: fade, chirp");

    d.step(0.25);
    d.press("POKE");
    expect(d.run.path).toBe("/asleep");
    expect(d.readout("jobs pending")).toBe("0");
    expect(d.visual).toEqual({ pose: "asleep", light: "off" });

    const left = d.lines.length;
    d.step(0.5);
    d.step(0.5);
    expect(d.run.path).toBe("/asleep");
    expect(d.since(left, "drop", "note")).toEqual([]);
  });

  // Wakes the buddy and walks in, which starts the hello.
  async function greeting() {
    const d = drive("buddy-greeting");
    for (let i = 0; i < 2; i++) {
      d.step(0.5);
      await d.settle();
    }
    d.press("trigger_response (enter true)");
    return d;
  }

  test("buddy-greeting: the routine runs its steps in order and ends by itself", async () => {
    const d = await greeting();
    expect(d.run.path).toBe(hello);
    expect(d.run.routine(hello)).toEqual({ step: 0, progress: 0 });

    d.step(0.5);
    await d.settle();
    expect(d.run.routine(hello)?.step).toBe(1);
    expect(d.visual?.light).toBe("off");

    for (const [index, light] of [
      [2, "lit"],
      [3, "off"],
      [4, "lit"],
    ] as const) {
      d.step(0.2);
      await d.settle();
      expect(d.run.routine(hello)?.step).toBe(index);
      expect(d.visual?.light).toBe(light);
    }

    const last = d.lines.length;
    d.step(0.2);
    await d.settle();
    expect(d.run.path).toBe("/awake/follow");
    expect(d.run.routine(hello)).toBeUndefined();
    expect(d.since(last, "exit", "enter")).toEqual(["exit /awake/greeting", "enter /awake/follow"]);
    expect(d.since(last, "note")).toContain("/awake/greeting: finish(GREETED)");
  });

  test("buddy-greeting: walking out is ignored", async () => {
    const d = await greeting();
    const pressed = d.lines.length;
    d.press("trigger_response (enter false)");
    expect(d.run.path).toBe(hello);
    expect(d.reaction).toBe("ignored");
    expect(d.since(pressed, "drop")).toEqual(["nobody handles trigger_response, so it is ignored"]);
  });

  test("buddy-greeting: a tired buddy greets again when it gets up", async () => {
    const d = await greeting();
    d.step(0.5);
    await d.settle();
    const pressed = d.lines.length;
    d.press("BUMP (cost 3)");
    expect(d.run.path).toBe("/resting");
    expect(d.run.routine(hello)).toBeUndefined();
    expect(d.since(pressed, "note")).toContain("timer.cancel: the 0.2 s wait was cancelled");

    let last = d.lines.length;
    for (let i = 0; i < 6; i++) {
      last = d.lines.length;
      d.step(0.5);
      await d.settle();
    }
    expect(d.run.path).toBe(hello);
    expect(d.since(last, "enter")).toContain("enter /awake/greeting (remembered child)");
    expect(d.run.routine(hello)).toEqual({ step: 0, progress: 0 });
  });

  test("buddy-greeting: a hello that starts over has no wait left from the one before", async () => {
    const d = await greeting();
    d.step(0.5);
    await d.settle();
    d.step(0.1);
    await d.settle();
    expect(d.run.routine(hello)).toEqual({ step: 1, progress: 0.5 });

    d.press("BUMP (cost 3)");
    d.press("RECHARGE");
    expect(d.run.path).toBe(hello);
    expect(d.run.routine(hello)).toEqual({ step: 0, progress: 0 });
  });

  const shown = afterChip("/resting/lamp/shown", 0.5);

  // Wakes the buddy and bumps away its energy, which sends it to rest; returns the log mark of the bump.
  function tireOut(d: ReturnType<typeof drive>): number {
    d.step(0.5);
    d.step(0.5);
    const pressed = d.lines.length;
    d.press("BUMP (cost 3)");
    return pressed;
  }

  test("buddy-regions: a resting buddy is in two states at once", () => {
    const d = drive("buddy-regions");
    const pressed = tireOut(d);
    expect(d.run.path).toBe("/resting/battery/filling");
    expect(d.readout("leaves")).toBe("/resting/battery/filling, /resting/lamp/shown");
    expect(d.visual).toEqual({ pose: "resting", light: "lit" });
    expect(d.since(pressed, "enter")).toEqual([
      "enter /resting",
      "enter /resting/battery (region)",
      "enter /resting/battery/filling (initial child)",
      "enter /resting/lamp (region)",
      "enter /resting/lamp/shown (initial child)",
    ]);
  });

  test("buddy-regions: the light blinks until the battery is full, then stays on", () => {
    const d = drive("buddy-regions");
    d.press("start() with napSeconds = 5");
    tireOut(d);
    const lights: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      d.step(0.5);
      lights.push(d.visual?.light);
    }
    expect(lights).toEqual(["off", "lit", "off", "lit", "off", "lit"]);
    expect(d.run.leaves).toEqual(["/resting/battery/full", "/resting/lamp/shown"]);

    const full = d.lines.length;
    for (let i = 0; i < 3; i++) {
      d.step(0.5);
      expect(d.visual?.light).toBe("lit");
      expect(d.run.waiting(shown)).toBe(true);
    }
    expect(d.since(full, "when")).toEqual([
      '/resting/lamp/shown: 0.5 s timer is due, but when "if the battery is not full" said no',
    ]);

    const last = d.lines.length;
    d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    expect(d.since(last, "exit").slice(0, 5)).toEqual([
      "exit /resting/lamp/shown",
      "exit /resting/lamp",
      "exit /resting/battery/full",
      "exit /resting/battery",
      "exit /resting",
    ]);
  });

  test("buddy-regions: RECHARGE is offered to both regions first", () => {
    const d = drive("buddy-regions");
    tireOut(d);
    const pressed = d.lines.length;
    d.press("RECHARGE");
    expect(d.since(pressed, "bubble")).toEqual([
      "/resting/battery/filling has no RECHARGE rule, asks its parent",
      "/resting/battery has no RECHARGE rule, so its region does not take it",
      "/resting/lamp/shown has no RECHARGE rule, asks its parent",
      "/resting/lamp has no RECHARGE rule, so its region does not take it",
    ]);
    expect(d.reaction).toBe("hop");
    expect(d.run.path).toBe("/awake/wander");
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
// Every buddy with a checkup takes the same route; it reaches each `always` rule and each way into `checkup`.
const CHECKUP_WALK = [
  "POKE",
  1,
  "trigger_response (enter true)",
  "trigger_response (enter true)",
  "trigger_response (enter false)",
  "trigger_response (enter true)",
  4,
  "BUMP (cost 1)",
  "BUMP (cost 3)",
  "RECHARGE",
  "BUMP (cost 2.5)",
  "POKE",
  "POKE",
  1,
  3,
  "POKE",
  "POKE",
  1,
  30,
] as const;
// Here walking in starts the hello, and three seconds see it through to `follow`.
const GREETING_WALK = [
  ...CHECKUP_WALK.slice(0, 3),
  3,
  ...CHECKUP_WALK.slice(3, 6),
  3,
  ...CHECKUP_WALK.slice(6),
];
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
  "buddy-checkup": CHECKUP_WALK,
  "buddy-memory": CHECKUP_WALK,
  "buddy-drain": CHECKUP_WALK,
  "buddy-nap": CHECKUP_WALK,
  "buddy-chirp": CHECKUP_WALK,
  "buddy-greeting": GREETING_WALK,
  "buddy-regions": GREETING_WALK,
};

describe("every rule a diagram draws can be used", () => {
  for (const id of Object.keys(WALKS) as DemoId[]) {
    test(id, async () => {
      const d = drive(id);
      for (const move of WALKS[id]) {
        if (typeof move === "string") {
          d.press(move);
          continue;
        }
        for (let passed = 0; passed < move; passed += 0.5) {
          d.step(0.5);
          await d.settle();
        }
      }
      const demo = DEMOS[id];
      const drawn = diagramChips(demo.config, demo.quietUpdates, demo.routines);
      expect([...d.fired].sort()).toEqual(drawn.sort());
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

describe("the buddy reacts to a press", () => {
  test("buddy-energy: a bump is a jolt only while awake takes it", () => {
    const d = drive("buddy-energy");
    d.press("BUMP (cost 1)");
    expect(d.reaction).toBe("ignored");
    d.press("POKE");
    expect(d.reaction).toBe("hop");
    d.press("BUMP (cost 1)");
    expect(d.reaction).toBe("bump");
    d.press("BUMP (cost 3)");
    expect(d.reaction).toBe("bump");
    expect(d.run.path).toBe("/resting");
    d.press("BUMP (cost 1)");
    expect(d.reaction).toBe("ignored");
    d.press("RECHARGE");
    expect(d.reaction).toBe("hop");
  });

  test("buddy-queue: stop and start send no event, and a stopped machine takes none", () => {
    const d = drive("buddy-queue");
    d.press("stop()");
    expect(d.reaction).toBeUndefined();
    d.press("POKE");
    expect(d.reaction).toBe("ignored");
    d.press("start() with wakes = 1");
    expect(d.reaction).toBeUndefined();
    d.press("POKE");
    expect(d.reaction).toBe("hop");
  });

  test("buddy-queue: a when that says no is a question mark", () => {
    const d = drive("buddy-queue");
    d.step(0.5);
    d.step(0.5);
    expect(d.run.path).toBe("/awake/wander");
    d.press("trigger_response (enter false)");
    expect(d.reaction).toBe("ignored");
    d.press("trigger_response (enter true)");
    expect(d.reaction).toBe("hop");
  });

  test("buddy-waking: a button that changes the code sends no event", () => {
    const d = drive("buddy-waking");
    d.press("Toggle cancel in exit");
    expect(d.reaction).toBeUndefined();
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

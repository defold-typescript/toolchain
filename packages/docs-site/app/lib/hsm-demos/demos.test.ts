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
    expect(activePaths("/on/dim")).toEqual(["/on", "/on/dim"]);
    expect(activePaths(undefined)).toEqual([]);
  });
});

describe("hsm tutorial demos", () => {
  test("every registry entry starts without throwing", () => {
    for (const id of Object.keys(DEMOS) as DemoId[]) {
      expect(() => drive(id), id).not.toThrow();
    }
  });

  test("nested-lamp: DIM while off is ignored", () => {
    const d = drive("nested-lamp");
    expect(d.run.path).toBe("/off");
    const mark = d.lines.length;
    d.press("DIM");
    expect(d.since(mark, "drop")).toEqual(["nobody handles DIM, so it is ignored"]);
    expect(d.run.path).toBe("/off");
  });

  test("nested-lamp: TOGGLE in on.dim climbs to on, then exits innermost first", () => {
    const d = drive("nested-lamp");
    d.press("TOGGLE");
    d.press("DIM");
    expect(d.run.path).toBe("/on/dim");
    const mark = d.lines.length;
    d.press("TOGGLE");
    expect(d.since(mark, "bubble", "exit", "enter")).toEqual([
      "/on/dim has no TOGGLE rule, asks its parent",
      "exit /on/dim",
      "exit /on",
      "enter /off",
    ]);
    expect(d.run.path).toBe("/off");
  });

  test("buddy: a bump that uses up the energy exits follow and alive, then enters resting", () => {
    const d = drive("buddy");
    d.press("SEE_PLAYER");
    expect(d.run.path).toBe("/alive/follow");
    expect(d.ctx.energy).toBe(3);
    const mark = d.lines.length;
    d.press("BUMP (cost 3)");
    expect(d.since(mark, "exit", "enter")).toEqual([
      "exit /alive/follow",
      "exit /alive",
      "enter /resting",
    ]);
    expect(d.run.path).toBe("/resting");
  });

  test("buddy: a small bump runs only the action", () => {
    const d = drive("buddy");
    expect(d.run.path).toBe("/alive/wander");
    const mark = d.lines.length;
    d.press("BUMP (cost 1)");
    expect(d.since(mark, "exit", "enter")).toEqual([]);
    expect(d.since(mark, "action")).toHaveLength(1);
    expect(d.ctx.energy).toBe(2);
    expect(d.run.path).toBe("/alive/wander");
  });

  test("buddy: SEE_PLAYER twice in follow restarts follow", () => {
    const d = drive("buddy");
    d.press("SEE_PLAYER");
    const mark = d.lines.length;
    d.press("SEE_PLAYER");
    expect(d.since(mark, "exit", "enter")).toEqual(["exit /alive/follow", "enter /alive/follow"]);
  });

  test("feet: walking off a ledge falls after the 0.1 s coyote timer", () => {
    const d = drive("feet");
    d.press("Walk off a ledge");
    d.step(0.05);
    expect(d.run.path).toBe("/coyote");
    const mark = d.lines.length;
    for (let i = 0; i < 10 && d.run.path === "/coyote"; i++) d.step(0.05);
    expect(d.run.path).toBe("/falling");
    expect(d.since(mark, "timer", "exit", "enter")).toEqual([
      "/coyote: 0.1 s timer fired",
      "exit /coyote",
      "enter /falling",
    ]);
  });

  test("feet: JUMP during coyote time still jumps", () => {
    const d = drive("feet");
    d.press("Walk off a ledge");
    d.step(0.05);
    expect(d.run.path).toBe("/coyote");
    d.press("JUMP");
    expect(d.run.path).toBe("/jumping");
  });

  test("sparkle: the children blink while the parent's 2 s timer runs straight through", () => {
    const d = drive("sparkle");
    d.press("STAR");
    const seen = new Set<string | undefined>();
    const visible = new Set<unknown>();
    // 39 ticks of 0.05 s: 1.95 s, just short of the parent's timer.
    for (let i = 0; i < 39; i++) {
      d.step(0.05);
      expect(d.run.instance.matches("/sparkling")).toBe(true);
      seen.add(d.run.path);
      visible.add(d.ctx.visible);
    }
    expect([...seen].sort()).toEqual(["/sparkling/hidden", "/sparkling/shown"]);
    expect([...visible].sort()).toEqual([false, true]);
    for (let i = 0; i < 3; i++) d.step(0.05);
    expect(d.run.path).toBe("/normal");
    expect(d.ctx.visible).toBe(true);
  });

  test("door: without cleanup the fade outlives opening and its late settle is ignored", () => {
    const d = drive("door");
    d.press("Toggle cancel in exit");
    expect(d.ctx.cleanup).toBe(false);
    d.press("Player walks in");
    expect(d.run.path).toBe("/opening");
    d.step(0.25);
    d.press("CLOSE");
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.run.path).toBe("/closed");
    expect(d.ctx.tint).toBe(0);
    expect(d.since(mark, "drop")).toEqual([
      "late settle(OPENED) ignored: /opening was already left",
    ]);
  });

  test("door: with cleanup in exit the closed door stays visible", () => {
    const d = drive("door");
    expect(d.ctx.cleanup).toBe(true);
    d.press("Player walks in");
    d.step(0.25);
    d.press("CLOSE");
    const mark = d.lines.length;
    d.step(0.5);
    expect(d.run.path).toBe("/closed");
    expect(d.ctx.tint).toBe(1);
    expect(d.since(mark, "drop")).toEqual([]);
  });

  test("level: a cached start queues LOADED and handles it before start returns", () => {
    const d = drive("level");
    d.press("start() with cached = true");
    expect(d.run.path).toBe("/playing");
    const texts = d.lines.map((line) => line.text);
    const queued = texts.indexOf("LOADED queued (machine is busy)");
    const returned = texts.indexOf('start() returned, path = "/playing"');
    expect(queued).toBeGreaterThanOrEqual(0);
    expect(returned).toBeGreaterThan(queued);
  });

  test("level: QUIT stops the machine and later events are ignored", () => {
    const d = drive("level");
    d.press("start() with cached = true");
    const beforeQuit = d.lines.length;
    d.press("QUIT");
    expect(d.run.path).toBeUndefined();
    expect(d.run.stopped).toBe(true);
    expect(d.since(beforeQuit, "note")).toContain("stopped, path = undefined");
    const mark = d.lines.length;
    d.press("LOADED");
    expect(d.since(mark, "drop")).toEqual(["LOADED ignored: machine is stopped"]);
  });
});

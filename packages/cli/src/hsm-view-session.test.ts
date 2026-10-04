import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { createSession, type Snapshot } from "./hsm-view-session";

const hsmSourceDir = requireHsmSourceDir();

let dir: string;
let sequence = 0;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-session-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(text: string): string {
  const file = path.join(dir, "main.ts");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function session(text: string) {
  return createSession({ file: write(text), hsmSourceDir });
}

function machine(body: string, key?: string): string {
  const call = key === undefined ? "defineMachine()" : `defineMachine(${JSON.stringify(key)})`;
  return `import { defineMachine } from "@defold-typescript/types/hsm";
export const machine = ${call}(${body});
`;
}

function kinds(snapshot: Snapshot): string[] {
  return snapshot.entries.map((entry) => entry.kind);
}

describe("createSession", () => {
  test("starts a machine and reports event transitions and accepted events", () => {
    const view = session(
      machine(`{
  initial: "/off",
  states: {
    off: { on: { TOGGLE: "/on" } },
    on: { on: { TOGGLE: "/off" } },
  },
}`),
    );

    expect(view.start({})).toMatchObject({
      path: "/off",
      active: ["/off"],
      leaves: ["/off"],
      accepts: ["TOGGLE"],
    });
    const toggled = view.send({ type: "TOGGLE" });
    expect(toggled.path).toBe("/on");
    expect(toggled.entered).toEqual(["/on"]);
    expect(toggled.fired).toEqual(["/off|on|TOGGLE|0"]);
    expect(toggled.entries).toContainEqual(
      expect.objectContaining({
        kind: "transition",
        t: 0,
        from: "/off",
        to: "/on",
        cause: "event",
      }),
    );
  });

  test("fires the accepted array entry and collects parent and parallel event keys", () => {
    const view = session(
      machine(`{
  initial: "/world",
  states: {
    world: {
      type: "parallel",
      on: { RESET: "/world" },
      states: {
        left: { initial: "/world/left/a", states: { a: { on: { GO: [{ target: "/world/left/b", guard: () => false }, { target: "/world/left/b" }] } }, b: {} } },
        right: { initial: "/world/right/x", states: { x: { on: { NEXT: "/world/right/y" } }, y: {} } },
      },
    },
  },
}`),
    );

    expect(view.start({}).accepts).toEqual(["GO", "NEXT", "RESET"]);
    expect(view.send({ type: "GO" }).fired).toEqual(["/world/left/a|on|GO|1"]);
    const reset = view.send({ type: "RESET" });
    expect(reset.fired).toEqual(["/world|on|RESET|0"]);
    expect(reset.accepts).toEqual(["GO", "NEXT", "RESET"]);
  });

  test("reports after, update and pass-through always rules at the advanced time", () => {
    const timers = session(
      machine(`{
  initial: "/a",
  states: { a: { after: { 0.5: "/b" } }, b: { update: () => "/c" }, c: {} },
}`),
    );
    timers.start({});
    const after = timers.update(0.5);
    expect(after).toMatchObject({ path: "/b", t: 0.5, fired: ["/a|after|0.5|0"] });
    const update = timers.update(0.25);
    expect(update).toMatchObject({ path: "/c", t: 0.75, fired: ["/b|update"] });

    const always = session(
      machine(`{
  initial: "/idle",
  states: { idle: { on: { GO: "/a" } }, a: { always: "/b" }, b: { always: "/c" }, c: {} },
}`),
    );
    always.start({});
    const moved = always.send({ type: "GO" });
    expect(moved.path).toBe("/c");
    expect(moved.active).toEqual(["/c"]);
    expect(moved.entered).toEqual(["/a", "/b", "/c"]);
    expect(moved.fired).toEqual(["/idle|on|GO|0", "/a|always|0", "/b|always|0"]);
  });

  test("names the after rule each parallel region fires in one update", () => {
    const regions = session(
      machine(`{
  initial: "/p",
  states: {
    p: {
      type: "parallel",
      states: {
        x: { initial: "/p/x/a", states: { a: { after: { 1: "/p/x/b" } }, b: {} } },
        y: { initial: "/p/y/c", states: { c: { after: { 1: "/p/y/d" } }, d: {} } },
      },
    },
  },
}`),
    );
    regions.start({});
    expect(regions.update(1)).toMatchObject({
      leaves: ["/p/x/b", "/p/y/d"],
      fired: ["/p/x/a|after|1|0", "/p/y/c|after|1|0"],
    });

    const leaving = session(
      machine(`{
  initial: "/p",
  states: {
    p: {
      type: "parallel",
      states: {
        x: { initial: "/p/x/a", states: { a: {} } },
        y: { initial: "/p/y/c", states: { c: { after: { 1: "/over" } } } },
      },
    },
    over: {},
  },
}`),
    );
    leaving.start({});
    expect(leaving.update(1)).toMatchObject({ path: "/over", fired: ["/p/y/c|after|1|0"] });

    const moved = session(
      machine(`{
  initial: "/p",
  states: {
    p: {
      type: "parallel",
      states: {
        x: { initial: "/p/x/a", states: { a: { update: () => "/p/x/b", after: { 1: "/p/x/b" } }, b: {} } },
        y: { initial: "/p/y/c", states: { c: { after: { 1: "/over" } } } },
      },
    },
    over: {},
  },
}`),
    );
    moved.start({});
    expect(moved.update(1)).toMatchObject({
      path: "/over",
      fired: ["/p/x/a|update", "/p/y/c|after|1|0"],
    });

    const looping = session(
      machine(`{
  initial: "/p",
  states: { p: { initial: "/p/a", states: { a: { after: { 1: "/p" } } } } },
}`),
    );
    looping.start({});
    expect(looping.update(1)).toMatchObject({ entered: ["/p", "/p/a"], fired: ["/p/a|after|1|0"] });
    expect(looping.update(1)).toMatchObject({ entered: ["/p", "/p/a"], fired: ["/p/a|after|1|0"] });
  });

  test("skips the due timers on a moved region's ancestor chain when naming a later region's after rule", () => {
    const updated = session(
      machine(`{
  initial: "/p",
  states: {
    p: {
      type: "parallel",
      states: {
        x: { initial: "/p/x/a", after: { 1: "/p/x/b" }, states: { a: { update: () => "/p/x/b" }, b: {} } },
        y: { initial: "/p/y/c", states: { c: { after: { 1: "/over" } } } },
      },
    },
    over: {},
  },
}`),
    );
    updated.start({});
    const afterUpdate = updated.update(1);
    expect(afterUpdate.path).toBe("/over");
    expect(afterUpdate.fired).toEqual(["/p/x/a|update", "/p/y/c|after|1|0"]);

    const timed = session(
      machine(`{
  initial: "/p",
  states: {
    p: {
      type: "parallel",
      states: {
        x: { initial: "/p/x/a", after: { 1: "/p/x/b" }, states: { a: { after: { 1: "/p/x/b" } }, b: {} } },
        y: { initial: "/p/y/c", states: { c: { after: { 1: "/over" } } } },
      },
    },
    over: {},
  },
}`),
    );
    timed.start({});
    const afterTimer = timed.update(1);
    expect(afterTimer.path).toBe("/over");
    expect(afterTimer.fired).toEqual(["/p/x/a|after|1|0", "/p/y/c|after|1|0"]);

    const parallelTimer = session(
      machine(`{
  initial: "/p",
  states: {
    p: {
      type: "parallel",
      after: { 1: "/over" },
      states: {
        x: { initial: "/p/x/a", states: { a: { update: () => "/p/x/b" }, b: {} } },
        y: { initial: "/p/y/c", states: { c: { after: { 1: "/done" } } } },
      },
    },
    over: {},
    done: {},
  },
}`),
    );
    parallelTimer.start({});
    const afterParallel = parallelTimer.update(1);
    expect(afterParallel.path).toBe("/done");
    expect(afterParallel.fired).toEqual(["/p/x/a|update", "/p/y/c|after|1|0"]);
  });

  test("captures engine calls for one snapshot and records unhandled events", () => {
    const view = session(
      machine(`{
  initial: "/idle",
  states: { idle: { on: { PLAY: { actions: () => sprite.play_flipbook("#sprite", "walk") } } } },
}`),
    );
    view.start({});
    const played = view.send({ type: "PLAY" });
    expect(played.entries).toContainEqual(
      expect.objectContaining({
        kind: "engine",
        api: "sprite.play_flipbook",
        args: ["#sprite", "walk"],
      }),
    );
    const ignored = view.send({ type: "MISSING" });
    expect(kinds(ignored)).toContain("unhandled");
    expect(ignored.entries.some((entry) => entry.kind === "engine")).toBe(false);
  });

  test("edits only existing primitive ctx leaves and serializes cycles without functions", () => {
    const view = session(
      machine(`{
  initial: "/idle",
  states: { idle: {} },
}`),
    );
    const ctx: Record<string, unknown> = {
      velocity: { x: 1, helper: () => 1 },
      list: [1, 2],
    };
    ctx.self = ctx;
    view.start(ctx);

    const edited = view.editCtx(["velocity", "x"], 3);
    expect(edited.ctx).toEqual({
      velocity: { x: 3 },
      list: [1, 2],
      self: "[circular]",
    });
    expect(kinds(edited)).toContain("edit");

    for (const [target, value] of [
      [["velocity"], 4],
      [["list"], 4],
      [["missing"], 4],
      [["velocity", "x"], { bad: true }],
    ] as const) {
      const rejected = view.editCtx([...target], value);
      expect(rejected.error).toBeDefined();
      expect(rejected.ctx).toEqual({
        velocity: { x: 3 },
        list: [1, 2],
        self: "[circular]",
      });
    }
  });

  test("halts after a throwing hook until start is called again", () => {
    const view = session(
      machine(`{
  initial: "/safe",
  states: { safe: { on: { BREAK: { target: "/broken", actions: () => { throw new Error("boom"); } } } }, broken: {} },
}`),
    );
    view.start({});
    const broken = view.send({ type: "BREAK" });
    expect(broken.error).toBe("boom");
    expect(broken.running).toBe(false);
    expect(kinds(broken)).toContain("error");
    expect(view.send({ type: "BREAK" }).error).toBe("boom");
    const restarted = view.start({});
    expect(restarted).toMatchObject({ running: true, path: "/safe" });
    expect(restarted.error).toBeUndefined();
  });

  test("loads a reload while halted and runs it on the next start", () => {
    const source = (action: string) =>
      machine(`{
  initial: "/safe",
  states: { safe: { on: { BREAK: { target: "/broken", actions: () => { ${action} } } } }, broken: {} },
}`);
    const fixed = source("");
    const file = write(source(`throw new Error("boom");`));
    const view = createSession({ file, hsmSourceDir });
    view.start({});
    expect(view.send({ type: "BREAK" }).error).toBe("boom");
    writeFileSync(file, fixed);
    const reloaded = view.reload();
    expect(reloaded).toMatchObject({ running: false, error: "boom" });
    expect(kinds(reloaded)).toContain("reload");
    expect(view.send({ type: "BREAK" }).error).toBe("boom");
    view.start({});
    const ran = view.send({ type: "BREAK" });
    expect(ran.path).toBe("/broken");
    expect(ran.error).toBeUndefined();
    expect(view.index().files[0]?.text).toBe(fixed);
  });

  test("reloads keyed machines in place, restarts unkeyed machines and survives a failed reload", () => {
    const keyedName = `reload-${++sequence}`;
    const keyedSource = (target: string) =>
      machine(
        `{
  initial: "/a",
  states: { a: { on: { GO: "${target}" } }, b: {}, c: {} },
}`,
        keyedName,
      );
    const keyedFile = write(keyedSource("/b"));
    const keyed = createSession({ file: keyedFile, hsmSourceDir });
    keyed.start({ count: 1 });
    writeFileSync(keyedFile, keyedSource("/c"));
    const kept = keyed.reload();
    expect(kept).toMatchObject({ path: "/a", running: true });
    expect(kinds(kept)).toContain("reload");
    expect(keyed.send({ type: "GO" }).path).toBe("/c");

    const unkeyedSource = (initial: string) =>
      machine(`{ initial: "${initial}", states: { a: {}, b: {} } }`);
    const unkeyedFile = path.join(dir, "unkeyed.ts");
    writeFileSync(unkeyedFile, unkeyedSource("/a"));
    const unkeyed = createSession({ file: unkeyedFile, hsmSourceDir });
    unkeyed.start({ count: 2 });
    writeFileSync(unkeyedFile, unkeyedSource("/b"));
    const restarted = unkeyed.reload();
    expect(restarted).toMatchObject({ path: "/b", ctx: { count: 2 }, running: true });
    expect(restarted.entries).toContainEqual(
      expect.objectContaining({ kind: "reload", reason: "unkeyed machine restarted" }),
    );

    writeFileSync(unkeyedFile, "export const = ;\n");
    const failed = unkeyed.reload();
    expect(failed.error).toContain(unkeyedFile);
    expect(failed.running).toBe(true);
    expect(unkeyed.snapshot().path).toBe("/b");
  });

  test("switches machines fresh and exposes the picked machine's source index", () => {
    const file = write(
      `import { defineMachine } from "@defold-typescript/types/hsm";
export const lamp = defineMachine("lamp")({ initial: "/off", states: { off: { on: { TOGGLE: "/on" } }, on: {} } });
export const door = defineMachine("door")({ initial: "/closed", states: { closed: {}, open: {} } });
`,
    );
    const view = createSession({ file, hsmSourceDir });
    expect(view.start({}).machines).toEqual(["lamp", "door"]);
    view.send({ type: "TOGGLE" });
    const door = view.pick("door");
    expect(door).toMatchObject({ picked: "door", path: "/closed", running: true });
    expect(view.pick("lamp").path).toBe("/off");

    const index = view.index();
    expect(index.files[0]?.path).toBe(file);
    expect(index.states["/off"]).toBeDefined();
    expect(index.onKeys["/off"]?.TOGGLE).toBeDefined();
  });
});

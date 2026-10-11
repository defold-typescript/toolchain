import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { ruleId } from "./hsm-view-index";
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

function privateTurret(key: string, fields: string): string {
  return `import { defineMachine } from "@defold-typescript/types/hsm";
export const turret = defineMachine(${JSON.stringify(key)})({
  privateCtx: () => ({ ${fields} }),
  initial: "/idle",
  states: {
    idle: {
      on: {
        FIRE: {
          run: (ctx) => {
            ctx.heat += 1;
            ctx.shots.push(ctx.heat);
          },
        },
      },
    },
  },
});
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
    expect(toggled.fired).toEqual([ruleId("/off", "on", "TOGGLE", 0)]);
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
        left: { initial: "/world/left/a", states: { a: { on: { GO: [{ to: "/world/left/b", when: () => false }, { to: "/world/left/b" }] } }, b: {} } },
        right: { initial: "/world/right/x", states: { x: { on: { NEXT: "/world/right/y" } }, y: {} } },
      },
    },
  },
}`),
    );

    expect(view.start({}).accepts).toEqual(["GO", "NEXT", "RESET"]);
    const go = view.send({ type: "GO" });
    expect(go.fired).toEqual([ruleId("/world/left/a", "on", "GO", 1)]);
    expect(go.rejected).toEqual([ruleId("/world/left/a", "on", "GO", 0)]);
    const reset = view.send({ type: "RESET" });
    expect(reset.fired).toEqual([ruleId("/world", "on", "RESET", 0)]);
    expect(reset.accepts).toEqual(["GO", "NEXT", "RESET"]);
  });

  test("lists the on rules whose when rejected the event", () => {
    const bubbled = session(
      machine(`{
  initial: "/p",
  states: {
    p: {
      initial: "/p/c",
      on: { GO: [{ to: "/q" }] },
      states: { c: { on: { GO: [{ to: "/q", when: () => false }, { to: "/q", when: () => false }] } } },
    },
    q: {},
  },
}`),
    );
    bubbled.start({});
    const sent = bubbled.send({ type: "GO" });
    expect(sent.rejected).toEqual([ruleId("/p/c", "on", "GO", 0), ruleId("/p/c", "on", "GO", 1)]);
    expect(sent.fired).toEqual([ruleId("/p", "on", "GO", 0)]);

    const plain = session(
      machine(`{
  initial: "/a",
  states: { a: { on: { GO: "/b" } }, b: { on: { GO: [{ to: "/a" }] } } },
}`),
    );
    plain.start({});
    expect(plain.send({ type: "GO" }).rejected).toEqual([]);
    expect(plain.send({ type: "GO" }).rejected).toEqual([]);

    const stopped = session(
      machine(`{
  initial: "/a",
  states: { a: { on: { GO: [{ to: "/b" }, { to: "/b", when: () => false }] } }, b: {} },
}`),
    );
    stopped.start({});
    const taken = stopped.send({ type: "GO" });
    expect(taken.fired).toEqual([ruleId("/a", "on", "GO", 0)]);
    expect(taken.rejected).toEqual([]);

    const refused = session(
      machine(`{
  initial: "/a",
  states: { a: { on: { GO: [{ to: "/b", when: () => false }, { to: "/b", when: () => 0 as unknown as boolean }] } }, b: {} },
}`),
    );
    refused.start({});
    const none = refused.send({ type: "GO" });
    expect(none.rejected).toEqual([ruleId("/a", "on", "GO", 0), ruleId("/a", "on", "GO", 1)]);
    expect(none.fired).toEqual([]);
    expect(kinds(none)).toContain("unhandled");
    expect(refused.send({ type: "OTHER" }).rejected).toEqual([]);
    expect(refused.update(0.1).rejected).toEqual([]);

    const reading = session(
      machine(`{
  initial: "/a",
  states: { a: { on: { GO: [{ to: "/b", when: (_ctx, event) => (event as { n: number }).n > 1 }] } }, b: {} },
}`),
    );
    reading.start({});
    const low = reading.send({ type: "GO", n: 0 });
    expect(low.rejected).toEqual([ruleId("/a", "on", "GO", 0)]);
    expect(low.path).toBe("/a");
    const high = reading.send({ type: "GO", n: 2 });
    expect(high.rejected).toEqual([]);
    expect(high.fired).toEqual([ruleId("/a", "on", "GO", 0)]);
    expect(high.path).toBe("/b");
  });

  test("leaves out the rules a can call checked", () => {
    const asked = session(
      machine(`{
  initial: "/a",
  states: {
    a: { on: { GO: "/b" } },
    b: {
      enter: (_ctx, m) => { m.can({ type: "LOCKED" }); },
      on: { LOCKED: [{ to: "/a", when: () => false }] },
    },
  },
}`),
    );
    asked.start({});
    const moved = asked.send({ type: "GO" });
    expect(moved.fired).toEqual([ruleId("/a", "on", "GO", 0)]);
    expect(moved.rejected).toEqual([]);
    expect(asked.send({ type: "LOCKED" }).rejected).toEqual([ruleId("/b", "on", "LOCKED", 0)]);

    const mixed = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      on: {
        GO: [{ to: "/b", when: () => false }, { run: (_ctx, _event, m) => { m.can({ type: "LOCKED" }); } }],
        LOCKED: [{ to: "/b", when: () => false }],
      },
    },
    b: {},
  },
}`),
    );
    mixed.start({});
    const both = mixed.send({ type: "GO" });
    expect(both.rejected).toEqual([ruleId("/a", "on", "GO", 0)]);
    expect(both.fired).toEqual([ruleId("/a", "on", "GO", 1)]);

    const rooted = session(
      machine(`{
  initial: "/a",
  enter: (_ctx, m) => { m.can({ type: "GO" }); },
  on: { GO: [{ to: "/b", when: () => false }] },
  states: { a: {}, b: {} },
}`),
    );
    expect(rooted.start({}).rejected).toEqual([]);
    expect(rooted.send({ type: "GO" }).rejected).toEqual([ruleId("", "on", "GO", 0)]);

    const ticking = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      update: (_ctx, _dt, m) => { m.can({ type: "GO" }); return undefined; },
      on: { GO: [{ to: "/b", when: () => false }] },
    },
    b: {},
  },
}`),
    );
    ticking.start({});
    expect(ticking.update(0.1).rejected).toEqual([]);

    const throwing = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      on: {
        ASK: { run: (_ctx, _event, m) => { try { m.can({ type: "BOOM" }); } catch {} } },
        BOOM: [{ to: "/b", when: () => { throw new Error("boom"); } }],
        GO: [{ to: "/b", when: () => false }],
      },
    },
    b: {},
  },
}`),
    );
    throwing.start({});
    throwing.send({ type: "ASK" });
    expect(throwing.send({ type: "GO" }).rejected).toEqual([ruleId("/a", "on", "GO", 0)]);

    const nested = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      on: {
        ASK: { run: (_ctx, _event, m) => { m.can({ type: "OUTER" }); } },
        OUTER: [
          { to: "/b", when: (_ctx, _event, m) => (m as unknown as { can: (event: { type: string }) => boolean }).can({ type: "INNER" }) },
          { to: "/b", when: () => false },
        ],
        INNER: [{ to: "/b", when: () => false }],
      },
    },
    b: {},
  },
}`),
    );
    nested.start({});
    expect(nested.send({ type: "ASK" }).rejected).toEqual([]);
  });

  test("hands a guard the machine", () => {
    const view = session(
      machine(`{
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
                GO: [{ to: "/alive/move/jump", when: (_ctx, _event, machine) => machine.matches("/alive/posture/standing") }],
                PING: "/alive/move/jump",
              },
            },
            jump: { on: { BACK: "/alive/move/idle" } },
          },
        },
        posture: {
          initial: "/alive/posture/standing",
          states: {
            standing: { on: { HIT: "/alive/posture/crouching" } },
            crouching: {
              always: [{ to: "/alive/posture/standing", when: (_ctx, machine) => machine.matches("/alive/move/jump") }],
            },
          },
        },
      },
    },
  },
}`),
    );
    view.start({});
    view.send({ type: "HIT" });
    const dropped = view.send({ type: "GO" });
    expect(dropped.rejected).toEqual([ruleId("/alive/move/idle", "on", "GO", 0)]);
    expect(dropped.leaves).toEqual(["/alive/move/idle", "/alive/posture/crouching"]);
    expect(kinds(dropped)).not.toContain("error");
    const pinged = view.send({ type: "PING" });
    expect(pinged.fired).toContain(ruleId("/alive/posture/crouching", "always", 0));
    expect(pinged.leaves).toEqual(["/alive/move/jump", "/alive/posture/standing"]);
  });

  test("hands a guard hasTag", () => {
    const view = session(
      machine(`{
  initial: "/alive",
  states: {
    alive: {
      initial: "/alive/walk",
      on: {
        HIT: [{ to: "/hurt", when: (_ctx, _event, machine) => !machine.hasTag("invulnerable") }],
      },
      states: {
        walk: { on: { ROLL: "/alive/roll" } },
        roll: { tags: ["invulnerable"], on: { LAND: "/alive/walk" } },
      },
    },
    hurt: {},
  },
}`),
    );
    view.start({});
    view.send({ type: "ROLL" });
    const dropped = view.send({ type: "HIT" });
    expect(dropped.rejected).toEqual([ruleId("/alive", "on", "HIT", 0)]);
    expect(dropped.leaves).toEqual(["/alive/roll"]);
    expect(kinds(dropped)).not.toContain("error");
    view.send({ type: "LAND" });
    expect(view.send({ type: "HIT" }).leaves).toEqual(["/hurt"]);
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
    expect(after).toMatchObject({ path: "/b", t: 0.5, fired: [ruleId("/a", "after", "0.5")] });
    const update = timers.update(0.25);
    expect(update).toMatchObject({ path: "/c", t: 0.75, fired: [ruleId("/b", "update")] });

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
    expect(moved.fired).toEqual([
      ruleId("/idle", "on", "GO", 0),
      ruleId("/a", "always", 0),
      ruleId("/b", "always", 0),
    ]);
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
      fired: [ruleId("/p/x/a", "after", "1"), ruleId("/p/y/c", "after", "1")],
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
    expect(leaving.update(1)).toMatchObject({
      path: "/over",
      fired: [ruleId("/p/y/c", "after", "1")],
    });

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
      fired: [ruleId("/p/x/a", "update"), ruleId("/p/y/c", "after", "1")],
    });

    const looping = session(
      machine(`{
  initial: "/p",
  states: { p: { initial: "/p/a", states: { a: { after: { 1: "/p" } } } } },
}`),
    );
    looping.start({});
    expect(looping.update(1)).toMatchObject({
      entered: ["/p", "/p/a"],
      fired: [ruleId("/p/a", "after", "1")],
    });
    expect(looping.update(1)).toMatchObject({
      entered: ["/p", "/p/a"],
      fired: [ruleId("/p/a", "after", "1")],
    });
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
    expect(afterUpdate.fired).toEqual([ruleId("/p/x/a", "update"), ruleId("/p/y/c", "after", "1")]);

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
    expect(afterTimer.fired).toEqual([
      ruleId("/p/x/a", "after", "1"),
      ruleId("/p/y/c", "after", "1"),
    ]);

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
    expect(afterParallel.fired).toEqual([
      ruleId("/p/x/a", "update"),
      ruleId("/p/y/c", "after", "1"),
    ]);
  });

  test("names the after list entry that fired", () => {
    const ordered = session(
      machine(`{
  initial: "/a",
  states: {
    a: { after: [{ delay: 2, to: "/b" }, { delay: 1, to: "/c" }] },
    b: {},
    c: {},
  },
}`),
    );
    ordered.start({});
    expect(ordered.update(1)).toMatchObject({ path: "/c", fired: [ruleId("/a", "after", 1)] });

    const computed = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      after: [
        {
          delay: (ctx) => {
            ctx.reads += 1;
            return ctx.wait;
          },
          to: "/b",
        },
      ],
    },
    b: {},
  },
}`),
    );
    computed.start({ wait: 0.5, reads: 0 });
    expect(computed.update(0.25)).toMatchObject({ path: "/a", fired: [] });
    expect(computed.update(0.25)).toMatchObject({
      path: "/b",
      fired: [ruleId("/a", "after", 0)],
      ctx: { reads: 1 },
    });

    const ran = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      after: {
        1: {
          to: "/b",
          run: (ctx) => {
            ctx.ran = true;
          },
        },
      },
    },
    b: {},
  },
}`),
    );
    ran.start({ ran: false });
    expect(ran.update(1)).toMatchObject({
      path: "/b",
      fired: [ruleId("/a", "after", "1")],
      ctx: { ran: true },
    });

    const staying = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      after: [
        {
          delay: 1,
          run: (ctx) => {
            ctx.n += 1;
          },
        },
      ],
    },
  },
}`),
    );
    staying.start({ n: 0 });
    const stayed = staying.update(1);
    expect(stayed).toMatchObject({
      path: "/a",
      fired: [ruleId("/a", "after", 0)],
      ctx: { n: 1 },
    });
    expect(kinds(stayed)).not.toContain("transition");

    const empty = 'has an after timer with no "to" and no "run"';
    expect(() =>
      session(machine(`{ initial: "/a", states: { a: { after: [{ delay: 1 }] } } }`)),
    ).toThrow(empty);
    expect(() =>
      session(machine(`{ initial: "/a", states: { a: { after: { 1: {} } } } }`)),
    ).toThrow(empty);
  });

  test("names the every entry that ran", () => {
    const record = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      every: {
        0.5: (ctx) => {
          ctx.n += 1;
        },
      },
    },
  },
}`),
    );
    record.start({ n: 0 });
    expect(record.update(0.25)).toMatchObject({ path: "/a", fired: [] });
    const repeated = record.update(0.25);
    expect(repeated).toMatchObject({
      path: "/a",
      fired: [ruleId("/a", "every", "0.5")],
      ctx: { n: 1 },
    });
    expect(kinds(repeated)).not.toContain("transition");

    const listed = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      every: [
        {
          delay: 1,
          run: [
            (ctx) => {
              ctx.a += 1;
            },
            (ctx) => {
              ctx.b += 1;
            },
          ],
        },
        {
          delay: (ctx) => ctx.rate,
          run: (ctx) => {
            ctx.c += 1;
          },
        },
      ],
    },
  },
}`),
    );
    listed.start({ a: 0, b: 0, c: 0, rate: 0.5 });
    expect(listed.update(0.5)).toMatchObject({ fired: [ruleId("/a", "every", 1)] });
    expect(listed.update(0.5)).toMatchObject({
      fired: [ruleId("/a", "every", 0), ruleId("/a", "every", 1)],
      ctx: { a: 1, b: 1, c: 2 },
    });

    const timed = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      every: {
        1: (ctx) => {
          ctx.n += 1;
        },
      },
      after: { 1: "/b" },
    },
    b: {},
  },
}`),
    );
    timed.start({ n: 0 });
    expect(timed.update(1)).toMatchObject({
      path: "/b",
      fired: [ruleId("/a", "every", "1"), ruleId("/a", "after", "1")],
    });

    const empty = 'has an every entry with no "run"';
    expect(() =>
      session(machine(`{ initial: "/a", states: { a: { every: [{ delay: 1 }] } } }`)),
    ).toThrow(empty);
    expect(() =>
      session(machine(`{ initial: "/a", states: { a: { every: { 1: [] } } } }`)),
    ).toThrow(empty);
  });

  test("lists the after timer its when holds back", () => {
    const moving = session(
      machine(`{
  initial: "/a",
  states: {
    a: { after: { 1: { to: "/b", when: (ctx) => ctx.open } } },
    b: {},
  },
}`),
    );
    moving.start({ open: false });
    expect(moving.update(0.5)).toMatchObject({ fired: [], rejected: [] });
    const held = { path: "/a", fired: [], rejected: [ruleId("/a", "after", "1")] };
    expect(moving.update(0.5)).toMatchObject(held);
    expect(moving.update(0.1)).toMatchObject(held);
    moving.editCtx(["open"], true);
    expect(moving.update(0.1)).toMatchObject({
      path: "/b",
      fired: [ruleId("/a", "after", "1")],
      rejected: [],
    });

    const staying = session(
      machine(`{
  initial: "/a",
  states: {
    a: {
      after: [
        {
          delay: 1,
          when: (ctx) => ctx.open,
          run: (ctx) => {
            ctx.n += 1;
          },
        },
      ],
    },
  },
}`),
    );
    staying.start({ open: false, n: 0 });
    expect(staying.update(1)).toMatchObject({
      rejected: [ruleId("/a", "after", 0)],
      ctx: { n: 0 },
    });
    staying.editCtx(["open"], true);
    const ran = staying.update(0.1);
    expect(ran).toMatchObject({
      fired: [ruleId("/a", "after", 0)],
      rejected: [],
      ctx: { n: 1 },
    });
    expect(kinds(ran)).not.toContain("transition");
  });

  test("runs the run of an always rule", () => {
    const moved = session(
      machine(`{
  initial: "/idle",
  states: {
    idle: { on: { GO: "/a" } },
    a: {
      always: {
        to: "/b",
        run: (ctx) => {
          ctx.ran = true;
        },
      },
    },
    b: {},
  },
}`),
    );
    moved.start({ ran: false });
    const settled = moved.send({ type: "GO" });
    expect(settled).toMatchObject({ path: "/b", ctx: { ran: true } });
    expect(settled.fired).toContain(ruleId("/a", "always", 0));
  });

  test("captures engine calls for one snapshot and records unhandled events", () => {
    const view = session(
      machine(`{
  initial: "/idle",
  states: { idle: { on: { PLAY: { run: () => sprite.play_flipbook("#sprite", "walk") } } } },
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
  states: { safe: { on: { BREAK: { to: "/broken", run: () => { throw new Error("boom"); } } } }, broken: {} },
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
  states: { safe: { on: { BREAK: { to: "/broken", run: () => { ${action} } } } }, broken: {} },
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

  test("starts a private machine from its public fields and shows every field", () => {
    const key = `private-${++sequence}`;
    const view = session(privateTurret(key, "heat: 0, shots: []"));

    const started = view.start({ rate: 2 });
    expect(started.machines).toEqual([key]);
    expect(started.ctx).toEqual({ rate: 2, heat: 0, shots: [] });

    const fired = view.send({ type: "FIRE" });
    expect(fired.ctx).toEqual({ rate: 2, heat: 1, shots: [1] });
    expect(fired.fired).toEqual([ruleId("/idle", "on", "FIRE", 0)]);
  });

  test("reloads a keyed private machine with the fields a new factory adds and the values it has", () => {
    const key = `private-${++sequence}`;
    const file = write(privateTurret(key, "heat: 0, shots: []"));
    const view = createSession({ file, hsmSourceDir });
    view.start({ rate: 2 });
    view.send({ type: "FIRE" });

    writeFileSync(file, privateTurret(key, "heat: 0, shots: [], armor: 5"));
    expect(kinds(view.reload())).toContain("reload");
    expect(view.update(0).ctx).toEqual({ rate: 2, heat: 1, shots: [1], armor: 5 });
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

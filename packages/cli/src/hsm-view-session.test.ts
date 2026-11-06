import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { ruleId } from "./hsm-view-index";
import { createSession, type Snapshot } from "./hsm-view-session";

const hsmSourceDir = requireLibrarySourceDir(HSM_LIBRARY);
const ecsSourceDir = requireLibrarySourceDir(ECS_LIBRARY);

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
  return createSession({ file: write(text), hsmSourceDir, ecsSourceDir });
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
    const view = createSession({ file, hsmSourceDir, ecsSourceDir });
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
    const keyed = createSession({ file: keyedFile, hsmSourceDir, ecsSourceDir });
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
    const unkeyed = createSession({ file: unkeyedFile, hsmSourceDir, ecsSourceDir });
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
    const view = createSession({ file, hsmSourceDir, ecsSourceDir });
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
    const view = createSession({ file, hsmSourceDir, ecsSourceDir });
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

const SCRIPT_IMPORT = 'import { defineScript } from "@defold-typescript/types";';
const HSM_IMPORT = 'import { defineMachine } from "@defold-typescript/types/hsm";';
const ECS_IMPORT = 'from "@defold-typescript/types/ecs"';

function prints(snapshot: Snapshot): string[] {
  return snapshot.entries.flatMap((entry) => (entry.kind === "print" ? [entry.text] : []));
}

describe("createSession run", () => {
  test("runs the script's init on creation over its properties and lists the worlds it builds", () => {
    const view = session(`${SCRIPT_IMPORT}
import { system, world } ${ECS_IMPORT};
const move = system("move")({ update() {} });
export const glow = system()({ update() {} });
export default defineScript({
  properties: { speed: 2 },
  init(self) {
    print(\`speed \${self.speed}\`);
    return { garden: world(move, glow) };
  },
});
`);
    const snapshot = view.snapshot();

    expect(snapshot).toMatchObject({
      worlds: ["garden"],
      world: "garden",
      frame: 0,
      t: 0,
      machines: [],
      running: true,
    });
    expect(snapshot.systems.map((system) => system.name)).toEqual(["move", "glow"]);
    expect(prints(snapshot)).toEqual(["speed 2"]);
  });

  test("calls the script's update, then the started machine's, on one clock that start leaves running", () => {
    const view = session(`${SCRIPT_IMPORT}
${HSM_IMPORT}
import { system, world } ${ECS_IMPORT};
const tick = system("tick")({ update(dt) { print(\`world \${dt}\`); } });
export const lamp = defineMachine()({
  initial: "/on",
  states: { on: { update: (_ctx, dt) => { print(\`machine \${dt}\`); return undefined; } } },
});
export default defineScript({
  init() { return { garden: world(tick) }; },
  update(self, dt) {
    print(\`script \${dt}\`);
    self.garden.update(dt);
  },
});
`);

    const first = view.update(0.5);
    expect(prints(first)).toEqual(["script 0.5", "world 0.5"]);
    expect(first).toMatchObject({ t: 0.5, frame: 1 });
    view.update(0.5);
    view.update(0.5);

    expect(view.start({})).toMatchObject({ t: 1.5, frame: 3, path: "/on", running: true });
    const both = view.update(0.5);
    expect(prints(both)).toEqual(["script 0.5", "world 0.5", "machine 0.5"]);
    expect(both).toMatchObject({ t: 2, frame: 4 });
  });

  test("updates each world when the file exports no script", () => {
    const view = session(`import { system, world } ${ECS_IMPORT};
export const left = world(system()({ update(dt) { print(\`left \${dt}\`); } }));
export const right = world(system()({ update(dt) { print(\`right \${dt}\`); } }));
`);

    const updated = view.update(0.5);
    expect(prints(updated)).toEqual(["left 0.5", "right 0.5"]);
    expect(updated).toMatchObject({ worlds: ["left", "right"], world: "left", t: 0.5, frame: 1 });
  });

  test("logs the entities the picked world's systems gain and lose", () => {
    const view = session(`${SCRIPT_IMPORT}
import { addEntity, processingSystem, removeEntity, requireAll, world } ${ECS_IMPORT};
const count = processingSystem("count")(requireAll("n"), { process() {} });
export default defineScript({
  init() { return { garden: world(count, { n: 1 }, { n: 2 }), frames: 0 }; },
  update(self, dt) {
    self.frames += 1;
    if (self.frames === 1) {
      addEntity(self.garden, { n: 3 });
    } else {
      removeEntity(self.garden, self.garden.entities[0]);
    }
    self.garden.update(dt);
  },
});
`);

    const joined = view.update(0.25);
    expect(joined.entries.filter((entry) => entry.kind === "join")).toEqual([
      { kind: "join", t: 0.25, system: 1, entity: 3 },
    ]);
    const left = view.update(0.25);
    expect(left.entries.filter((entry) => entry.kind === "leave")).toEqual([
      { kind: "leave", t: 0.5, system: 1, entity: 1 },
    ]);
  });

  test("restart reruns the files and init, resets the clock and entity ids, stops the machine and reseeds math.random", () => {
    const view = session(`${SCRIPT_IMPORT}
${HSM_IMPORT}
import { addEntity, world } ${ECS_IMPORT};
export const lamp = defineMachine()({ initial: "/on", states: { on: {} } });
export default defineScript({
  init() {
    print(\`roll \${math.random()}\`);
    return { garden: world({ n: 1 }, { n: 2 }) };
  },
  update(self, dt) {
    addEntity(self.garden, { n: 3 });
    self.garden.update(dt);
  },
});
`);
    const roll = prints(view.snapshot());
    view.start({});
    view.update(0.1);
    view.update(0.1);
    view.update(0.1);
    expect(view.snapshot().entities.map((entity) => entity.id)).toEqual([1, 2, 3, 4, 5]);

    const restarted = view.restart();
    expect(restarted).toMatchObject({ t: 0, frame: 0, path: undefined, running: true });
    expect(restarted.machines).toEqual(["lamp"]);
    expect(prints(restarted)).toEqual(roll);
    expect(restarted.entities.map((entity) => entity.id)).toEqual([1, 2]);
    expect(view.update(0.1)).toMatchObject({ frame: 1, path: undefined });
  });

  test("halts on a throw in the script's update or a system until restart, which start does not continue", () => {
    const scriptThrows = session(`${SCRIPT_IMPORT}
${HSM_IMPORT}
import { world } ${ECS_IMPORT};
export const lamp = defineMachine()({ initial: "/on", states: { on: {} } });
export default defineScript({
  init() { return { garden: world(), frames: 0 }; },
  update(self, dt) {
    self.frames += 1;
    if (self.frames === 2) {
      throw new Error("script broke");
    }
    self.garden.update(dt);
  },
});
`);
    scriptThrows.update(0.5);
    const broken = scriptThrows.update(0.5);
    expect(broken).toMatchObject({ running: false, error: "script broke", t: 1, frame: 2 });
    expect(kinds(broken)).toContain("error");
    expect(scriptThrows.update(0.5)).toMatchObject({ error: "script broke", t: 1, frame: 2 });
    expect(scriptThrows.start({})).toMatchObject({
      running: false,
      error: "script broke",
      path: undefined,
    });
    const restarted = scriptThrows.restart();
    expect(restarted.running).toBe(true);
    expect(restarted.error).toBeUndefined();
    expect(scriptThrows.update(0.5)).toMatchObject({ running: true, frame: 1 });

    const systemThrows = session(`import { system, world } ${ECS_IMPORT};
export const garden = world(
  system("fuse")({
    n: 0,
    update() {
      this.n += 1;
      if (this.n === 2) {
        throw new Error("fuse blew");
      }
    },
  }),
);
`);
    systemThrows.update(0.5);
    expect(systemThrows.update(0.5)).toMatchObject({ running: false, error: "fuse blew" });
    expect(systemThrows.update(0.5)).toMatchObject({ error: "fuse blew", frame: 2 });
    expect(systemThrows.restart()).toMatchObject({ running: true, frame: 0 });
  });

  test("halts on a throw in the simulated machine's hooks, and start continues the run", () => {
    const view = session(`${SCRIPT_IMPORT}
${HSM_IMPORT}
import { system, world } ${ECS_IMPORT};
export const lamp = defineMachine()({
  initial: "/on",
  states: { on: { on: { BREAK: { run: () => { throw new Error("bulb"); } } } } },
});
const tick = system("tick")({ update() { print("tick"); } });
export default defineScript({
  init() { return { garden: world(tick) }; },
  update(self, dt) { self.garden.update(dt); },
});
`);
    view.start({});
    view.update(0.5);
    expect(view.send({ type: "BREAK" })).toMatchObject({ running: false, error: "bulb" });
    expect(view.update(0.5)).toMatchObject({ error: "bulb", frame: 1 });

    const continued = view.start({});
    expect(continued).toMatchObject({ running: true, path: "/on", t: 0.5, frame: 1 });
    expect(continued.error).toBeUndefined();
    const ticked = view.update(0.5);
    expect(prints(ticked)).toEqual(["tick"]);
    expect(ticked.frame).toBe(2);
  });

  test("times the systems of a world that only the started machine's update advances", () => {
    const view = session(`${SCRIPT_IMPORT}
${HSM_IMPORT}
import { system, world } ${ECS_IMPORT};
const busy = (ms: number) => {
  const end = os.clock() + ms / 1000;
  while (os.clock() < end) {}
};
const work = system("work")({ update() { busy(2.05); } });
const garden = world(work);
export const keeper = defineMachine()({
  initial: "/on",
  states: { on: { update: (_ctx, dt) => { garden.update(dt); return undefined; } } },
});
export default defineScript({ init() { return { garden }; } });
`);

    expect(view.update(1 / 60).systems[0]?.ms).toBe(0);

    view.start({});
    const timed = view.update(1 / 60);
    expect(timed.running).toBe(true);
    expect(timed.systems[0]?.ms).toBeGreaterThanOrEqual(2);
  });

  test("reload keeps self, the worlds, the entity ids and a keyed machine, and calls on_reload once", () => {
    const key = `run-reload-${++sequence}`;
    const source = (version: string) => `${SCRIPT_IMPORT}
${HSM_IMPORT}
import { world } ${ECS_IMPORT};
export const lamp = defineMachine(${JSON.stringify(key)})({
  initial: "/off",
  states: { off: { on: { GO: "/on" } }, on: {} },
});
export default defineScript({
  init() {
    print("init");
    return { garden: world({ name: "a" }, { name: "b" }), n: 0 };
  },
  update(self) {
    self.n += 1;
    print(\`${version} \${self.n}\`);
  },
  on_reload(self) {
    print(\`reloaded \${self.n}\`);
  },
});
`;
    const file = write(source("v1"));
    const view = createSession({ file, hsmSourceDir, ecsSourceDir });
    view.start({});
    view.send({ type: "GO" });
    view.update(0.1);
    view.update(0.1);
    const ids = view.snapshot().entities.map((entity) => entity.id);

    writeFileSync(file, source("v2"));
    const reloaded = view.reload();
    expect(prints(reloaded)).toEqual(["reloaded 2"]);
    expect(kinds(reloaded)).toContain("reload");
    expect(reloaded).toMatchObject({ path: "/on", worlds: ["garden"], running: true });
    expect(reloaded.entities.map((entity) => entity.id)).toEqual(ids);
    expect(prints(view.update(0.1))).toEqual(["v2 3"]);

    writeFileSync(file, "export const = ;\n");
    const failed = view.reload();
    expect(kinds(failed)).toContain("error");
    expect(failed.running).toBe(true);
    expect(prints(view.update(0.1))).toEqual(["v2 4"]);
  });

  test("picks a world by name, and a file with no machine refuses machine actions", () => {
    const view = session(`${SCRIPT_IMPORT}
import { system, world } ${ECS_IMPORT};
export const move = system()({ update() {} });
export const fade = system()({ update() {} });
export default defineScript({
  init() { return { garden: world(move, { a: 1 }), other: world(fade, { b: 1 }, { c: 1 }) }; },
});
`);
    expect(view.snapshot().systems.map((system) => system.name)).toEqual(["move"]);

    const other = view.pickWorld("other");
    expect(other.world).toBe("other");
    expect(other.systems.map((system) => system.name)).toEqual(["fade"]);
    expect(other.entities.map((entity) => entity.value)).toEqual([{ b: 1 }, { c: 1 }]);
    expect(() => view.pickWorld("missing")).toThrow("garden, other");

    expect(view.snapshot().picked).toBeUndefined();
    expect(() => view.start({})).toThrow("defines no machine");
    expect(() => view.send({ type: "GO" })).toThrow("defines no machine");
    expect(() => view.pick("lamp")).toThrow("defines no machine");
  });

  test("refuses a file that defines no machine and creates no world once init has run", () => {
    const file = write(`${SCRIPT_IMPORT}
export default defineScript({ init() { return { n: 1 }; } });
`);
    expect(() => createSession({ file, hsmSourceDir, ecsSourceDir })).toThrow(
      `${file} defines no machine and creates no world`,
    );
  });
});

const CRITTERS = `${SCRIPT_IMPORT}
import { processingSystem, requireAll, world } ${ECS_IMPORT};
import { join, leave, member, tickMachines } from "@defold-typescript/types/ecs/hsm";
import { defineMachine, type MachineInstance } from "@defold-typescript/types/hsm";

type CritterEvent = { type: "SCARE" } | { type: "CAUGHT" };

interface Critter {
  readonly name: string;
  x: number;
  speed: number;
  wandering?: true;
  fleeing?: true;
  fsm?: MachineInstance<Critter, CritterEvent>;
}

export const herd = world<Critter>(
  tickMachines<Critter>("fsm"),
  processingSystem<Critter>()(requireAll("wandering"), {
    process(e, dt) {
      e.x += e.speed * dt;
    },
  }),
  processingSystem<Critter>()(requireAll("fleeing"), {
    process(e, dt) {
      e.x -= 3 * e.speed * dt;
    },
  }),
);

export const critterMachine = defineMachine<Critter, CritterEvent>()({
  initial: "/wander",
  enter: join(herd),
  states: {
    wander: {
      ...member(herd, "wandering"),
      on: { SCARE: "/flee" },
      after: { 1: { to: "/flee", when: (critter) => critter.speed > 50 } },
    },
    flee: { ...member(herd, "fleeing"), after: { 2: "/wander" }, on: { CAUGHT: "/caught" } },
    caught: { enter: leave(herd) },
  },
});

export const lamp = defineMachine()({
  initial: "/off",
  states: { off: { on: { TOGGLE: "/on" } }, on: { after: { 1: "/off" } } },
});

function spawn(name: string): Critter {
  const critter: Critter = { name, x: 0, speed: 40 };
  critter.fsm = critterMachine.start(critter);
  critter.fsm.send({ type: "SCARE" });
  return critter;
}

export default defineScript({
  init() {
    return { light: lamp.start({}), a: spawn("a"), b: spawn("b") };
  },
  update(_self, dt) {
    herd.update(dt);
  },
});
`;

function critterNamed(snapshot: Snapshot, name: string): Record<string, unknown> | undefined {
  return snapshot.entities
    .map((entity) => entity.value as Record<string, unknown>)
    .find((value) => value.name === name);
}

describe("createSession follow", () => {
  test("names each instance the run starts by the entity that holds it, and links the entity", () => {
    const view = session(CRITTERS);
    view.start({ name: "sim", x: 0, speed: 1 });
    const ran = view.update(0.5);

    expect(ran.instances).toEqual([
      { id: 1, label: "instance 1", machine: "lamp" },
      { id: 2, label: "herd entity 1", machine: "critterMachine" },
      { id: 3, label: "herd entity 2", machine: "critterMachine" },
    ]);
    expect(ran.following).toBeUndefined();
    expect(ran.entities.map((entity) => [entity.id, entity.machine])).toEqual([
      [1, 2],
      [2, 3],
      [3, undefined],
    ]);
    expect(critterNamed(ran, "sim")).toBeDefined();
  });

  test("shows a followed instance's states, the rule each move names, and its entity as ctx", () => {
    const view = session(CRITTERS);
    const followed = view.follow(2);
    expect(followed).toMatchObject({
      following: 2,
      picked: "critterMachine",
      path: "/flee",
      leaves: ["/flee"],
    });
    expect(followed.ctx).toMatchObject({ name: "a", fleeing: true });

    view.update(0.5);
    view.update(0.5);
    view.update(0.5);
    const back = view.update(0.5);
    expect(back).toMatchObject({
      t: 2,
      path: "/wander",
      active: ["/wander"],
      leaves: ["/wander"],
      entered: ["/wander"],
      fired: [ruleId("/flee", "after", "2")],
      rejected: [],
    });
    expect(back.ctx).toMatchObject({ name: "a", wandering: true });
    expect(back.entries.filter((entry) => entry.kind === "transition")).toEqual([
      { kind: "transition", t: 2, from: "/flee", to: "/wander", cause: "after", event: undefined },
    ]);

    view.update(0.5);
    const held = view.update(0.5);
    expect(held).toMatchObject({ t: 3, path: "/wander", entered: [], fired: [], rejected: [] });
  });

  test("an after timer on a followed instance fires at the same time as with nothing followed", () => {
    const view = session(CRITTERS);
    const returnTime = (): number | undefined => {
      for (let frame = 0; frame < 10; frame++) {
        const snapshot = view.update(0.5);
        if (critterNamed(snapshot, "a")?.wandering === true) {
          return snapshot.t;
        }
      }
      return undefined;
    };
    const alone = returnTime();

    view.restart();
    view.follow(2);
    const followed = returnTime();

    expect(alone).toBe(2);
    expect(followed).toBe(alone);
  });

  test("sends events to the followed instance and edits the entity it runs on", () => {
    const view = session(CRITTERS);
    view.update(0.5);
    view.follow(3);

    const edited = view.editCtx(["speed"], 99);
    expect(edited.ctx).toMatchObject({ name: "b", speed: 99 });
    expect(edited.entities.find((entity) => entity.machine === 3)?.value).toMatchObject({
      name: "b",
      speed: 99,
    });

    const caught = view.send({ type: "CAUGHT" });
    expect(caught).toMatchObject({ following: 3, path: "/caught", running: true });
    expect(caught.fired).toEqual([ruleId("/flee", "on", "CAUGHT", 0)]);
    expect(caught.entries).toContainEqual({
      kind: "transition",
      t: 0.5,
      from: "/flee",
      to: "/caught",
      cause: "event",
      event: { type: "CAUGHT" },
    });
  });

  test("returns to the simulated instance as it was, keeps following through a reload, and drops it on restart", () => {
    const file = write(CRITTERS);
    const view = createSession({ file, hsmSourceDir, ecsSourceDir });
    view.pick("lamp");
    view.send({ type: "TOGGLE" });

    expect(view.follow(2)).toMatchObject({ picked: "critterMachine", following: 2 });
    expect(view.index().states["/flee"]).toBeDefined();
    view.update(0.5);
    view.update(0.5);
    view.update(0.5);
    expect(() => view.follow(9)).toThrow("unknown instance: 9");
    expect(() => view.follow(9)).toThrow("#1 instance 1, #2 herd entity 1, #3 herd entity 2");

    const back = view.follow(undefined);
    expect(back).toMatchObject({ picked: "lamp", path: "/on", following: undefined });
    expect(view.index().states["/flee"]).toBeUndefined();

    view.follow(2);
    expect(view.reload()).toMatchObject({ following: 2, picked: "critterMachine" });
    expect(view.snapshot().instances).toHaveLength(3);
    expect(view.start({}).following).toBeUndefined();

    view.follow(2);
    const restarted = view.restart();
    expect(restarted.following).toBeUndefined();
    expect(restarted.instances.map((instance) => instance.id)).toEqual([1, 2, 3]);
  });

  test("halts the run on a throw from a followed instance, which only restart continues", () => {
    const view = session(`${SCRIPT_IMPORT}
import { world } ${ECS_IMPORT};
import { join, tickMachines } from "@defold-typescript/types/ecs/hsm";
import { defineMachine, type MachineInstance } from "@defold-typescript/types/hsm";

type WalkerEvent = { type: "TRIP" };

interface Walker {
  readonly name: string;
  fsm?: MachineInstance<Walker, WalkerEvent>;
}

export const herd = world<Walker>(tickMachines<Walker>("fsm"));

export const walker = defineMachine<Walker, WalkerEvent>()({
  initial: "/walk",
  enter: join(herd),
  states: {
    walk: {
      on: {
        TRIP: {
          run: (ctx) => {
            throw new Error(\`\${ctx.name} tripped\`);
          },
        },
      },
    },
  },
});

export default defineScript({
  init() {
    const a: Walker = { name: "a" };
    a.fsm = walker.start(a);
    return { a };
  },
  update(_self, dt) {
    herd.update(dt);
  },
});
`);
    view.update(0.5);
    view.follow(1);

    expect(view.send({ type: "TRIP" })).toMatchObject({
      following: 1,
      running: false,
      error: "a tripped",
    });
    expect(view.start({ name: "sim" })).toMatchObject({
      following: 1,
      running: false,
      error: "a tripped",
      t: 0.5,
      frame: 1,
    });
    expect(view.update(0.5)).toMatchObject({ running: false, t: 0.5, frame: 1 });

    const restarted = view.restart();
    expect(restarted).toMatchObject({ running: true, t: 0, frame: 0, following: undefined });
    expect(restarted.error).toBeUndefined();
    expect(restarted.instances.map((instance) => [instance.id, instance.machine])).toEqual([
      [1, "walker"],
    ]);
    const resumed = view.update(0.5);
    expect(resumed).toMatchObject({ running: true, t: 0.5, frame: 1 });
    expect(resumed.instances).toEqual([{ id: 1, label: "herd entity 1", machine: "walker" }]);
  });
});

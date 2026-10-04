import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMachine, getInitialSnapshot, getNextSnapshot } from "xstate";
import { exportMachine, runHsmExport } from "./hsm-export";

const LAMP = `import { defineMachine } from "@defold-typescript/types/hsm";

const guards = { ready: (ctx: Ctx) => ctx.ready };
const DIM = "/on/dim" as const;
const dimTarget = (DIM satisfies string);

export const lamp = defineMachine<Ctx, LampEvent>()({
  initial: "/off",
  states: {
    off: {
      on: {
        TOGGLE: "/on",
        BREAK: { target: "/broken", guard: guards.ready },
        ALIVE: "/alive",
      },
    },
    on: {
      history: "shallow",
      initial: dimTarget,
      on: {
        TOGGLE: "/off",
        PULSE: { target: "/on", reenter: true },
      },
      states: {
        dim: {
          on: {
            UP: [{ target: "/on/bright", guard: (ctx) => ctx.bright }, { target: "/on/dim.max" }],
          },
        },
        bright: { after: { 1.5: "/on/dim" } },
        "dim.max": {},
      },
    },
    alive: {
      type: "parallel",
      states: {
        a: { initial: "/alive/a/x", states: { x: { on: { NEXT: "/alive/a/y" } }, y: {} } },
        b: { initial: "/alive/b/p", states: { p: {}, q: {} } },
      },
    },
    broken: { always: { target: "/off", guard: (ctx) => ctx.fixed } },
  },
});
`;

const SPLIT = `import { defineMachine } from "@defold-typescript/types/hsm";

export const split = defineMachine<Ctx, Ev>()({
  initial: "/a",
  states: {
    a: { after: { 0.0011: "/b", 0.0014: "/c", 0.0041: "/d" } },
    b: {},
    c: {},
    d: {},
  },
});
`;

type Snapshot = ReturnType<typeof getInitialSnapshot>;

function lampMachine(guards: { bright: boolean; ready: boolean; fixed: boolean }) {
  return createMachine(exportMachine(LAMP, "lamp.ts") as never).provide({
    guards: {
      "/on/dim on UP guard 0": () => guards.bright,
      "guards.ready": () => guards.ready,
      "/broken always guard": () => guards.fixed,
    },
  });
}

function walk(
  machine: ReturnType<typeof lampMachine>,
  events: readonly string[],
): Snapshot["value"][] {
  let snapshot = getInitialSnapshot(machine);
  const values = [snapshot.value];
  for (const type of events) {
    snapshot = getNextSnapshot(machine, snapshot, { type });
    values.push(snapshot.value);
  }
  return values;
}

describe("exportMachine round-trips through xstate", () => {
  test("initial value and transitions follow the hsm definition", () => {
    const machine = lampMachine({ bright: false, ready: true, fixed: false });
    expect(walk(machine, ["TOGGLE", "UP", "TOGGLE", "TOGGLE"])).toEqual([
      "off",
      { on: "dim" },
      { on: "dim.max" },
      "off",
      { on: "dim.max" },
    ]);
  });

  test("a guarded branch wins when its guard passes", () => {
    const machine = lampMachine({ bright: true, ready: false, fixed: false });
    expect(walk(machine, ["TOGGLE", "UP", "BREAK"])).toEqual([
      "off",
      { on: "dim" },
      { on: "bright" },
      { on: "bright" },
    ]);
  });

  test("a failed guard keeps the state", () => {
    const machine = lampMachine({ bright: false, ready: false, fixed: false });
    expect(walk(machine, ["BREAK"])).toEqual(["off", "off"]);
  });

  test("always leaves at once only while its guard passes", () => {
    expect(walk(lampMachine({ bright: false, ready: true, fixed: false }), ["BREAK"])).toEqual([
      "off",
      "broken",
    ]);
    expect(walk(lampMachine({ bright: false, ready: true, fixed: true }), ["BREAK"])).toEqual([
      "off",
      "off",
    ]);
  });

  test("history resumes the last child, and reenter goes through it", () => {
    const machine = lampMachine({ bright: true, ready: false, fixed: false });
    expect(walk(machine, ["TOGGLE", "UP", "TOGGLE", "TOGGLE", "PULSE"]).slice(-2)).toEqual([
      { on: "bright" },
      { on: "bright" },
    ]);
  });

  test("a parallel state enters every region", () => {
    const machine = lampMachine({ bright: false, ready: false, fixed: false });
    expect(walk(machine, ["ALIVE", "NEXT"])).toEqual([
      "off",
      { alive: { a: "x", b: "p" } },
      { alive: { a: "y", b: "p" } },
    ]);
  });

  test("after fires on the millisecond delay event", () => {
    const machine = lampMachine({ bright: true, ready: false, fixed: false });
    expect(walk(machine, ["TOGGLE", "UP", "xstate.after.1500./on/bright"]).at(-1)).toEqual({
      on: "dim",
    });
  });

  test("fractional millisecond delays each fire their own transition", () => {
    const machine = createMachine(exportMachine(SPLIT, "split.ts") as never);
    const at = (type: string) => getNextSnapshot(machine, getInitialSnapshot(machine), { type });
    expect(at("xstate.after.1.4./a").value).toBe("c");
    expect(at("xstate.after.1.1./a").value).toBe("b");
    expect(at("xstate.after.4.1./a").value).toBe("d");
  });
});

describe("exportMachine output", () => {
  test("after is in milliseconds and initial names the child", () => {
    const json = exportMachine(LAMP, "lamp.ts") as {
      id: string;
      initial: string;
      states: Record<string, Record<string, unknown> & { states: Record<string, unknown> }>;
    };
    expect(json.id).toBe("lamp");
    expect(json.initial).toBe("off");
    expect(json.states.on?.states.bright).toEqual({
      id: "/on/bright",
      after: { "1500": "#/on/dim" },
    });
    expect(json.states.alive?.states.a).toMatchObject({ initial: "x" });
    expect(json.states.on?.on).toEqual({
      TOGGLE: "#/off",
      PULSE: { target: "#/on", reenter: true },
    });
  });

  test("after keeps fractions of a millisecond", () => {
    const json = exportMachine(SPLIT, "split.ts") as {
      states: Record<string, { after?: Record<string, string> }>;
    };
    expect(json.states.a?.after).toEqual({ "1.1": "#/b", "1.4": "#/c", "4.1": "#/d" });
  });

  test("states keep their written order", () => {
    const json = exportMachine(LAMP, "lamp.ts") as { states: Record<string, unknown> };
    expect(Object.keys(json.states)).toEqual(["off", "on", "alive", "broken"]);
  });

  test("function slots export named placeholders", () => {
    const source = `
      import { defineMachine } from "@defold-typescript/types/hsm";
      function onEnter() {}
      export const hooks = defineMachine<Ctx, Ev>()({
        initial: "/a",
        enter: () => {},
        states: {
          a: {
            enter: onEnter,
            exit: () => {},
            update: () => undefined,
            invoke: (ctx, settle) => undefined,
            always: [{ target: "/b", guard: () => true }, { target: "/b", guard: checks.done }],
            on: {
              GO: [
                { target: "/b", guard: guards.ready, actions: log.info },
                { target: "/b", guard: (c) => c.x, actions: [() => {}, record] },
              ],
              POKE: { actions: () => {} },
            },
          },
          b: {},
        },
      });
    `;
    expect(exportMachine(source, "hooks.ts")).toEqual({
      id: "hooks",
      initial: "a",
      entry: ["/ enter"],
      states: {
        a: {
          id: "/a",
          entry: ["onEnter"],
          exit: ["/a exit"],
          meta: { update: "/a update" },
          invoke: { src: "/a invoke" },
          always: [
            { target: "#/b", guard: "/a always guard 0" },
            { target: "#/b", guard: "checks.done" },
          ],
          on: {
            GO: [
              { target: "#/b", guard: "guards.ready", actions: ["log.info"] },
              {
                target: "#/b",
                guard: "/a on GO guard 1",
                actions: ["/a on GO action 1 0", "record"],
              },
            ],
            POKE: { actions: ["/a on POKE action"] },
          },
        },
        b: { id: "/b" },
      },
    });
  });
});

describe("exportMachine static-read limits", () => {
  const wrap = (body: string, prelude = "") =>
    `import { defineMachine } from "@defold-typescript/types/hsm";\n${prelude}\nexport const m = defineMachine<Ctx, Ev>()({\n${body}\n});\n`;

  test("string and object values resolve through same-file consts", () => {
    const source = wrap(
      `  initial: START,\n  states: { a: A_STATE, b: {} },`,
      `const START = ("/a" as const);\nconst A_STATE = { on: { GO: TARGET } } satisfies object;\nconst TARGET = "/b";`,
    );
    expect(exportMachine(source, "c.ts")).toEqual({
      id: "m",
      initial: "a",
      states: { a: { id: "/a", on: { GO: "#/b" } }, b: { id: "/b" } },
    });
  });

  const locate = (source: string, token: string): string => {
    const before = source.slice(0, source.indexOf(token)).split("\n");
    return `${before.length}:${(before.at(-1) as string).length + 1}`;
  };

  test.each([
    ["a spread", `  initial: "/a",\n  states: { a: {}, ...more },`, "...more", "/ states"],
    ["a call", `  initial: pick(),\n  states: { a: {} },`, "pick()", "/ initial"],
    ["a computed key", `  initial: "/a",\n  states: { [name]: {} },`, "[name]", "/ states"],
    [
      "an unresolvable identifier",
      `  initial: "/a",\n  states: { a: { on: { GO: elsewhere } } },`,
      "elsewhere",
      "/a on GO",
    ],
  ])("%s at a structural slot throws a located error", (_label, body, token, slot) => {
    const source = wrap(body);
    expect(() => exportMachine(source, "bad.ts")).toThrow(
      `bad.ts:${locate(source, token)}: hsm-export cannot read ${slot} statically`,
    );
  });
});

describe("exportMachine machine selection", () => {
  const one = (decl: string) => `${decl}({ initial: "/a", states: { a: {} } });\n`;
  const twoMachines = `import { defineMachine } from "@defold-typescript/types/hsm";
${one('export const first = defineMachine<Ctx, Ev>("door")')}${one("export const second = defineMachine<Ctx, Ev>()")}`;

  test("one definition and no name exports it", () => {
    expect(exportMachine(one("const only = defineMachine<Ctx, Ev>()"), "one.ts")).toMatchObject({
      id: "only",
    });
  });

  test("a definition is named by its key, else by its const", () => {
    expect(exportMachine(twoMachines, "two.ts", "door")).toMatchObject({ id: "door" });
    expect(exportMachine(twoMachines, "two.ts", "second")).toMatchObject({ id: "second" });
  });

  test("two definitions and no name throws listing both", () => {
    expect(() => exportMachine(twoMachines, "two.ts")).toThrow(
      "two.ts: hsm-export found 2 machines (door, second); name one: hsm-export <file> <name>",
    );
  });

  test("an unknown name throws", () => {
    expect(() => exportMachine(twoMachines, "two.ts", "first")).toThrow(
      'two.ts: hsm-export found no machine named "first"; machines: door, second',
    );
  });

  test("a file with no definition throws", () => {
    expect(() => exportMachine("export const x = 1;\n", "none.ts")).toThrow(
      "none.ts: hsm-export found no defineMachine call",
    );
  });
});

describe("runHsmExport", () => {
  test("reads the file relative to cwd", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hsm-export-"));
    try {
      writeFileSync(path.join(dir, "lamp.ts"), LAMP);
      expect(runHsmExport({ cwd: dir, file: "lamp.ts" })).toMatchObject({ id: "lamp" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the platformer player machine", () => {
  const file = path.resolve(
    import.meta.dir,
    "../../../docs/examples/platformer/src/player-machine.ts",
  );

  test("exports playerMachine with update hooks as meta placeholders", () => {
    const json = exportMachine(readFileSync(file, "utf8"), file) as {
      id: string;
      states: Record<string, { meta?: unknown; states: Record<string, { meta?: unknown }> }>;
    };
    expect(json.id).toBe("playerMachine");
    expect(json.states.grounded?.meta).toEqual({ update: "/grounded update" });
    expect(json.states.grounded?.states.idle?.meta).toEqual({ update: "/grounded/idle update" });

    const machine = createMachine(json as never);
    let snapshot = getInitialSnapshot(machine);
    expect(snapshot.value).toEqual({ airborne: "falling" });
    snapshot = getNextSnapshot(machine, snapshot, { type: "JUMP" });
    expect(snapshot.value).toEqual({ airborne: "falling" });
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createLiveRegistry, parseInspectLine } from "../../cli/src/hsm-view-live";
import { inspect } from "./debug";
import { defineMachine } from "./index";

type DoorEv = { type: "OPEN" } | { type: "CLOSE" };

const NAMES = ["sys", "msg", "go", "vmath", "print"] as const;
const globals = globalThis as unknown as Record<(typeof NAMES)[number], unknown>;
const saved: Partial<Record<(typeof NAMES)[number], unknown>> = {};

let isDebug = true;
let printed: string[] = [];
let posted: unknown[][] = [];
let positionTargets: unknown[] = [];

beforeEach(() => {
  for (const name of NAMES) {
    saved[name] = globals[name];
  }
  isDebug = true;
  printed = [];
  posted = [];
  positionTargets = [];
  globals.sys = {
    get_engine_info: () => ({ version: "1.13.2", version_sha1: "", is_debug: isDebug }),
  };
  globals.msg = {
    post: (...args: unknown[]) => {
      posted.push(args);
    },
  };
  globals.go = {
    get_world_position: (target: unknown) => {
      positionTargets.push(target);
      return { x: 10, y: 20, z: 0 };
    },
  };
  globals.vmath = {
    vector3: (x: number, y: number, z: number) => ({ x, y, z }),
    vector4: (x: number, y: number, z: number, w: number) => ({ x, y, z, w }),
  };
  globals.print = (line: string) => {
    printed.push(line);
  };
});

afterEach(() => {
  for (const name of NAMES) {
    globals[name] = saved[name];
  }
});

function startDoor() {
  return defineMachine<object, DoorEv>()({
    initial: "/closed",
    states: {
      closed: { on: { OPEN: "/open" } },
      open: { on: { CLOSE: "/closed" }, after: { 1: "/closed" } },
    },
  }).start({});
}

describe("inspect", () => {
  test("logs the start state at the call, then each transition with its frame, event and leaves", () => {
    const door = startDoor();
    inspect(door, "door");
    door.send({ type: "OPEN" });
    expect(printed).toEqual([
      "hsm door frame 0: inspecting [/closed]",
      "hsm door frame 0: /closed -> /open (OPEN) [/open]",
    ]);
  });

  test("counts draw calls as frames, logs a cause when there is no event, and empty leaves once stopped", () => {
    const door = startDoor();
    const inspector = inspect(door, "gate");
    door.send({ type: "OPEN" });
    inspector.draw("/gate");
    inspector.draw("/gate");
    door.update(1.5);
    door.stop();
    expect(printed).toEqual([
      "hsm gate frame 0: inspecting [/closed]",
      "hsm gate frame 0: /closed -> /open (OPEN) [/open]",
      "hsm gate frame 2: /open -> /closed (after) [/closed]",
      "hsm gate frame 2: /closed -> (stopped) (stop) []",
    ]);
  });

  test("a region move of a parallel machine lists every active leaf", () => {
    const hero = defineMachine<object, { type: "WALK" }>()({
      initial: "/alive",
      states: {
        alive: {
          type: "parallel",
          states: {
            move: {
              initial: "/alive/move/idle",
              states: { idle: { on: { WALK: "/alive/move/walk" } }, walk: {} },
            },
            weapon: { initial: "/alive/weapon/ready", states: { ready: {} } },
          },
        },
      },
    }).start({});
    inspect(hero, "hero");
    hero.send({ type: "WALK" });
    expect(printed).toEqual([
      "hsm hero frame 0: inspecting [/alive/move/idle, /alive/weapon/ready]",
      "hsm hero frame 0: /alive/move/idle -> /alive/move/walk (WALK) [/alive/move/walk, /alive/weapon/ready]",
    ]);
  });

  test("a repeated label gets an ordinal on both the log and the drawn text", () => {
    const inspectors = [startDoor(), startDoor(), startDoor()].map((door) =>
      inspect(door, "enemy"),
    );
    for (const inspector of inspectors) {
      inspector.draw("/enemy");
    }
    expect(printed).toEqual([
      "hsm enemy frame 0: inspecting [/closed]",
      "hsm enemy#2 frame 0: inspecting [/closed]",
      "hsm enemy#3 frame 0: inspecting [/closed]",
    ]);
    expect(posted.map((args) => (args[2] as { text: string }).text)).toEqual([
      "enemy /closed",
      "enemy#2 /closed",
      "enemy#3 /closed",
    ]);
  });

  test("a repeated label takes an ordinal no earlier inspect call printed", () => {
    const inspectors = ["grunt#2", "grunt", "grunt"].map((label) => inspect(startDoor(), label));
    for (const inspector of inspectors) {
      inspector.draw("/grunt");
    }
    const labelOf = (line: string) => line.slice("hsm ".length, line.indexOf(" frame "));
    expect(printed.map(labelOf)).toEqual(["grunt#2", "grunt", "grunt#3"]);
    const texts = posted.map((args) => (args[2] as { text: string }).text);
    texts.forEach((text, i) => {
      expect(text.startsWith(`${labelOf(printed[i] as string)} `)).toBe(true);
    });

    inspect(startDoor(), "grunt#2");
    const fourth = labelOf(printed[3] as string);
    expect(printed.slice(0, 3).map(labelOf)).not.toContain(fourth);

    const registry = createLiveRegistry();
    for (const line of printed) {
      registry.feed(line);
    }
    expect(registry.current().instances.map((instance) => instance.label)).toEqual(
      printed.map(labelOf),
    );
  });

  test("every printed line reads back the label, leaves and move whatever the names hold", () => {
    const boss = defineMachine<object, { type: "HIT (crit), now" }>()({
      initial: "/boss",
      states: {
        boss: {
          type: "parallel",
          states: {
            one: {
              initial: "/boss/one/left, right",
              states: {
                "left, right": { on: { "HIT (crit), now": "/boss/one/a]b" } },
                "a]b": {},
              },
            },
            two: { initial: "/boss/two/x -> y", states: { "x -> y": {} } },
            three: { initial: "/boss/three/(p)", states: { "(p)": {} } },
            four: { initial: "/boss/four/q frame 1: r", states: { "q frame 1: r": {} } },
            five: { initial: "/boss/five/back\\slash", states: { "back\\slash": {} } },
            six: { initial: "/boss/six/line\nbreak", states: { "line\nbreak": {} } },
          },
        },
      },
    }).start({});
    const label = "boss frame 2: [x]";
    const leaves = [[...boss.leaves]];
    const moves: { from: string; to: string | undefined; reason: string }[] = [];
    inspect(boss, label);
    boss.onMove((from, to, cause, event) => {
      moves.push({ from, to, reason: event === undefined ? cause : event.type });
      leaves.push([...boss.leaves]);
    });
    boss.send({ type: "HIT (crit), now" });
    boss.stop();

    expect(printed).toHaveLength(3);
    const parsed = printed.map(parseInspectLine);
    expect(parsed[0]).toEqual({ label, leaves: leaves[0] as string[] });
    expect(parsed.slice(1)).toEqual(
      moves.map((move, i) => ({ label, leaves: leaves[i + 1] as string[], move })),
    );
    expect(parsed[2]?.move?.to).toBeUndefined();
    expect(parsed[2]?.leaves).toEqual([]);
  });

  test("draw posts the label and active path above the target to the render script", () => {
    const door = startDoor();
    const inspector = inspect(door, "hatch");
    door.send({ type: "OPEN" });
    inspector.draw("/hatch");
    expect(positionTargets).toEqual(["/hatch"]);
    expect(posted).toEqual([
      [
        "@render:",
        "draw_debug_text",
        {
          text: "hatch /open",
          position: { x: 10, y: 60, z: 0 },
          color: { x: 1, y: 1, z: 1, w: 1 },
        },
      ],
    ]);
  });

  test("draw shows every region's leaf of a parallel machine, and (stopped) once stopped", () => {
    const player = defineMachine<object, DoorEv>()({
      initial: "/alive",
      states: {
        alive: {
          type: "parallel",
          states: {
            move: { initial: "/alive/move/idle", states: { idle: {} } },
            weapon: { initial: "/alive/weapon/ready", states: { ready: {} } },
          },
        },
      },
    }).start({});
    const inspector = inspect(player, "player");
    inspector.draw("/player");
    player.stop();
    inspector.draw("/player");
    expect(posted.map((args) => (args[2] as { text: string }).text)).toEqual([
      "player /alive/move/idle, /alive/weapon/ready",
      "player (stopped)",
    ]);
  });

  test("does nothing in a release build", () => {
    isDebug = false;
    const door = startDoor();
    const inspector = inspect(door, "vault");
    door.send({ type: "OPEN" });
    inspector.draw("/vault");
    expect(printed).toEqual([]);
    expect(posted).toEqual([]);
    expect(positionTargets).toEqual([]);
  });
});

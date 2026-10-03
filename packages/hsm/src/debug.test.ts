import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
  test("logs each transition with the label, the frame and the event", () => {
    const door = startDoor();
    inspect(door, "door");
    door.send({ type: "OPEN" });
    expect(printed).toEqual(["hsm door frame 0: /closed -> /open (OPEN)"]);
  });

  test("counts draw calls as frames and logs a cause when there is no event", () => {
    const door = startDoor();
    const inspector = inspect(door, "door");
    door.send({ type: "OPEN" });
    inspector.draw("/door");
    inspector.draw("/door");
    door.update(1.5);
    door.stop();
    expect(printed).toEqual([
      "hsm door frame 0: /closed -> /open (OPEN)",
      "hsm door frame 2: /open -> /closed (after)",
      "hsm door frame 2: /closed -> (stopped) (stop)",
    ]);
  });

  test("draw posts the label and active path above the target to the render script", () => {
    const door = startDoor();
    const inspector = inspect(door, "door");
    door.send({ type: "OPEN" });
    inspector.draw("/door");
    expect(positionTargets).toEqual(["/door"]);
    expect(posted).toEqual([
      [
        "@render:",
        "draw_debug_text",
        {
          text: "door /open",
          position: { x: 10, y: 60, z: 0 },
          color: { x: 1, y: 1, z: 1, w: 1 },
        },
      ],
    ]);
  });

  test("does nothing in a release build", () => {
    isDebug = false;
    const door = startDoor();
    const inspector = inspect(door, "door");
    door.send({ type: "OPEN" });
    inspector.draw("/door");
    expect(printed).toEqual([]);
    expect(posted).toEqual([]);
    expect(positionTargets).toEqual([]);
  });
});

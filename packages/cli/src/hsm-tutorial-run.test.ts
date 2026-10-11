/**
 * The state machines tutorial ends with two machines the reader has built: a robot buddy and
 * the dock that charges it. This applies the page's step fences, loads the two machine files of
 * the last lesson's project over the hsm source, and plays the part of the engine: it fires the
 * callbacks of the fade, the chirp and the timers, and carries each posted message to the
 * machine it was posted to.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { lessonProjects } from "./hsm-guide-steps";
import { loadMachines } from "./hsm-view-load";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const PAGE = path.join(REPO_ROOT, "packages", "docs", "guide", "state-machines-tutorial.md");

const LIGHT = "main:/buddy#light";
const BUDDY = "main:/buddy#buddy";
const DOCK = "main:/dock#dock";
const PLAYER = "main:/player#trigger";

const RESTING = ["/resting/battery/filling", "/resting/lamp/shown"];

interface MachineEvent {
  readonly type: string;
  readonly [field: string]: unknown;
}

interface Running {
  readonly path: string | undefined;
  readonly leaves: readonly string[];
  readonly matches: (path: string) => boolean;
  readonly can: (event: MachineEvent) => boolean;
  readonly send: (event: MachineEvent) => void;
  readonly update: (dt: number) => void;
  readonly hasTag: (tag: string) => boolean;
  readonly onMove: (listener: (from: string, to: string | undefined) => void) => () => void;
  readonly onUnhandled: (listener: (event: MachineEvent) => void) => () => void;
}

interface Startable {
  readonly start: (ctx: Record<string, unknown>, at?: readonly string[]) => Running;
}

type Role = "buddy" | "dock";

const MACHINE_FILES: Record<Role, string> = {
  buddy: "buddy-machine.ts",
  dock: "dock-machine.ts",
};

/** Every engine call a role's machine has made in this test, as its api and arguments. */
const calls: Record<Role, [string, readonly unknown[]][]> = { buddy: [], dock: [] };

let projectDir: string | undefined;
const loaded = new Map<Role, Startable>();

/** The machine a role's file of the last lesson's project defines, loaded once. */
function machine(role: Role): Startable {
  const known = loaded.get(role);
  if (known !== undefined) {
    return known;
  }
  if (projectDir === undefined) {
    const last = lessonProjects(readFileSync(PAGE, "utf8")).at(-1);
    if (last === undefined) {
      throw new Error("the tutorial has no step fence");
    }
    projectDir = mkdtempSync(path.join(os.tmpdir(), "hsm-tutorial-run-"));
    for (const [title, text] of last.files) {
      writeFileSync(path.join(projectDir, title), text);
    }
  }
  const load = loadMachines(path.join(projectDir, MACHINE_FILES[role]), {
    hsmSourceDir: requireHsmSourceDir(),
  });
  load.engine.setSink((entry) => {
    if (entry.kind === "engine") {
      calls[role].push([entry.api, entry.args]);
    }
  });
  const [only, ...others] = load.machines;
  if (only === undefined || others.length > 0) {
    throw new Error(`${MACHINE_FILES[role]} defines ${load.machines.length} machines, not one`);
  }
  loaded.set(role, only.machine as Startable);
  return only.machine as Startable;
}

beforeEach(() => {
  calls.buddy = [];
  calls.dock = [];
});

afterAll(() => {
  if (projectDir !== undefined) {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

/** The callbacks the buddy handed to `api` in argument `slot`, oldest first. */
function callbacks(api: string, slot: number): (() => void)[] {
  return calls.buddy
    .filter(([name]) => name === api)
    .map(([, args]) => args[slot])
    .filter((callback): callback is () => void => typeof callback === "function");
}

function newest(api: string, slot: number): () => void {
  const callback = callbacks(api, slot).at(-1);
  if (callback === undefined) {
    throw new Error(`the buddy has handed ${api} no callback in argument ${slot}`);
  }
  return callback;
}

const fadeEnds = () => newest("go.animate", 7)();
const soundEnds = () => newest("sound.play", 2)();
const promisesSettle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** What a role has posted, as receiver and message id. */
const posted = (role: Role) =>
  calls[role].filter(([api]) => api === "msg.post").map(([, args]) => [args[0], args[1]]);

const startBuddy = (at?: readonly string[]) =>
  machine("buddy").start({ light: LIGHT, dock: DOCK }, at);
const startDock = () => machine("dock").start({});

const playerWalksIn: MachineEvent = { type: "trigger_response", sender: PLAYER, enter: true };

function awakeBuddy(): Running {
  const buddy = startBuddy();
  fadeEnds();
  soundEnds();
  return buddy;
}

/** A buddy that has met the player: the engine ends its chirp and each wait of its greeting. */
async function followingBuddy(): Promise<Running> {
  const buddy = awakeBuddy();
  buddy.send(playerWalksIn);
  expect(buddy.path).toBe("/awake/greeting");
  soundEnds();
  await promisesSettle();
  for (let fired = 0; buddy.path === "/awake/greeting"; fired++) {
    const wait = callbacks("timer.delay", 2)[fired];
    if (wait === undefined) {
      throw new Error(`the greeting is waiting on nothing after ${fired} timers`);
    }
    wait();
    await promisesSettle();
  }
  expect(buddy.path).toBe("/awake/follow");
  return buddy;
}

async function restingBuddy(): Promise<Running> {
  const buddy = await followingBuddy();
  buddy.send({ type: "BUMP", cost: 3 });
  return buddy;
}

/** The leaves each move of `running` enters from here on. */
function entered(running: Running): (string | undefined)[] {
  const leaves: (string | undefined)[] = [];
  running.onMove((_from, to) => leaves.push(to));
  return leaves;
}

describe("the tutorial's buddy", () => {
  test("a first start leaves it waking", () => {
    expect(startBuddy().path).toBe("/waking");
  });

  test("it wakes once the fade and the chirp have both reported", () => {
    const buddy = startBuddy();
    const moves = entered(buddy);
    fadeEnds();
    expect(buddy.path).toBe("/waking");
    soundEnds();
    expect(moves).toEqual(["/checkup", "/awake/wander"]);
    expect(buddy.path).toBe("/awake/wander");
  });

  test("a bump that uses up the energy sends it to rest and asks the dock for a charge", async () => {
    const buddy = await restingBuddy();
    expect([...buddy.leaves]).toEqual(RESTING);
    expect(posted("buddy")).toContainEqual([DOCK, "charge_me"]);
  });

  test("a charge returns it through the checkup to the child it left", async () => {
    const buddy = await restingBuddy();
    const moves = entered(buddy);
    buddy.send({ type: "charged", sender: DOCK });
    expect(moves).toContain("/checkup");
    expect(buddy.path).toBe("/awake/follow");
  });

  test("while it rests a poke is dropped, and the drop is reacted to and reported", async () => {
    const buddy = await restingBuddy();
    const poke: MachineEvent = { type: "POKE" };
    const dropped: string[] = [];
    buddy.onUnhandled((event) => dropped.push(event.type));
    expect(buddy.can(poke)).toBe(false);
    expect(buddy.hasTag("busy")).toBe(true);

    const soundsBefore = calls.buddy.filter(([api]) => api === "sound.play").length;
    buddy.send(poke);
    expect([...buddy.leaves]).toEqual(RESTING);
    expect(calls.buddy.filter(([api]) => api === "sound.play").length).toBe(soundsBefore + 1);
    expect(dropped).toEqual(["POKE"]);
  });

  test("started at the leaves saved while it rested, it rests", async () => {
    const saved = [...(await restingBuddy()).leaves];
    expect(saved).toEqual(RESTING);
    expect([...startBuddy(saved).leaves]).toEqual(saved);
  });
});

describe("the tutorial's dock", () => {
  test("it charges for its delay, then tells the sender and is idle again", () => {
    const dock = startDock();
    expect(dock.path).toBe("/idle");
    dock.send({ type: "charge_me", sender: BUDDY });
    expect(dock.path).toBe("/charging");
    expect(posted("dock")).toEqual([]);
    dock.update(1);
    expect(dock.path).toBe("/charging");
    dock.update(1);
    expect(posted("dock")).toEqual([[BUDDY, "charged"]]);
    expect(dock.path).toBe("/idle");
  });
});

describe("the tutorial's two machines, wired", () => {
  const URLS: Record<Role, string> = { buddy: BUDDY, dock: DOCK };

  /**
   * Carries what each machine has posted to the other's url, as its message event, until
   * neither has posted anything new. A message arrives after the call that posted it returns.
   */
  function wire(running: Record<Role, Running>): () => void {
    const carried: Record<Role, number> = { buddy: 0, dock: 0 };
    const carry = (from: Role, to: Role): boolean => {
      const pending = calls[from].slice(carried[from]);
      carried[from] = calls[from].length;
      for (const [api, [receiver, id, fields]] of pending) {
        if (api === "msg.post" && receiver === URLS[to]) {
          running[to].send({
            ...(fields as object | undefined),
            type: id as string,
            sender: URLS[from],
          });
        }
      }
      return pending.length > 0;
    };
    return () => {
      while (carry("buddy", "dock") || carry("dock", "buddy")) {
        // Each pass delivers what the last one made the receiver post.
      }
    };
  }

  test("a tired buddy is awake again once the dock's delay has passed", async () => {
    const buddy = await followingBuddy();
    const dock = startDock();
    const deliver = wire({ buddy, dock });
    deliver();
    expect(dock.path).toBe("/idle");

    buddy.send({ type: "BUMP", cost: 3 });
    deliver();
    expect([...buddy.leaves]).toEqual(RESTING);
    expect(dock.path).toBe("/charging");

    const tick = (dt: number) => {
      buddy.update(dt);
      dock.update(dt);
      deliver();
    };
    tick(0.75);
    tick(0.75);
    expect(buddy.matches("/resting")).toBe(true);
    tick(0.75);
    expect(dock.path).toBe("/idle");
    expect(buddy.path).toBe("/awake/follow");
  });
});

/**
 * The State machines guide's animation recipe is a whole machine, so this runs the
 * `knight-machine.ts` fence as the page prints it, over the hsm source, and plays the
 * part of the engine: it records each flipbook and fires the completion callbacks.
 * The save and load recipes and the door requests recipe are whole machines too, and
 * run the same way.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { loadMachines, type MachineEngine } from "./hsm-view-load";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const GUIDE_PAGE = path.join(REPO_ROOT, "packages", "docs", "guide", "state-machines.md");
const RECIPE_FENCE = "knight-machine.ts";
const RECIPE_MACHINE = "knightMachine";

const TITLED_TS_FENCE = /^```ts[^\n]*\btitle="([^"]+)"[^\n]*\n([\s\S]*?)^```/gm;

function titledFence(page: string, title: string): string {
  for (const match of page.matchAll(TITLED_TS_FENCE)) {
    if (match[1] === title) {
      return match[2] as string;
    }
  }
  throw new Error(`state-machines.md has no ts fence titled ${title}`);
}

interface LoadedFence {
  readonly machine: unknown;
  readonly engine: MachineEngine;
}

const dirs: string[] = [];
const loadedFences = new Map<string, LoadedFence>();

/** The machine named `name` of the fence titled `title`, with its engine; a fence loads once. */
function fenceMachine(title: string, name: string): LoadedFence {
  const cached = loadedFences.get(title);
  if (cached !== undefined) {
    return cached;
  }
  const body = titledFence(readFileSync(GUIDE_PAGE, "utf8"), title);
  const dir = mkdtempSync(path.join(os.tmpdir(), "hsm-guide-recipe-"));
  dirs.push(dir);
  const file = path.join(dir, title);
  writeFileSync(file, body);
  const loaded = loadMachines(file, { hsmSourceDir: requireHsmSourceDir() });
  const machine = loaded.machines.find((entry) => entry.name === name);
  if (machine === undefined) {
    throw new Error(`${title} defines no machine named ${name}`);
  }
  const fence = { machine: machine.machine, engine: loaded.engine };
  loadedFences.set(title, fence);
  return fence;
}

interface KnightCtx {
  run: boolean;
  crouch: boolean;
  jump: boolean;
}

interface Knight {
  readonly path: string | undefined;
  readonly ctx: KnightCtx;
  readonly send: (event: { type: string }) => void;
}

interface Startable {
  readonly start: (ctx: KnightCtx) => Knight;
}

const JUMP = { type: "JUMP" };

let recipe: Startable | undefined;
let played: unknown[] = [];
let pending: (() => void) | undefined;
let knight: Knight;

function knightMachine(): Startable {
  if (recipe !== undefined) {
    return recipe;
  }
  const fence = fenceMachine(RECIPE_FENCE, RECIPE_MACHINE);
  fence.engine.setSink((entry) => {
    if (entry.kind !== "engine" || entry.api !== "sprite.play_flipbook") {
      return;
    }
    played.push(entry.args[1]);
    const callback = entry.args[2];
    if (typeof callback === "function") {
      pending = callback as () => void;
    }
  });
  recipe = fence.machine as Startable;
  return recipe;
}

function start(): void {
  knight = knightMachine().start({ run: false, crouch: false, jump: false });
}

function intent(fields: Partial<KnightCtx>): void {
  Object.assign(knight.ctx, fields);
  knight.send({ type: "INTENT" });
}

function finish(): void {
  const done = pending;
  if (done === undefined) {
    throw new Error("no flipbook is waiting on its completion callback");
  }
  pending = undefined;
  done();
}

beforeEach(() => {
  played = [];
  pending = undefined;
});

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("the knight recipe", () => {
  test("starts standing idle and plays idle once", () => {
    start();
    expect(knight.path).toBe("/standing/free/idle");
    expect(played).toEqual(["idle"]);
  });

  test("crouching plays the in-between animation before the crouched one", () => {
    start();
    intent({ crouch: true, run: true });
    expect(knight.path).toBe("/to_crouch");
    finish();
    expect(knight.path).toBe("/crouching/run");
    expect(played).toEqual(["idle", "to_crouch", "crouch_walk"]);
  });

  test("standing up plays the in-between animation before idle", () => {
    start();
    intent({ crouch: true, run: true });
    finish();
    intent({ crouch: false, run: false });
    expect(knight.path).toBe("/to_standing");
    finish();
    expect(knight.path).toBe("/standing/free/idle");
    expect(played.slice(-2)).toEqual(["from_crouch", "idle"]);
  });

  test("an unchanged request replays nothing", () => {
    start();
    intent({});
    intent({ run: false });
    expect(played).toEqual(["idle"]);
  });

  test("a jump finishes before the run requested during it starts", () => {
    start();
    knight.send(JUMP);
    expect(knight.path).toBe("/standing/jump");
    intent({ run: true });
    expect(knight.path).toBe("/standing/jump");
    finish();
    expect(knight.path).toBe("/standing/free/run");
    expect(played).toEqual(["idle", "jump", "run"]);
  });

  test("a jump pressed during a jump plays after it", () => {
    start();
    knight.send(JUMP);
    knight.send(JUMP);
    finish();
    expect(knight.path).toBe("/standing/jump");
    expect(played).toEqual(["idle", "jump", "jump"]);
    finish();
    expect(knight.path).toBe("/standing/free/idle");
  });

  test("a crouched knight ignores a jump", () => {
    start();
    intent({ crouch: true });
    finish();
    knight.send(JUMP);
    expect(knight.path).toBe("/crouching/idle");
    expect(played).toEqual(["idle", "to_crouch", "crouch_idle"]);
  });

  test("a jump pressed while standing up plays once the knight is up", () => {
    start();
    intent({ crouch: true });
    finish();
    intent({ crouch: false });
    expect(knight.path).toBe("/to_standing");
    knight.send(JUMP);
    finish();
    expect(knight.path).toBe("/standing/jump");
  });

  test("the callback of an earlier jump does not end the next one", () => {
    start();
    knight.send(JUMP);
    const earlier = pending;
    finish();
    expect(knight.path).toBe("/standing/free/idle");
    knight.send(JUMP);
    earlier?.();
    expect(knight.path).toBe("/standing/jump");
  });

  test("a waiting jump plays before a requested run", () => {
    start();
    knight.send(JUMP);
    knight.send(JUMP);
    intent({ run: true });
    finish();
    expect(knight.path).toBe("/standing/jump");
    finish();
    expect(knight.path).toBe("/standing/free/run");
    expect(played).toEqual(["idle", "jump", "jump", "run"]);
  });

  test("crouching wins over a waiting jump and drops it", () => {
    start();
    knight.send(JUMP);
    knight.send(JUMP);
    intent({ crouch: true });
    finish();
    expect(knight.path).toBe("/to_crouch");
    finish();
    intent({ crouch: false });
    finish();
    expect(knight.path).toBe("/standing/free/idle");
    expect(played).toEqual(["idle", "jump", "to_crouch", "crouch_idle", "from_crouch", "idle"]);
  });

  test("a request to stand made on the way down is taken once the knight is down", () => {
    start();
    intent({ crouch: true });
    expect(knight.path).toBe("/to_crouch");
    intent({ crouch: false, run: true });
    expect(knight.path).toBe("/to_crouch");
    finish();
    expect(knight.path).toBe("/to_standing");
    finish();
    expect(knight.path).toBe("/standing/free/run");
    expect(played).toEqual(["idle", "to_crouch", "from_crouch", "run"]);
  });
});

interface Chest {
  readonly path: string | undefined;
  readonly leaves: readonly string[];
  readonly send: (event: { type: string }) => void;
  readonly stop: () => void;
}

interface ChestMachine<Ctx> {
  readonly start: (ctx: Ctx, at?: readonly string[]) => Chest;
}

const SPRITE = "#sprite";

describe("the save and load recipes", () => {
  const routed = () =>
    fenceMachine("chest-routed.ts", "routedChestMachine").machine as ChestMachine<{
      opened: boolean;
    }>;
  const positioned = () => fenceMachine("chest-machine.ts", "chestMachine");
  const chestMachine = () => positioned().machine as ChestMachine<{ sprite: string }>;

  test("the routed chest starts in the state its saved flag tells", () => {
    expect(routed().start({ opened: true }).path).toBe("/open");
    expect(routed().start({ opened: false }).path).toBe("/closed");
  });

  test("the chest started with no list is at its initial", () => {
    expect(chestMachine().start({ sprite: SPRITE }).path).toBe("/locked");
  });

  test("a chest started with a copy of saved leaves is in the states it was saved in", () => {
    const first = chestMachine().start({ sprite: SPRITE });
    first.send({ type: "UNLOCK" });
    first.send({ type: "OPEN" });
    const saved = [...first.leaves];
    first.stop();
    expect(saved).toEqual(["/open"]);
    expect([...chestMachine().start({ sprite: SPRITE }, saved).leaves]).toEqual(saved);
  });

  test("a chest started at the open state plays the animation of its enter hook", () => {
    const machine = chestMachine();
    const sprites: unknown[] = [];
    positioned().engine.setSink((entry) => {
      if (entry.kind === "engine" && entry.api === "sprite.play_flipbook") {
        sprites.push(entry.args[0]);
      }
    });
    try {
      machine.start({ sprite: SPRITE }, ["/open"]);
    } finally {
      positioned().engine.setSink(undefined);
    }
    expect(sprites).toEqual([SPRITE]);
  });
});

interface DoorRequest {
  readonly type: string;
  readonly sender: string;
}

interface Door {
  readonly path: string | undefined;
  readonly can: (event: DoorRequest) => boolean;
  readonly send: (event: DoorRequest) => void;
}

interface DoorMachine {
  readonly start: (ctx: { sprite: string }) => Door;
}

const CALLER = "main:/player#script";
const OTHER = "main:/guard#script";

describe("the door requests recipe", () => {
  const fence = () => fenceMachine("door-requests.ts", "doorMachine");
  let calls: unknown[] = [];
  let door: Door;

  beforeEach(() => {
    calls = [];
    fence().engine.setSink((entry) => {
      if (entry.kind === "engine") {
        calls.push([entry.api, entry.args]);
      }
    });
    door = (fence().machine as DoorMachine).start({ sprite: SPRITE });
  });

  afterEach(() => {
    fence().engine.setSink(undefined);
  });

  test("a request no state took is refused by name and stays unhandled", () => {
    const request = { type: "close_door", sender: CALLER };
    expect(door.can(request)).toBe(false);
    door.send(request);
    expect(door.path).toBe("/closed");
    expect(calls).toEqual([["msg.post", [CALLER, "door_refused", { request: "close_door" }]]]);
  });

  test("a locked door rattles before the refusal and still takes nothing", () => {
    door.send({ type: "lock_door", sender: CALLER });
    expect(door.path).toBe("/locked");
    expect(calls).toEqual([]);
    const request = { type: "open_door", sender: OTHER };
    expect(door.can(request)).toBe(false);
    door.send(request);
    expect(door.path).toBe("/locked");
    expect(door.can(request)).toBe(false);
    expect(calls).toEqual([
      ["sprite.play_flipbook", [SPRITE, "rattle"]],
      ["msg.post", [OTHER, "door_refused", { request: "open_door" }]],
    ]);
  });

  test("the requests the door takes run no hook", () => {
    door.send({ type: "lock_door", sender: CALLER });
    door.send({ type: "unlock_door", sender: CALLER });
    door.send({ type: "open_door", sender: CALLER });
    expect(door.path).toBe("/open");
    expect(calls).toEqual([]);
  });
});

/**
 * The State machines guide's animation recipe is a whole machine, so this runs the
 * `knight-machine.ts` fence as the page prints it, over the hsm source, and plays the
 * part of the engine: it records each flipbook and fires the completion callbacks.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { loadMachines } from "./hsm-view-load";

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

let dir: string | undefined;
let recipe: Startable | undefined;
let played: unknown[] = [];
let pending: (() => void) | undefined;
let knight: Knight;

function knightMachine(): Startable {
  if (recipe !== undefined) {
    return recipe;
  }
  const body = titledFence(readFileSync(GUIDE_PAGE, "utf8"), RECIPE_FENCE);
  dir = mkdtempSync(path.join(os.tmpdir(), "hsm-guide-recipe-"));
  const file = path.join(dir, RECIPE_FENCE);
  writeFileSync(file, body);
  const loaded = loadMachines(file, { hsmSourceDir: requireHsmSourceDir() });
  const machine = loaded.machines.find((entry) => entry.name === RECIPE_MACHINE);
  if (machine === undefined) {
    throw new Error(`${RECIPE_FENCE} defines no machine named ${RECIPE_MACHINE}`);
  }
  loaded.engine.setSink((entry) => {
    if (entry.kind !== "engine" || entry.api !== "sprite.play_flipbook") {
      return;
    }
    played.push(entry.args[1]);
    const callback = entry.args[2];
    if (typeof callback === "function") {
      pending = callback as () => void;
    }
  });
  recipe = machine.machine as Startable;
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
  if (dir !== undefined) {
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

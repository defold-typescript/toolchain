import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

interface Body {
  readonly velocity: { x: number; y: number; z: number };
  ground_contact: boolean;
}

interface Motion {
  readonly path: string;
  readonly matches: (path: string) => boolean;
  readonly send: (event: { type: "JUMP" } | { type: "JUMP_RELEASED" }) => void;
  readonly update: (dt: number) => void;
}

// The example module needs the Defold script globals to type-check, which this
// tsconfig does not load, so its shape is restated here and loaded by path.
interface PlayerModule {
  readonly playerMachine: { readonly start: (ctx: Body) => Motion };
}

const machinePath = join(import.meta.dir, "../docs/examples/platformer/src/player-machine.ts");

// The example imports hsm through its shipped declarations, which have no
// runtime half; Bun runs the library source those declarations are emitted from.
mock.module("@defold-typescript/types/hsm", () => import("../packages/hsm/src/index.ts"));

const globals = globalThis as unknown as { hash?: unknown; sprite?: unknown };
let savedHash: unknown;
let savedSprite: unknown;
let played: string[] = [];
let mod: PlayerModule;

beforeAll(async () => {
  savedHash = globals.hash;
  savedSprite = globals.sprite;
  globals.hash = (s: string) => s;
  globals.sprite = {
    play_flipbook: (_url: unknown, anim: string) => {
      played.push(anim);
    },
  };
  mod = (await import(machinePath)) as PlayerModule;
});

afterAll(() => {
  globals.hash = savedHash;
  globals.sprite = savedSprite;
});

beforeEach(() => {
  played = [];
});

function body(x: number, y: number, ground_contact: boolean): Body {
  return { velocity: { x, y, z: 0 }, ground_contact };
}

function startAirborne() {
  const ctx = body(0, 0, false);
  const motion = mod.playerMachine.start(ctx);
  return { ctx, motion };
}

function startGrounded(x: number) {
  const { ctx, motion } = startAirborne();
  ctx.ground_contact = true;
  ctx.velocity.x = x;
  motion.update(1 / 60);
  played = [];
  return { ctx, motion };
}

describe("platformer player machine", () => {
  test("starts falling and plays fall", () => {
    const { motion } = startAirborne();
    expect(motion.matches("airborne.falling")).toBe(true);
    expect(played).toEqual(["fall"]);
  });

  test("landing at rest lands in grounded.idle and plays idle", () => {
    const { ctx, motion } = startAirborne();
    played = [];
    ctx.ground_contact = true;
    motion.update(1 / 60);
    expect(motion.path).toBe("grounded.idle");
    expect(played).toEqual(["idle"]);
  });

  test("landing while moving lands in grounded.walk without flashing idle", () => {
    const { ctx, motion } = startAirborne();
    played = [];
    ctx.ground_contact = true;
    ctx.velocity.x = 300;
    motion.update(1 / 60);
    expect(motion.path).toBe("grounded.walk");
    expect(played).toEqual(["walk"]);
  });

  test("grounded idle and walk follow velocity.x", () => {
    const { ctx, motion } = startGrounded(0);
    expect(motion.path).toBe("grounded.idle");
    ctx.velocity.x = -120;
    motion.update(1 / 60);
    expect(motion.path).toBe("grounded.walk");
    ctx.velocity.x = 0;
    motion.update(1 / 60);
    expect(motion.path).toBe("grounded.idle");
    expect(played).toEqual(["walk", "idle"]);
  });

  test("walking off a ledge reaches airborne.falling, not the sibling leaf", () => {
    const { ctx, motion } = startGrounded(300);
    expect(motion.path).toBe("grounded.walk");
    ctx.ground_contact = false;
    motion.update(1 / 60);
    expect(motion.path).toBe("airborne.falling");
    expect(played).toEqual(["fall"]);
  });

  test("losing ground while a leaf's own velocity check fires still reaches airborne.falling", () => {
    const fromIdle = startGrounded(0);
    fromIdle.ctx.ground_contact = false;
    fromIdle.ctx.velocity.x = 300;
    fromIdle.motion.update(1 / 60);
    expect(fromIdle.motion.path).toBe("airborne.falling");

    const fromWalk = startGrounded(300);
    fromWalk.ctx.ground_contact = false;
    fromWalk.ctx.velocity.x = 0;
    fromWalk.motion.update(1 / 60);
    expect(fromWalk.motion.path).toBe("airborne.falling");
  });

  test("JUMP from grounded takes off into airborne.rising", () => {
    const { ctx, motion } = startGrounded(0);
    motion.send({ type: "JUMP" });
    expect(motion.path).toBe("airborne.rising");
    expect(ctx.velocity.y).toBe(1200);
    expect(ctx.ground_contact).toBe(false);
    expect(played).toEqual(["jump"]);
  });

  test("JUMP while airborne changes neither the state nor velocity.y", () => {
    const { ctx, motion } = startAirborne();
    ctx.velocity.y = -50;
    played = [];
    motion.send({ type: "JUMP" });
    expect(motion.path).toBe("airborne.falling");
    expect(ctx.velocity.y).toBe(-50);
    expect(played).toEqual([]);
  });

  test("JUMP_RELEASED halves velocity.y while rising only", () => {
    const { ctx, motion } = startGrounded(0);
    motion.send({ type: "JUMP" });
    motion.send({ type: "JUMP_RELEASED" });
    expect(motion.path).toBe("airborne.rising");
    expect(ctx.velocity.y).toBe(600);

    const falling = startAirborne();
    falling.ctx.velocity.y = -80;
    falling.motion.send({ type: "JUMP_RELEASED" });
    expect(falling.motion.path).toBe("airborne.falling");
    expect(falling.ctx.velocity.y).toBe(-80);
  });

  test("rising turns to falling once velocity.y drops to zero", () => {
    const { ctx, motion } = startGrounded(0);
    motion.send({ type: "JUMP" });
    played = [];
    ctx.velocity.y = 10;
    motion.update(1 / 60);
    expect(motion.path).toBe("airborne.rising");
    ctx.velocity.y = 0;
    motion.update(1 / 60);
    expect(motion.path).toBe("airborne.falling");
    expect(played).toEqual(["fall"]);
  });
});

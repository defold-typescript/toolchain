import type { Vector3 } from "@defold-typescript/types";
import { defineMachine } from "@defold-typescript/types/hsm";

// Take-off speed when jumping in pixel units.
const jump_takeoff_speed = 1200;

const anim_walk = hash("walk");
const anim_idle = hash("idle");
const anim_jump = hash("jump");
const anim_fall = hash("fall");

export interface PlayerCtx {
  readonly velocity: Vector3;
  ground_contact: boolean;
}

export type PlayerEvent = { type: "JUMP" } | { type: "JUMP_RELEASED" };

// Each state plays its animation once, in `enter`, so an animation that is
// already playing is never restarted. `update` hooks run leaf-first and the
// first returned target wins, so the leaves check `ground_contact` themselves
// and leave the walk-off-a-ledge step to `grounded`.
export const playerMachine = defineMachine<PlayerCtx, PlayerEvent>()({
  initial: "airborne",
  states: {
    grounded: {
      initial: "idle",
      update: (ctx) => (ctx.ground_contact ? undefined : "airborne"),
      on: {
        // Only allow jump from ground (extend with a counter for double-jumps).
        JUMP: {
          target: "airborne.rising",
          actions: (ctx) => {
            ctx.velocity.y = jump_takeoff_speed;
            ctx.ground_contact = false;
          },
        },
      },
      states: {
        idle: {
          enter: () => sprite.play_flipbook("#sprite", anim_idle),
          update: (ctx) => (ctx.ground_contact && ctx.velocity.x !== 0 ? "walk" : undefined),
        },
        walk: {
          enter: () => sprite.play_flipbook("#sprite", anim_walk),
          update: (ctx) => (ctx.ground_contact && ctx.velocity.x === 0 ? "idle" : undefined),
        },
      },
    },
    airborne: {
      initial: "falling",
      update: (ctx) => {
        if (!ctx.ground_contact) {
          return undefined;
        }
        return ctx.velocity.x === 0 ? "grounded.idle" : "grounded.walk";
      },
      states: {
        rising: {
          enter: () => sprite.play_flipbook("#sprite", anim_jump),
          on: {
            // Cut the jump short if we are still going up.
            JUMP_RELEASED: {
              actions: (ctx) => {
                ctx.velocity.y = ctx.velocity.y * 0.5;
              },
            },
          },
          update: (ctx) => (ctx.velocity.y <= 0 && !ctx.ground_contact ? "falling" : undefined),
        },
        falling: {
          enter: () => sprite.play_flipbook("#sprite", anim_fall),
        },
      },
    },
  },
});

// defold-typescript:setup-debug BEGIN — managed block, do not edit
import * as lldebugger from "lldebugger.debug";

if (sys.get_engine_info().is_debug) {
  lldebugger.start();
}

// defold-typescript:setup-debug END

import type { Hash, Vector3 } from "@defold-typescript/types";
import { defineScript } from "@defold-typescript/types";

// Tweakables — module-level constants. The TS player is a hand-conversion;
// `move_acceleration` and `air_acceleration_factor` are not in the upstream Lua
// template but make movement acceleration-based, matching the article's prose.
// Horizontal acceleration in pixel units per second squared.
const move_acceleration = 1500;
// Acceleration factor to use when air-borne (multiplies move_acceleration).
const air_acceleration_factor = 0.8;
// Max speed right/left.
const max_speed = 450;
// Gravity pulling the player down in pixel units.
const gravity = -1900;
// Take-off speed when jumping in pixel units.
const jump_takeoff_speed = 1200;

// Pre-hashed ids. In Defold these are hash() handles. action_id and group are
// delivered as hashes, so every comparison is Hash vs Hash. The message_id is
// matched with the `isMessage` type guard, which narrows the payload and lowers
// to a `hash("...")` comparison, so no hand-rolled message-id constant is needed.
const group_obstacle = hash("ground");
const input_left = hash("left");
const input_right = hash("right");
const input_jump = hash("jump");
const anim_walk = hash("walk");
const anim_idle = hash("idle");
const anim_jump = hash("jump");
const anim_fall = hash("fall");

// The script state is defined once, by `init`'s return shape. `PlayerSelf` is
// derived from it so the standalone helpers keep a named annotation without a
// second hand-maintained field list that could drift from `init`.
function createPlayerSelf() {
  return {
    velocity: vmath.vector3(0, 0, 0),
    input_direction: 0,
    facing_direction: 0,
    correction: vmath.vector3(),
    ground_contact: false,
    wall_contact: false,
    anim: undefined as Hash | undefined,
  };
}

type PlayerSelf = ReturnType<typeof createPlayerSelf>;

function play_animation(self: PlayerSelf, anim: Hash): void {
  // Only play animations which are not already playing.
  if (self.anim !== anim) {
    sprite.play_flipbook("#sprite", anim);
    self.anim = anim;
  }
}

function update_animations(self: PlayerSelf): void {
  // Make sure the player character faces the right way.
  sprite.set_hflip("#sprite", self.facing_direction < 0);
  if (self.ground_contact) {
    if (self.velocity.x === 0) {
      play_animation(self, anim_idle);
    } else {
      play_animation(self, anim_walk);
    }
  } else if (self.velocity.y > 0) {
    play_animation(self, anim_jump);
  } else {
    play_animation(self, anim_fall);
  }
}

// https://defold.com/manuals/physics/#resolving-kinematic-collisions
function handle_obstacle_contact(self: PlayerSelf, normal: Vector3, distance: number): void {
  if (distance > 0) {
    // Project the accumulated correction onto the penetration vector.
    const proj = vmath.project(self.correction, normal.mul(distance));
    if (proj < 1) {
      // Only care for projections that do not overshoot.
      const comp = normal.mul(distance - distance * proj);
      go.set_position(go.get_position().add(comp));
      self.correction = self.correction.add(comp);
    }
  }

  // Collided with a wall — stop horizontal movement.
  // TSTL maps TS `Math.abs` to Lua `math.abs`, so no Defold-specific shim.
  if (Math.abs(normal.x) > 0.7) {
    self.wall_contact = true;
    self.velocity.x = 0;
  }
  // Collided with the ground — stop vertical movement.
  if (normal.y > 0.7) {
    self.ground_contact = true;
    self.velocity.y = 0;
  }
  // Collided with the ceiling — stop vertical movement.
  if (normal.y < -0.7) {
    self.velocity.y = 0;
  }
}

function jump(self: PlayerSelf): void {
  // Only allow jump from ground (extend with a counter for double-jumps).
  if (self.ground_contact) {
    self.velocity.y = jump_takeoff_speed;
    play_animation(self, anim_jump);
    self.ground_contact = false;
  }
}

function abort_jump(self: PlayerSelf): void {
  // Cut the jump short if we are still going up.
  if (self.velocity.y > 0) {
    self.velocity.y = self.velocity.y * 0.5;
  }
}

function walk(self: PlayerSelf, direction: number): void {
  // Only change facing direction if direction is other than 0.
  if (direction !== 0) {
    self.facing_direction = direction;
  }
  // Store the input direction; fixed_update integrates it into velocity.x
  // over the physics step (acceleration-based, per the article's prose).
  self.input_direction = direction;
}

export default defineScript({
  // Editor script properties: the key is the name (written once) and the value
  // is the default, so its type flows onto `self`. The transpiler emits the
  // `go.property("adj", …)` / `go.property("name", …)` registrations for us.
  properties: {
    adj: vmath.vector3(0, 0, 0),
    name: hash("initial value"),
  },

  init() {
    // This lets us handle input in this script. `init` returns the initial
    // state; the transpiler merges it onto the engine-owned `self`.
    msg.post(".", "acquire_input_focus");
    return createPlayerSelf();
  },

  fixed_update(self, dt) {
    // Apply horizontal acceleration. Air is damped by `air_acceleration_factor`.
    const accel = self.ground_contact
      ? move_acceleration
      : move_acceleration * air_acceleration_factor;
    self.velocity.x = self.velocity.x + accel * self.input_direction * dt;
    // Clamp to ±max_speed so the player cannot accelerate past top speed.
    if (self.velocity.x > max_speed) self.velocity.x = max_speed;
    if (self.velocity.x < -max_speed) self.velocity.x = -max_speed;

    // Apply gravity.
    self.velocity.y = self.velocity.y + gravity * dt;

    // Move player, applying the editor-tunable `adj` offset property.
    const pos = go.get_position().add(self.velocity.mul(dt)).add(self.adj);
    go.set_position(pos);

    // Update animations based on state (ground, air, move and idle).
    update_animations(self);

    // Reset volatile state.
    self.correction = vmath.vector3();
    self.ground_contact = false;
    self.wall_contact = false;
  },

  on_message(self, message_id, message) {
    if (isMessage(message_id, message, "contact_point_response")) {
      // `message` is now the typed contact_point_response payload — no cast.
      // Check that the object is something we consider an obstacle.
      if (message.other_group === group_obstacle) {
        handle_obstacle_contact(self, message.normal, message.distance);
      }
    }
  },

  on_input(self, action_id, action) {
    if (action_id === input_left) {
      walk(self, -(action.value ?? 0));
    } else if (action_id === input_right) {
      walk(self, action.value ?? 0);
    } else if (action_id === input_jump) {
      if (action.pressed) {
        jump(self);
      } else if (action.released) {
        abort_jump(self);
      }
    }
  },
});

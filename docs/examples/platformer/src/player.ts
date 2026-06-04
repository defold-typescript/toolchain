import type { Hash, Vector3 } from "@defold-typescript/types";
import { defineScript } from "@defold-typescript/types";

// Tweakables — module-level constants, exactly as in the original .script.
// Acceleration factor to use when air-borne.
const air_acceleration_factor = 0.8;
// Max speed right/left.
const max_speed = 450;
// Gravity pulling the player down in pixel units.
const gravity = -1900;
// Take-off speed when jumping in pixel units.
const jump_takeoff_speed = 1200;

// Pre-hashed ids. In Defold these are hash() handles. message_id, action_id,
// and group are all delivered as hashes, so every comparison is Hash vs Hash.
const msg_contact_point_response = hash("contact_point_response");
const group_obstacle = hash("ground");
const input_left = hash("left");
const input_right = hash("right");
const input_jump = hash("jump");
const anim_walk = hash("walk");
const anim_idle = hash("idle");
const anim_jump = hash("jump");
const anim_fall = hash("fall");

interface PlayerSelf {
  velocity: Vector3;
  facing_direction: number;
  correction: Vector3;
  ground_contact: boolean;
  wall_contact: boolean;
  anim: Hash | undefined;
}

// The contact_point_response fields this script reads. on_message delivers the
// payload as an untyped record, so we cast to the subset we use. (The typed
// contact_point_response payload also lacks `group` today — it exposes only
// own_group/other_group, a builtin-messages fidelity gap.)
interface ContactPoint {
  group: Hash;
  normal: Vector3;
  distance: number;
}

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
  // Use a different velocity on ground and in air.
  if (self.ground_contact) {
    self.velocity.x = max_speed * direction;
  } else {
    self.velocity.x = max_speed * air_acceleration_factor * direction;
  }
}

export default defineScript<PlayerSelf>({
  init(self) {
    // This lets us handle input in this script.
    msg.post(".", "acquire_input_focus");
    self.velocity = vmath.vector3(0, 0, 0);
    self.facing_direction = 0;
    self.correction = vmath.vector3();
    self.ground_contact = false;
    self.anim = undefined;
  },

  fixed_update(self, dt) {
    // Apply gravity.
    self.velocity.y = self.velocity.y + gravity * dt;

    // Move player.
    const pos = go.get_position().add(self.velocity.mul(dt));
    go.set_position(pos);

    // Update animations based on state (ground, air, move and idle).
    update_animations(self);

    // Reset volatile state.
    self.correction = vmath.vector3();
    self.ground_contact = false;
    self.wall_contact = false;
  },

  on_message(self, message_id, message) {
    if (message_id === msg_contact_point_response) {
      const contact = message as unknown as ContactPoint;
      // Check that the object is something we consider an obstacle.
      if (contact.group === group_obstacle) {
        handle_obstacle_contact(self, contact.normal, contact.distance);
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

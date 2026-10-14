/// <reference path="../index.d.ts" />

import type { Hash, Vector3 } from "../src/core-types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type ContactPointEvent = BuiltinMessages["contact_point_event"] & {
  type: Hash<"contact_point_event">;
};
type CollisionEvent = BuiltinMessages["collision_event"] & { type: Hash<"collision_event"> };

// script_physics.cpp sets `type` to the message-name hash on every listener
// event, and fills `a`/`b` with the fields of the proto sub-message.
physics.set_event_listener((_self, events) => {
  for (const event of events) {
    const _type: Hash = event.type;

    if (isPhysicsEvent(event, "collision_event")) {
      const _only: Equal<typeof event, CollisionEvent> = true;
      const _id: Hash = event.a.id;
      const _group: Hash = event.b.group;
      const _position: Vector3 = event.a.position;
      // @ts-expect-error a collision body carries no mass
      event.a.mass;
    }

    if (isPhysicsEvent(event, "contact_point_event")) {
      const _only: Equal<typeof event, ContactPointEvent> = true;
      const _mass: number = event.a.mass;
      const _normal: Vector3 = event.b.normal;
      const _instance: Vector3 = event.a.instance_position;
      const _velocity: Vector3 = event.a.relative_velocity;
      const _impulse: number = event.applied_impulse;
    }

    if (isPhysicsEvent(event, "trigger_event")) {
      const _enter: boolean = event.enter;
      const _other: Hash = event.b.id;
      // @ts-expect-error a trigger body carries no position
      event.a.position;
    }

    if (isPhysicsEvent(event, "ray_cast_response")) {
      const _fraction: number = event.fraction;
    }

    // @ts-expect-error no physics event is named colision_event
    isPhysicsEvent(event, "colision_event");
  }
});

// The same payloads reach `on_message`, typed from the one catalog entry.
declare const message: Record<string | number, unknown>;
declare const message_id: Hash;
if (isMessage(message_id, message, "contact_point_event")) {
  const _mass: number = message.a.mass;
}

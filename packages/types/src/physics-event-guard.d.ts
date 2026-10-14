/** @noSelfInFile */
import type { Hash } from "./core-types";

// `physics.set_event_listener` sets `type` on every event to its message-name
// hash (script_physics.cpp), but a `Hash` is an object type, not a unit type, so
// an `event.type == hash("…")` check cannot narrow the event union. This guard
// re-introduces the literal at the use site. The transpiler lowers the call to
// `event.type == hash("…")` (physics-event-guard-lowering.ts), so this package
// emits no runtime Lua. It names no `physics` type, so it compiles on a surface
// whose reference declares no event union.
type PhysicsEventName<E> = E extends { type: Hash<infer N> } ? N : never;

declare global {
  /**
   * Type guard for a `physics.set_event_listener` callback: narrows one event
   * to the member of the event union whose `type` is the hash of `name`. The
   * engine sets `type` on every event, but a `Hash` cannot act as a union
   * discriminant, so an `event.type == hash("collision_event")` check leaves the
   * event unnarrowed — this guard re-introduces the literal.
   *
   * @param event - one entry of the `events` array the listener received.
   * @param name - the event's message name (e.g. `"collision_event"`).
   * @returns `true` when `event.type` is `hash(name)`, narrowing `event` to that event.
   * @example
   * ```ts
   * physics.set_event_listener((self, events) => {
   *   for (const event of events) {
   *     if (isPhysicsEvent(event, "collision_event")) {
   *       print(event.a.id, event.b.id);
   *     }
   *   }
   * });
   * ```
   */
  function isPhysicsEvent<E extends { type: Hash }, K extends PhysicsEventName<E>>(
    event: E,
    name: K,
  ): event is Extract<E, { type: Hash<K> }>;
}

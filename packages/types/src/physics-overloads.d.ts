/** @noSelfInFile */
import type { Hash, Vector3 } from "./core-types";

declare global {
  namespace physics {
    /**
     * Ray casts are used to test for intersections against collision objects in the physics world.
     * Collision objects of types kinematic, dynamic and static are tested against. Trigger objects
     * do not intersect with ray casts.
     * Which collision objects to hit is filtered by their collision groups and can be configured
     * through `groups`.
     * NOTE: Ray casts will ignore collision objects that contain the starting point of the ray. This is a limitation in Box2D.
     *
     * @param from - the world position of the start of the ray
     * @param to - the world position of the end of the ray
     * @param groups - a lua table containing the hashed groups for which to test collisions against
     * @returns The first hit, or `undefined` when the ray hits nothing. See ray_cast_response for details on the returned values.
     * @example
     * ```ts
     * export default defineScript({
     *   update(self, dt) {
     *     const from = go.get_world_position();
     *     const to = vmath.vector3(from.x, from.y - 100, from.z);
     *     const hit = physics.raycast(from, to, [hash("world"), hash("enemy")]);
     *     if (hit !== undefined) {
     *       print(hit.position, hit.id);
     *     }
     *   },
     * });
     * ```
     *
     * @remarks
     * script_physics.cpp:Physics_RayCast pushes one hit table when no options
     * table is passed, and sets no `request_id` on it.
     */
    function raycast(
      from: Vector3,
      to: Vector3,
      groups: Hash[],
    ): Omit<BuiltinMessages["ray_cast_response"], "request_id"> | undefined;
    /**
     * Ray cast with an options table, which returns the hits as a list: every hit with `all` set, else a list of the first one.
     *
     * @param from - the world position of the start of the ray
     * @param to - the world position of the end of the ray
     * @param groups - a lua table containing the hashed groups for which to test collisions against
     * @param options - ray-cast options; `all` returns every hit instead of the first
     * @returns The hits, or `undefined` when the ray hits nothing. See ray_cast_response for details on the returned values.
     * @example
     * ```ts
     * export default defineScript({
     *   update(self, dt) {
     *     const from = go.get_world_position();
     *     const to = vmath.vector3(from.x, from.y - 100, from.z);
     *     const hits = physics.raycast(from, to, [hash("world"), hash("enemy")], { all: true });
     *     for (const hit of hits ?? []) {
     *       print(hit.position, hit.id);
     *     }
     *   },
     * });
     * ```
     *
     * @remarks
     * script_physics.cpp:Physics_RayCast returns a list whenever argument 4 is a
     * table (`lua_istable(L, 4)`), holding one hit unless `all` is set, and
     * `nil` when the ray hits nothing.
     */
    function raycast(
      from: Vector3,
      to: Vector3,
      groups: Hash[],
      options: { all?: boolean },
    ): Omit<BuiltinMessages["ray_cast_response"], "request_id">[] | undefined;
    /**
     * Ray cast with an options value that may be `undefined`, which returns the first hit without one and the hits as a list with one.
     *
     * @param from - the world position of the start of the ray
     * @param to - the world position of the end of the ray
     * @param groups - a lua table containing the hashed groups for which to test collisions against
     * @param options - ray-cast options, or `undefined` for none; `all` returns every hit instead of the first
     * @returns The first hit without options or the hits with them, or `undefined` when the ray hits nothing. See ray_cast_response for details on the returned values.
     * @example
     * ```ts
     * function cast(from: Vector3, to: Vector3, options: { all?: boolean } | undefined) {
     *   const result = physics.raycast(from, to, [hash("world")], options);
     *   if (result !== undefined && !Array.isArray(result)) {
     *     print(result.position);
     *   }
     * }
     * ```
     *
     * @remarks
     * script_physics.cpp:Physics_RayCast reads argument 4 only when
     * `lua_istable(L, 4)`, so a nil options argument returns one hit as no
     * options table does.
     */
    function raycast(
      from: Vector3,
      to: Vector3,
      groups: Hash[],
      options: { all?: boolean } | undefined,
    ):
      | Omit<BuiltinMessages["ray_cast_response"], "request_id">
      | Omit<BuiltinMessages["ray_cast_response"], "request_id">[]
      | undefined;
  }
}

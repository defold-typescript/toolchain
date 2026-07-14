/** @noSelfInFile */
import type { Opaque, Vector3 } from "../src/core-types";

declare global {
  /**
   * Query and cast functions for the Defold-owned Box2D v2 world.
   */
  namespace b2d.world {
    /**
     * The capsule table has `center1`, `center2`, and `radius` fields. The return
     * value is the fraction of `translation` that can be traveled before collision,
     * or 1 if there is no hit.
     *
     * @param world - world
     * @param capsule - capsule table with `center1`, `center2`, and `radius`
     * @param translation - capsule displacement
     * @param filter - optional query filter with `category_bits` and `mask_bits`
     * @returns travel fraction before collision
     */
    function cast_mover(world: Opaque<"b2World">, capsule: { center1?: Vector3; center2?: Vector3; radius?: number }, translation: Vector3, filter?: { category_bits?: number; mask_bits?: number }): number;
    /**
     * Cast a ray.
     *
     * @param world - world from `b2d.get_world` or `b2d.body.get_world`
     * @param origin - world ray origin
     * @param translation - world ray translation
     * @param filter - optional query filter with `category_bits`, `mask_bits`, and optional `group_index`
     * @param max_results - optional maximum result count
     */
    function cast_ray(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results: number): LuaMultiReturn<[{ fixture: number; shape: number; point: Vector3; normal: Vector3; fraction: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * The translation is the ray displacement from `origin`. Result order is not
     * guaranteed by Box2D.
     *
     * @param world - world
     * @param origin - ray start position
     * @param translation - ray displacement
     * @param filter - optional query filter with `category_bits` and `mask_bits`
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function cast_ray(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter?: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results?: number): LuaMultiReturn<[{ fixture: number; shape: number; point: Vector3; normal: Vector3; fraction: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * Cast a ray and return the closest hit.
     *
     * @param world - world from `b2d.get_world` or `b2d.body.get_world`
     * @param origin - world ray origin
     * @param translation - world ray translation
     * @param filter - optional query filter with `category_bits`, `mask_bits`, and optional `group_index`
     * @returns hit table with `fixture`, `shape`, `point`, `normal`, `fraction`, `node_visits`, and `leaf_visits`, or nil
     */
    function cast_ray_closest(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter: { category_bits?: number; mask_bits?: number; group_index?: number }): { fixture: number; shape: number; point: Vector3; normal: Vector3; fraction: number; node_visits: number; leaf_visits: number };
    /**
     * The translation is the ray displacement from `origin`.
     *
     * @param world - world
     * @param origin - ray start position
     * @param translation - ray displacement
     * @param filter - optional query filter with `category_bits` and `mask_bits`
     * @returns closest cast hit table with `node_visits` and `leaf_visits`, or `nil` on miss
     */
    function cast_ray_closest(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter?: { category_bits?: number; mask_bits?: number; group_index?: number }): { fixture: number; shape: number; point: Vector3; normal: Vector3; fraction: number; node_visits: number; leaf_visits: number } | undefined;
    /**
     * Uses Box2D v2 time-of-impact for fixture child shapes that support distance proxies.
     * Grid fixture children are skipped.
     *
     * @param world - world from `b2d.get_world` or `b2d.body.get_world`
     * @param shape - shape table using the same format as the `shape` field in `b2d.body.create_fixture`
     * @param translation - world shape translation
     * @param filter - optional query filter with `category_bits`, `mask_bits`, and optional `group_index`
     * @param max_results - optional maximum result count
     */
    function cast_shape(world: Opaque<"b2World">, shape: { type?: number; radius?: number; center?: Vector3; v0?: Vector3; v1?: Vector3; v2?: Vector3; v3?: Vector3; vertices?: Vector3[]; hx?: number; hy?: number; angle?: number; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, translation: Vector3, filter: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results: number): LuaMultiReturn<[{ fixture: number; shape: number; point: Vector3; normal: Vector3; fraction: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * The shape table uses the same circle, capsule, segment, polygon, and box formats
     * as `b2d.body.create_shape`. The translation is the shape displacement.
     *
     * @param world - world
     * @param shape - shape table
     * @param translation - shape displacement
     * @param filter - optional query filter with `category_bits` and `mask_bits`
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function cast_shape(world: Opaque<"b2World">, shape: { type?: number; radius?: number; center?: Vector3; v0?: Vector3; v1?: Vector3; v2?: Vector3; v3?: Vector3; vertices?: Vector3[]; hx?: number; hy?: number; angle?: number; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, translation: Vector3, filter?: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results?: number): LuaMultiReturn<[{ fixture: number; shape: number; point: Vector3; normal: Vector3; fraction: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * The capsule table has `center1`, `center2`, and `radius` fields. Plane result
     * tables include `shape`, `normal`, `offset`, and `hit`.
     *
     * @param world - world
     * @param capsule - capsule table with `center1`, `center2`, and `radius`
     * @param filter - optional query filter with `category_bits` and `mask_bits`
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     * @returns array of plane result tables
     */
    function collide_mover(world: Opaque<"b2World">, capsule: { center1?: Vector3; center2?: Vector3; radius?: number }, filter?: { category_bits?: number; mask_bits?: number }, max_results?: number): Record<string | number, unknown>;
    /**
     * Enable or disable continuous collision.
     *
     * @param world - world
     * @param enable - true to enable continuous collision
     */
    function enable_continuous(world: Opaque<"b2World">, enable: boolean): void;
    /**
     * Enable or disable world sleeping.
     *
     * @param world - world
     * @param enable - true to allow sleeping
     */
    function enable_sleeping(world: Opaque<"b2World">, enable: boolean): void;
    /**
     * Enable or disable speculative collision.
     *
     * @param world - world
     * @param enable - true to enable speculative collision
     */
    function enable_speculative(world: Opaque<"b2World">, enable: boolean): void;
    /**
     * Enable or disable warm starting.
     *
     * @param world - world
     * @param enable - true to enable warm starting
     */
    function enable_warm_starting(world: Opaque<"b2World">, enable: boolean): void;
    /**
     * The definition table requires `position`, `radius`, `falloff`, and
     * `impulse_per_length`. It may also include `mask_bits`.
     *
     * @param world - world
     * @param definition - explosion definition
     */
    function explode(world: Opaque<"b2World">, definition: Record<string | number, unknown>): void;
    /**
     * Get the number of awake bodies.
     *
     * @param world - world
     * @returns awake body count
     */
    function get_awake_body_count(world: Opaque<"b2World">): number;
    /**
     * The returned table contains `body_count`, `shape_count`, `contact_count`,
     * `joint_count`, `island_count`, `stack_used`, `static_tree_height`,
     * `tree_height`, `byte_count`, `task_count`, and `color_counts`.
     *
     * @param world - world
     * @returns world counters
     */
    function get_counters(world: Opaque<"b2World">): Record<string | number, unknown>;
    /**
     * Get world gravity.
     *
     * @param world - world
     * @returns gravity vector
     */
    function get_gravity(world: Opaque<"b2World">): Vector3;
    /**
     * Get the hit event threshold.
     *
     * @param world - world
     * @returns hit event threshold in project units per second
     */
    function get_hit_event_threshold(world: Opaque<"b2World">): number;
    /**
     * Get the maximum linear speed.
     *
     * @param world - world
     * @returns maximum linear speed in project units per second
     */
    function get_maximum_linear_speed(world: Opaque<"b2World">): number;
    /**
     * The returned table contains Box2D timing fields including `step`, `pairs`,
     * `collide`, `solve`, `merge_islands`, `prepare_stages`, `solve_constraints`,
     * `prepare_constraints`, `integrate_velocities`, `warm_start`,
     * `solve_impulses`, `integrate_positions`, `relax_impulses`,
     * `apply_restitution`, `store_impulses`, `split_islands`, `transforms`,
     * `hit_events`, `refit`, `bullets`, `sleep_islands`, and `sensors`.
     *
     * @param world - world
     * @returns world profiling data
     */
    function get_profile(world: Opaque<"b2World">): Record<string | number, unknown>;
    /**
     * Get the restitution threshold.
     *
     * @param world - world
     * @returns restitution threshold in project units per second
     */
    function get_restitution_threshold(world: Opaque<"b2World">): number;
    /**
     * Get whether continuous collision is enabled.
     *
     * @param world - world
     * @returns true if continuous collision is enabled
     */
    function is_continuous_enabled(world: Opaque<"b2World">): boolean;
    /**
     * The world is locked during callbacks and some simulation phases. Functions
     * marked as locked during callbacks cannot be called while this returns true.
     *
     * @param world - world
     * @returns true if the world is locked
     */
    function is_locked(world: Opaque<"b2World">): boolean;
    /**
     * Get whether world sleeping is enabled.
     *
     * @param world - world
     * @returns true if sleeping is enabled
     */
    function is_sleeping_enabled(world: Opaque<"b2World">): boolean;
    /**
     * Check whether a world handle is valid.
     *
     * @param world - world
     * @returns true if the world handle is valid
     */
    function is_valid(world: Opaque<"b2World">): boolean;
    /**
     * Get whether warm starting is enabled.
     *
     * @param world - world
     * @returns true if warm starting is enabled
     */
    function is_warm_starting_enabled(world: Opaque<"b2World">): boolean;
    /**
     * Overlap an AABB.
     *
     * @param world - world from `b2d.get_world` or `b2d.body.get_world`
     * @param aabb - table with `lower` and `upper` vector3 fields
     * @param filter - optional query filter with `category_bits`, `mask_bits`, and optional `group_index`
     * @param max_results - optional maximum result count
     */
    function overlap_aabb(world: Opaque<"b2World">, aabb: { lower?: Vector3; upper?: Vector3 }, filter: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results: number): LuaMultiReturn<[{ index: number; type: number; sensor: boolean; density: number; friction: number; restitution: number; child_count: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * The AABB table has `lower` and `upper` `vector3` fields.
     *
     * @param world - world
     * @param aabb - AABB table with `lower` and `upper`
     * @param filter - optional query filter with `category_bits` and `mask_bits`
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function overlap_aabb(world: Opaque<"b2World">, aabb: { lower?: Vector3; upper?: Vector3 }, filter?: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results?: number): LuaMultiReturn<[{ shape_id: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * Overlap a shape.
     *
     * @param world - world from `b2d.get_world` or `b2d.body.get_world`
     * @param shape - shape table using the same format as the `shape` field in `b2d.body.create_fixture`
     * @param filter - optional query filter with `category_bits`, `mask_bits`, and optional `group_index`
     * @param max_results - optional maximum result count
     */
    function overlap_shape(world: Opaque<"b2World">, shape: { type?: number; radius?: number; center?: Vector3; v0?: Vector3; v1?: Vector3; v2?: Vector3; v3?: Vector3; vertices?: Vector3[]; hx?: number; hy?: number; angle?: number; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, filter: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results: number): LuaMultiReturn<[{ index: number; type: number; sensor: boolean; density: number; friction: number; restitution: number; child_count: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * The shape table uses the same circle, capsule, segment, polygon, and box formats
     * as `b2d.body.create_shape`.
     *
     * @param world - world
     * @param shape - shape table
     * @param filter - optional query filter with `category_bits` and `mask_bits`
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function overlap_shape(world: Opaque<"b2World">, shape: { type?: number; radius?: number; center?: Vector3; v0?: Vector3; v1?: Vector3; v2?: Vector3; v3?: Vector3; vertices?: Vector3[]; hx?: number; hy?: number; angle?: number; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, filter?: { category_bits?: number; mask_bits?: number; group_index?: number }, max_results?: number): LuaMultiReturn<[{ shape_id: number }[], { node_visits: number; leaf_visits: number }]>;
    /**
     * Rebuild the static broad-phase tree.
     *
     * @param world - world
     */
    function rebuild_static_tree(world: Opaque<"b2World">): void;
    /**
     * Set contact solver tuning.
     *
     * @param world - world
     * @param hertz - contact stiffness frequency in hertz
     * @param damping_ratio - contact damping ratio
     * @param pushout - pushout velocity in project units per second
     */
    function set_contact_tuning(world: Opaque<"b2World">, hertz: number, damping_ratio: number, pushout: number): void;
    /**
     * Set world gravity.
     *
     * @param world - world
     * @param gravity - gravity vector
     */
    function set_gravity(world: Opaque<"b2World">, gravity: Vector3): void;
    /**
     * Set the hit event threshold.
     *
     * @param world - world
     * @param threshold - hit event threshold in project units per second
     */
    function set_hit_event_threshold(world: Opaque<"b2World">, threshold: number): void;
    /**
     * Set joint solver tuning.
     *
     * @param world - world
     * @param hertz - joint stiffness frequency in hertz
     * @param damping_ratio - joint damping ratio
     */
    function set_joint_tuning(world: Opaque<"b2World">, hertz: number, damping_ratio: number): void;
    /**
     * Set the maximum linear speed.
     *
     * @param world - world
     * @param speed - maximum linear speed in project units per second
     */
    function set_maximum_linear_speed(world: Opaque<"b2World">, speed: number): void;
    /**
     * Collisions below this relative speed use inelastic collision response.
     *
     * @param world - world
     * @param threshold - restitution threshold in project units per second
     */
    function set_restitution_threshold(world: Opaque<"b2World">, threshold: number): void;
  }
}

export {};

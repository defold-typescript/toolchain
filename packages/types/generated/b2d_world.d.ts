/** @noSelfInFile */
import type { Opaque, Vector3 } from "../src/core-types";

declare global {
  /**
   * Query and cast functions for the Defold-owned Box2D v2 world.
   */
  namespace b2d.world {
    /**
     * The return value is the fraction of `translation` that can be traveled before collision,
     * or 1 if there is no hit.
     *
     * @param world - world
     * @param capsule - mover capsule
     * @param translation - capsule displacement
     * @param filter - optional query filter
     * @returns travel fraction before collision
     */
    function cast_mover(world: Opaque<"b2World">, capsule: b2d.mover_capsule, translation: Vector3, filter?: b2d.query_filter): number;
    /**
     * Cast a ray.
     *
     * @param world - world from b2d.get_world or b2d.body.get_world
     * @param origin - world ray origin
     * @param translation - world ray translation
     * @param filter - optional query filter
     * @param max_results - optional maximum result count
     */
    function cast_ray(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.fixture_cast_hit[], b2d.tree_stats]>;
    /**
     * The translation is the ray displacement from `origin`. Result order is not
     * guaranteed by Box2D.
     *
     * @param world - world
     * @param origin - ray start position
     * @param translation - ray displacement
     * @param filter - optional query filter
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function cast_ray(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.shape_cast_hit[], b2d.tree_stats]>;
    /**
     * Cast a ray and return the closest hit.
     *
     * @param world - world from b2d.get_world or b2d.body.get_world
     * @param origin - world ray origin
     * @param translation - world ray translation
     * @param filter - optional query filter
     * @returns closest hit, or `nil`
     */
    function cast_ray_closest(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter?: b2d.query_filter): b2d.fixture_cast_hit | undefined;
    /**
     * The translation is the ray displacement from `origin`.
     *
     * @param world - world
     * @param origin - ray start position
     * @param translation - ray displacement
     * @param filter - optional query filter
     * @returns closest hit, or `nil`
     */
    function cast_ray_closest(world: Opaque<"b2World">, origin: Vector3, translation: Vector3, filter?: b2d.query_filter): b2d.shape_cast_hit | undefined;
    /**
     * Uses Box2D v2 time-of-impact for fixture child shapes that support distance proxies.
     * Grid fixture children are skipped.
     *
     * @param world - world from b2d.get_world or b2d.body.get_world
     * @param shape - query shape
     * @param translation - world shape translation
     * @param filter - optional query filter
     * @param max_results - optional maximum result count
     */
    function cast_shape(world: Opaque<"b2World">, shape: { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; hx: number; hy: number; center?: Vector3; angle?: number } | { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; vertices: Vector3[] } | { type: typeof b2d.shape.SHAPE_TYPE_CIRCLE; radius: number; center?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CAPSULE; radius: number; center1: Vector3; center2: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_EDGE | typeof b2d.shape.SHAPE_TYPE_SEGMENT; v1: Vector3; v2: Vector3; v0?: Vector3; v3?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CHAIN; vertices: Vector3[]; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, translation: Vector3, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.fixture_cast_hit[], b2d.tree_stats]>;
    /**
     * The translation is the shape displacement.
     *
     * @param world - world
     * @param shape - cast shape
     * @param translation - shape displacement
     * @param filter - optional query filter
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function cast_shape(world: Opaque<"b2World">, shape: { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; hx: number; hy: number; center?: Vector3; angle?: number } | { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; vertices: Vector3[] } | { type: typeof b2d.shape.SHAPE_TYPE_CIRCLE; radius: number; center?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CAPSULE; radius: number; center1: Vector3; center2: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_EDGE | typeof b2d.shape.SHAPE_TYPE_SEGMENT; v1: Vector3; v2: Vector3; v0?: Vector3; v3?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CHAIN; vertices: Vector3[]; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, translation: Vector3, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.shape_cast_hit[], b2d.tree_stats]>;
    /**
     * Collide a mover capsule against the world.
     *
     * @param world - world
     * @param capsule - mover capsule
     * @param filter - optional query filter
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     * @returns collision planes
     */
    function collide_mover(world: Opaque<"b2World">, capsule: b2d.mover_capsule, filter?: b2d.query_filter, max_results?: number): b2d.mover_plane[];
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
     * Apply an explosion impulse.
     *
     * @param world - world
     * @param definition - explosion definition
     */
    function explode(world: Opaque<"b2World">, definition: b2d.explosion_definition): void;
    /**
     * Get the number of awake bodies.
     *
     * @param world - world
     * @returns awake body count
     */
    function get_awake_body_count(world: Opaque<"b2World">): number;
    /**
     * Get world counters.
     *
     * @param world - world
     * @returns world counters
     */
    function get_counters(world: Opaque<"b2World">): b2d.world_counters;
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
     * Get world profiling data.
     *
     * @param world - world
     * @returns world profiling data
     */
    function get_profile(world: Opaque<"b2World">): b2d.world_profile;
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
     * @param world - world from b2d.get_world or b2d.body.get_world
     * @param aabb - query bounds
     * @param filter - optional query filter
     * @param max_results - optional maximum result count
     * @returns `[fixtures, stats]`:
     * - `fixtures` — overlapping fixtures. **⚠️ `index` is 1-based; passed to Defold unchanged.**
     * - `stats` — broad-phase query statistics
     */
    function overlap_aabb(world: Opaque<"b2World">, aabb: b2d.aabb, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.fixture_info[], b2d.tree_stats]>;
    /**
     * Find shapes overlapping an AABB.
     *
     * @param world - world
     * @param aabb - query bounds
     * @param filter - optional query filter
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function overlap_aabb(world: Opaque<"b2World">, aabb: b2d.aabb, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.shape_info[], b2d.tree_stats]>;
    /**
     * Overlap a shape.
     *
     * @param world - world from b2d.get_world or b2d.body.get_world
     * @param shape - query shape
     * @param filter - optional query filter
     * @param max_results - optional maximum result count
     * @returns `[fixtures, stats]`:
     * - `fixtures` — overlapping fixtures. **⚠️ `index` is 1-based; passed to Defold unchanged.**
     * - `stats` — broad-phase query statistics
     */
    function overlap_shape(world: Opaque<"b2World">, shape: { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; hx: number; hy: number; center?: Vector3; angle?: number } | { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; vertices: Vector3[] } | { type: typeof b2d.shape.SHAPE_TYPE_CIRCLE; radius: number; center?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CAPSULE; radius: number; center1: Vector3; center2: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_EDGE | typeof b2d.shape.SHAPE_TYPE_SEGMENT; v1: Vector3; v2: Vector3; v0?: Vector3; v3?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CHAIN; vertices: Vector3[]; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.fixture_info[], b2d.tree_stats]>;
    /**
     * Find shapes overlapping a shape proxy.
     *
     * @param world - world
     * @param shape - query shape
     * @param filter - optional query filter
     * @param max_results - optional maximum result count. Omit or pass 0 for unlimited results.
     */
    function overlap_shape(world: Opaque<"b2World">, shape: { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; hx: number; hy: number; center?: Vector3; angle?: number } | { type: typeof b2d.shape.SHAPE_TYPE_POLYGON | typeof b2d.shape.SHAPE_TYPE_BOX; vertices: Vector3[] } | { type: typeof b2d.shape.SHAPE_TYPE_CIRCLE; radius: number; center?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CAPSULE; radius: number; center1: Vector3; center2: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_EDGE | typeof b2d.shape.SHAPE_TYPE_SEGMENT; v1: Vector3; v2: Vector3; v0?: Vector3; v3?: Vector3 } | { type: typeof b2d.shape.SHAPE_TYPE_CHAIN; vertices: Vector3[]; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }, filter?: b2d.query_filter, max_results?: number): LuaMultiReturn<[b2d.shape_info[], b2d.tree_stats]>;
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

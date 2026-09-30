/** @noSelfInFile */
import type { Opaque, Vector3 } from "../src/core-types";

declare global {
  /**
   * Read and tune the Bullet dynamics world owned by the current collection.
   * Defold remains responsible for world lifetime, stepping, collision objects,
   * callbacks, and debug drawing.
   *
   * World and collision-object values returned by this API are borrowed,
   * generational handles. They become invalid when their collection or owning
   * game object is deleted and must not be retained as native pointers.
   *
   * All positions, distances, translations, dimensions and contact distances use
   * Defold world units. The binding converts them using `physics.scale`. Rotations
   * and unit normals are not scaled. Query functions refresh Bullet broadphase
   * AABBs before execution, so collision-object transform changes are visible.
   *
   * Query filters are optional tables with these fields:
   *
   * `category_bits`
   * : [type:integer] unsigned 16-bit category bits, default `65535`
   *
   * `mask_bits`
   * : [type:integer] unsigned 16-bit mask bits, default `65535`
   *
   * `include_triggers`
   * : [type:boolean] include objects without contact response, default `true`
   *
   * `ignore`
   * : [type:btCollisionObject|btCollisionObject[]] one collision-object handle or an array of handles to exclude
   *
   * `report_initial_overlaps`
   * : [type:boolean] report shapes overlapping the cast origin as synthesized fraction-zero hits, default `false`
   *
   * `report_initial_overlaps` is a `bullet3d.world` query option only. It does
   * not change `physics.raycast()` or either Box2D backend.
   *
   * Category and mask checks are reciprocal: the query category must match the
   * object's mask and the object's category must match the query mask.
   *
   * Temporary query shapes use the same geometry fields as
   * [ref:bullet3d.shape.get_shape]:
   * a sphere has `type` and `diameter`, a box has `type` and `dimensions`, a
   * Y-axis capsule has `type`, `diameter` and `height`, and a convex hull has
   * `type` and a `vertices` array with at least four `vector3` values. The `type`
   * is one of the `bullet3d.shape.SHAPE_TYPE_*` constants. Every shape can specify
   * `position` and `rotation`; their defaults are zero and the identity rotation.
   * Cast shapes can also specify `target_rotation`, which defaults to `rotation`.
   * Capsule `height` is the length of the cylindrical middle section; total
   * end-to-end height is `height + diameter`. Query sizes are always expressed
   * in Defold world units. Except for triangle meshes, a table returned by
   * `bullet3d.shape.get_shape` can be reused directly after adding the desired
   * query transform fields. Queries accept only sphere, box, capsule, and hull.
   * Hull vertices describe a convex hull; concave input is convexified by Bullet.
   * All query vectors and scalar sizes must be finite. Diameters, dimensions and
   * capsule heights must be greater than zero; hulls require at least four finite
   * vertices. Cast translations must be finite and non-zero. Query rotations
   * must be finite, non-zero quaternions and are normalized by the binding. AABB
   * lower bounds must not exceed their corresponding upper bounds.
   *
   * Overlap and enumeration results are arrays of `btCollisionObject` handles.
   * Cast results are tables containing `object`, `point`, `normal`, `fraction`,
   * `initial_overlap`, and `inside`. `shape_index` is present when Bullet reports
   * a compound child and is one-based. Cast arrays are sorted by ascending
   * fraction. `fraction` is in `[0, 1]` along the supplied translation. For native
   * hits, `normal` is the hit object's outward unit surface normal; synthesized
   * initial-overlap hits use a zero normal. `inside` is true for a synthesized
   * ray-origin hit when Bullet reports signed contact distance less than or equal
   * to zero. It denotes initial contact or penetration rather than strict
   * geometric containment, and exact-surface cases follow Bullet's contact
   * tolerance. Shape-cast initial overlaps set only `initial_overlap`.
   *
   * Contact results contain `object_a`, `object_b`, `position_a`, `position_b`,
   * `normal_on_b`, and signed `distance`. Positions are points on their named
   * objects, and `normal_on_b` points from object B toward object A. A negative
   * distance is penetration and a small positive distance is Bullet's contact
   * margin. Object order is always normalized to the order supplied by the caller.
   *
   * `max_results` is optional. Zero or omission means unlimited results. A
   * negative value is an error. Broadphase overlaps, native world enumeration,
   * contacts, and equal-fraction cast hits have unspecified order. A capped query
   * can therefore return a different equal-priority subset after world changes.
   * Synchronous queries execute immediately and do not advance simulation.
   * Async casts are deferred until after the next physics step. They execute on
   * the main thread rather than a worker thread, and all queued casts for one
   * world share one broadphase AABB refresh. Every cast in the batch completes
   * before any callback runs, so callback mutations cannot affect other query
   * computations in that batch. Deferral avoids blocking the Lua call site but
   * does not remove the cast work from the frame.
   * Native fraction-zero cast callbacks are suppressed. Starting overlaps are
   * omitted by default, or reported through the exact, deduplicated synthesis
   * enabled by `report_initial_overlaps`; this avoids direction-dependent Bullet
   * results for casts that start touching or penetrating another object.
   */
  namespace bullet3d.world {
    /**
     * Bullet world axis-aligned bounding box
     */
    interface aabb {
      /**
       * lower world-space bound in Defold units
       */
      lower: Vector3;
      /**
       * upper world-space bound in Defold units
       */
      upper: Vector3;
    }
    /**
     * Bullet world cast result
     */
    interface cast_result {
      /**
       * hit collision object
       */
      object: Opaque<"btCollisionObject" | "btRigidBody">;
      /**
       * hit point in world space and Defold units
       */
      point: Vector3;
      /**
       * outward unit surface normal
       */
      normal: Vector3;
      /**
       * fraction along the supplied translation in `[0, 1]`
       */
      fraction: number;
      /**
       * one-based compound child index
       */
      shape_index?: number;
      /**
       * whether the hit was synthesized from an initial overlap
       */
      initial_overlap: boolean;
      /**
       * whether a synthesized ray-origin hit starts inside the object
       */
      inside: boolean;
    }
    /**
     * Bullet world contact result
     */
    interface contact_result {
      /**
       * first collision object
       */
      object_a: Opaque<"btCollisionObject" | "btRigidBody">;
      /**
       * second collision object
       */
      object_b: Opaque<"btCollisionObject" | "btRigidBody">;
      /**
       * contact point on object A in world space and Defold units
       */
      position_a: Vector3;
      /**
       * contact point on object B in world space and Defold units
       */
      position_b: Vector3;
      /**
       * unit normal pointing from object B toward object A
       */
      normal_on_b: Vector3;
      /**
       * signed contact distance in Defold units
       */
      distance: number;
    }
    /**
     * Bullet world query filter
     */
    interface query_filter {
      /**
       * unsigned 16-bit category bits; defaults to `65535`
       */
      category_bits?: number;
      /**
       * unsigned 16-bit mask bits; defaults to `65535`
       */
      mask_bits?: number;
      /**
       * whether to include objects without contact response; defaults to `true`
       */
      include_triggers?: boolean;
      /**
       * one collision object or an array of collision objects to exclude
       */
      ignore?: Opaque<"btCollisionObject" | "btRigidBody"> | Opaque<"btCollisionObject" | "btRigidBody">[];
      /**
       * whether casts synthesize fraction-zero hits for initial overlaps; defaults to `false`
       */
      report_initial_overlaps?: boolean;
    }
    /**
     * Casts immediately from `origin` to `origin + translation` and returns all
     * matching hits sorted by fraction. Translation must be non-zero.
     * Bullet's convex ray test normally does not report a ray whose start and end are both inside
     * the same convex hull. Set `filter.report_initial_overlaps = true` to perform
     * an exact point-overlap test at the origin and synthesize one deduplicated hit
     * per initially touching or overlapping object with `fraction = 0`, zero `normal`,
     * `point = origin`, `initial_overlap = true`, and `inside = true`. The point is
     * the query origin, not a surface contact. This explicitly supports the
     * inside-hull behavior requested by issue #5348. Fraction-zero native callbacks
     * and starting overlaps are suppressed when the option is false.
     *
     * @param world - world handle
     * @param origin - ray origin in world space
     * @param translation - non-zero ray displacement in world units
     * @param filter - query filter
     * @param max_results - maximum sorted hits, or zero for all
     * @returns cast results sorted by ascending fraction. **⚠️ `shape_index` is 1-based; passed to Defold unchanged.**
     */
    function cast_ray(world: bullet3d.btDiscreteDynamicsWorld, origin: Vector3, translation: Vector3, filter?: bullet3d.world.query_filter, max_results?: number): bullet3d.world.cast_result[];
    /**
     * Queues the same ray query as bullet3d.world.cast_ray and returns without
     * executing it. After the next physics step, `callback(self, hits)` receives the
     * cast-result array sorted by fraction. The query observes post-step world state.
     * It is deferred on the main thread, not executed concurrently; use it to move
     * work out of the current Lua call and to query the stepped state, not as a
     * guarantee of lower total CPU time. Queued casts for the same world share one
     * broadphase AABB refresh and all finish before their callbacks begin.
     *
     * @param world - world handle
     * @param origin - ray origin in world space
     * @param translation - non-zero ray displacement in world units
     * @param callback - function called as `callback(self, hits)`
     * @param filter - query filter
     * @param max_results - maximum sorted hits, or zero for all
     * @example
     * ```ts
     * // Queue a downward cast and inspect only the closest non-trigger hit:
     * const world = bullet3d.get_world();
     * if (world !== undefined) {
     *   bullet3d.world.cast_ray_async(
     *     world,
     *     go.get_world_position(),
     *     vmath.vector3(0, -100, 0),
     *     (self, hits) => {
     *       const hit = hits[0];
     *       if (hit !== undefined) {
     *         print("hit", hit.object);
     *       }
     *     },
     *     { include_triggers: false },
     *     1,
     *   );
     * }
     * ```
     */
    function cast_ray_async(world: bullet3d.btDiscreteDynamicsWorld, origin: Vector3, translation: Vector3, callback: (self: unknown, hits: bullet3d.world.cast_result[]) => void, filter?: bullet3d.world.query_filter, max_results?: number): void;
    /**
     * Equivalent to bullet3d.world.cast_ray with one result, but returns the
     * hit table directly or `nil` on a miss.
     *
     * @param world - world handle
     * @param origin - ray origin in world space
     * @param translation - non-zero ray displacement in world units
     * @param filter - query filter
     * @returns closest cast result, or `nil` on a miss. **⚠️ `shape_index` is 1-based; passed to Defold unchanged.**
     * @example
     * ```ts
     * // Cast downward and report the closest non-trigger hit:
     * export default defineScript({
     *   init() {
     *     const world = bullet3d.get_world();
     *     if (world === undefined) return;
     *     const origin = go.get_world_position();
     *     const translation = vmath.vector3(0, -100, 0);
     *     const filter = { include_triggers: false };
     *
     *     const hit = bullet3d.world.cast_ray_closest(world, origin, translation, filter);
     *     if (hit !== undefined) {
     *       const distance = vmath.length(translation) * hit.fraction;
     *       print("hit", hit.object, "after", distance, "units");
     *     }
     *   },
     * });
     * ```
     */
    function cast_ray_closest(world: bullet3d.btDiscreteDynamicsWorld, origin: Vector3, translation: Vector3, filter?: bullet3d.world.query_filter): bullet3d.world.cast_result | undefined;
    /**
     * Sweeps the temporary shape from `shape.position` by `translation`, while
     * interpolating from `shape.rotation` to `shape.target_rotation`. Translation
     * must be non-zero. The query executes immediately and returns all matching hits
     * sorted by fraction. Bullet's convex sweep supports only convex query shapes.
     * When `filter.report_initial_overlaps` is true, an exact contact test at the
     * starting transform synthesizes one deduplicated hit per overlapping object
     * with `fraction = 0`, `point = shape.position`, zero `normal`,
     * `initial_overlap = true`, and `inside = false`. The point is the query-shape
     * origin, not a surface contact, and the result does not report penetration depth.
     *
     * @param world - world handle
     * @param shape - convex query shape with optional target rotation
     * @param translation - non-zero sweep displacement in world units
     * @param filter - query filter
     * @param max_results - maximum sorted hits, or zero for all
     * @returns cast results sorted by ascending fraction. **⚠️ `shape_index` is 1-based; passed to Defold unchanged.**
     */
    function cast_shape(world: bullet3d.btDiscreteDynamicsWorld, shape: bullet3d.shape.definition, translation: Vector3, filter?: bullet3d.world.query_filter, max_results?: number): bullet3d.world.cast_result[];
    /**
     * Queues the same convex sweep as bullet3d.world.cast_shape and returns
     * without executing it. After the next physics step, `callback(self, hits)`
     * receives the sorted cast-result array from the post-step world state. The
     * operation is deferred on the main thread rather than run concurrently. All
     * queued casts for one world share one broadphase AABB refresh and all finish
     * before their callbacks begin.
     *
     * @param world - world handle
     * @param shape - convex query shape with optional target rotation
     * @param translation - non-zero sweep displacement in world units
     * @param callback - function called as `callback(self, hits)`
     * @param filter - query filter
     * @param max_results - maximum sorted hits, or zero for all
     */
    function cast_shape_async(world: bullet3d.btDiscreteDynamicsWorld, shape: bullet3d.shape.definition, translation: Vector3, callback: (self: unknown, hits: bullet3d.world.cast_result[]) => void, filter?: bullet3d.world.query_filter, max_results?: number): void;
    /**
     * Equivalent to bullet3d.world.cast_shape with one result, but returns
     * the hit table directly or `nil` on a miss.
     *
     * @param world - world handle
     * @param shape - convex query shape with optional target rotation
     * @param translation - non-zero sweep displacement in world units
     * @param filter - query filter
     * @returns closest cast result, or `nil` on a miss. **⚠️ `shape_index` is 1-based; passed to Defold unchanged.**
     */
    function cast_shape_closest(world: bullet3d.btDiscreteDynamicsWorld, shape: bullet3d.shape.definition, translation: Vector3, filter?: bullet3d.world.query_filter): bullet3d.world.cast_result | undefined;
    /**
     * Runs Bullet's discrete pair contact algorithm without changing the simulation.
     * Both borrowed handles must belong to `world` and must identify different
     * objects. The output preserves the caller's A/B order even when Bullet's
     * internal manifold order is reversed. Collision filters are not applied to an
     * explicitly selected pair.
     *
     * @param world - world handle
     * @param object_a - first collision object in the world
     * @param object_b - different second collision object in the world
     * @param max_results - maximum number of contact points, or zero for all
     * @returns normalized contact results
     */
    function contact_pair_test(world: bullet3d.btDiscreteDynamicsWorld, object_a: Opaque<"btCollisionObject" | "btRigidBody">, object_b: Opaque<"btCollisionObject" | "btRigidBody">, max_results?: number): bullet3d.world.contact_result[];
    /**
     * Runs Bullet's discrete contact test between `object` and matching objects in
     * the same world. The supplied object is always `object_a` in returned contacts.
     * The borrowed collision-object handle must belong to `world`. Bullet may return
     * several contact points for one object pair and may include small positive
     * contact-margin distances.
     *
     * @param world - world handle
     * @param object - collision object belonging to the world
     * @param filter - filter applied to candidate `object_b` values
     * @param max_results - maximum number of contact points, or zero for all
     * @returns normalized contact results
     * @example
     * ```ts
     * // Inspect current contacts for this collision object:
     * export default defineScript({
     *   update(self, dt) {
     *     const world = bullet3d.get_world();
     *     const object = bullet3d.get_collision_object("#collisionobject");
     *     if (world === undefined || object === undefined) return;
     *     const filter = { include_triggers: false };
     *     const contacts = bullet3d.world.contact_test(world, object, filter);
     *
     *     for (const contact of contacts) {
     *       if (contact.distance < 0) {
     *         print("penetration", -contact.distance, "against", contact.object_b);
     *       }
     *     }
     *   },
     * });
     * ```
     */
    function contact_test(world: bullet3d.btDiscreteDynamicsWorld, object: Opaque<"btCollisionObject" | "btRigidBody">, filter?: bullet3d.world.query_filter, max_results?: number): bullet3d.world.contact_result[];
    /**
     * Get the number of collision objects in the world
     *
     * @param world - world handle
     * @returns number of collision objects
     */
    function get_collision_object_count(world: bullet3d.btDiscreteDynamicsWorld): number;
    /**
     * Returns the Defold-owned collision objects currently registered in the world.
     * Internal or unmanaged Bullet objects without Defold ownership metadata are
     * not exposed.
     *
     * @param world - world handle
     * @param max_results - maximum number of results, or zero for all
     * @returns array of collision-object handles
     */
    function get_collision_objects(world: bullet3d.btDiscreteDynamicsWorld, max_results?: number): Opaque<"btCollisionObject" | "btRigidBody">[];
    /**
     * Get world gravity
     *
     * @param world - world handle
     * @returns gravity in Defold units per second squared
     */
    function get_gravity(world: bullet3d.btDiscreteDynamicsWorld): Vector3;
    /**
     * Test whether a world handle is valid
     *
     * @param world - world handle
     * @returns `true` if the native world still exists
     */
    function is_valid(world: bullet3d.btDiscreteDynamicsWorld): boolean;
    /**
     * Finds collision objects whose Bullet broadphase bounds overlap the supplied
     * world-space AABB. This is intentionally a broadphase query and can include
     * objects whose actual collision geometry does not intersect the box. Use
     * bullet3d.world.overlap_point or
     * bullet3d.world.overlap_shape for exact narrow-phase overlap tests.
     *
     * @param world - world handle
     * @param aabb - world-space bounds
     * @param filter - query filter
     * @param max_results - maximum number of results, or zero for all
     * @returns array of overlapping collision-object handles
     */
    function overlap_aabb(world: bullet3d.btDiscreteDynamicsWorld, aabb: bullet3d.world.aabb, filter?: bullet3d.world.query_filter, max_results?: number): Opaque<"btCollisionObject" | "btRigidBody">[];
    /**
     * Performs an exact narrow-phase test using a temporary zero-radius Bullet
     * sphere at the world-space point. A result is returned only for a contact with
     * signed distance less than or equal to zero, so broadphase-only false positives
     * are removed. Results on an exact surface follow Bullet's contact tolerance.
     *
     * @param world - world handle
     * @param point - point in world space
     * @param filter - query filter
     * @param max_results - maximum number of results, or zero for all
     * @returns array of overlapping collision-object handles
     */
    function overlap_point(world: bullet3d.btDiscreteDynamicsWorld, point: Vector3, filter?: bullet3d.world.query_filter, max_results?: number): Opaque<"btCollisionObject" | "btRigidBody">[];
    /**
     * Performs an exact Bullet contact test for a temporary sphere, box, Y-axis
     * capsule, or convex hull. Multiple native contact points for the same target
     * object are deduplicated in the returned overlap array.
     *
     * @param world - world handle
     * @param shape - convex query shape
     * @param filter - query filter
     * @param max_results - maximum number of results, or zero for all
     * @returns array of overlapping collision-object handles
     * @example
     * ```ts
     * // Find non-trigger objects overlapping a two-unit sphere around this game object:
     * export default defineScript({
     *   init() {
     *     const world = bullet3d.get_world();
     *     if (world === undefined) return;
     *     const shape = {
     *       type: bullet3d.shape.SHAPE_TYPE_SPHERE,
     *       diameter: 2,
     *       position: go.get_world_position(),
     *     };
     *     const filter = { include_triggers: false };
     *     const overlaps = bullet3d.world.overlap_shape(world, shape, filter);
     *
     *     for (const object of overlaps) {
     *       print("overlap", object);
     *     }
     *   },
     * });
     * ```
     */
    function overlap_shape(world: bullet3d.btDiscreteDynamicsWorld, shape: bullet3d.shape.definition, filter?: bullet3d.world.query_filter, max_results?: number): Opaque<"btCollisionObject" | "btRigidBody">[];
    /**
     * Bullet propagates the new value to active dynamic bodies unless they have
     * `bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY` set. Such bodies retain their
     * custom body gravity.
     *
     * @param world - world handle
     * @param gravity - finite gravity in Defold units per second squared
     * @example
     * ```ts
     * // Set gravity for the current collection's physics world:
     * export default defineScript({
     *   init() {
     *     const world = bullet3d.get_world();
     *     if (world !== undefined) {
     *       bullet3d.world.set_gravity(world, vmath.vector3(0, -9.81, 0));
     *     }
     *   },
     * });
     * ```
     */
    function set_gravity(world: bullet3d.btDiscreteDynamicsWorld, gravity: Vector3): void;
  }
}

export {};

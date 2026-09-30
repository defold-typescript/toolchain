/** @noSelfInFile */
import type { Opaque, Quaternion, Vector3 } from "../src/core-types";

declare global {
  /**
   * Functions shared by rigid bodies and trigger ghost objects. Defold keeps
   * ownership of each object's user pointer, motion state, collision shape, and
   * world membership. Logical child shapes are inspected and mutated through
   * `bullet3d.shape`; ownership is not transferred to Lua.
   *
   * Positions, distances, and CCD thresholds use Defold units. Rotations,
   * coefficients, flags, activation state, and time values use Bullet values.
   * Floating-point and vector inputs must be finite. CCD radii and motion
   * thresholds must also be non-negative.
   */
  namespace bullet3d.collision_object {
    type ACTIVATION_STATE = typeof bullet3d.collision_object.ACTIVE_TAG | typeof bullet3d.collision_object.ISLAND_SLEEPING | typeof bullet3d.collision_object.WANTS_DEACTIVATION | typeof bullet3d.collision_object.DISABLE_DEACTIVATION | typeof bullet3d.collision_object.DISABLE_SIMULATION;
    type COLLISION_FLAG = typeof bullet3d.collision_object.CF_DYNAMIC_OBJECT | typeof bullet3d.collision_object.CF_STATIC_OBJECT | typeof bullet3d.collision_object.CF_KINEMATIC_OBJECT | typeof bullet3d.collision_object.CF_NO_CONTACT_RESPONSE | typeof bullet3d.collision_object.CF_CUSTOM_MATERIAL_CALLBACK | typeof bullet3d.collision_object.CF_CHARACTER_OBJECT | typeof bullet3d.collision_object.CF_DISABLE_VISUALIZE_OBJECT | typeof bullet3d.collision_object.CF_DISABLE_SPU_COLLISION_PROCESSING;
    type INTERNAL_TYPE = typeof bullet3d.collision_object.CO_COLLISION_OBJECT | typeof bullet3d.collision_object.CO_RIGID_BODY | typeof bullet3d.collision_object.CO_GHOST_OBJECT | typeof bullet3d.collision_object.CO_SOFT_BODY | typeof bullet3d.collision_object.CO_HF_FLUID;
    /**
     * Active simulation state.
     */
    const ACTIVE_TAG: number & { readonly __brand: "bullet3d.collision_object.ACTIVE_TAG" };
    /**
     * Character collision object flag.
     */
    const CF_CHARACTER_OBJECT: number & { readonly __brand: "bullet3d.collision_object.CF_CHARACTER_OBJECT" };
    /**
     * Custom material callback flag.
     */
    const CF_CUSTOM_MATERIAL_CALLBACK: number & { readonly __brand: "bullet3d.collision_object.CF_CUSTOM_MATERIAL_CALLBACK" };
    /**
     * Disable SPU collision processing flag.
     */
    const CF_DISABLE_SPU_COLLISION_PROCESSING: number & { readonly __brand: "bullet3d.collision_object.CF_DISABLE_SPU_COLLISION_PROCESSING" };
    /**
     * Disable debug visualization flag.
     */
    const CF_DISABLE_VISUALIZE_OBJECT: number & { readonly __brand: "bullet3d.collision_object.CF_DISABLE_VISUALIZE_OBJECT" };
    /**
     * Zero-valued default dynamic-object flag. Compare the complete collision-flags value with this constant; do not pass it to `has_collision_flag`, since zero is not a bit that can be tested.
     */
    const CF_DYNAMIC_OBJECT: number & { readonly __brand: "bullet3d.collision_object.CF_DYNAMIC_OBJECT" };
    /**
     * Kinematic collision object flag.
     */
    const CF_KINEMATIC_OBJECT: number & { readonly __brand: "bullet3d.collision_object.CF_KINEMATIC_OBJECT" };
    /**
     * Disable contact response flag.
     */
    const CF_NO_CONTACT_RESPONSE: number & { readonly __brand: "bullet3d.collision_object.CF_NO_CONTACT_RESPONSE" };
    /**
     * Static collision object flag.
     */
    const CF_STATIC_OBJECT: number & { readonly __brand: "bullet3d.collision_object.CF_STATIC_OBJECT" };
    /**
     * Generic collision object type.
     */
    const CO_COLLISION_OBJECT: number & { readonly __brand: "bullet3d.collision_object.CO_COLLISION_OBJECT" };
    /**
     * Ghost collision object type.
     */
    const CO_GHOST_OBJECT: number & { readonly __brand: "bullet3d.collision_object.CO_GHOST_OBJECT" };
    /**
     * Height-field fluid collision object type.
     */
    const CO_HF_FLUID: number & { readonly __brand: "bullet3d.collision_object.CO_HF_FLUID" };
    /**
     * Rigid body collision object type.
     */
    const CO_RIGID_BODY: number & { readonly __brand: "bullet3d.collision_object.CO_RIGID_BODY" };
    /**
     * Soft body collision object type.
     */
    const CO_SOFT_BODY: number & { readonly __brand: "bullet3d.collision_object.CO_SOFT_BODY" };
    /**
     * Disable automatic deactivation.
     */
    const DISABLE_DEACTIVATION: number & { readonly __brand: "bullet3d.collision_object.DISABLE_DEACTIVATION" };
    /**
     * Disable simulation.
     */
    const DISABLE_SIMULATION: number & { readonly __brand: "bullet3d.collision_object.DISABLE_SIMULATION" };
    /**
     * Sleeping simulation state.
     */
    const ISLAND_SLEEPING: number & { readonly __brand: "bullet3d.collision_object.ISLAND_SLEEPING" };
    /**
     * Wants-deactivation simulation state.
     */
    const WANTS_DEACTIVATION: number & { readonly __brand: "bullet3d.collision_object.WANTS_DEACTIVATION" };
    /**
     * Activate a collision object
     *
     * @param object - collision object
     * @param force - force activation of a static or kinematic object; defaults to `false`
     */
    function activate(object: Opaque<"btCollisionObject" | "btRigidBody">, force?: boolean): void;
    /**
     * Force the activation state
     *
     * @param object - collision object
     * @param state - activation state
     */
    function force_activation_state(object: Opaque<"btCollisionObject" | "btRigidBody">, state: bullet3d.collision_object.ACTIVATION_STATE): void;
    /**
     * Get the activation state
     *
     * @param object - collision object
     * @returns activation state
     */
    function get_activation_state(object: Opaque<"btCollisionObject" | "btRigidBody">): bullet3d.collision_object.ACTIVATION_STATE;
    /**
     * Get the CCD motion threshold
     *
     * @param object - collision object
     * @returns threshold in Defold units
     */
    function get_ccd_motion_threshold(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get the CCD swept sphere radius
     *
     * @param object - collision object
     * @returns radius in Defold units
     */
    function get_ccd_swept_sphere_radius(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Returns the raw unsigned 16-bit filter group that Defold assigned to the
     * object's Bullet broadphase proxy. Use this value as `category_bits` in a
     * `bullet3d.world` query filter. Bullet applies reciprocal filtering: the
     * query's `mask_bits` must include this group, and the query's `category_bits`
     * must be included in the object's filter mask.
     *
     * @param object - collision object in a Bullet world
     * @returns raw unsigned 16-bit collision filter group
     */
    function get_collision_filter_group(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Returns the raw unsigned 16-bit filter mask that Defold assigned to the
     * object's Bullet broadphase proxy. Use this value as `mask_bits` in a
     * `bullet3d.world` query filter. Bullet applies reciprocal filtering: the
     * query's `category_bits` must be included in this mask, and the query's
     * `mask_bits` must include the object's filter group.
     *
     * @param object - collision object in a Bullet world
     * @returns raw unsigned 16-bit collision filter mask
     */
    function get_collision_filter_mask(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get collision flags
     *
     * @param object - collision object
     * @returns bit field of `CF_*` constants
     */
    function get_collision_flags(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get the contact processing threshold
     *
     * @param object - collision object
     * @returns threshold in Defold units
     */
    function get_contact_processing_threshold(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get deactivation time
     *
     * @param object - collision object
     * @returns deactivation time
     */
    function get_deactivation_time(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get friction
     *
     * @param object - collision object
     * @returns friction coefficient
     */
    function get_friction(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get the Bullet collision object type
     *
     * @param object - collision object
     * @returns native collision object type
     */
    function get_internal_type(object: Opaque<"btCollisionObject" | "btRigidBody">): bullet3d.collision_object.INTERNAL_TYPE;
    /**
     * Get the world position
     *
     * @param object - collision object
     * @returns world position in Defold units
     */
    function get_position(object: Opaque<"btCollisionObject" | "btRigidBody">): Vector3;
    /**
     * Get restitution
     *
     * @param object - collision object
     * @returns restitution coefficient
     */
    function get_restitution(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get the world rotation
     *
     * @param object - collision object
     * @returns world rotation
     */
    function get_rotation(object: Opaque<"btCollisionObject" | "btRigidBody">): Quaternion;
    /**
     * Get one attached shape by one-based index.
     *
     * @param object - collision object
     * @param shape_index - one-based shape index. **⚠️ 1-based; passed to Defold unchanged.**
     * @returns borrowed logical shape handle
     */
    function get_shape(object: Opaque<"btCollisionObject" | "btRigidBody">, shape_index: number): bullet3d.shape.btCollisionShape;
    /**
     * Get the number of shapes attached to a collision object.
     *
     * @param object - collision object
     * @returns shape count
     */
    function get_shape_count(object: Opaque<"btCollisionObject" | "btRigidBody">): number;
    /**
     * Get all attached shapes.
     *
     * @param object - collision object
     * @returns array of borrowed shape handles
     * @example
     * ```ts
     * // Enumerate the logical shapes attached to a collision object:
     * export default defineScript({
     *   init() {
     *     const object = bullet3d.get_collision_object("#collisionobject");
     *     if (object === undefined) return;
     *     for (const shape of bullet3d.collision_object.get_shapes(object)) {
     *       const index = bullet3d.shape.get_index(shape);
     *       const data = bullet3d.shape.get_shape(shape);
     *       print("shape", index, "type", data.type);
     *     }
     *   },
     * });
     * ```
     */
    function get_shapes(object: Opaque<"btCollisionObject" | "btRigidBody">): bullet3d.shape.btCollisionShape[];
    /**
     * Get the world transform
     *
     * @param object - collision object
     */
    function get_world_transform(object: Opaque<"btCollisionObject" | "btRigidBody">): LuaMultiReturn<[Vector3, Quaternion]>;
    /**
     * Test a collision flag
     *
     * @param object - collision object
     * @param flag - collision flag or mask
     * @returns `true` when all requested flag bits are set
     */
    function has_collision_flag(object: Opaque<"btCollisionObject" | "btRigidBody">, flag: number): boolean;
    /**
     * Test whether the object responds to contacts
     *
     * @param object - collision object
     * @returns contact response state
     */
    function has_contact_response(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * This exposes Bullet's native `btCollisionObject::isActive` result. It is
     * `false` for `ISLAND_SLEEPING` and `DISABLE_SIMULATION`, and `true` for the
     * other activation states available to Defold collision objects. It is
     * unrelated to whether the Defold component is enabled.
     *
     * @param object - collision object
     * @returns active state
     */
    function is_active(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Box2D-style name for the same simulation state returned by
     * bullet3d.collision_object.is_active.
     *
     * @param object - collision object
     * @returns `false` when sleeping or simulation is disabled
     */
    function is_awake(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Test whether the object is a ghost trigger
     *
     * @param object - collision object
     * @returns ghost object state
     */
    function is_ghost_object(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Test whether the object is kinematic
     *
     * @param object - collision object
     * @returns kinematic state
     */
    function is_kinematic(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Test whether the object is a rigid body
     *
     * @param object - collision object
     * @returns rigid body state
     */
    function is_rigid_body(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Test whether the object is static
     *
     * @param object - collision object
     * @returns static state
     */
    function is_static(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Test whether the object is static or kinematic
     *
     * @param object - collision object
     * @returns static or kinematic state
     */
    function is_static_or_kinematic(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Test whether a collision object handle is valid
     *
     * @param object - collision object
     * @returns `true` if the native object still exists
     */
    function is_valid(object: Opaque<"btCollisionObject" | "btRigidBody">): boolean;
    /**
     * Set the activation state
     *
     * @param object - collision object
     * @param state - activation state
     */
    function set_activation_state(object: Opaque<"btCollisionObject" | "btRigidBody">, state: bullet3d.collision_object.ACTIVATION_STATE): void;
    /**
     * Passing `true` calls Bullet's `activate()`. Passing `false` requests the
     * native `ISLAND_SLEEPING` state. As in Bullet, static or kinematic objects are
     * not activated without force, and protected `DISABLE_DEACTIVATION` or
     * `DISABLE_SIMULATION` states are not replaced by a sleeping request.
     *
     * @param object - collision object
     * @param awake - requested awake state
     */
    function set_awake(object: Opaque<"btCollisionObject" | "btRigidBody">, awake: boolean): void;
    /**
     * Set the CCD motion threshold
     *
     * @param object - collision object
     * @param threshold - finite non-negative threshold in Defold units
     * @example
     * ```ts
     * // Enable continuous collision detection for a small, fast-moving body:
     * export default defineScript({
     *   init() {
     *     const body = bullet3d.get_rigid_body("#collisionobject");
     *     if (body === undefined) return;
     *     bullet3d.collision_object.set_ccd_swept_sphere_radius(body, 0.25);
     *     bullet3d.collision_object.set_ccd_motion_threshold(body, 0.5);
     *   },
     * });
     * ```
     */
    function set_ccd_motion_threshold(object: Opaque<"btCollisionObject" | "btRigidBody">, threshold: number): void;
    /**
     * Set the CCD swept sphere radius
     *
     * @param object - collision object
     * @param radius - finite non-negative radius in Defold units
     */
    function set_ccd_swept_sphere_radius(object: Opaque<"btCollisionObject" | "btRigidBody">, radius: number): void;
    /**
     * Set the contact processing threshold
     *
     * @param object - collision object
     * @param threshold - finite threshold in Defold units
     */
    function set_contact_processing_threshold(object: Opaque<"btCollisionObject" | "btRigidBody">, threshold: number): void;
    /**
     * Set deactivation time
     *
     * @param object - collision object
     * @param seconds - finite deactivation time
     */
    function set_deactivation_time(object: Opaque<"btCollisionObject" | "btRigidBody">, seconds: number): void;
    /**
     * Set friction
     *
     * @param object - collision object
     * @param friction - finite friction coefficient
     */
    function set_friction(object: Opaque<"btCollisionObject" | "btRigidBody">, friction: number): void;
    /**
     * The owning game object's position is updated as well.
     *
     * @param object - collision object
     * @param position - finite world position in Defold units
     */
    function set_position(object: Opaque<"btCollisionObject" | "btRigidBody">, position: Vector3): void;
    /**
     * Set restitution
     *
     * @param object - collision object
     * @param restitution - finite restitution coefficient
     */
    function set_restitution(object: Opaque<"btCollisionObject" | "btRigidBody">, restitution: number): void;
    /**
     * The owning game object's rotation is updated as well.
     *
     * @param object - collision object
     * @param rotation - finite, non-zero world rotation; normalized by the binding
     */
    function set_rotation(object: Opaque<"btCollisionObject" | "btRigidBody">, rotation: Quaternion): void;
    /**
     * The owning game object's position and rotation are updated as well, so the
     * transform persists when Defold synchronizes game objects into Bullet.
     *
     * @param object - collision object
     * @param position - finite world position in Defold units
     * @param rotation - finite, non-zero world rotation; normalized by the binding
     * @example
     * ```ts
     * // Move a collision object while preserving its rotation:
     * export default defineScript({
     *   init() {
     *     const object = bullet3d.get_collision_object("#collisionobject");
     *     if (object === undefined) return;
     *     const [position, rotation] = bullet3d.collision_object.get_world_transform(object);
     *     bullet3d.collision_object.set_world_transform(object, position.add(vmath.vector3(0, 5, 0)), rotation);
     *     bullet3d.collision_object.activate(object, true);
     *   },
     * });
     * ```
     */
    function set_world_transform(object: Opaque<"btCollisionObject" | "btRigidBody">, position: Vector3, rotation: Quaternion): void;
  }
}

export {};

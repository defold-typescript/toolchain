/** @noSelfInFile */
import type { Opaque, Vector3 } from "../src/core-types";

declare global {
  /**
   * Rigid body functions accept the collision object userdata returned by
   * `bullet3d.get_rigid_body()`. Passing a trigger ghost object raises an error.
   * Defold retains ownership of the collision shape, motion state, world
   * membership, and native user pointer. The shape's logical children can be
   * mutated through `bullet3d.shape`; shared resource shapes become per-instance
   * copies on first mutation. Mass and local inertia can be changed for dynamic
   * bodies without changing their Defold collision-object type.
   *
   * Linear quantities use Defold units. Angular velocity, damping, and factors
   * are unscaled. Torque and angular impulse use squared physics scale because
   * inertia scales with length squared. Floating-point and vector inputs must be
   * finite. Damping must be in `[0, 1]`, and sleeping thresholds must be
   * non-negative.
   */
  namespace bullet3d.rigid_body {
    type FLAG = typeof bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY | typeof bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_EXPLICIT | typeof bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_WORLD | typeof bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_BODY;
    /**
     * Disable automatic world gravity. Set this bit before assigning custom body gravity that must survive later world-gravity changes or re-adding the body to a world.
     */
    const BT_DISABLE_WORLD_GRAVITY: number & { readonly __brand: "bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY" };
    /**
     * Enable explicit gyroscopic force integration.
     */
    const BT_ENABLE_GYROSCOPIC_FORCE_EXPLICIT: number & { readonly __brand: "bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_EXPLICIT" };
    /**
     * Enable implicit body-space gyroscopic force integration. This flag is enabled by default for newly constructed rigid bodies.
     */
    const BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_BODY: number & { readonly __brand: "bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_BODY" };
    /**
     * Enable implicit world-space gyroscopic force integration.
     */
    const BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_WORLD: number & { readonly __brand: "bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_WORLD" };
    /**
     * Apply a force at the center of mass
     *
     * @param body - rigid body
     * @param force - force in Defold units
     */
    function apply_central_force(body: Opaque<"btRigidBody">, force: Vector3): void;
    /**
     * Apply an impulse at the center of mass
     *
     * @param body - rigid body
     * @param impulse - impulse in Defold units
     */
    function apply_central_impulse(body: Opaque<"btRigidBody">, impulse: Vector3): void;
    /**
     * This has the same point semantics as `b2d.body.apply_force`: `world_position`
     * is the point where the force is applied. The binding converts it to the
     * center-of-mass-relative offset expected by Bullet's `applyForce` method.
     *
     * @param body - rigid body
     * @param force - force in Defold units
     * @param world_position - application point in world space and Defold units
     * @example
     * ```ts
     * // Apply an upward force at the game object's current world position:
     * export default defineScript({
     *   init() {
     *     const body = bullet3d.get_rigid_body("#collisionobject");
     *     if (body === undefined) return;
     *     const force = vmath.vector3(0, 100, 0);
     *     bullet3d.rigid_body.apply_force(body, force, go.get_world_position());
     *   },
     * });
     * ```
     */
    function apply_force(body: Opaque<"btRigidBody">, force: Vector3, world_position: Vector3): void;
    /**
     * This exposes Bullet's `btRigidBody::applyForce` point convention directly.
     * `relative_position` is an offset from the body's center of mass expressed in
     * world axes, not a world position or body-local coordinate.
     *
     * @param body - rigid body
     * @param force - force in Defold units
     * @param relative_position - center-of-mass-relative offset in world axes and Defold units
     */
    function apply_force_at_relative_position(body: Opaque<"btRigidBody">, force: Vector3, relative_position: Vector3): void;
    /**
     * This exposes Bullet's `btRigidBody::applyImpulse` point convention directly.
     * `relative_position` is an offset from the body's center of mass expressed in
     * world axes, not a world position or body-local coordinate.
     *
     * @param body - rigid body
     * @param impulse - impulse in Defold units
     * @param relative_position - center-of-mass-relative offset in world axes and Defold units
     */
    function apply_impulse(body: Opaque<"btRigidBody">, impulse: Vector3, relative_position: Vector3): void;
    /**
     * This has the same point semantics as `b2d.body.apply_linear_impulse`.
     * `world_position` is converted to the center-of-mass-relative offset expected
     * by Bullet's `applyImpulse` method.
     *
     * @param body - rigid body
     * @param impulse - impulse in Defold units
     * @param world_position - application point in world space and Defold units
     */
    function apply_linear_impulse(body: Opaque<"btRigidBody">, impulse: Vector3, world_position: Vector3): void;
    /**
     * Apply torque
     *
     * @param body - rigid body
     * @param torque - torque in Defold squared units
     */
    function apply_torque(body: Opaque<"btRigidBody">, torque: Vector3): void;
    /**
     * Apply a torque impulse
     *
     * @param body - rigid body
     * @param impulse - angular impulse in Defold squared units
     */
    function apply_torque_impulse(body: Opaque<"btRigidBody">, impulse: Vector3): void;
    /**
     * Clear accumulated force and torque
     *
     * @param body - rigid body
     */
    function clear_forces(body: Opaque<"btRigidBody">): void;
    /**
     * Calls Bullet's native `btRigidBody::getAabb`, which immediately calculates
     * the bounds from the body's current collision shape and world transform. This
     * does not read the broadphase proxy's cached AABB.
     *
     * @param body - rigid body
     * @returns world-space bounds in Defold units
     */
    function compute_aabb(body: Opaque<"btRigidBody">): bullet3d.world.aabb;
    /**
     * Get angular damping
     *
     * @param body - rigid body
     * @returns angular damping
     */
    function get_angular_damping(body: Opaque<"btRigidBody">): number;
    /**
     * Get the angular factor
     *
     * @param body - rigid body
     * @returns per-axis angular factor
     */
    function get_angular_factor(body: Opaque<"btRigidBody">): Vector3;
    /**
     * Get the angular sleeping threshold
     *
     * @param body - rigid body
     * @returns threshold in radians per second
     */
    function get_angular_sleeping_threshold(body: Opaque<"btRigidBody">): number;
    /**
     * Get angular velocity
     *
     * @param body - rigid body
     * @returns angular velocity in radians per second
     */
    function get_angular_velocity(body: Opaque<"btRigidBody">): Vector3;
    /**
     * Get the center-of-mass world position
     *
     * @param body - rigid body
     * @returns center-of-mass position in Defold units
     */
    function get_center_of_mass_position(body: Opaque<"btRigidBody">): Vector3;
    /**
     * Get linear and angular damping
     *
     * @param body - rigid body
     */
    function get_damping(body: Opaque<"btRigidBody">): LuaMultiReturn<[number, number]>;
    /**
     * Get rigid body flags
     *
     * @param body - rigid body
     * @returns rigid body flags
     */
    function get_flags(body: Opaque<"btRigidBody">): number;
    /**
     * Get body gravity
     *
     * @param body - rigid body
     * @returns gravity in Defold units per second squared
     */
    function get_gravity(body: Opaque<"btRigidBody">): Vector3;
    /**
     * Get inverse mass
     *
     * @param body - rigid body
     * @returns inverse mass
     */
    function get_inverse_mass(body: Opaque<"btRigidBody">): number;
    /**
     * Get linear damping
     *
     * @param body - rigid body
     * @returns linear damping
     */
    function get_linear_damping(body: Opaque<"btRigidBody">): number;
    /**
     * Get the linear factor
     *
     * @param body - rigid body
     * @returns per-axis linear factor
     */
    function get_linear_factor(body: Opaque<"btRigidBody">): Vector3;
    /**
     * Get the linear sleeping threshold
     *
     * @param body - rigid body
     * @returns threshold in Defold units per second
     */
    function get_linear_sleeping_threshold(body: Opaque<"btRigidBody">): number;
    /**
     * Get linear velocity
     *
     * @param body - rigid body
     * @returns velocity in Defold units per second
     */
    function get_linear_velocity(body: Opaque<"btRigidBody">): Vector3;
    /**
     * This has the same point semantics as
     * `b2d.body.get_linear_velocity_from_local_point`. The local origin is the
     * body's center of mass.
     *
     * @param body - rigid body
     * @param local_point - point in body-local space and Defold units
     * @returns point velocity in Defold units per second
     */
    function get_linear_velocity_from_local_point(body: Opaque<"btRigidBody">, local_point: Vector3): Vector3;
    /**
     * This has the same point semantics as
     * `b2d.body.get_linear_velocity_from_world_point`.
     *
     * @param body - rigid body
     * @param world_point - point in world space and Defold units
     * @returns point velocity in Defold units per second
     */
    function get_linear_velocity_from_world_point(body: Opaque<"btRigidBody">, world_point: Vector3): Vector3;
    /**
     * Returns the diagonal local inertia in Defold mass-times-distance-squared
     * units. A zero component denotes an axis with zero inverse inertia.
     *
     * @param body - rigid body
     * @returns diagonal local inertia
     */
    function get_local_inertia(body: Opaque<"btRigidBody">): Vector3;
    /**
     * Get mass
     *
     * @param body - rigid body
     * @returns mass, or zero for an infinite-mass body
     */
    function get_mass(body: Opaque<"btRigidBody">): number;
    /**
     * Get total accumulated force
     *
     * @param body - rigid body
     * @returns accumulated force in Defold units
     */
    function get_total_force(body: Opaque<"btRigidBody">): Vector3;
    /**
     * Get total accumulated torque
     *
     * @param body - rigid body
     * @returns accumulated torque in Defold squared units
     */
    function get_total_torque(body: Opaque<"btRigidBody">): Vector3;
    /**
     * The relative position is expressed in world axes. Despite Bullet's function
     * name, it is not a body-local coordinate.
     *
     * @param body - rigid body
     * @param relative_position - center-of-mass-relative offset in world axes and Defold units
     * @returns point velocity in Defold units per second
     */
    function get_velocity_in_local_point(body: Opaque<"btRigidBody">, relative_position: Vector3): Vector3;
    /**
     * Get the body's world
     *
     * @param body - rigid body
     * @returns owning world
     */
    function get_world(body: Opaque<"btRigidBody">): bullet3d.btDiscreteDynamicsWorld;
    /**
     * Test a rigid body flag
     *
     * @param body - rigid body
     * @param flag - flag or mask
     * @returns `true` when all requested flag bits are set
     */
    function has_flag(body: Opaque<"btRigidBody">, flag: number): boolean;
    /**
     * Test whether a handle refers to a valid rigid body
     *
     * @param body - rigid body
     * @returns rigid body validity
     */
    function is_valid(body: Opaque<"btRigidBody">): boolean;
    /**
     * Set angular damping
     *
     * @param body - rigid body
     * @param damping - finite angular damping in `[0, 1]`
     */
    function set_angular_damping(body: Opaque<"btRigidBody">, damping: number): void;
    /**
     * Set the angular factor
     *
     * @param body - rigid body
     * @param factor - per-axis angular factor
     */
    function set_angular_factor(body: Opaque<"btRigidBody">, factor: Vector3): void;
    /**
     * Set angular velocity
     *
     * @param body - rigid body
     * @param velocity - finite angular velocity in radians per second
     */
    function set_angular_velocity(body: Opaque<"btRigidBody">, velocity: Vector3): void;
    /**
     * Set linear and angular damping
     *
     * @param body - rigid body
     * @param linear - finite linear damping in `[0, 1]`
     * @param angular - finite angular damping in `[0, 1]`
     */
    function set_damping(body: Opaque<"btRigidBody">, linear: number, angular: number): void;
    /**
     * This replaces the complete flag mask. Every enabled gyroscopic mode is
     * evaluated independently, so clear existing gyroscopic mode bits before
     * selecting a different mode.
     *
     * @param body - rigid body
     * @param flags - rigid body flags
     */
    function set_flags(body: Opaque<"btRigidBody">, flags: number): void;
    /**
     * A later `bullet3d.world.set_gravity()` call, or removing and re-adding the
     * body to a world, can overwrite custom body gravity unless the body's
     * `BT_DISABLE_WORLD_GRAVITY` flag is set.
     *
     * @param body - rigid body
     * @param gravity - gravity in Defold units per second squared
     * @example
     * ```ts
     * // Give one body persistent custom gravity without discarding its other flags:
     * export default defineScript({
     *   init() {
     *     const body = bullet3d.get_rigid_body("#collisionobject");
     *     if (body === undefined) return;
     *     let flags = bullet3d.rigid_body.get_flags(body);
     *     flags = bit.bor(flags, bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY);
     *     bullet3d.rigid_body.set_flags(body, flags);
     *     bullet3d.rigid_body.set_gravity(body, vmath.vector3(0, 4, 0));
     *   },
     * });
     * ```
     */
    function set_gravity(body: Opaque<"btRigidBody">, gravity: Vector3): void;
    /**
     * Set linear damping
     *
     * @param body - rigid body
     * @param damping - finite linear damping in `[0, 1]`
     */
    function set_linear_damping(body: Opaque<"btRigidBody">, damping: number): void;
    /**
     * Set the linear factor
     *
     * @param body - rigid body
     * @param factor - per-axis linear factor
     */
    function set_linear_factor(body: Opaque<"btRigidBody">, factor: Vector3): void;
    /**
     * Set linear velocity
     *
     * @param body - rigid body
     * @param velocity - finite velocity in Defold units per second
     */
    function set_linear_velocity(body: Opaque<"btRigidBody">, velocity: Vector3): void;
    /**
     * Recalculates local inertia from the body's current collision shape. Only a
     * dynamic body can be changed; zero mass cannot be used to convert it into a
     * static body. Values too small to have a finite native inverse are rejected.
     * The body is activated after the update.
     *
     * @param body - dynamic rigid body
     * @param mass - finite mass greater than zero
     * @example
     * ```ts
     * // Change the mass of a dynamic collision object and inspect its recalculated inertia:
     * export default defineScript({
     *   init() {
     *     const body = bullet3d.get_rigid_body("#collisionobject");
     *     if (body === undefined) return;
     *     bullet3d.rigid_body.set_mass(body, 5);
     *     print("local inertia", bullet3d.rigid_body.get_local_inertia(body));
     *   },
     * });
     * ```
     */
    function set_mass(body: Opaque<"btRigidBody">, mass: number): void;
    /**
     * Sets mass and diagonal local inertia together, updates the world-space
     * inertia tensor, and activates the body. Only dynamic bodies are accepted.
     * A zero inertia component is allowed and disables angular response on that
     * local axis; negative, non-finite, or nonzero values too small to have a
     * finite native inverse are rejected.
     *
     * @param body - dynamic rigid body
     * @param mass - finite mass greater than zero
     * @param local_inertia - finite non-negative diagonal local inertia in Defold mass-times-distance-squared units
     */
    function set_mass_properties(body: Opaque<"btRigidBody">, mass: number, local_inertia: Vector3): void;
    /**
     * Set the sleeping thresholds
     *
     * @param body - rigid body
     * @param linear - finite non-negative linear threshold in Defold units per second
     * @param angular - finite non-negative angular threshold in radians per second
     */
    function set_sleeping_thresholds(body: Opaque<"btRigidBody">, linear: number, angular: number): void;
  }
}

export {};

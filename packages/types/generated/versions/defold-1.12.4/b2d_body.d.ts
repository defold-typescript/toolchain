/** @noSelfInFile */
import type { Opaque, Vector3 } from "../../../src/core-types";

declare global {
  /**
   * Functions for interacting with Box2D bodies.
   */
  namespace b2d.body {
    type b2Body = Opaque<"b2Body">;
    type b2World = Opaque<"b2World">;
    /**
     * Dynamic body
     */
    const B2_DYNAMIC_BODY: number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" };
    /**
     * Kinematic body
     */
    const B2_KINEMATIC_BODY: number & { readonly __brand: "b2d.body.B2_KINEMATIC_BODY" };
    /**
     * Static (immovable) body
     */
    const B2_STATIC_BODY: number & { readonly __brand: "b2d.body.B2_STATIC_BODY" };
    /**
     * Apply an angular impulse.
     *
     * @param body - body
     * @param impulse - impulse the angular impulse in units of kg*m*m/s
     */
    function apply_angular_impulse(body: Opaque<"b2Body">, impulse: number): void;
    /**
     * Apply a force at a world point. If the force is not
     * applied at the center of mass, it will generate a torque and
     * affect the angular velocity. This wakes up the body.
     *
     * @param body - body
     * @param force - the world force vector, usually in Newtons (N).
     * @param point - the world position of the point of application.
     */
    function apply_force(body: Opaque<"b2Body">, force: Vector3, point: Vector3): void;
    /**
     * Apply a force to the center of mass. This wakes up the body.
     *
     * @param body - body
     * @param force - the world force vector, usually in Newtons (N).
     */
    function apply_force_to_center(body: Opaque<"b2Body">, force: Vector3): void;
    /**
     * Apply an impulse at a point. This immediately modifies the velocity.
     * It also modifies the angular velocity if the point of application
     * is not at the center of mass. This wakes up the body.
     *
     * @param body - body
     * @param impulse - the world impulse vector, usually in N-seconds or kg-m/s.
     * @param point - the world position of the point of application.
     */
    function apply_linear_impulse(body: Opaque<"b2Body">, impulse: Vector3, point: Vector3): void;
    /**
     * Apply a torque. This affects the angular velocity
     * without affecting the linear velocity of the center of mass.
     * This wakes up the body.
     *
     * @param body - body
     * @param torque - torque about the z-axis (out of the screen), usually in N-m.
     */
    function apply_torque(body: Opaque<"b2Body">, torque: number): void;
    /**
     * You can disable sleeping on this body. If you disable sleeping, the body will be woken.
     *
     * @param body - body
     * @param enable - if false, the body will never sleep, and consume more CPU
     */
    function enable_sleep(body: Opaque<"b2Body">, enable: boolean): void;
    /**
     * Get the angle in radians.
     *
     * @param body - body
     * @returns the current world rotation angle in radians.
     */
    function get_angle(body: Opaque<"b2Body">): number;
    /**
     * Get the angular damping of the body.
     *
     * @param body - body
     * @returns the damping
     */
    function get_angular_damping(body: Opaque<"b2Body">): number;
    /**
     * Get the angular velocity.
     *
     * @param body - body
     * @returns the angular velocity in radians/second.
     */
    function get_angular_velocity(body: Opaque<"b2Body">): number;
    /**
     * Get the gravity scale of the body.
     *
     * @param body - body
     * @returns the scale
     */
    function get_gravity_scale(body: Opaque<"b2Body">): number;
    /**
     * Get the linear damping of the body.
     *
     * @param body - body
     * @returns the damping
     */
    function get_linear_damping(body: Opaque<"b2Body">): number;
    /**
     * Get the linear velocity of the center of mass.
     *
     * @param body - body
     * @returns the linear velocity of the center of mass.
     */
    function get_linear_velocity(body: Opaque<"b2Body">): Vector3;
    /**
     * Get the world velocity of a local point.
     *
     * @param body - body
     * @param local_point - a point in local coordinates.
     * @returns the world velocity of a point.
     */
    function get_linear_velocity_from_local_point(body: Opaque<"b2Body">, local_point: Vector3): Vector3;
    /**
     * Get the world linear velocity of a world point attached to this body.
     *
     * @param body - body
     * @param world_point - a point in world coordinates.
     * @returns the world velocity of a point.
     */
    function get_linear_velocity_from_world_point(body: Opaque<"b2Body">, world_point: Vector3): Vector3;
    /**
     * Get the local position of the center of mass.
     *
     * @param body - body
     * @returns Get the local position of the center of mass.
     */
    function get_local_center_of_mass(body: Opaque<"b2Body">): Vector3;
    /**
     * Gets a local point relative to the body's origin given a world point.
     *
     * @param body - body
     * @param world_point - a point in world coordinates.
     * @returns the corresponding local point relative to the body's origin.
     */
    function get_local_point(body: Opaque<"b2Body">, world_point: Vector3): Vector3;
    /**
     * Gets a local vector given a world vector.
     *
     * @param body - body
     * @param world_vector - a vector in world coordinates.
     * @returns the corresponding local vector.
     */
    function get_local_vector(body: Opaque<"b2Body">, world_vector: Vector3): Vector3;
    /**
     * Get the total mass of the body.
     *
     * @param body - body
     * @returns the mass, usually in kilograms (kg).
     */
    function get_mass(body: Opaque<"b2Body">): number;
    /**
     * Get the world body origin position.
     *
     * @param body - body
     * @returns the world position of the body's origin.
     */
    function get_position(body: Opaque<"b2Body">): Vector3;
    /**
     * Get the rotational inertia of the body about the local origin.
     *
     * @param body - body
     * @returns the rotational inertia, usually in kg-m^2.
     */
    function get_rotational_inertia(body: Opaque<"b2Body">): number;
    /**
     * Get the type of this body.
     *
     * @param body - body
     * @returns the body type
     */
    function get_type(body: Opaque<"b2Body">): (number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_KINEMATIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_STATIC_BODY" });
    /**
     * Get the parent world of this body.
     *
     * @param body - body
     */
    function get_world(body: Opaque<"b2Body">): Opaque<"b2World">;
    /**
     * Get the world position of the center of mass.
     *
     * @param body - body
     * @returns Get the world position of the center of mass.
     */
    function get_world_center_of_mass(body: Opaque<"b2Body">): Vector3;
    /**
     * Get the world coordinates of a point given the local coordinates.
     *
     * @param body - body
     * @param local_vector - localPoint a point on the body measured relative the the body's origin.
     * @returns the same point expressed in world coordinates.
     */
    function get_world_point(body: Opaque<"b2Body">, local_vector: Vector3): Vector3;
    /**
     * Get the world coordinates of a vector given the local coordinates.
     *
     * @param body - body
     * @param local_vector - a vector fixed in the body.
     * @returns the same vector expressed in world coordinates.
     */
    function get_world_vector(body: Opaque<"b2Body">, local_vector: Vector3): Vector3;
    /**
     * Get the active state of the body.
     *
     * @param body - body
     * @returns is the body active
     */
    function is_active(body: Opaque<"b2Body">): boolean;
    /**
     * Get the sleeping state of this body.
     *
     * @param body - body
     * @returns true if the body is awake, false if it's sleeping.
     */
    function is_awake(body: Opaque<"b2Body">): boolean;
    /**
     * Is this body in bullet mode
     *
     * @param body - body
     * @returns true if the body is in bullet mode
     */
    function is_bullet(body: Opaque<"b2Body">): boolean;
    /**
     * Does this body have fixed rotation?
     *
     * @param body - body
     * @returns is the rotation fixed
     */
    function is_fixed_rotation(body: Opaque<"b2Body">): boolean;
    /**
     * Is this body allowed to sleep
     *
     * @param body - body
     * @returns true if the body is allowed to sleep
     */
    function is_sleeping_enabled(body: Opaque<"b2Body">): boolean;
    /**
     * This resets the mass properties to the sum of the mass properties of the fixtures.
     * This normally does not need to be called unless you called SetMassData to override
     *
     * @param body - body
     */
    function reset_mass_data(body: Opaque<"b2Body">): void;
    /**
     * Set the active state of the body. An inactive body is not
     * simulated and cannot be collided with or woken up.
     * If you pass a flag of true, all fixtures will be added to the
     * broad-phase.
     * If you pass a flag of false, all fixtures will be removed from
     * the broad-phase and all contacts will be destroyed.
     * Fixtures and joints are otherwise unaffected. You may continue
     * to create/destroy fixtures and joints on inactive bodies.
     * Fixtures on an inactive body are implicitly inactive and will
     * not participate in collisions, ray-casts, or queries.
     * Joints connected to an inactive body are implicitly inactive.
     * An inactive body is still owned by a b2World object and remains
     * in the body list.
     *
     * @param body - body
     * @param enable - true if the body should be active
     */
    function set_active(body: Opaque<"b2Body">, enable: boolean): void;
    /**
     * Set the angular damping of the body.
     *
     * @param body - body
     * @param damping - the damping
     */
    function set_angular_damping(body: Opaque<"b2Body">, damping: number): void;
    /**
     * Set the angular velocity.
     *
     * @param body - body
     * @param omega - the new angular velocity in radians/second.
     */
    function set_angular_velocity(body: Opaque<"b2Body">, omega: number): void;
    /**
     * Set the sleep state of the body. A sleeping body has very low CPU cost.
     *
     * @param body - body
     * @param enable - flag set to false to put body to sleep, true to wake it.
     */
    function set_awake(body: Opaque<"b2Body">, enable: boolean): void;
    /**
     * Should this body be treated like a bullet for continuous collision detection?
     *
     * @param body - body
     * @param enable - if true, the body will be in bullet mode
     */
    function set_bullet(body: Opaque<"b2Body">, enable: boolean): void;
    /**
     * Set this body to have fixed rotation. This causes the mass to be reset.
     *
     * @param body - body
     * @param enable - true if the rotation should be fixed
     */
    function set_fixed_rotation(body: Opaque<"b2Body">, enable: boolean): void;
    /**
     * Set the gravity scale of the body.
     *
     * @param body - body
     * @param scale - the scale
     */
    function set_gravity_scale(body: Opaque<"b2Body">, scale: number): void;
    /**
     * Set the linear damping of the body.
     *
     * @param body - body
     * @param damping - the damping
     */
    function set_linear_damping(body: Opaque<"b2Body">, damping: number): void;
    /**
     * Set the linear velocity of the center of mass.
     *
     * @param body - body
     * @param velocity - the new linear velocity of the center of mass.
     */
    function set_linear_velocity(body: Opaque<"b2Body">, velocity: Vector3): void;
    /**
     * Set the position of the body's origin and rotation.
     * This breaks any contacts and wakes the other bodies.
     * Manipulating a body's transform may cause non-physical behavior.
     *
     * @param body - body
     * @param position - the world position of the body's local origin.
     * @param angle - the world position of the body's local origin.
     */
    function set_transform(body: Opaque<"b2Body">, position: Vector3, angle: number): void;
    /**
     * Set the type of this body. This may alter the mass and velocity.
     *
     * @param body - body
     * @param type - the body type
     */
    function set_type(body: Opaque<"b2Body">, type: (number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_KINEMATIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_STATIC_BODY" })): void;
  }
}

export {};

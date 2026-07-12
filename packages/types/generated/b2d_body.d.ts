/** @noSelfInFile */
import type { Hash, Opaque, Vector3 } from "../src/core-types";

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
     * Apply a linear impulse to the center of mass.
     *
     * @param body - body
     * @param impulse - world impulse vector
     */
    function apply_linear_impulse_to_center(body: Opaque<"b2Body">, impulse: Vector3): void;
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
     * Compute the world AABB of all body shapes.
     *
     * @param body - body
     * @returns table with `lower` and `upper` vector3 fields
     */
    function compute_aabb(body: Opaque<"b2Body">): { lower: Vector3; upper: Vector3 };
    /**
     * Chains are one-sided connected segments with optional ghost vertices at
     * the ends of open chains. Ghost vertices are creation-time chain data only and
     * cannot be added to arbitrary shapes, bodies, or joints after creation.
     *
     * `definition.vertices`
     * table array of local `vector3` vertices. Open chains require at least 2 vertices. Loop chains require at least 4 vertices.
     * `definition.loop`
     * boolean true to create a closed loop chain.
     * `definition.prev_vertex`
     * vector3 optional ghost vertex before the first vertex for open chains.
     * `definition.next_vertex`
     * vector3 optional ghost vertex after the last vertex for open chains.
     * `definition.friction`
     * number optional friction.
     * `definition.restitution`
     * number optional restitution.
     * `definition.material`
     * number optional material id.
     * `definition.filter`
     * table optional filter with `category_bits`, `mask_bits`, and `group_index`.
     * `definition.enable_sensor_events`
     * boolean true to enable sensor events for chain segments.
     *
     * @param body - body
     * @param definition - the chain definition
     * @example
     * ```ts
     * const [chain, segments] = b2d.body.create_chain(body, {
     *   vertices: [vmath.vector3(-64, 0, 0), vmath.vector3(0, 16, 0), vmath.vector3(64, 0, 0)],
     *   prev_vertex: vmath.vector3(-96, 0, 0), next_vertex: vmath.vector3(96, 0, 0), friction: 0.6,
     * });
     * ```
     */
    function create_chain(body: Opaque<"b2Body">, definition: Record<string | number, unknown>): LuaMultiReturn<[Opaque<"b2Chain">, { shape_id: number }[]]>;
    /**
     * Creates a fixture and attach it to this body. Use this function if you need
     * to set some fixture parameters, like friction. Otherwise you can create the
     * fixture directly from a shape.
     * If the density is non-zero, this function automatically updates the mass of the body.
     * Contacts are not created until the next time step.
     *
     * @param body - body
     * @param definition - fixture definition table with:
     * `shape` = shape table, `friction` = number, `restitution` = number,
     * `density` = number, `sensor` = boolean, and optional `filter` table.
     * Supported shape tables are:
     * `circle` = `{ type = b2d.shape.SHAPE_TYPE_CIRCLE, radius = number, center = vector3_or_nil }`
     * `edge` = `{ type = b2d.shape.SHAPE_TYPE_EDGE, v1 = vector3, v2 = vector3, v0 = vector3_or_nil, v3 = vector3_or_nil }`
     * `polygon` = `{ type = b2d.shape.SHAPE_TYPE_POLYGON, vertices = { vector3, ... } }`
     * `box` = `{ type = b2d.shape.SHAPE_TYPE_BOX, hx = number, hy = number, center = vector3_or_nil, angle = radians_or_nil }`
     * `chain` = `{ type = b2d.shape.SHAPE_TYPE_CHAIN, vertices = { vector3, ... }, loop = boolean_or_nil, prev_vertex = vector3_or_nil, next_vertex = vector3_or_nil }`
     * @returns fixture info table with `index`, `type`, `sensor`, `density`, `friction`, `restitution`, and `child_count`
     * @example
     * ```ts
     * const body = b2d.get_body("#collisionobject");
     * const triangle = b2d.body.create_fixture(body, {
     *   density: 1.0, friction: 0.3,
     *   shape: { type: b2d.shape.SHAPE_TYPE_POLYGON, vertices: [vmath.vector3(-16, -16, 0), vmath.vector3(16, -16, 0), vmath.vector3(0, 16, 0)] },
     * });
     * ```
     */
    function create_fixture(body: Opaque<"b2Body">, definition: { shape?: { type?: number; radius?: number; center?: Vector3; v0?: Vector3; v1?: Vector3; v2?: Vector3; v3?: Vector3; vertices?: Vector3[]; hx?: number; hy?: number; angle?: number; loop?: boolean; prev_vertex?: Vector3; next_vertex?: Vector3 }; friction?: number; restitution?: number; density?: number; sensor?: boolean; filter?: { category_bits?: number; mask_bits?: number; group_index?: number } }): { index: number; type: number; sensor: boolean; density: number; friction: number; restitution: number; child_count: number };
    /**
     * Creates a fixture from a shape and attach it to this body.
     * This is a convenience function. Use b2FixtureDef if you need to set parameters
     * like friction, restitution, user data, or filtering.
     * If the density is non-zero, this function automatically updates the mass of the body.
     *
     * @param body - body
     * @param shape - the shape to be cloned.
     * @param density - the shape density (set to zero for static bodies).
     */
    function create_fixture(body: Opaque<"b2Body">, shape: Opaque<"b2Shape">, density: number): void;
    /**
     * Creates a shape and attaches it to this body.
     * If the density is non-zero, this function automatically updates the mass of the body.
     * Contacts are not created until the next time step.
     * The definition may include `density`, `friction`, `restitution`, `material`,
     * `sensor` or `is_sensor`, `filter`, and the shape table itself. The shape table
     * can be in `definition.shape` or directly in `definition`.
     *
     * @param body - body
     * @param definition - the shape definition.
     */
    function create_shape(body: Opaque<"b2Body">, definition: Record<string | number, unknown>): void;
    /**
     * Destroy a fixture from a body.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function destroy_fixture(body: Opaque<"b2Body">, fixture_index: number): void;
    /**
     * Destroy a shape. This removes the shape from the broad-phase and
     * destroys all contacts associated with this shape. This will
     * automatically adjust the mass of the body if the body is dynamic and the
     * shape has positive density.
     * All shapes attached to a body are implicitly destroyed when the body is destroyed.
     *
     * @param body - body
     * @param shape_index - 1-based shape index from `b2d.body.get_shapes`
     */
    function destroy_shape(body: Opaque<"b2Body">, shape_index: number): void;
    /**
     * Print the body representation to the log output
     *
     * @param body - body
     */
    function dump(body: Opaque<"b2Body">): void;
    /**
     * Enable or disable contact events on all body shapes.
     *
     * @param body - body
     * @param enable - true to enable contact events
     */
    function enable_contact_events(body: Opaque<"b2Body">, enable: boolean): void;
    /**
     * Enable or disable hit events on all body shapes.
     *
     * @param body - body
     * @param enable - true to enable hit events
     */
    function enable_hit_events(body: Opaque<"b2Body">, enable: boolean): void;
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
     * Get touching contact data for a body.
     *
     * @param body - body
     * @returns array of contact tables
     */
    function get_contact_data(body: Opaque<"b2Body">): Record<string | number, unknown>;
    /**
     * Get the list of all contacts attached to this body.
     *
     * @param body - body
     * @returns the first edge
     */
    function get_contact_list(body: Opaque<"b2Body">): Opaque<"b2ContactEdge">;
    /**
     * Get the fixtures attached to this body.
     *
     * @param body - body
     * @returns array of fixture info tables with `index`, `type`, `sensor`, `density`, `friction`, `restitution`, and `child_count`
     */
    function get_fixtures(body: Opaque<"b2Body">): { index: number; type: number; sensor: boolean; density: number; friction: number; restitution: number; child_count: number }[];
    /**
     * Get the total force currently applied on this object
     *
     * @param body - body
     */
    function get_force(body: Opaque<"b2Body">): Vector3;
    /**
     * Get the gravity scale of the body.
     *
     * @param body - body
     * @returns the scale
     */
    function get_gravity_scale(body: Opaque<"b2Body">): number;
    /**
     * Get the rotational inertia of the body about the local origin.
     *
     * @param body - body
     * @returns the rotational inertia, usually in kg-m^2.
     */
    function get_inertia(body: Opaque<"b2Body">): number;
    /**
     * Get the joints attached to this body.
     *
     * @param body - body
     * @returns array of `b2Joint` handles created by `b2d.joint`
     */
    function get_joints(body: Opaque<"b2Body">): number[];
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
    function get_local_center(body: Opaque<"b2Body">): Vector3;
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
     * Get the mass data of the body.
     *
     * @param body - body
     * @returns table with `mass`, `center` in local coordinates, and `inertia`.
     */
    function get_mass_data(body: Opaque<"b2Body">): { mass: number; center: Vector3; inertia: number };
    /**
     * Get the mass data of the body.
     *
     * @param body - body
     * @returns a struct containing the mass, inertia and center of the body.
     */
    function get_mass_data(body: Opaque<"b2Body">): Opaque<"b2MassData">;
    /**
     * Get the body name.
     *
     * @param body - body
     * @returns body name, or nil if no name is set
     */
    function get_name(body: Opaque<"b2Body">): string;
    /**
     * Get the next body in the world's body list.
     *
     * @param body - body
     * @returns the next body
     */
    function get_next(body: Opaque<"b2Body">): Opaque<"b2Body">;
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
     * Get the list of all shapes attached to this body.
     *
     * @param body - body
     * @returns a table of shape info entries. Each entry includes `shape_id` for use with `b2d.shape` functions.
     */
    function get_shapes(body: Opaque<"b2Body">): { shape_id: number }[];
    /**
     * Get the sleep velocity threshold.
     *
     * @param body - body
     * @returns velocity threshold in Defold units per second
     */
    function get_sleep_threshold(body: Opaque<"b2Body">): number;
    /**
     * Get the body transform for the body's origin.
     *
     * @param body - body
     * @returns table with `position` and `angle` in radians.
     */
    function get_transform(body: Opaque<"b2Body">): { position: Vector3; angle: number };
    /**
     * Get the body transform for the body's origin.
     *
     * @param body - body
     * @returns the world position of the body's origin.
     */
    function get_transform(body: Opaque<"b2Body">): Opaque<"b2Transform">;
    /**
     * Get the type of this body.
     *
     * @param body - body
     * @returns the body type
     */
    function get_type(body: Opaque<"b2Body">): (number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_KINEMATIC_BODY" }) | (number & { readonly __brand: "b2d.body.B2_STATIC_BODY" });
    /**
     * Get the user data pointer that was provided in the body definition.
     *
     * @param body - body
     * @returns the game object id this body is connected to
     */
    function get_user_data(body: Opaque<"b2Body">): Hash;
    /**
     * Get the parent world of this body.
     *
     * @param body - body
     */
    function get_world(body: Opaque<"b2Body">): Opaque<"b2World">;
    /**
     * Get the angle in radians.
     *
     * @param body - body
     * @returns the current world rotation angle in radians.
     */
    function get_world_center(body: Opaque<"b2Body">): number;
    /**
     * Get the world position of the center of mass.
     *
     * @param body - body
     * @returns Get the world position of the center of mass.
     */
    function get_world_center(body: Opaque<"b2Body">): Vector3;
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
    function is_sleeping_allowed(body: Opaque<"b2Body">): boolean;
    /**
     * Is this body allowed to sleep
     *
     * @param body - body
     * @returns true if the body is allowed to sleep
     */
    function is_sleeping_enabled(body: Opaque<"b2Body">): boolean;
    /**
     * Validate a body handle.
     *
     * @param body - body
     * @returns true if the body handle still refers to a live Box2D body
     */
    function is_valid(body: Opaque<"b2Body">): boolean;
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
     * Set the mass properties to override the mass properties of the fixtures.
     *
     * @param body - body
     * @param data - table with `mass`, `center` in local coordinates, and `inertia`.
     */
    function set_mass_data(body: Opaque<"b2Body">, data: { mass?: number; center?: Vector3; inertia?: number }): void;
    /**
     * Set the mass properties to override the mass properties of the shapes.
     *
     * @param body - body
     * @param data - the mass properties.
     */
    function set_mass_data(body: Opaque<"b2Body">, data: Opaque<"b2MassData">): void;
    /**
     * Set the body name.
     *
     * @param body - body
     * @param name - body name
     */
    function set_name(body: Opaque<"b2Body">, name: string): void;
    /**
     * Set the sleep velocity threshold.
     *
     * @param body - body
     * @param threshold - velocity threshold in Defold units per second
     */
    function set_sleep_threshold(body: Opaque<"b2Body">, threshold: number): void;
    /**
     * You can disable sleeping on this body. If you disable sleeping, the body will be woken.
     *
     * @param body - body
     * @param enable - if false, the body will never sleep, and consume more CPU
     */
    function set_sleeping_allowed(body: Opaque<"b2Body">, enable: boolean): void;
    /**
     * Set velocity to reach a target transform.
     *
     * @param body - body
     * @param position - target world position
     * @param angle - target world angle in radians
     * @param time_step - time step used to compute velocity
     */
    function set_target_transform(body: Opaque<"b2Body">, position: Vector3, angle: number, time_step: number): void;
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
    /**
     * Set the user data. Use this to store your application specific data.
     *
     * @param body - body
     * @param id - the game object id
     */
    function set_user_data(body: Opaque<"b2Body">, id: Hash): void;
  }
}

export {};

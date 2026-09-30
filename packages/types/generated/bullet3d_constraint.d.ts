/** @noSelfInFile */
import type { Opaque, Quaternion, Vector3 } from "../src/core-types";

declare global {
  /**
   * Creates and controls Bullet constraints between Defold rigid bodies. A
   * constraint belongs to the supplied world and is destroyed automatically
   * with either body, with the world, or when the module is finalized. It is
   * temporarily removed from the native world while either linked body is
   * disabled and is restored when both bodies are enabled again. Dropping its
   * Lua userdata does not destroy the native constraint; call `destroy` for
   * early release.
   *
   * Creator positions and all other linear values use Defold units and are
   * converted with `physics.scale`. Angles are radians. Axes are one-based in
   * Lua: axes 1-3 are linear and axes 4-6 are angular. Mutating functions cannot
   * be called while the physics world is stepping. Floating-point and vector
   * inputs must be finite. Axis vectors must be non-zero and are normalized.
   * Input rotations must be finite, non-zero quaternions and are normalized by
   * the binding.
   *
   * `CONSTRAINT_TYPE_*` values identify the concrete constraint exposed by this
   * binding. This deliberately distinguishes universal, hinge2, and spring 6-DOF
   * constraints independently of Bullet's internal constraint type hierarchy.
   */
  namespace bullet3d.constraint {
    /**
     * Universal and hinge2 constraint parameters
     */
    interface anchor_axes_params {
      /**
       * world-space anchor
       */
      anchor: Vector3;
      /**
       * first non-zero world-space axis
       */
      axis1: Vector3;
      /**
       * second non-zero world-space axis, orthogonal to `axis1`
       */
      axis2: Vector3;
      /**
       * whether connected bodies can collide; defaults to `false`
       */
      collide_connected?: boolean;
    }
    type btTypedConstraint = Opaque<"btTypedConstraint">;
    /**
     * The frame-B fields are required for a two-body constraint.
     */
    interface cone_twist_params {
      /**
       * local body-A frame position
       */
      frame_a_position: Vector3;
      /**
       * local body-A frame rotation
       */
      frame_a_rotation: Quaternion;
      /**
       * local body-B frame position
       */
      frame_b_position?: Vector3;
      /**
       * local body-B frame rotation
       */
      frame_b_rotation?: Quaternion;
      /**
       * whether to constrain angular motion only
       */
      angular_only?: boolean;
      /**
       * whether connected bodies can collide; defaults to `false`
       */
      collide_connected?: boolean;
    }
    /**
     * The frame-B fields are required for a two-body constraint.
     */
    interface generic_6dof_params {
      /**
       * local body-A frame position
       */
      frame_a_position: Vector3;
      /**
       * local body-A frame rotation
       */
      frame_a_rotation: Quaternion;
      /**
       * local body-B frame position
       */
      frame_b_position?: Vector3;
      /**
       * local body-B frame rotation
       */
      frame_b_rotation?: Quaternion;
      /**
       * whether connected bodies can collide; defaults to `false`
       */
      collide_connected?: boolean;
    }
    /**
     * Generic spring 6-DOF constraint parameters
     */
    interface generic_6dof_spring_params {
      /**
       * local body-A frame position
       */
      frame_a_position: Vector3;
      /**
       * local body-A frame rotation
       */
      frame_a_rotation: Quaternion;
      /**
       * local body-B frame position
       */
      frame_b_position: Vector3;
      /**
       * local body-B frame rotation
       */
      frame_b_rotation: Quaternion;
      /**
       * whether connected bodies can collide; defaults to `false`
       */
      collide_connected?: boolean;
    }
    /**
     * The frame-B fields are required for a two-body constraint.
     */
    interface hinge_params {
      /**
       * local body-A frame position
       */
      frame_a_position: Vector3;
      /**
       * local body-A frame rotation
       */
      frame_a_rotation: Quaternion;
      /**
       * local body-B frame position
       */
      frame_b_position?: Vector3;
      /**
       * local body-B frame rotation
       */
      frame_b_rotation?: Quaternion;
      /**
       * whether angular calculations reference frame A
       */
      use_reference_frame_a?: boolean;
      /**
       * whether to constrain angular motion only
       */
      angular_only?: boolean;
      /**
       * whether connected bodies can collide; defaults to `false`
       */
      collide_connected?: boolean;
    }
    /**
     * `pivot_b` is required for a two-body constraint. For a one-body constraint,
     * it is an optional world-space anchor.
     */
    interface point_to_point_params {
      /**
       * local body-A pivot
       */
      pivot_a: Vector3;
      /**
       * local body-B pivot or world-space anchor
       */
      pivot_b?: Vector3;
      /**
       * whether connected bodies can collide; defaults to `false`
       */
      collide_connected?: boolean;
    }
    /**
     * The frame-B fields are required for a two-body constraint.
     */
    interface slider_params {
      /**
       * local body-A frame position
       */
      frame_a_position: Vector3;
      /**
       * local body-A frame rotation
       */
      frame_a_rotation: Quaternion;
      /**
       * local body-B frame position
       */
      frame_b_position?: Vector3;
      /**
       * local body-B frame rotation
       */
      frame_b_rotation?: Quaternion;
      /**
       * whether linear calculations reference frame A
       */
      use_linear_reference_frame_a?: boolean;
      /**
       * whether connected bodies can collide; defaults to `false`
       */
      collide_connected?: boolean;
    }
    type CONSTRAINT_TYPE = typeof bullet3d.constraint.CONSTRAINT_TYPE_CONE_TWIST | typeof bullet3d.constraint.CONSTRAINT_TYPE_GENERIC_6DOF | typeof bullet3d.constraint.CONSTRAINT_TYPE_GENERIC_6DOF_SPRING | typeof bullet3d.constraint.CONSTRAINT_TYPE_HINGE | typeof bullet3d.constraint.CONSTRAINT_TYPE_HINGE2 | typeof bullet3d.constraint.CONSTRAINT_TYPE_POINT_TO_POINT | typeof bullet3d.constraint.CONSTRAINT_TYPE_SLIDER | typeof bullet3d.constraint.CONSTRAINT_TYPE_UNIVERSAL;
    /**
     * Cone-twist constraint type
     */
    const CONSTRAINT_TYPE_CONE_TWIST: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_CONE_TWIST" };
    /**
     * Generic 6-DOF constraint type
     */
    const CONSTRAINT_TYPE_GENERIC_6DOF: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_GENERIC_6DOF" };
    /**
     * Generic spring 6-DOF constraint type
     */
    const CONSTRAINT_TYPE_GENERIC_6DOF_SPRING: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_GENERIC_6DOF_SPRING" };
    /**
     * Hinge constraint type
     */
    const CONSTRAINT_TYPE_HINGE: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_HINGE" };
    /**
     * Hinge2 constraint type
     */
    const CONSTRAINT_TYPE_HINGE2: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_HINGE2" };
    /**
     * Point-to-point constraint type
     */
    const CONSTRAINT_TYPE_POINT_TO_POINT: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_POINT_TO_POINT" };
    /**
     * Slider constraint type
     */
    const CONSTRAINT_TYPE_SLIDER: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_SLIDER" };
    /**
     * Universal constraint type
     */
    const CONSTRAINT_TYPE_UNIVERSAL: number & { readonly __brand: "bullet3d.constraint.CONSTRAINT_TYPE_UNIVERSAL" };
    /**
     * The world is derived from `body_a`.
     *
     * @param body_a - first body
     * @param body_b - second body or world
     * @param params - local frames and options
     * @returns cone-twist constraint
     */
    function create_cone_twist(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody"> | undefined, params: bullet3d.constraint.cone_twist_params): bullet3d.constraint.btTypedConstraint;
    /**
     * The params table requires local frame A and, for a two-body constraint,
     * local frame B. It optionally accepts `collide_connected`. The world is
     * derived from `body_a`. The active 6-DOF solver ignores its legacy
     * linear-reference-frame selector, so that field is rejected rather than
     * silently accepted.
     *
     * @param body_a - first body
     * @param body_b - second body or world
     * @param params - local frames and options
     * @returns generic 6-DOF constraint
     */
    function create_generic_6dof(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody"> | undefined, params: bullet3d.constraint.generic_6dof_params): bullet3d.constraint.btTypedConstraint;
    /**
     * Both bodies and both local frames are required. The params table optionally
     * accepts `collide_connected`. The world is derived from `body_a`. The active
     * spring 6-DOF solver ignores its legacy linear-reference-frame selector, so
     * that field is rejected rather than silently accepted.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param params - local frames and options
     * @returns spring 6-DOF constraint
     * @example
     * ```ts
     * // Create a spring that moves along its first linear axis:
     * export default defineScript({
     *   init() {
     *     const body_a = bullet3d.get_rigid_body("/body_a#collisionobject");
     *     const body_b = bullet3d.get_rigid_body("/body_b#collisionobject");
     *     let spring: bullet3d.constraint.btTypedConstraint | undefined;
     *     if (body_a !== undefined && body_b !== undefined) {
     *       spring = bullet3d.constraint.create_generic_6dof_spring(body_a, body_b, {
     *         frame_a_position: vmath.vector3(),
     *         frame_a_rotation: vmath.quat(),
     *         frame_b_position: vmath.vector3(),
     *         frame_b_rotation: vmath.quat(),
     *       });
     *       bullet3d.constraint.set_limit(spring, 1, -1, 1);
     *       bullet3d.constraint.enable_spring(spring, 1, true);
     *       bullet3d.constraint.set_spring_stiffness(spring, 1, 20);
     *       bullet3d.constraint.set_spring_damping(spring, 1, 0.5);
     *       bullet3d.constraint.set_spring_equilibrium_point(spring, 1, 0);
     *     }
     *     return { spring };
     *   },
     *
     *   final(self) {
     *     if (self.spring !== undefined && bullet3d.constraint.is_valid(self.spring)) {
     *       bullet3d.constraint.destroy(self.spring);
     *     }
     *   },
     * });
     * ```
     */
    function create_generic_6dof_spring(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody">, params: bullet3d.constraint.generic_6dof_spring_params): bullet3d.constraint.btTypedConstraint;
    /**
     * The world is derived from `body_a`.
     *
     * @param body_a - first body
     * @param body_b - second body or world
     * @param params - local frames and options
     * @returns hinge constraint
     * @example
     * ```ts
     * // Create a motorized hinge with a 90-degree range:
     * export default defineScript({
     *   init() {
     *     const body_a = bullet3d.get_rigid_body("/door#collisionobject");
     *     const body_b = bullet3d.get_rigid_body("/frame#collisionobject");
     *     let hinge: bullet3d.constraint.btTypedConstraint | undefined;
     *     if (body_a !== undefined) {
     *       hinge = bullet3d.constraint.create_hinge(body_a, body_b, {
     *         frame_a_position: vmath.vector3(-0.5, 0, 0),
     *         frame_a_rotation: vmath.quat(),
     *         frame_b_position: vmath.vector3(0.5, 0, 0),
     *         frame_b_rotation: vmath.quat(),
     *       });
     *       bullet3d.constraint.set_hinge_limits(hinge, -math.pi / 4, math.pi / 4);
     *       bullet3d.constraint.set_hinge_motor(hinge, true, 1.5, 2.5);
     *     }
     *     return { hinge };
     *   },
     *
     *   final(self) {
     *     if (self.hinge !== undefined && bullet3d.constraint.is_valid(self.hinge)) {
     *       bullet3d.constraint.destroy(self.hinge);
     *     }
     *   },
     * });
     * ```
     */
    function create_hinge(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody"> | undefined, params: bullet3d.constraint.hinge_params): bullet3d.constraint.btTypedConstraint;
    /**
     * Both bodies are required. Its initial linear suspension travel is one Defold
     * unit in either direction. The world is derived from `body_a`.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param params - anchor, axes, and options
     * @returns hinge2 constraint
     */
    function create_hinge2(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody">, params: bullet3d.constraint.anchor_axes_params): bullet3d.constraint.btTypedConstraint;
    /**
     * The world is derived from `body_a`; both bodies must belong to that same world.
     *
     * @param body_a - first body
     * @param body_b - second body or world
     * @param params - pivots and options
     * @returns point-to-point constraint
     * @example
     * ```ts
     * // Join two bodies at matching local pivots and explicitly destroy the
     * // constraint when the script is finalized:
     * export default defineScript({
     *   init() {
     *     const body_a = bullet3d.get_rigid_body("/body_a#collisionobject");
     *     const body_b = bullet3d.get_rigid_body("/body_b#collisionobject");
     *     let constraint: bullet3d.constraint.btTypedConstraint | undefined;
     *     if (body_a !== undefined) {
     *       constraint = bullet3d.constraint.create_point_to_point(body_a, body_b, {
     *         pivot_a: vmath.vector3(0.5, 0, 0),
     *         pivot_b: vmath.vector3(-0.5, 0, 0),
     *       });
     *     }
     *     return { constraint };
     *   },
     *
     *   final(self) {
     *     if (self.constraint !== undefined && bullet3d.constraint.is_valid(self.constraint)) {
     *       bullet3d.constraint.destroy(self.constraint);
     *     }
     *   },
     * });
     * ```
     */
    function create_point_to_point(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody"> | undefined, params: bullet3d.constraint.point_to_point_params): bullet3d.constraint.btTypedConstraint;
    /**
     * The world is derived from `body_a`.
     *
     * @param body_a - first body
     * @param body_b - second body or world
     * @param params - local frames and options
     * @returns slider constraint
     */
    function create_slider(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody"> | undefined, params: bullet3d.constraint.slider_params): bullet3d.constraint.btTypedConstraint;
    /**
     * Both bodies are required. The world is derived from `body_a`.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param params - anchor, axes, and options
     * @returns universal constraint
     */
    function create_universal(body_a: Opaque<"btRigidBody">, body_b: Opaque<"btRigidBody">, params: bullet3d.constraint.anchor_axes_params): bullet3d.constraint.btTypedConstraint;
    /**
     * Destroy a constraint
     *
     * @param constraint - constraint
     */
    function destroy(constraint: bullet3d.constraint.btTypedConstraint): void;
    /**
     * Enable or disable the cone-twist motor
     *
     * @param constraint - cone-twist constraint
     * @param enabled - motor state
     */
    function enable_cone_twist_motor(constraint: bullet3d.constraint.btTypedConstraint, enabled: boolean): void;
    /**
     * Enable or disable a spring axis
     *
     * @param constraint - spring 6-DOF or hinge2 constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     * @param enabled - spring state
     */
    function enable_spring(constraint: bullet3d.constraint.btTypedConstraint, axis: number, enabled: boolean): void;
    /**
     * Get a current 6-DOF angle
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based angular-axis index from 1 to 3. **⚠️ 1-based; passed to Defold unchanged.**
     * @returns current angle in radians
     */
    function get_6dof_angle(constraint: bullet3d.constraint.btTypedConstraint, axis: number): number;
    /**
     * Get a current 6-DOF angular axis
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based angular-axis index from 1 to 3. **⚠️ 1-based; passed to Defold unchanged.**
     * @returns world-space unit axis
     */
    function get_6dof_axis(constraint: bullet3d.constraint.btTypedConstraint, axis: number): Vector3;
    /**
     * Axes 1-3 are linear and axes 4-6 are angular. Generic 6-DOF, generic spring
     * 6-DOF, and universal constraints support bounce only on angular axes; hinge2
     * supports it on every axis. Linear target velocity uses Defold units per
     * second and angular target velocity uses radians per second. `max_force` is a
     * force for linear axes and a torque in Defold squared units for angular axes.
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     */
    function get_6dof_motor(constraint: bullet3d.constraint.btTypedConstraint, axis: number): LuaMultiReturn<[boolean, number, number, number]>;
    /**
     * Get a current 6-DOF linear position
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based linear-axis index from 1 to 3. **⚠️ 1-based; passed to Defold unchanged.**
     * @returns relative position in Defold units
     */
    function get_6dof_position(constraint: bullet3d.constraint.btTypedConstraint, axis: number): number;
    /**
     * Get universal or hinge2 anchors
     *
     * @param constraint - universal or hinge2 constraint
     */
    function get_anchors(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[Vector3, Vector3]>;
    /**
     * Get universal or hinge2 angles
     *
     * @param constraint - universal or hinge2 constraint
     */
    function get_angles(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[number, number]>;
    /**
     * Get universal or hinge2 axes
     *
     * @param constraint - universal or hinge2 constraint
     */
    function get_axes(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[Vector3, Vector3]>;
    /**
     * Get the first linked body
     *
     * @param constraint - constraint
     * @returns first body
     */
    function get_body_a(constraint: bullet3d.constraint.btTypedConstraint): Opaque<"btRigidBody">;
    /**
     * Get the second linked body
     *
     * @param constraint - constraint
     * @returns second body, or nil for a world constraint
     */
    function get_body_b(constraint: bullet3d.constraint.btTypedConstraint): Opaque<"btRigidBody"> | undefined;
    /**
     * Get whether connected bodies can collide
     *
     * @param constraint - constraint
     * @returns whether connected bodies can collide
     */
    function get_collide_connected(constraint: bullet3d.constraint.btTypedConstraint): boolean;
    /**
     * Get cone-twist angular spans
     *
     * @param constraint - cone-twist constraint
     */
    function get_cone_twist_limits(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[number, number, number]>;
    /**
     * Supported constraint types are hinge, cone-twist, generic 6-DOF, generic
     * spring 6-DOF, slider, universal, and hinge2. Point-to-point constraints use
     * `get_pivots` instead.
     * Returns position and rotation. For one-body generic 6-DOF and slider
     * constraints this is the user-body frame, despite Bullet storing it as its
     * native frame B.
     *
     * @param constraint - framed constraint
     */
    function get_frame_a(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[Vector3, Quaternion]>;
    /**
     * Supports the same constraint types as `get_frame_a`. For a one-body
     * constraint, this is the frame attached to the fixed world body.
     *
     * @param constraint - framed constraint
     */
    function get_frame_b(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[Vector3, Quaternion]>;
    /**
     * Get the current hinge angle
     *
     * @param constraint - hinge constraint
     * @returns angle in radians
     */
    function get_hinge_angle(constraint: bullet3d.constraint.btTypedConstraint): number;
    /**
     * Get hinge angular limits
     *
     * @param constraint - hinge constraint
     */
    function get_hinge_limits(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[number, number]>;
    /**
     * Get hinge motor settings
     *
     * @param constraint - hinge constraint
     */
    function get_hinge_motor(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[boolean, number, number]>;
    /**
     * Axes 1-3 return linear limits in Defold units. Axes 4-6 return angular
     * limits in radians.
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     */
    function get_limit(constraint: bullet3d.constraint.btTypedConstraint, axis: number): LuaMultiReturn<[number, number]>;
    /**
     * Get point-to-point pivots
     *
     * @param constraint - point-to-point constraint
     */
    function get_pivots(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[Vector3, Vector3]>;
    /**
     * Get slider limits
     *
     * @param constraint - slider constraint
     */
    function get_slider_limits(constraint: bullet3d.constraint.btTypedConstraint): LuaMultiReturn<[number, number, number, number]>;
    /**
     * The linear motor uses Defold units per second and maximum force. The angular
     * motor uses radians per second and maximum torque in Defold squared units.
     *
     * @param constraint - slider constraint
     * @param motor - `linear` or `angular`
     */
    function get_slider_motor(constraint: bullet3d.constraint.btTypedConstraint, motor: string): LuaMultiReturn<[boolean, number, number]>;
    /**
     * Get the current slider position
     *
     * @param constraint - slider constraint
     * @returns current linear position in Defold units
     */
    function get_slider_position(constraint: bullet3d.constraint.btTypedConstraint): number;
    /**
     * Get the current cone-twist twist angle
     *
     * @param constraint - cone-twist constraint
     * @returns twist angle in radians
     */
    function get_twist_angle(constraint: bullet3d.constraint.btTypedConstraint): number;
    /**
     * Get the constraint type
     *
     * @param constraint - constraint
     * @returns constraint type
     */
    function get_type(constraint: bullet3d.constraint.btTypedConstraint): bullet3d.constraint.CONSTRAINT_TYPE;
    /**
     * Returns a stable lowercase diagnostic name such as `"hinge"` or
     * `"generic_6dof_spring"`.
     *
     * @param constraint - constraint
     * @returns constraint type name
     */
    function get_type_name(constraint: bullet3d.constraint.btTypedConstraint): string;
    /**
     * Get the slider linear reference-frame choice
     *
     * @param constraint - slider constraint
     * @returns true when linear calculations reference frame A
     */
    function get_use_linear_reference_frame_a(constraint: bullet3d.constraint.btTypedConstraint): boolean;
    /**
     * Get the owning world
     *
     * @param constraint - constraint
     * @returns owning world
     */
    function get_world(constraint: bullet3d.constraint.btTypedConstraint): bullet3d.btDiscreteDynamicsWorld;
    /**
     * Test whether a constraint is active in its world
     *
     * @param constraint - constraint
     * @returns false while a linked body is disabled
     */
    function is_active(constraint: bullet3d.constraint.btTypedConstraint): boolean;
    /**
     * Test angular-only mode
     *
     * @param constraint - hinge or cone-twist constraint
     * @returns angular-only state
     */
    function is_angular_only(constraint: bullet3d.constraint.btTypedConstraint): boolean;
    /**
     * Both a ranged and a locked axis are considered limited; a free axis is not.
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     * @returns limit state
     */
    function is_limited(constraint: bullet3d.constraint.btTypedConstraint, axis: number): boolean;
    /**
     * Test whether a cone-twist is past its swing limit
     *
     * @param constraint - cone-twist constraint
     * @returns swing-limit state
     */
    function is_past_swing_limit(constraint: bullet3d.constraint.btTypedConstraint): boolean;
    /**
     * Test whether a constraint handle is valid
     *
     * @param constraint - constraint handle
     * @returns true while the native constraint exists
     */
    function is_valid(constraint: bullet3d.constraint.btTypedConstraint): boolean;
    /**
     * Linear and angular values use the units described by `get_6dof_motor`.
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     * @param enabled - motor state
     * @param target_velocity - linear or angular target velocity
     * @param max_force - non-negative maximum motor force for linear axes or torque for angular axes
     * @param bounce - optional bounce from 0 to 1; defaults to `0`
     */
    function set_6dof_motor(constraint: bullet3d.constraint.btTypedConstraint, axis: number, enabled: boolean, target_velocity: number, max_force: number, bounce?: number): void;
    /**
     * Set angular-only mode
     *
     * @param constraint - hinge or cone-twist constraint
     * @param angular_only - angular-only state
     */
    function set_angular_only(constraint: bullet3d.constraint.btTypedConstraint, angular_only: boolean): void;
    /**
     * Set cone-twist angular spans
     *
     * @param constraint - cone-twist constraint
     * @param swing_span_1 - non-negative first swing span in radians
     * @param swing_span_2 - non-negative second swing span in radians
     * @param twist_span - non-negative twist span in radians
     * @param softness - optional softness from 0 to 1; defaults to `1`
     * @param bias - optional bias from 0 to 1; defaults to `0.3`
     * @param relaxation - optional relaxation from 0 to 1; defaults to `1`
     */
    function set_cone_twist_limits(constraint: bullet3d.constraint.btTypedConstraint, swing_span_1: number, swing_span_2: number, twist_span: number, softness?: number, bias?: number, relaxation?: number): void;
    /**
     * By default, `target` is the desired rotation of body A relative to body B.
     * With `constraint_space` set, it is the desired rotation of frame A relative
     * to frame B in constraint space.
     *
     * @param constraint - cone-twist constraint
     * @param target - finite, non-zero target orientation; normalized by the binding
     * @param constraint_space - optional target-is-in-constraint-space flag; defaults to `false`
     */
    function set_cone_twist_motor_target(constraint: bullet3d.constraint.btTypedConstraint, target: Quaternion, constraint_space?: boolean): void;
    /**
     * Frame mutation is supported for hinge, generic 6-DOF, generic spring 6-DOF,
     * and slider constraints. Cone-twist, universal, and hinge2 frames are
     * read-only through this API.
     *
     * @param constraint - mutable framed constraint
     * @param position - finite local position
     * @param rotation - finite, non-zero local rotation; normalized by the binding
     */
    function set_frame_a(constraint: bullet3d.constraint.btTypedConstraint, position: Vector3, rotation: Quaternion): void;
    /**
     * Supports the same constraint types as `set_frame_a`. For a one-body
     * constraint, this changes the frame attached to the fixed world body.
     *
     * @param constraint - mutable framed constraint
     * @param position - finite local position or world frame position
     * @param rotation - finite, non-zero local or world frame rotation; normalized by the binding
     */
    function set_frame_b(constraint: bullet3d.constraint.btTypedConstraint, position: Vector3, rotation: Quaternion): void;
    /**
     * This function only supports hinges attached to the world. For a two-body
     * hinge, change both local frames with `set_frame_a` and `set_frame_b`.
     *
     * @param constraint - one-body hinge constraint
     * @param axis - non-zero axis in body-A space
     */
    function set_hinge_axis(constraint: bullet3d.constraint.btTypedConstraint, axis: Vector3): void;
    /**
     * Set hinge angular limits
     *
     * @param constraint - hinge constraint
     * @param lower - lower angle in radians
     * @param upper - upper angle in radians
     * @param bias - optional limit bias from 0 to 1; defaults to `0.3`
     * @param relaxation - optional relaxation from 0 to 1; defaults to `1`
     */
    function set_hinge_limits(constraint: bullet3d.constraint.btTypedConstraint, lower: number, upper: number, bias?: number, relaxation?: number): void;
    /**
     * Set hinge motor settings
     *
     * @param constraint - hinge constraint
     * @param enabled - motor state
     * @param target_velocity - angular target velocity in radians per second
     * @param max_impulse - non-negative maximum angular motor impulse in Defold squared units
     */
    function set_hinge_motor(constraint: bullet3d.constraint.btTypedConstraint, enabled: boolean, target_velocity: number, max_impulse: number): void;
    /**
     * Set a hinge motor angle target
     *
     * @param constraint - hinge constraint
     * @param target_angle - target angle in radians
     * @param time_step - positive step duration in seconds
     */
    function set_hinge_motor_target(constraint: bullet3d.constraint.btTypedConstraint, target_angle: number, time_step: number): void;
    /**
     * Axes 1-3 use Defold units and axes 4-6 use radians. A lower value less than
     * the upper value creates a limited range, equal values lock the axis, and a
     * lower value greater than the upper value makes the axis free.
     *
     * @param constraint - 6-DOF-derived constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     * @param lower - lower limit
     * @param upper - upper limit
     */
    function set_limit(constraint: bullet3d.constraint.btTypedConstraint, axis: number, lower: number, upper: number): void;
    /**
     * Set point-to-point pivots
     *
     * @param constraint - point-to-point constraint
     * @param pivot_a - local body-A pivot
     * @param pivot_b - local body-B pivot or world anchor
     */
    function set_pivots(constraint: bullet3d.constraint.btTypedConstraint, pivot_a: Vector3, pivot_b: Vector3): void;
    /**
     * Each lower/upper pair follows Bullet's limit convention: lower less than
     * upper creates a limited range, equal values lock that axis, and lower greater
     * than upper makes it free. Bullet normalizes the angular limits.
     *
     * @param constraint - slider constraint
     * @param lower_linear - lower linear limit in Defold units
     * @param upper_linear - upper linear limit in Defold units
     * @param lower_angular - lower angular limit in radians
     * @param upper_angular - upper angular limit in radians
     */
    function set_slider_limits(constraint: bullet3d.constraint.btTypedConstraint, lower_linear: number, upper_linear: number, lower_angular: number, upper_angular: number): void;
    /**
     * Linear and angular values use the units described by `get_slider_motor`.
     *
     * @param constraint - slider constraint
     * @param motor - `linear` or `angular`
     * @param enabled - motor state
     * @param target_velocity - linear or angular target velocity
     * @param max_force - non-negative maximum linear force or angular torque
     */
    function set_slider_motor(constraint: bullet3d.constraint.btTypedConstraint, motor: string, enabled: boolean, target_velocity: number, max_force: number): void;
    /**
     * Generic spring 6-DOF constraints use a scale-independent damping factor from
     * 0 to 1, where 1 means no damping. Hinge2 constraints use a damping coefficient
     * where 0 means no damping and any non-negative value is accepted. Hinge2
     * angular damping is automatically converted using `physics.scale` squared.
     *
     * @param constraint - spring 6-DOF or hinge2 constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     * @param damping - damping value in the range required by the constraint type
     */
    function set_spring_damping(constraint: bullet3d.constraint.btTypedConstraint, axis: number, damping: number): void;
    /**
     * With no axis, captures all current transforms. With an axis and no value,
     * captures that axis. Linear values use Defold units and angular values use
     * radians.
     *
     * @param constraint - spring 6-DOF or hinge2 constraint
     * @param axis - optional one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     * @param value - optional explicit equilibrium value
     */
    function set_spring_equilibrium_point(constraint: bullet3d.constraint.btTypedConstraint, axis?: number, value?: number): void;
    /**
     * Linear stiffness values are independent of `physics.scale`. Angular
     * stiffness values are automatically converted using `physics.scale` squared.
     *
     * @param constraint - spring 6-DOF or hinge2 constraint
     * @param axis - one-based axis from 1 to 6. **⚠️ 1-based; passed to Defold unchanged.**
     * @param stiffness - non-negative stiffness
     */
    function set_spring_stiffness(constraint: bullet3d.constraint.btTypedConstraint, axis: number, stiffness: number): void;
  }
}

export {};

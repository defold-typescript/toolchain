/** @noSelfInFile */
import type { Opaque, Vector3 } from "../src/core-types";

declare global {
  /**
   * Functions for interacting with native Box2D joints.
   */
  namespace b2d.joint {
    type b2Joint = Opaque<"b2Joint">;
    /**
     * Distance joint type.
     */
    const JOINT_TYPE_DISTANCE: number & { readonly __brand: "b2d.joint.JOINT_TYPE_DISTANCE" };
    /**
     * Filter joint type.
     */
    const JOINT_TYPE_FILTER: number & { readonly __brand: "b2d.joint.JOINT_TYPE_FILTER" };
    /**
     * Friction joint type.
     */
    const JOINT_TYPE_FRICTION: number & { readonly __brand: "b2d.joint.JOINT_TYPE_FRICTION" };
    /**
     * Gear joint type.
     */
    const JOINT_TYPE_GEAR: number & { readonly __brand: "b2d.joint.JOINT_TYPE_GEAR" };
    /**
     * Motor joint type.
     */
    const JOINT_TYPE_MOTOR: number & { readonly __brand: "b2d.joint.JOINT_TYPE_MOTOR" };
    /**
     * Mouse joint type.
     */
    const JOINT_TYPE_MOUSE: number & { readonly __brand: "b2d.joint.JOINT_TYPE_MOUSE" };
    /**
     * Prismatic joint type.
     */
    const JOINT_TYPE_PRISMATIC: number & { readonly __brand: "b2d.joint.JOINT_TYPE_PRISMATIC" };
    /**
     * Pulley joint type.
     */
    const JOINT_TYPE_PULLEY: number & { readonly __brand: "b2d.joint.JOINT_TYPE_PULLEY" };
    /**
     * Revolute joint type.
     */
    const JOINT_TYPE_REVOLUTE: number & { readonly __brand: "b2d.joint.JOINT_TYPE_REVOLUTE" };
    /**
     * Rope joint type.
     */
    const JOINT_TYPE_ROPE: number & { readonly __brand: "b2d.joint.JOINT_TYPE_ROPE" };
    /**
     * Unknown joint type.
     */
    const JOINT_TYPE_UNKNOWN: number & { readonly __brand: "b2d.joint.JOINT_TYPE_UNKNOWN" };
    /**
     * Weld joint type.
     */
    const JOINT_TYPE_WELD: number & { readonly __brand: "b2d.joint.JOINT_TYPE_WELD" };
    /**
     * Wheel joint type.
     */
    const JOINT_TYPE_WHEEL: number & { readonly __brand: "b2d.joint.JOINT_TYPE_WHEEL" };
    /**
     * At lower limit state.
     */
    const LIMIT_STATE_AT_LOWER: number & { readonly __brand: "b2d.joint.LIMIT_STATE_AT_LOWER" };
    /**
     * At upper limit state.
     */
    const LIMIT_STATE_AT_UPPER: number & { readonly __brand: "b2d.joint.LIMIT_STATE_AT_UPPER" };
    /**
     * Equal limits state.
     */
    const LIMIT_STATE_EQUAL: number & { readonly __brand: "b2d.joint.LIMIT_STATE_EQUAL" };
    /**
     * Inactive limit state.
     */
    const LIMIT_STATE_INACTIVE: number & { readonly __brand: "b2d.joint.LIMIT_STATE_INACTIVE" };
    /**
     * Create a distance joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `local_anchor_a`, `local_anchor_b`, `length`, `frequency`, `damping_ratio`, and `collide_connected`
     * @returns created joint
     */
    function create_distance(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { local_anchor_a?: Vector3; local_anchor_b?: Vector3; length?: number; frequency?: number; damping_ratio?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a filter joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition table
     * @returns created joint
     */
    function create_filter(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: Record<string | number, unknown>): Opaque<"b2Joint">;
    /**
     * Create a friction joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `local_anchor_a`, `local_anchor_b`, `max_force`, `max_torque`, and `collide_connected`
     * @returns created joint
     */
    function create_friction(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { local_anchor_a?: Vector3; local_anchor_b?: Vector3; max_force?: number; max_torque?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a gear joint.
     *
     * @param joint1 - first revolute or prismatic joint
     * @param joint2 - second revolute or prismatic joint
     * @param definition - optional definition with `ratio`
     * @returns created joint
     */
    function create_gear(joint1: Opaque<"b2Joint">, joint2: Opaque<"b2Joint">, definition: { ratio?: number }): Opaque<"b2Joint">;
    /**
     * Create a motor joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `linear_offset`, `angular_offset`, `max_force`, `max_torque`, `correction_factor`, and `collide_connected`
     * @returns created joint
     */
    function create_motor(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { linear_offset?: Vector3; angular_offset?: number; max_force?: number; max_torque?: number; correction_factor?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a mouse joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `target`, `max_force`, `frequency`, `damping_ratio`, and `collide_connected`
     * @returns created joint
     */
    function create_mouse(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { target?: Vector3; max_force?: number; frequency?: number; damping_ratio?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a prismatic joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `local_anchor_a`, `local_anchor_b`, `local_axis_a`, `reference_angle`, `enable_limit`, `lower_translation`, `upper_translation`, `enable_motor`, `max_motor_force`, `motor_speed`, and `collide_connected`
     * @returns created joint
     */
    function create_prismatic(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { local_anchor_a?: Vector3; local_anchor_b?: Vector3; local_axis_a?: Vector3; reference_angle?: number; enable_limit?: boolean; lower_translation?: number; upper_translation?: number; enable_motor?: boolean; max_motor_force?: number; motor_speed?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a pulley joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `ground_anchor_a`, `ground_anchor_b`, `local_anchor_a`, `local_anchor_b`, `length_a`, `length_b`, `ratio`, and `collide_connected`
     * @returns created joint
     */
    function create_pulley(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { ground_anchor_a?: Vector3; ground_anchor_b?: Vector3; local_anchor_a?: Vector3; local_anchor_b?: Vector3; length_a?: number; length_b?: number; ratio?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a revolute joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `local_anchor_a`, `local_anchor_b`, `reference_angle`, `enable_limit`, `lower_angle`, `upper_angle`, `enable_motor`, `max_motor_torque`, `motor_speed`, and `collide_connected`
     * @returns created joint
     */
    function create_revolute(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { local_anchor_a?: Vector3; local_anchor_b?: Vector3; reference_angle?: number; enable_limit?: boolean; lower_angle?: number; upper_angle?: number; enable_motor?: boolean; max_motor_torque?: number; motor_speed?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a rope joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `local_anchor_a`, `local_anchor_b`, `max_length`, and `collide_connected`
     * @returns created joint
     */
    function create_rope(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { local_anchor_a?: Vector3; local_anchor_b?: Vector3; max_length?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a weld joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `local_anchor_a`, `local_anchor_b`, `reference_angle`, `frequency`, `damping_ratio`, and `collide_connected`
     * @returns created joint
     */
    function create_weld(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { local_anchor_a?: Vector3; local_anchor_b?: Vector3; reference_angle?: number; frequency?: number; damping_ratio?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Create a wheel joint.
     *
     * @param body_a - first body
     * @param body_b - second body
     * @param definition - optional definition with `local_anchor_a`, `local_anchor_b`, `local_axis_a`, `enable_motor`, `max_motor_torque`, `motor_speed`, `frequency`, `damping_ratio`, and `collide_connected`
     * @returns created joint
     */
    function create_wheel(body_a: Opaque<"b2Body">, body_b: Opaque<"b2Body">, definition: { local_anchor_a?: Vector3; local_anchor_b?: Vector3; local_axis_a?: Vector3; enable_motor?: boolean; max_motor_torque?: number; motor_speed?: number; frequency?: number; damping_ratio?: number; collide_connected?: boolean }): Opaque<"b2Joint">;
    /**
     * Destroy a joint created by `b2d.joint`.
     *
     * @param joint - joint
     */
    function destroy(joint: Opaque<"b2Joint">): void;
    /**
     * Enable or disable joint limits.
     *
     * @param joint - prismatic or revolute joint
     * @param enable - true to enable limits
     */
    function enable_limit(joint: Opaque<"b2Joint">, enable: boolean): void;
    /**
     * Enable or disable the joint motor.
     *
     * @param joint - prismatic, revolute, or wheel joint
     * @param enable - true to enable the motor
     */
    function enable_motor(joint: Opaque<"b2Joint">, enable: boolean): void;
    /**
     * Enable or disable joint spring behavior.
     *
     * @param joint - distance, prismatic, revolute, or wheel joint
     * @param enable - true to enable the spring
     */
    function enable_spring(joint: Opaque<"b2Joint">, enable: boolean): void;
    /**
     * Get the world anchor on body A.
     *
     * @param joint - joint
     * @returns world anchor
     */
    function get_anchor_a(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get the world anchor on body B.
     *
     * @param joint - joint
     * @returns world anchor
     */
    function get_anchor_b(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get weld joint angular damping ratio.
     *
     * @param joint - weld joint
     * @returns damping ratio
     */
    function get_angular_damping_ratio(joint: Opaque<"b2Joint">): number;
    /**
     * Get weld joint angular frequency.
     *
     * @param joint - weld joint
     * @returns frequency in hertz
     */
    function get_angular_hertz(joint: Opaque<"b2Joint">): number;
    /**
     * Get motor joint angular offset.
     *
     * @param joint - motor joint
     * @returns angular offset in radians
     */
    function get_angular_offset(joint: Opaque<"b2Joint">): number;
    /**
     * Get the first body connected to a joint.
     *
     * @param joint - joint
     * @returns body A
     */
    function get_body_a(joint: Opaque<"b2Joint">): Opaque<"b2Body">;
    /**
     * Get the second body connected to a joint.
     *
     * @param joint - joint
     * @returns body B
     */
    function get_body_b(joint: Opaque<"b2Joint">): Opaque<"b2Body">;
    /**
     * Get whether connected bodies can collide.
     *
     * @param joint - joint
     * @returns true if connected bodies can collide
     */
    function get_collide_connected(joint: Opaque<"b2Joint">): boolean;
    /**
     * Get motor joint correction factor.
     *
     * @param joint - motor joint
     * @returns correction factor
     */
    function get_correction_factor(joint: Opaque<"b2Joint">): number;
    /**
     * Get the current distance joint length.
     *
     * @param joint - distance joint
     * @returns current length in project units
     */
    function get_current_length(joint: Opaque<"b2Joint">): number;
    /**
     * Get spring damping ratio.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @returns damping ratio
     */
    function get_damping_ratio(joint: Opaque<"b2Joint">): number;
    /**
     * Get spring frequency.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @returns frequency in hertz
     */
    function get_frequency(joint: Opaque<"b2Joint">): number;
    /**
     * Get pulley ground anchor A.
     *
     * @param joint - pulley joint
     * @returns world anchor
     */
    function get_ground_anchor_a(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get pulley ground anchor B.
     *
     * @param joint - pulley joint
     * @returns world anchor
     */
    function get_ground_anchor_b(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Alias for `b2d.joint.get_frequency`.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @returns frequency in hertz
     */
    function get_hertz(joint: Opaque<"b2Joint">): number;
    /**
     * Get revolute joint angle.
     *
     * @param joint - revolute joint
     * @returns angle in radians
     */
    function get_joint_angle(joint: Opaque<"b2Joint">): number;
    /**
     * Get joint speed.
     *
     * @param joint - prismatic, revolute, or wheel joint
     * @returns joint speed
     */
    function get_joint_speed(joint: Opaque<"b2Joint">): number;
    /**
     * Get joint translation.
     *
     * @param joint - prismatic or wheel joint
     * @returns translation in project units
     */
    function get_joint_translation(joint: Opaque<"b2Joint">): number;
    /**
     * Get the first joint connected to a gear joint.
     *
     * @param joint - gear joint
     * @returns first connected joint
     */
    function get_joint1(joint: Opaque<"b2Joint">): Opaque<"b2Joint">;
    /**
     * Get the second joint connected to a gear joint.
     *
     * @param joint - gear joint
     * @returns second connected joint
     */
    function get_joint2(joint: Opaque<"b2Joint">): Opaque<"b2Joint">;
    /**
     * Get the distance joint length.
     *
     * @param joint - distance joint
     * @returns length in project units
     */
    function get_length(joint: Opaque<"b2Joint">): number;
    /**
     * Get pulley segment length A.
     *
     * @param joint - pulley joint
     * @returns length in project units
     */
    function get_length_a(joint: Opaque<"b2Joint">): number;
    /**
     * Get pulley segment length B.
     *
     * @param joint - pulley joint
     * @returns length in project units
     */
    function get_length_b(joint: Opaque<"b2Joint">): number;
    /**
     * Get rope limit state.
     *
     * @param joint - rope joint
     * @returns one of the `LIMIT_STATE_*` constants
     */
    function get_limit_state(joint: Opaque<"b2Joint">): number;
    /**
     * Get weld joint linear damping ratio.
     *
     * @param joint - weld joint
     * @returns damping ratio
     */
    function get_linear_damping_ratio(joint: Opaque<"b2Joint">): number;
    /**
     * Get weld joint linear frequency.
     *
     * @param joint - weld joint
     * @returns frequency in hertz
     */
    function get_linear_hertz(joint: Opaque<"b2Joint">): number;
    /**
     * Get motor joint linear offset.
     *
     * @param joint - motor joint
     * @returns linear offset in project units
     */
    function get_linear_offset(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get the local anchor on body A.
     *
     * @param joint - joint
     * @returns local anchor
     */
    function get_local_anchor_a(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get the local anchor on body B.
     *
     * @param joint - joint
     * @returns local anchor
     */
    function get_local_anchor_b(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get the local axis on body A.
     *
     * @param joint - prismatic or wheel joint
     * @returns local axis
     */
    function get_local_axis_a(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get the lower joint limit.
     *
     * @param joint - prismatic or revolute joint
     * @returns lower limit
     */
    function get_lower_limit(joint: Opaque<"b2Joint">): number;
    /**
     * Get maximum force.
     *
     * @param joint - mouse or friction joint
     * @returns maximum force
     */
    function get_max_force(joint: Opaque<"b2Joint">): number;
    /**
     * Get rope maximum length.
     *
     * @param joint - rope joint
     * @returns maximum length in project units
     */
    function get_max_length(joint: Opaque<"b2Joint">): number;
    /**
     * Get maximum motor force.
     *
     * @param joint - prismatic joint
     * @returns maximum motor force
     */
    function get_max_motor_force(joint: Opaque<"b2Joint">): number;
    /**
     * Get maximum motor torque.
     *
     * @param joint - revolute or wheel joint
     * @returns maximum motor torque
     */
    function get_max_motor_torque(joint: Opaque<"b2Joint">): number;
    /**
     * Get maximum torque.
     *
     * @param joint - friction joint
     * @returns maximum torque
     */
    function get_max_torque(joint: Opaque<"b2Joint">): number;
    /**
     * Get the distance joint minimum length.
     *
     * @param joint - distance joint
     * @returns minimum length in project units
     */
    function get_min_length(joint: Opaque<"b2Joint">): number;
    /**
     * Get current motor force.
     *
     * @param joint - distance or prismatic joint
     * @returns motor force
     */
    function get_motor_force(joint: Opaque<"b2Joint">): number;
    /**
     * Get current motor force.
     *
     * @param joint - prismatic joint
     * @param inv_dt - inverse time step
     * @returns motor force
     */
    function get_motor_force(joint: Opaque<"b2Joint">, inv_dt: number): number;
    /**
     * Get motor speed.
     *
     * @param joint - prismatic, revolute, or wheel joint
     * @returns motor speed
     */
    function get_motor_speed(joint: Opaque<"b2Joint">): number;
    /**
     * Get current motor torque.
     *
     * @param joint - revolute or wheel joint
     * @returns motor torque
     */
    function get_motor_torque(joint: Opaque<"b2Joint">): number;
    /**
     * Get current motor torque.
     *
     * @param joint - revolute or wheel joint
     * @param inv_dt - inverse time step
     * @returns motor torque
     */
    function get_motor_torque(joint: Opaque<"b2Joint">, inv_dt: number): number;
    /**
     * Get the target for a mouse joint.
     *
     * @param joint - mouse joint
     * @returns world target
     */
    function get_mouse_target(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get joint ratio.
     *
     * @param joint - pulley or gear joint
     * @returns joint ratio
     */
    function get_ratio(joint: Opaque<"b2Joint">): number;
    /**
     * Get reaction force.
     *
     * @param joint - joint
     * @returns reaction force
     */
    function get_reaction_force(joint: Opaque<"b2Joint">): Vector3;
    /**
     * Get reaction force.
     *
     * @param joint - joint
     * @param inv_dt - inverse time step
     * @returns reaction force
     */
    function get_reaction_force(joint: Opaque<"b2Joint">, inv_dt: number): Vector3;
    /**
     * Get reaction torque.
     *
     * @param joint - joint
     * @returns reaction torque
     */
    function get_reaction_torque(joint: Opaque<"b2Joint">): number;
    /**
     * Get reaction torque.
     *
     * @param joint - joint
     * @param inv_dt - inverse time step
     * @returns reaction torque
     */
    function get_reaction_torque(joint: Opaque<"b2Joint">, inv_dt: number): number;
    /**
     * Get the reference angle.
     *
     * @param joint - prismatic, revolute, or weld joint
     * @returns reference angle in radians
     */
    function get_reference_angle(joint: Opaque<"b2Joint">): number;
    /**
     * Alias for `b2d.joint.get_damping_ratio`.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @returns damping ratio
     */
    function get_spring_damping_ratio(joint: Opaque<"b2Joint">): number;
    /**
     * Get spring frequency.
     *
     * @param joint - distance, mouse, prismatic, revolute, or wheel joint
     * @returns frequency in hertz
     */
    function get_spring_hertz(joint: Opaque<"b2Joint">): number;
    /**
     * Get the joint type.
     *
     * @param joint - joint
     * @returns one of the `JOINT_TYPE_*` constants
     */
    function get_type(joint: Opaque<"b2Joint">): number;
    /**
     * Get the upper joint limit.
     *
     * @param joint - prismatic or revolute joint
     * @returns upper limit
     */
    function get_upper_limit(joint: Opaque<"b2Joint">): number;
    /**
     * Get the world owning a joint.
     *
     * @param joint - joint
     * @returns owning world
     */
    function get_world(joint: Opaque<"b2Joint">): Opaque<"b2World">;
    /**
     * Get whether the joint is active.
     *
     * @param joint - joint
     * @returns true if the joint is active
     */
    function is_active(joint: Opaque<"b2Joint">): boolean;
    /**
     * Get whether joint limits are enabled.
     *
     * @param joint - prismatic or revolute joint
     * @returns true if limits are enabled
     */
    function is_limit_enabled(joint: Opaque<"b2Joint">): boolean;
    /**
     * Get whether the joint motor is enabled.
     *
     * @param joint - prismatic, revolute, or wheel joint
     * @returns true if the motor is enabled
     */
    function is_motor_enabled(joint: Opaque<"b2Joint">): boolean;
    /**
     * Get whether joint spring behavior is enabled.
     *
     * @param joint - distance, prismatic, revolute, or wheel joint
     * @returns true if the spring is enabled
     */
    function is_spring_enabled(joint: Opaque<"b2Joint">): boolean;
    /**
     * Validate a joint handle.
     *
     * @param joint - joint
     * @returns true if the joint handle still refers to a live Box2D joint
     */
    function is_valid(joint: Opaque<"b2Joint">): boolean;
    /**
     * Set weld joint angular damping ratio.
     *
     * @param joint - weld joint
     * @param ratio - damping ratio
     */
    function set_angular_damping_ratio(joint: Opaque<"b2Joint">, ratio: number): void;
    /**
     * Set weld joint angular frequency.
     *
     * @param joint - weld joint
     * @param hertz - frequency in hertz
     */
    function set_angular_hertz(joint: Opaque<"b2Joint">, hertz: number): void;
    /**
     * Set motor joint angular offset.
     *
     * @param joint - motor joint
     * @param offset - angular offset in radians
     */
    function set_angular_offset(joint: Opaque<"b2Joint">, offset: number): void;
    /**
     * Set whether connected bodies can collide.
     *
     * @param joint - joint
     * @param collide - true if connected bodies can collide
     */
    function set_collide_connected(joint: Opaque<"b2Joint">, collide: boolean): void;
    /**
     * Set motor joint correction factor.
     *
     * @param joint - motor joint
     * @param factor - correction factor
     */
    function set_correction_factor(joint: Opaque<"b2Joint">, factor: number): void;
    /**
     * Set spring damping ratio.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @param ratio - damping ratio
     */
    function set_damping_ratio(joint: Opaque<"b2Joint">, ratio: number): void;
    /**
     * Set spring frequency.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @param frequency - frequency in hertz
     */
    function set_frequency(joint: Opaque<"b2Joint">, frequency: number): void;
    /**
     * Alias for `b2d.joint.set_frequency`.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @param hertz - frequency in hertz
     */
    function set_hertz(joint: Opaque<"b2Joint">, hertz: number): void;
    /**
     * Set the distance joint length.
     *
     * @param joint - distance joint
     * @param length - length in project units
     */
    function set_length(joint: Opaque<"b2Joint">, length: number): void;
    /**
     * Set the distance joint length range.
     *
     * @param joint - distance joint
     * @param min_length - minimum length in project units
     * @param max_length - maximum length in project units
     */
    function set_length_range(joint: Opaque<"b2Joint">, min_length: number, max_length: number): void;
    /**
     * Set joint limits.
     *
     * @param joint - prismatic or revolute joint
     * @param lower - lower limit
     * @param upper - upper limit
     */
    function set_limits(joint: Opaque<"b2Joint">, lower: number, upper: number): void;
    /**
     * Set weld joint linear damping ratio.
     *
     * @param joint - weld joint
     * @param ratio - damping ratio
     */
    function set_linear_damping_ratio(joint: Opaque<"b2Joint">, ratio: number): void;
    /**
     * Set weld joint linear frequency.
     *
     * @param joint - weld joint
     * @param hertz - frequency in hertz
     */
    function set_linear_hertz(joint: Opaque<"b2Joint">, hertz: number): void;
    /**
     * Set motor joint linear offset.
     *
     * @param joint - motor joint
     * @param offset - linear offset in project units
     */
    function set_linear_offset(joint: Opaque<"b2Joint">, offset: Vector3): void;
    /**
     * Set maximum force.
     *
     * @param joint - mouse or friction joint
     * @param force - maximum force
     */
    function set_max_force(joint: Opaque<"b2Joint">, force: number): void;
    /**
     * Set rope maximum length.
     *
     * @param joint - rope joint
     * @param length - maximum length in project units
     */
    function set_max_length(joint: Opaque<"b2Joint">, length: number): void;
    /**
     * Set maximum motor force.
     *
     * @param joint - prismatic joint
     * @param force - maximum motor force
     */
    function set_max_motor_force(joint: Opaque<"b2Joint">, force: number): void;
    /**
     * Set maximum motor torque.
     *
     * @param joint - revolute or wheel joint
     * @param torque - maximum motor torque
     */
    function set_max_motor_torque(joint: Opaque<"b2Joint">, torque: number): void;
    /**
     * Set maximum torque.
     *
     * @param joint - friction joint
     * @param torque - maximum torque
     */
    function set_max_torque(joint: Opaque<"b2Joint">, torque: number): void;
    /**
     * Set the distance joint minimum length.
     *
     * @param joint - distance joint
     * @param length - minimum length in project units
     */
    function set_min_length(joint: Opaque<"b2Joint">, length: number): void;
    /**
     * Set motor speed.
     *
     * @param joint - prismatic, revolute, or wheel joint
     * @param speed - motor speed
     */
    function set_motor_speed(joint: Opaque<"b2Joint">, speed: number): void;
    /**
     * Set the target for a mouse joint.
     *
     * @param joint - mouse joint
     * @param target - world target
     */
    function set_mouse_target(joint: Opaque<"b2Joint">, target: Vector3): void;
    /**
     * Set gear joint ratio.
     *
     * @param joint - gear joint
     * @param ratio - gear ratio
     */
    function set_ratio(joint: Opaque<"b2Joint">, ratio: number): void;
    /**
     * Set weld joint reference angle.
     *
     * @param joint - weld joint
     * @param angle - reference angle in radians
     */
    function set_reference_angle(joint: Opaque<"b2Joint">, angle: number): void;
    /**
     * Alias for `b2d.joint.set_damping_ratio`.
     *
     * @param joint - distance, mouse, weld, or wheel joint
     * @param ratio - damping ratio
     */
    function set_spring_damping_ratio(joint: Opaque<"b2Joint">, ratio: number): void;
    /**
     * Set spring frequency.
     *
     * @param joint - distance, mouse, prismatic, revolute, or wheel joint
     * @param hertz - frequency in hertz
     */
    function set_spring_hertz(joint: Opaque<"b2Joint">, hertz: number): void;
    /**
     * Wake the bodies connected to a joint.
     *
     * @param joint - joint
     */
    function wake_bodies(joint: Opaque<"b2Joint">): void;
  }
}

export {};

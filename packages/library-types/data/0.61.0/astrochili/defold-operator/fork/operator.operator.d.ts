/** @noSelfInFile **/

/**
 * Shared settings and math helpers for the Operator camera controller. The camera itself
 * is driven by the properties and messages of `operator/operator/operator.script`
 * (`activate`, `follow_point`, `manual_control` and the rest), which are not members of
 * this module. The settings fields are plain module fields; assigning one goes through a
 * cast, since a namespace import is read-only:
 * `(operator as { flight_look_easing: (this: void, x: number) => number }).flight_look_easing = (x) => x`.
 * @see {@link https://github.com/astrochili/defold-operator|Github Source}
 * @noResolution
 */
declare module 'operator.operator' {
  /**
   * Linearly interpolates from `a` to `b`, returning `a + (b - a) * t`. `t` is not
   * clamped, so a value outside `0` to `1` extrapolates.
   * @param t The progress, `0` giving `a` and `1` giving `b`.
   * @param a The start value.
   * @param b The end value.
   */
  export function lerp(t: number, a: number, b: number): number;
  /**
   * Linearly interpolates from vector `a` to vector `b`, returning `a + (b - a) * t` as a
   * new vector. `t` is not clamped, so a value outside `0` to `1` extrapolates.
   * @param t The progress, `0` giving `a` and `1` giving `b`.
   * @param a The start vector.
   * @param b The end vector.
   */
  export function lerp(t: number, a: Vector3, b: Vector3): Vector3;

  /**
   * Returns the angle between two vectors, in degrees from `0` to `180`. A vector of zero
   * length gives NaN.
   * @param v1 The first vector.
   * @param v2 The second vector.
   */
  export function angle_between(v1: Vector3, v2: Vector3): number;

  /**
   * Projects a vector onto the plane through the origin with the given normal, returning
   * `v - plane_normal * vmath.dot(plane_normal, v)`. The normal must have unit length for
   * the result to lie on the plane.
   * @param plane_normal The plane's normal, of unit length.
   * @param v The vector to project.
   */
  export function project_on_plane(plane_normal: Vector3, v: Vector3): Vector3;

  /**
   * Converts Euler angles in degrees to a rotation, composed as `z * y * x` from the
   * rotations about each axis.
   * @param euler The angles about the `x`, `y` and `z` axes, in degrees.
   */
  export function quat_from_euler(euler: Vector3): Quaternion;

  /**
   * Converts a rotation to Euler angles in degrees, about the `x`, `y` and `z` axes. It
   * reads them back in the order `y * x * z`, so it reverses `quat_from_euler` when the
   * `z` angle is `0`. At an `x` angle near 90 or -90 degrees the `z` angle is `0`.
   * @param quat The rotation.
   */
  export function euler_from_quat(quat: Quaternion): Vector3;

  /**
   * Returns `target`, shifted by one full turn when that makes the turn from `original`
   * no more than 180 degrees, so an animation from `original` takes the short way round.
   * @param original The current angle, in degrees.
   * @param target The wanted angle, in degrees.
   */
  export function normalized_target_angle(original: number, target: number): number;

  /**
   * Applies `normalized_target_angle` to each of the `x`, `y` and `z` angles, returning a
   * new vector.
   * @param original The current Euler angles, in degrees.
   * @param target The wanted Euler angles, in degrees.
   */
  export function normalized_target_euler(original: Vector3, target: Vector3): Vector3;

  /**
   * Brings an angle beyond 360 or -360 degrees back by one full turn, then clamps it
   * between `min` and `max`.
   * @param angle The angle, in degrees.
   * @param min The smallest angle returned, in degrees.
   * @param max The largest angle returned, in degrees.
   */
  export function clamp_angle(angle: number, min: number, max: number): number;

  /**
   * Sine ease-in-out: maps a progress from `0` to `1` to an eased progress from `0` to `1`.
   * @param x The progress, from `0` to `1`.
   */
  export function EASING_INOUT_SINE(x: number): number;

  /**
   * Cubic ease-in-out: maps a progress from `0` to `1` to an eased progress from `0` to `1`.
   * @param x The progress, from `0` to `1`.
   */
  export function EASING_INOUT_CUBIC(x: number): number;

  /**
   * Quintic ease-in-out: maps a progress from `0` to `1` to an eased progress from `0` to
   * `1`.
   * @param x The progress, from `0` to `1`.
   */
  export function EASING_INOUT_QUINT(x: number): number;

  /**
   * Circular ease-in-out: maps a progress from `0` to `1` to an eased progress from `0` to
   * `1`.
   * @param x The progress, from `0` to `1`.
   */
  export function EASING_INOUT_CIRC(x: number): number;

  /**
   * Quadratic ease-in-out: maps a progress from `0` to `1` to an eased progress from `0` to
   * `1`. It is the default `flight_look_easing`.
   * @param x The progress, from `0` to `1`.
   */
  export function EASING_INOUT_QUAD(x: number): number;

  /**
   * Quartic ease-in-out: maps a progress from `0` to `1` to an eased progress from `0` to
   * `1`.
   * @param x The progress, from `0` to `1`.
   */
  export function EASING_INOUT_QUART(x: number): number;

  /**
   * Exponential ease-in-out: maps a progress from `0` to `1` to an eased progress from `0`
   * to `1`.
   * @param x The progress, from `0` to `1`.
   */
  export function EASING_INOUT_EXPO(x: number): number;

  /**
   * The collision groups tested by the raycast from the operator anchor to the camera, so
   * the camera stays in front of obstacles. Read on every raycast. Starts as
   * `[hash("default")]`.
   */
  export let camera_collisions_groups: Hash[];

  /**
   * The number of bezier segments an operator samples a flight path with, which sets how
   * accurate its uniform position is. Read each time an operator starts flying to the next
   * motion point. `16` is usually enough; starts at `32`.
   */
  export let flight_bezier_samples_count: number;

  /**
   * The easing function that turns the camera between motion points, taking the progress
   * from `0` to `1` and returning the eased progress. Starts as `EASING_INOUT_QUAD`; any of
   * the `EASING_INOUT_*` functions, or a project's own, can replace it.
   */
  export let flight_look_easing: (x: number) => number;

  /**
   * Returns the url of the active operator's game object, or `undefined` when no operator
   * is active.
   */
  export function get_active_operator(): Url | undefined;

  /**
   * Turns debug mode on or off for every operator and checkpoint: on, they show their
   * camera and checkpoint meshes and draw the active bezier path.
   * @param is_debug `true` to turn debug mode on.
   */
  export function set_debug(is_debug: boolean): void;

  /** Returns whether debug mode is on. Starts `false`. */
  export function is_debug(): boolean;
}

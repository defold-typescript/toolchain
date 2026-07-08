/** @noSelfInFile */

import type { Quaternion, Vector3, Vector4 } from "./core-types";

declare global {
  namespace vmath {
    /**
     * Clamp input value to be in range of [min, max]. In case if input value has vector3|vector4 type
     * return new vector3|vector4 with clamped value at every vector's element.
     * Min/max arguments can be vector3|vector4. In that case clamp excuted per every vector's element
     *
     * @param value - Input value or vector of values
     * @param min - Min value(s) border
     * @param max - Max value(s) border
     * @returns Clamped value or vector
     */
    function clamp<T extends number | Vector3 | Vector4>(
      value: T,
      min: number | T,
      max: number | T,
    ): T;
    /**
     * Linearly interpolate between two vectors. The function
     * treats the vectors as positions and interpolates between
     * the positions in a straight line. Lerp is useful to describe
     * transitions from one place to another over time.
     * The function does not clamp t between 0 and 1.
     *
     * @param t - interpolation parameter, 0-1
     * @param v1 - vector to lerp from
     * @param v2 - vector to lerp to
     * @returns the lerped vector
     */
    function lerp<T extends Vector3 | Vector4>(t: number, v1: T, v2: T): T;
    /**
     * Linearly interpolate between two quaternions. Linear
     * interpolation of rotations are only useful for small
     * rotations. For interpolations of arbitrary rotations,
     * vmath.slerp yields much better results.
     * The function does not clamp t between 0 and 1.
     *
     * @param t - interpolation parameter, 0-1
     * @param q1 - quaternion to lerp from
     * @param q2 - quaternion to lerp to
     * @returns the lerped quaternion
     */
    function lerp(t: number, q1: Quaternion, q2: Quaternion): Quaternion;
    /**
     * Linearly interpolate between two values. Lerp is useful
     * to describe transitions from one value to another over time.
     * The function does not clamp t between 0 and 1.
     *
     * @param t - interpolation parameter, 0-1
     * @param n1 - number to lerp from
     * @param n2 - number to lerp to
     * @returns the lerped number
     */
    function lerp(t: number, n1: number, n2: number): number;
    /**
     * Performs an element wise multiplication between two vectors of the same type
     * The returned value is a vector defined as (e.g. for a vector3):
     * `v = vmath.mul_per_elem(a, b) = vmath.vector3(a.x * b.x, a.y * b.y, a.z * b.z)`
     *
     * @param v1 - first vector
     * @param v2 - second vector
     * @returns multiplied vector
     */
    function mul_per_elem<T extends Vector3 | Vector4>(v1: T, v2: T): T;
    /**
     * Normalizes a vector, i.e. returns a new vector with the same
     * direction as the input vector, but with length 1.
     * The length of the vector must be above 0, otherwise a
     * division-by-zero will occur.
     *
     * @param v1 - vector to normalize
     * @returns new normalized vector
     */
    function normalize<T extends Vector3 | Vector4 | Quaternion>(v1: T): T;
    /**
     * Spherically interpolates between two vectors. The difference to
     * lerp is that slerp treats the vectors as directions instead of
     * positions in space.
     * The direction of the returned vector is interpolated by the angle
     * and the magnitude is interpolated between the magnitudes of the
     * from and to vectors.
     * Slerp is computationally more expensive than lerp.
     * The function does not clamp t between 0 and 1.
     *
     * @param t - interpolation parameter, 0-1
     * @param v1 - vector to slerp from
     * @param v2 - vector to slerp to
     * @returns the slerped vector
     */
    function slerp<T extends Vector3 | Vector4>(t: number, v1: T, v2: T): T;
    /**
     * Slerp travels the torque-minimal path maintaining constant
     * velocity, which means it travels along the straightest path along
     * the rounded surface of a sphere. Slerp is useful for interpolation
     * of rotations.
     * The function does not clamp t between 0 and 1.
     *
     * @param t - interpolation parameter, 0-1
     * @param q1 - quaternion to slerp from
     * @param q2 - quaternion to slerp to
     * @returns the slerped quaternion
     */
    function slerp(t: number, q1: Quaternion, q2: Quaternion): Quaternion;
  }
}

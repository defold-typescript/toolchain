/** @noSelfInFile **/

/**
 * Linear, quadratic and cubic bezier curves through vector or number points, with a
 * uniform position along the curve's length. The Operator camera moves along these
 * curves, and a project can use them for its own paths.
 * @see {@link https://github.com/astrochili/defold-operator|Github Source}
 * @noResolution
 */
declare module 'operator.bezier' {
  /**
   * A bezier instance, created by `new`, with the curve's length pre-calculated in
   * samples. Its methods are the module functions called with the instance as `self`.
   */
  export interface Bezier<P> {
    /**
     * Returns the classic position along the curve at a progress. `time` is not clamped,
     * so a value outside `0` to `1` extrapolates.
     * @param time The progress, from `0` to `1`.
     */
    position(time: number): P;

    /**
     * Returns the uniform position along the curve: the point at that fraction of the
     * curve's length. `time` is clamped between `0` and `1`, and the accuracy depends on
     * the `samples_count` given to `new`.
     * @param time The progress, from `0` to `1`.
     */
    uniform_position(time: number): P;
  }

  /**
   * Creates a bezier instance from 2 to 4 points: 2 give a straight line, 3 a quadratic
   * curve and 4 a cubic curve. Any other count fails an assert. The default length
   * function is `vmath.length`, which rejects numbers, so number points need a
   * `length_func` such as `math.abs`.
   * @param points The points, from the start of the curve to its end.
   * @param samples_count The number of segments `uniform_position` measures the curve
   * with, a whole number. It defaults to `1`, and 2 points always use `1`.
   * @param length_func Returns the length of the difference of two points. Defaults to
   * `vmath.length`.
   * @param lerp_func Interpolates between two points. Defaults to `vmath.lerp`.
   */
  function new_<P extends Vector3 | Vector4>(
    points: P[],
    samples_count?: number,
    length_func?: (v: P) => number,
    lerp_func?: (t: number, a: P, b: P) => P,
  ): Bezier<P>;
  /**
   * Creates a bezier instance from 2 to 4 number points: 2 give a straight line, 3 a
   * quadratic curve and 4 a cubic curve. Any other count fails an assert. The default
   * length function is `vmath.length`, which rejects numbers, so a `length_func` such as
   * `math.abs` is required; the default lerp function, `vmath.lerp`, takes numbers.
   * @param points The points, from the start of the curve to its end.
   * @param samples_count The number of segments `uniform_position` measures the curve
   * with, a whole number. It defaults to `1`, and 2 points always use `1`.
   * @param length_func Returns the length of the difference of two points.
   * @param lerp_func Interpolates between two points. Defaults to `vmath.lerp`.
   */
  function new_(
    points: number[],
    samples_count: number | undefined,
    length_func: (v: number) => number,
    lerp_func?: (t: number, a: number, b: number) => number,
  ): Bezier<number>;
  export { new_ as new };

  /**
   * Returns the classic position along the curve at a progress. `time` is not clamped,
   * so a value outside `0` to `1` extrapolates.
   * @param self The bezier instance, created by `new`.
   * @param time The progress, from `0` to `1`.
   */
  export function position<P>(self: Bezier<P>, time: number): P;

  /**
   * Returns the uniform position along the curve: the point at that fraction of the
   * curve's length. `time` is clamped between `0` and `1`, and the accuracy depends on
   * the `samples_count` given to `new`.
   * @param self The bezier instance, created by `new`.
   * @param time The progress, from `0` to `1`.
   */
  export function uniform_position<P>(self: Bezier<P>, time: number): P;
}

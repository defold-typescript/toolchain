/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as bezier from "operator.bezier";
import * as operator from "operator.operator";

// Compile-only proof for the operator forks, written as the calls upstream's README makes
// from a script. No assertions execute; the `dts-declaration-validity` compile is the
// gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export function init(): void {
  // No operator is active until one activates, so the url can be nil.
  const active = operator.get_active_operator();
  const _active: Equal<typeof active, Url | undefined> = true;
  void _active;

  const rotation = operator.quat_from_euler(vmath.vector3(0, 90, 0));
  const _rotation: Equal<typeof rotation, Quaternion> = true;
  void _rotation;

  const v1 = vmath.vector3(0, 0, 0);
  const v2 = vmath.vector3(1, 2, 3);
  const scalar = operator.lerp(0.5, 1, 2);
  const _scalar: Equal<typeof scalar, number> = true;
  void _scalar;
  const vector = operator.lerp(0.5, v1, v2);
  const _vector: Equal<typeof vector, Vector3> = true;
  void _vector;

  const easing: (x: number) => number = operator.EASING_INOUT_QUART;
  void easing;
  operator.set_debug(!operator.is_debug());
  (operator as { flight_look_easing: (this: void, x: number) => number }).flight_look_easing = (
    x,
  ) => x;

  const p3 = vmath.vector3(2, 0, 0);
  const path = bezier.new([v1, v2, p3]);
  const _path: Equal<typeof path, bezier.Bezier<Vector3>> = true;
  void _path;
  const point = path.uniform_position(0.5);
  const _point: Equal<typeof point, Vector3> = true;
  void _point;

  // Number points fall through to `vmath.length`, which rejects numbers, so a length_func
  // is required; the default `vmath.lerp` takes numbers.
  const line = bezier.new(
    [1, 2, 3],
    undefined,
    (v) => math.abs(v),
    (t, a, b) => a + (b - a) * t,
  );
  const _line: Equal<typeof line, bezier.Bezier<number>> = true;
  void _line;
  const ramp = bezier.new([0, 5, 10], 8, math.abs);
  const _ramp: Equal<typeof ramp, bezier.Bezier<number>> = true;
  void _ramp;

  // @ts-expect-error number points need a length_func
  bezier.new([1, 2, 3]);
  // @ts-expect-error the registry hooks belong to the bundled scripts and are not declared
  operator.did_init_operator(msg.url());
}

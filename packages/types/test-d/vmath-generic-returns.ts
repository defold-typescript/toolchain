/// <reference path="../index.d.ts" />
import type { Quaternion, Vector3, Vector4 } from "../src/core-types";

declare const v3a: Vector3;
declare const v3b: Vector3;
declare const v4a: Vector4;
declare const v4b: Vector4;
declare const q1: Quaternion;
declare const q2: Quaternion;
declare const vU: Vector3 | Vector4;

// lerp / slerp: same-type input yields the deterministic concrete return.
const _lerpV3: Vector3 = vmath.lerp(0.5, v3a, v3b);
const _lerpV4: Vector4 = vmath.lerp(0.5, v4a, v4b);
const _slerpV3: Vector3 = vmath.slerp(0.5, v3a, v3b);
const _slerpV4: Vector4 = vmath.slerp(0.5, v4a, v4b);

// @ts-expect-error lerp of two Vector3 is Vector3, not Vector4
const _lerpV3NotV4: Vector4 = vmath.lerp(0.5, v3a, v3b);
// @ts-expect-error slerp of two Vector4 is Vector4, not Vector3
const _slerpV4NotV3: Vector3 = vmath.slerp(0.5, v4a, v4b);

// Dimension mismatch is a compile error (each signature takes one vector type).
// @ts-expect-error lerp requires both vectors the same dimension
const _lerpMismatch = vmath.lerp(0.5, v3a, v4a);
// @ts-expect-error slerp requires both vectors the same dimension
const _slerpMismatch = vmath.slerp(0.5, v3a, v4a);

// The non-vector lerp/slerp overloads survive the skip: quaternion + number.
const _lerpQ: Quaternion = vmath.lerp(0.5, q1, q2);
const _lerpN: number = vmath.lerp(0.5, 1, 2);
const _slerpQ: Quaternion = vmath.slerp(0.5, q1, q2);

// mul_per_elem: same-type in, same-type out.
const _mulV3: Vector3 = vmath.mul_per_elem(v3a, v3b);
const _mulV4: Vector4 = vmath.mul_per_elem(v4a, v4b);
// @ts-expect-error mul_per_elem of two Vector3 is Vector3, not Vector4
const _mulV3NotV4: Vector4 = vmath.mul_per_elem(v3a, v3b);
// @ts-expect-error mul_per_elem requires both vectors the same dimension
const _mulMismatch = vmath.mul_per_elem(v3a, v4a);

// dot: the binding raises unless both vectors have the same type.
const _dotV3: number = vmath.dot(v3a, v3b);
const _dotV4: number = vmath.dot(v4a, v4b);
// @ts-expect-error dot requires both vectors the same dimension
const _dotMismatch = vmath.dot(v3a, v4a);

// normalize: concrete input yields the same concrete type.
const _normV3: Vector3 = vmath.normalize(v3a);
const _normV4: Vector4 = vmath.normalize(v4a);
const _normQ: Quaternion = vmath.normalize(q1);
// @ts-expect-error normalize of a Vector3 is Vector3, not Quaternion
const _normV3NotQ: Quaternion = vmath.normalize(v3a);

// A union-typed pair may hold two vector types, so it is narrowed first.
// @ts-expect-error lerp takes two vectors of one type
const _lerpUnion = vmath.lerp(0.5, vU, vU);
// @ts-expect-error slerp takes two vectors of one type
const _slerpUnion = vmath.slerp(0.5, vU, vU);
// @ts-expect-error mul_per_elem takes two vectors of one type
const _mulUnion = vmath.mul_per_elem(vU, vU);
// @ts-expect-error dot takes two vectors of one type
const _dotUnion = vmath.dot(vU, vU);
if (types.is_vector3(vU)) {
  const _lerpNarrowed: Vector3 = vmath.lerp(0.5, vU, v3b);
}

// clamp: scalar bounds are accepted on a vector value; number in yields number.
const _clampV3: Vector3 = vmath.clamp(v3a, 0, 1);
const _clampV4: Vector4 = vmath.clamp(v4a, 0, 1);
const _clampN: number = vmath.clamp(5, 0, 10);
const _clampV3Bounds: Vector3 = vmath.clamp(v3a, v3b, v3b);
// @ts-expect-error clamp bounds must match the value's dimension
const _clampMismatch = vmath.clamp(v3a, v4a, v4a);
// @ts-expect-error clamp of a Vector3 is Vector3, not number
const _clampV3NotN: number = vmath.clamp(v3a, 0, 1);
// Scalar bounds fit either vector type, so a union value keeps the union.
const _clampUnion: Vector3 | Vector4 = vmath.clamp(vU, 0, 1);
// @ts-expect-error scalar bounds on a union value do not narrow it to Vector3
const _clampUnionNotV3: Vector3 = vmath.clamp(vU, 0, 1);
// @ts-expect-error a vector bound on a union value may not match its type
const _clampUnionVectorBound = vmath.clamp(vU, v3a, 1);

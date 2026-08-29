/// <reference path="../index.d.ts" />

import type { Vector3 } from "../src/core-types";

physics.set_shape("/collisionobject", "shape", {
  type: physics.SHAPE_TYPE_SPHERE,
  diameter: 10,
});

physics.set_shape("/collisionobject", "shape", {
  type: physics.SHAPE_TYPE_SPHERE,
  // @ts-expect-error diamter is a misspelling of the recovered diameter field
  diamter: 10,
});

// get_shape's return is a variant record: `type` is always present, and the
// kind-specific fields are only present for their own shape kind, so each one
// reads as `<T> | undefined` until narrowed.
const shape = physics.get_shape("/collisionobject", "shape");
const _type: number = shape.type;
void _type;

// @ts-expect-error diameter is only present on sphere and capsule shapes
const _unnarrowedDiameter: number = shape.diameter;
void _unnarrowedDiameter;

if (shape.diameter !== undefined) {
  const _diameter: number = shape.diameter;
  void _diameter;
}

// @ts-expect-error height is only present on capsule shapes
const _unnarrowedHeight: number = shape.height;
void _unnarrowedHeight;

if (shape.dimensions !== undefined) {
  const _dimensions: Vector3 = shape.dimensions;
  void _dimensions;
}

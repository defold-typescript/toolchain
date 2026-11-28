/// <reference path="../index.d.ts" />

import type { Opaque } from "../src/core-types";
import type { Equal } from "./type-assert";

declare const world: Opaque<"b2World">;
declare const body: Opaque<"b2Body">;

const origin = vmath.vector3(0, 0, 0);
const east = vmath.vector3(1, 0, 0);
const box = { type: b2d.shape.SHAPE_TYPE_BOX, hx: 1, hy: 1 };
const polygon = { type: b2d.shape.SHAPE_TYPE_POLYGON, vertices: [origin, east, east] };
const circle = { type: b2d.shape.SHAPE_TYPE_CIRCLE, radius: 1 };
const capsule = { type: b2d.shape.SHAPE_TYPE_CAPSULE, radius: 1, center1: origin, center2: east };
const chain = { type: b2d.shape.SHAPE_TYPE_CHAIN, vertices: [origin, east], loop: false };

// Each backend's query takes the kinds its CheckShapeDef builds: v2 sets no
// SHAPE_TYPE_CAPSULE, and the v3 CheckShapeDef raises "Unsupported shape type" on
// a chain.
// @ts-expect-error v2 builds no capsule
b2d.world.overlap_shape<"v2">(world, capsule);
// @ts-expect-error v2 builds no capsule
b2d.world.cast_shape<"v2">(world, capsule, east);
// @ts-expect-error v3 queries take no chain
b2d.world.overlap_shape<"v3">(world, chain);
// @ts-expect-error v3 queries take no chain
b2d.world.cast_shape<"v3">(world, chain, east);
b2d.world.overlap_shape<"v3">(world, capsule);
b2d.world.cast_shape<"v3">(world, capsule, east);
b2d.world.overlap_shape(world, chain);
b2d.world.cast_shape(world, chain, east);

// Only the v3 overload takes a capsule, so a call with no type argument resolves
// to it and returns v3 hits.
const [capsuleShapes] = b2d.world.overlap_shape(world, capsule);
for (const info of capsuleShapes) {
  const shapeId: Equal<typeof info.shape_id, Opaque<"b2Shape">> = true;
  void shapeId;
}
const [capsuleCasts] = b2d.world.cast_shape(world, capsule, east);
for (const hit of capsuleCasts) {
  const shapeId: Equal<typeof hit.shape.shape_id, Opaque<"b2Shape">> = true;
  void shapeId;
}

// Both backends build a circle, a box and a polygon.
for (const shape of [box, polygon, circle] as const) {
  b2d.world.overlap_shape(world, shape);
  b2d.world.cast_shape(world, shape, east);
  b2d.world.overlap_shape<"v3">(world, shape);
  b2d.world.cast_shape<"v3">(world, shape, east);
}

// CheckShapeDef takes the box branch on `hx` or `hy` alone, so a polygon input
// takes the box form or the vertex form, never both. Each mixed shape is a
// local, which no excess-property check covers, so only the arms refuse it.
const polygonWithHx = { type: b2d.shape.SHAPE_TYPE_POLYGON, vertices: [origin], hx: 1 };
const polygonWithHy = { type: b2d.shape.SHAPE_TYPE_POLYGON, vertices: [origin], hy: 1 };
const boxWithVertices = { type: b2d.shape.SHAPE_TYPE_BOX, hx: 1, hy: 1, vertices: [origin] };
// @ts-expect-error a vertex polygon takes no hx
b2d.world.overlap_shape(world, polygonWithHx);
// @ts-expect-error a vertex polygon takes no hy
b2d.world.overlap_shape(world, polygonWithHy);
// @ts-expect-error a box takes no vertices
b2d.world.overlap_shape(world, boxWithVertices);
// @ts-expect-error a vertex polygon takes no hx
b2d.body.create_fixture(body, { shape: polygonWithHx });
// @ts-expect-error a box takes no vertices
b2d.body.create_fixture(body, { shape: boxWithVertices });
// @ts-expect-error a vertex polygon takes no hx
b2d.body.create_shape(body, polygonWithHx);
// @ts-expect-error a box takes no vertices
b2d.body.create_shape(body, boxWithVertices);
for (const shape of [box, polygon] as const) {
  b2d.body.create_fixture(body, { shape });
  b2d.body.create_shape(body, shape);
}

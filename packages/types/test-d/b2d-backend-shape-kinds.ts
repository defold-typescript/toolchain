/// <reference path="../index.d.ts" />
import type { Opaque } from "../src/core-types";

declare const body: Opaque<"b2Body">;
declare const shapeId: Opaque<"b2Shape">;
declare const world: Opaque<"b2World">;

const origin = vmath.vector3(0, 0, 0);
const east = vmath.vector3(1, 0, 0);
const box = { type: b2d.shape.SHAPE_TYPE_BOX, hx: 1, hy: 1 };
const polygon = { type: b2d.shape.SHAPE_TYPE_POLYGON, vertices: [origin, east, east] };
const circle = { type: b2d.shape.SHAPE_TYPE_CIRCLE, radius: 1 };
const capsule = {
  type: b2d.shape.SHAPE_TYPE_CAPSULE,
  radius: 1,
  center1: origin,
  center2: east,
};
const chain = { type: b2d.shape.SHAPE_TYPE_CHAIN, vertices: [origin, east], loop: false };

// Box2D v2: v2/script_box2d_*_v2.cpp's CheckShapeDef reads box, polygon, circle,
// edge (with ghost vertices) and chain.
for (const shape of [box, polygon, circle, chain] as const) {
  b2d.body.create_fixture(body, { shape });
  b2d.fixture.set_shape(body, 1, shape);
}
b2d.body.create_fixture(body, {
  shape: { type: b2d.shape.SHAPE_TYPE_EDGE, v1: origin, v2: east, v0: origin, v3: east },
});
b2d.fixture.set_shape(body, 1, { type: b2d.shape.SHAPE_TYPE_EDGE, v1: origin, v2: east });
// @ts-expect-error v2 has no capsule
b2d.body.create_fixture(body, { shape: capsule });
// @ts-expect-error v2 has no capsule
b2d.fixture.set_shape(body, 1, capsule);
b2d.fixture.set_shape(body, 1, {
  // @ts-expect-error v2 names an edge SHAPE_TYPE_EDGE, never SHAPE_TYPE_SEGMENT
  type: b2d.shape.SHAPE_TYPE_SEGMENT,
  v1: origin,
  v2: east,
});

// Box2D v3: v3/script_box2d_shape_v3.cpp's CheckShapeDef reads box, polygon,
// circle, capsule and segment; a chain is built with b2d.body.create_chain.
for (const shape of [box, polygon, circle, capsule] as const) {
  b2d.body.create_shape(body, shape);
  b2d.body.create_shape(body, { shape });
  b2d.shape.set_shape(shapeId, shape);
}
for (const type of [b2d.shape.SHAPE_TYPE_SEGMENT, b2d.shape.SHAPE_TYPE_EDGE] as const) {
  b2d.body.create_shape(body, { type, v1: origin, v2: east });
  b2d.shape.set_shape(shapeId, { type, v1: origin, v2: east });
}
// @ts-expect-error v3 creates a chain with b2d.body.create_chain, not create_shape
b2d.body.create_shape(body, chain);
// @ts-expect-error v3 creates a chain with b2d.body.create_chain, not create_shape
b2d.body.create_shape(body, { shape: chain });
// @ts-expect-error v3 set_shape takes no chain
b2d.shape.set_shape(shapeId, chain);
b2d.body.create_shape(body, {
  ...circle,
  is_sensor: true,
  density: 1,
  friction: 0.5,
  restitution: 0.1,
  material: 0,
  filter: { category_bits: 1, mask_bits: 0xffff, group_index: 0 },
});
b2d.body.create_shape(body, { shape: box, sensor: true });

// World queries read every kind either backend builds.
for (const shape of [box, polygon, circle, capsule, chain] as const) {
  b2d.world.cast_shape(world, shape, east);
  b2d.world.overlap_shape(world, shape);
}

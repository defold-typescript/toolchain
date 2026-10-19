/// <reference path="../index.d.ts" />
import type { Opaque, Vector3 } from "../src/core-types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare const world: Opaque<"b2World">;
declare const bounds: b2d.Aabb;

const origin = vmath.vector3(0, 0, 0);
const east = vmath.vector3(1, 0, 0);
const box = { type: b2d.shape.SHAPE_TYPE_BOX, hx: 1, hy: 1 };

// Box2D v2: v2/script_box2d_world_v2.cpp's PushCastHit sets `fixture` and `shape`
// to one fixture table, and the overlaps push fixture tables. A call with no type
// argument keeps these hits.
const [v2Rays] = b2d.world.cast_ray(world, origin, east);
const [v2RaysPicked] = b2d.world.cast_ray<"v2">(world, origin, east);
const [v2Casts] = b2d.world.cast_shape(world, box, east);
const [v2CastsPicked] = b2d.world.cast_shape<"v2">(world, box, east);
for (const hits of [v2Rays, v2RaysPicked, v2Casts, v2CastsPicked]) {
  for (const hit of hits) {
    const index: Equal<typeof hit.fixture.index, number> = true;
    void index;
    // @ts-expect-error a v2 hit's shape is its fixture table, which has no shape_id
    void hit.shape.shape_id;
  }
}
for (const hit of [
  b2d.world.cast_ray_closest(world, origin, east),
  b2d.world.cast_ray_closest<"v2">(world, origin, east),
]) {
  if (hit === undefined) continue;
  const index: Equal<typeof hit.fixture.index, number> = true;
  void index;
  // @ts-expect-error a v2 hit's shape is its fixture table, which has no shape_id
  void hit.shape.shape_id;
}
const [v2Boxes] = b2d.world.overlap_aabb(world, bounds);
const [v2BoxesPicked] = b2d.world.overlap_aabb<"v2">(world, bounds);
const [v2Shapes] = b2d.world.overlap_shape(world, box);
const [v2ShapesPicked] = b2d.world.overlap_shape<"v2">(world, box);
for (const infos of [v2Boxes, v2BoxesPicked, v2Shapes, v2ShapesPicked]) {
  for (const info of infos) {
    const children: Equal<typeof info.child_count, number> = true;
    void children;
    // @ts-expect-error a v2 overlap returns fixture tables, which have no shape_id
    void info.shape_id;
  }
}

// Box2D v3: v3/script_box2d_world_v3.cpp's PushCastHit sets `shape` from
// PushShapeInfo and no `fixture`; the overlaps push shape tables.
const [v3Rays] = b2d.world.cast_ray<"v3">(world, origin, east);
const [v3Casts] = b2d.world.cast_shape<"v3">(world, box, east);
for (const hits of [v3Rays, v3Casts]) {
  for (const hit of hits) {
    const shapeId: Equal<typeof hit.shape.shape_id, Opaque<"b2Shape">> = true;
    const point: Equal<typeof hit.point, Vector3> = true;
    const normal: Equal<typeof hit.normal, Vector3> = true;
    const fraction: Equal<typeof hit.fraction, number> = true;
    void [shapeId, point, normal, fraction];
    // @ts-expect-error a v3 hit carries no fixture
    void hit.fixture;
  }
}
const v3Closest = b2d.world.cast_ray_closest<"v3">(world, origin, east);
if (v3Closest !== undefined) {
  const shapeId: Equal<typeof v3Closest.shape.shape_id, Opaque<"b2Shape">> = true;
  const point: Equal<typeof v3Closest.point, Vector3> = true;
  const normal: Equal<typeof v3Closest.normal, Vector3> = true;
  const fraction: Equal<typeof v3Closest.fraction, number> = true;
  void [shapeId, point, normal, fraction];
  // @ts-expect-error a v3 hit carries no fixture
  void v3Closest.fixture;
}
const [v3Boxes] = b2d.world.overlap_aabb<"v3">(world, bounds);
const [v3Shapes] = b2d.world.overlap_shape<"v3">(world, box);
for (const infos of [v3Boxes, v3Shapes]) {
  for (const info of infos) {
    const shapeId: Equal<typeof info.shape_id, Opaque<"b2Shape">> = true;
    void shapeId;
  }
}

// @ts-expect-error the backend is "v2" or "v3"
b2d.world.cast_ray<"v4">(world, origin, east);

/// <reference path="../index.d.ts" />
import type { Opaque, Vector3 } from "../src/core-types";

declare const shape: bullet3d.shape.BtCollisionShape;
declare const world: bullet3d.BtDiscreteDynamicsWorld;

const size = vmath.vector3(1, 1, 1);
const corner = vmath.vector3(0, 0, 0);

// script_bullet3d_shape.cpp:CheckBullet3DShapeDef reads only the fields of the
// table's own `type`, and raises "Unsupported shape type" on a mesh.
bullet3d.shape.set_shape(shape, { type: bullet3d.shape.SHAPE_TYPE_SPHERE, diameter: 1 });
bullet3d.shape.set_shape(shape, { type: bullet3d.shape.SHAPE_TYPE_BOX, dimensions: size });
bullet3d.shape.set_shape(shape, {
  type: bullet3d.shape.SHAPE_TYPE_CAPSULE,
  diameter: 1,
  height: 2,
});
bullet3d.shape.set_shape(shape, {
  type: bullet3d.shape.SHAPE_TYPE_HULL,
  vertices: [corner, size, corner, size],
});

// @ts-expect-error a sphere reads `diameter`, not `dimensions`
bullet3d.shape.set_shape(shape, { type: bullet3d.shape.SHAPE_TYPE_SPHERE, dimensions: size });
// @ts-expect-error a capsule reads `height` as well as `diameter`
bullet3d.shape.set_shape(shape, { type: bullet3d.shape.SHAPE_TYPE_CAPSULE, diameter: 1 });

const mesh = { type: bullet3d.shape.SHAPE_TYPE_MESH };
// @ts-expect-error a mesh is not a shape a script can build
bullet3d.shape.set_shape(shape, mesh);
// @ts-expect-error the shape queries read the same definition
bullet3d.world.overlap_shape(world, mesh, {}, 1);

// script_bullet3d_shape.cpp:Shape_GetShape sets only `type` for a triangle mesh,
// so the result is not a definition until a field narrows it.
const data = bullet3d.shape.get_shape(shape);
// @ts-expect-error the result may be a mesh
bullet3d.shape.set_shape(shape, data);
if ("dimensions" in data) {
  const dimensions: Vector3 = data.dimensions;
  void dimensions;
  bullet3d.shape.set_shape(shape, data);
}
const kind: bullet3d.shape.ShapeType = data.type;
void kind;

declare const a: Opaque<"btRigidBody">;
declare const b: Opaque<"btRigidBody">;
declare const mb: Opaque<"btRigidBody"> | undefined;
declare const c: bullet3d.constraint.BtTypedConstraint;
declare const o: Opaque<"btCollisionObject" | "btRigidBody">;

const rotation = vmath.quat();
const frameA = { frame_a_position: corner, frame_a_rotation: rotation };
const frames = { ...frameA, frame_b_position: corner, frame_b_rotation: rotation };

// script_bullet3d_constraint.cpp reads frame B only when `body_b` is given, and
// then requires both of its fields.
bullet3d.constraint.create_hinge(a, undefined, frameA);
bullet3d.constraint.create_hinge(a, b, frames);
bullet3d.constraint.create_hinge(a, mb, frames);
// @ts-expect-error a second body needs frame B
bullet3d.constraint.create_hinge(a, b, frameA);
// @ts-expect-error a body that may be present needs frame B
bullet3d.constraint.create_hinge(a, mb, frameA);

bullet3d.constraint.create_cone_twist(a, undefined, frameA);
bullet3d.constraint.create_cone_twist(a, b, frames);
bullet3d.constraint.create_cone_twist(a, mb, frames);
// @ts-expect-error a second body needs frame B
bullet3d.constraint.create_cone_twist(a, b, frameA);
// @ts-expect-error a body that may be present needs frame B
bullet3d.constraint.create_cone_twist(a, mb, frameA);

bullet3d.constraint.create_generic_6dof(a, undefined, frameA);
bullet3d.constraint.create_generic_6dof(a, b, frames);
bullet3d.constraint.create_generic_6dof(a, mb, frames);
// @ts-expect-error a second body needs frame B
bullet3d.constraint.create_generic_6dof(a, b, frameA);
// @ts-expect-error a body that may be present needs frame B
bullet3d.constraint.create_generic_6dof(a, mb, frameA);

bullet3d.constraint.create_slider(a, undefined, frameA);
bullet3d.constraint.create_slider(a, b, frames);
bullet3d.constraint.create_slider(a, mb, frames);
// @ts-expect-error a second body needs frame B
bullet3d.constraint.create_slider(a, b, frameA);
// @ts-expect-error a body that may be present needs frame B
bullet3d.constraint.create_slider(a, mb, frameA);

// @ts-expect-error a second body needs `pivot_b`
bullet3d.constraint.create_point_to_point(a, b, { pivot_a: corner });
bullet3d.constraint.create_point_to_point(a, b, { pivot_a: corner, pivot_b: size });
bullet3d.constraint.create_point_to_point(a, undefined, { pivot_a: corner });

// script_bullet3d_constraint.cpp:CheckSliderMotorAxis raises on any other axis.
bullet3d.constraint.set_slider_motor(c, "linear", true, 1, 1);
bullet3d.constraint.get_slider_motor(c, "angular");
// @ts-expect-error the slider has a linear and an angular motor only
bullet3d.constraint.set_slider_motor(c, "both", true, 1, 1);
// @ts-expect-error the slider has a linear and an angular motor only
bullet3d.constraint.get_slider_motor(c, "both");

// script_bullet3d_collision_object.cpp:IsRigidBody is an upcast check, so a
// checked object is a rigid body.
// @ts-expect-error a collision object may not be a rigid body
bullet3d.rigid_body.apply_central_impulse(o, size);
if (bullet3d.collision_object.is_rigid_body(o)) {
  bullet3d.rigid_body.apply_central_impulse(o, size);
}

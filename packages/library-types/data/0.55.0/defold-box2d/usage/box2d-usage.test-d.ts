/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as box2d from "box2d";

// Compile-only proof for the curated box2d native-extension namespace. No assertions
// execute; the `dts-declaration-validity` compile is the gate.

const world = box2d.NewWorld(vmath.vector3(0, -10, 0));
const body = world.CreateBody({
  type: box2d.b2BodyType.b2_dynamicBody,
  position: vmath.vector3(0, 4, 0),
});
const other = world.CreateBody();

const box = box2d.NewPolygonShape();
box.SetAsBox(1, 1);
const _fixture: box2d.Fixture = body.CreateFixture(box, 1);
body.CreateFixture({ shape: { shape: box2d.b2Shape.e_circle, circle_radius: 0.5 }, density: 1 });
body.CreateFixture({ shape: box, density: 1 });

const { e_chain, e_edge, e_polygon } = box2d.b2Shape;
const origin = vmath.vector3();
const unitX = vmath.vector3(1, 0, 0);
const points = [origin, unitX, vmath.vector3(1, 1, 0)];
body.CreateFixture(
  { shape: e_edge, edge_v0: origin, edge_v1: origin, edge_v2: unitX, edge_v3: unitX },
  1,
);
body.CreateFixture({ shape: e_edge, edge_two_sided: true, edge_v1: origin, edge_v2: unitX }, 1);
body.CreateFixture({ shape: e_polygon, polygon_vertices: points }, 1);
body.CreateFixture({ shape: e_polygon, box: true, box_hx: 1, box_hy: 2 }, 1);
body.CreateFixture(
  { shape: e_polygon, box: true, box_hx: 1, box_hy: 2, box_center: unitX, box_angle: 0.5 },
  1,
);
body.CreateFixture({ shape: e_chain, chain_vertices: points, chain_loop: true }, 1);
body.CreateFixture(
  { shape: e_chain, chain_vertices: points, chain_prev_vertex: origin, chain_next_vertex: unitX },
  1,
);
body.CreateFixture(
  {
    shape: e_chain,
    chain_vertices: points,
    chain_loop: false,
    chain_prev_vertex: origin,
    chain_next_vertex: unitX,
  },
  1,
);

const hinge: box2d.RevoluteJoint = world.CreateJoint(
  box2d.InitializeRevoluteJointDef(body, other, vmath.vector3()),
);
const _weld: box2d.WeldJoint = world.CreateJoint({
  type: box2d.b2JointType.e_weldJoint,
  bodyA: body,
  bodyB: other,
});
const slider: box2d.PrismaticJoint = world.CreateJoint(
  box2d.InitializePrismaticJointDef(body, other, vmath.vector3(), vmath.vector3(1, 0, 0)),
);
const wheel: box2d.WheelJoint = world.CreateJoint(
  box2d.InitializeWheelJointDef(body, other, vmath.vector3(), vmath.vector3(1, 0, 0)),
);
const _gear: box2d.GearJoint = world.CreateJoint(
  box2d.InitializeGearJointDef(body, other, hinge, slider),
);
const _ratioGear: box2d.GearJoint = world.CreateJoint({
  type: box2d.b2JointType.e_gearJoint,
  bodyA: body,
  bodyB: other,
  joint1: hinge,
  joint2: slider,
  ratio: 2,
});

function createAny(def: box2d.JointDef): box2d.Joint {
  return world.CreateJoint(def);
}
createAny(box2d.InitializeWeldJointDef(body, other, vmath.vector3()));
declare const revoluteOrWeld: box2d.RevoluteJointDef | box2d.WeldJointDef;
const _either: box2d.Joint = world.CreateJoint(revoluteOrWeld);

hinge.SetUserData({ name: "hinge" });
const _data: object | undefined = hinge.GetUserData();

const [_stiffness, _damping] = box2d.b2LinearStiffness(5, 0.7, body, other);

world.SetContactListener({
  BeginContact: (contact) => {
    const _a: box2d.Fixture = contact.GetFixtureA();
  },
});

const p1 = vmath.vector3(-5, 0, 0);
const p2 = vmath.vector3(5, 0, 0);
world.RayCast((_hit, _point, _normal, fraction) => fraction, p1, p2);
world.Step(1 / 60, 8, 3);
const _at: Vector3 = body.GetPosition();

// @ts-expect-error gravity is a `vector3`; the extension raises on anything else.
box2d.NewWorld("down");
// @ts-expect-error a body type is one of the three `b2BodyType` values.
body.SetType(5);
// @ts-expect-error a revolute definition creates a revolute joint, not a prismatic one.
const _prismatic: box2d.PrismaticJoint = world.CreateJoint(
  box2d.InitializeRevoluteJointDef(body, other, vmath.vector3()),
);
// @ts-expect-error a fixture needs a definition, or a shape and its density.
body.CreateFixture();

const { e_gearJoint, e_ropeJoint, e_unknownJoint, e_weldJoint } = box2d.b2JointType;
declare const joint: box2d.Joint;
// @ts-expect-error the extension has no rope joint definition and raises on its type.
world.CreateJoint({ type: e_ropeJoint, bodyA: body, bodyB: other });
// @ts-expect-error the extension raises on the unknown joint type.
world.CreateJoint({ type: e_unknownJoint, bodyA: body, bodyB: other });
// @ts-expect-error a gear definition raises without `joint2`.
world.CreateJoint({ type: e_gearJoint, bodyA: body, bodyB: other, joint1: hinge });
// @ts-expect-error a gear connects revolute and prismatic joints, not a wheel joint.
box2d.InitializeGearJointDef(body, other, wheel, hinge);
// @ts-expect-error a joint of unknown kind may be neither revolute nor prismatic.
world.CreateJoint({ type: e_gearJoint, bodyA: body, bodyB: other, joint1: joint, joint2: hinge });
// @ts-expect-error a definition's `userData` never reaches the joint; use `SetUserData`.
world.CreateJoint({ type: e_weldJoint, bodyA: body, bodyB: other, userData: {} });

// @ts-expect-error the extension raises on a box that sets `box_center` without `box_angle`.
body.CreateFixture({ shape: e_polygon, box: true, box_hx: 1, box_hy: 1, box_center: origin }, 1);
// @ts-expect-error the extension raises on a box that sets `box_angle` without `box_center`.
body.CreateFixture({ shape: e_polygon, box: true, box_hx: 1, box_hy: 1, box_angle: 0 }, 1);
// @ts-expect-error an open chain needs `chain_next_vertex` as well.
body.CreateFixture({ shape: e_chain, chain_vertices: points, chain_prev_vertex: origin }, 1);
// @ts-expect-error an open chain needs both neighbor vertices.
body.CreateFixture({ shape: e_chain, chain_vertices: points, chain_loop: false }, 1);

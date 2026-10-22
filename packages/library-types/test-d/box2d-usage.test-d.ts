/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Compile-only proof for the curated box2d native-extension namespace. No assertions
// execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate.

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

const _joint: box2d.RevoluteJoint = world.CreateJoint(
  box2d.InitializeRevoluteJointDef(body, other, vmath.vector3()),
);
const _weld: box2d.WeldJoint = world.CreateJoint({
  type: box2d.b2JointType.e_weldJoint,
  bodyA: body,
  bodyB: other,
});
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

export {};

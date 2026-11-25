export {};

// The `properties` table of physics.create_joint and physics.set_joint_properties
// takes every joint-type field the engine's UnpackConnectJointParams reads, on
// every surface, and rejects a field of the wrong type.

physics.create_joint(
  physics.JOINT_TYPE_SPRING,
  "/a#collisionobject",
  "spring",
  vmath.vector3(),
  "/b#collisionobject",
  vmath.vector3(),
  { collide_connected: true, length: 100, frequency: 2, damping: 0.5 },
);

physics.create_joint(
  physics.JOINT_TYPE_SLIDER,
  "/a#collisionobject",
  "slider",
  vmath.vector3(),
  "/b#collisionobject",
  vmath.vector3(),
  {
    local_axis_a: vmath.vector3(1, 0, 0),
    enable_limit: true,
    lower_translation: 0,
    upper_translation: 10,
  },
);

physics.set_joint_properties("/a#collisionobject", "slider", {
  enable_motor: true,
  max_motor_force: 50,
  motor_speed: 1,
});

// @ts-expect-error length is a number
physics.set_joint_properties("/a#collisionobject", "spring", { length: "far" });

physics.create_joint(
  physics.JOINT_TYPE_SLIDER,
  "/a#collisionobject",
  "slider",
  vmath.vector3(),
  "/b#collisionobject",
  vmath.vector3(),
  // @ts-expect-error local_axis_a is a vector3
  { local_axis_a: 1 },
);

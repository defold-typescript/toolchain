/// <reference path="../index.d.ts" />

// A hash resolves as a URL with an empty fragment, so a slot that looks up a
// component never finds one by hash: the call raises "The component could not
// be found". The `#fragment` address string and a `Url` still name it.

declare const address: Url;
const spawner = hash("/spawner");
const origin = vmath.vector3();

// @ts-expect-error
factory.create(spawner);
factory.create("#factory");
factory.create(address);

// @ts-expect-error
collectionfactory.create(spawner);
collectionfactory.create("#collectionfactory");
collectionfactory.create(address);

// @ts-expect-error
collectionproxy.get_resources(spawner);
collectionproxy.get_resources("#proxy");
collectionproxy.get_resources(address);

// @ts-expect-error
label.get_text(spawner);
label.get_text("#label");
label.get_text(address);

// @ts-expect-error
model.get_aabb(spawner);
model.get_aabb("#model");
model.get_aabb(address);

// @ts-expect-error
physics.get_shape(spawner, "box");
physics.get_shape("#collisionobject", "box");
physics.get_shape(address, "box");

// @ts-expect-error
tilemap.get_tile(spawner, "ground", 1, 1);
tilemap.get_tile("#tilemap", "ground", 1, 1);
tilemap.get_tile(address, "ground", 1, 1);

// @ts-expect-error
b2d.get_body(spawner);
b2d.get_body("#collisionobject");
b2d.get_body(address);

// @ts-expect-error
bullet3d.get_rigid_body(spawner);
bullet3d.get_rigid_body("#collisionobject");
bullet3d.get_rigid_body(address);

// The second collision object is its own component lookup.
// @ts-expect-error
physics.create_joint(physics.JOINT_TYPE_FIXED, "#a", "joint", origin, spawner, origin);
physics.create_joint(physics.JOINT_TYPE_FIXED, "#a", "joint", origin, "#b", origin);
physics.create_joint(physics.JOINT_TYPE_FIXED, "#a", "joint", origin, address, origin);

// A game-object slot resolves the hash as the object's id and keeps it.
go.get_position(hash("/player"));

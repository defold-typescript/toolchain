/// <reference path="../index.d.ts" />

// Each table parameter below takes only the keys and shapes its engine binding
// reads. A `LuaMap` or `LuaTable` is checked against the keyed arm; an object
// literal or interface-typed value passes the plain-table arm.

// physics.set_shape: Physics_SetShape raises on a missing kind field and on any
// shape type but sphere, box and capsule.
physics.set_shape("#co", "shape", { type: physics.SHAPE_TYPE_SPHERE, diameter: 10 });
physics.set_shape("#co", "shape", { type: physics.SHAPE_TYPE_BOX, dimensions: vmath.vector3() });
physics.set_shape("#co", "shape", { type: physics.SHAPE_TYPE_CAPSULE, diameter: 2, height: 4 });
// @ts-expect-error a box needs its dimensions
physics.set_shape("#co", "shape", { type: physics.SHAPE_TYPE_BOX });
// @ts-expect-error a sphere needs its diameter
physics.set_shape("#co", "shape", { type: physics.SHAPE_TYPE_SPHERE });
// @ts-expect-error a hull shape cannot be set
physics.set_shape("#co", "shape", { type: physics.SHAPE_TYPE_HULL });

// factory.create: the property parser reads string keys only, and values of
// the script-property types.
const spawnProps = new LuaMap<string, number | Hash | Vector3>();
spawnProps.set("speed", 5);
factory.create("#factory", undefined, undefined, spawnProps);
factory.create("#factory", undefined, undefined, { speed: 5, target: hash("a") });
// @ts-expect-error a hash key is skipped by the property parser
factory.create("#factory", undefined, undefined, new LuaMap<Hash, number>());
// @ts-expect-error a Matrix4 value makes the engine drop every property
factory.create("#factory", undefined, undefined, new LuaMap<string, Matrix4>());

// collectionfactory.create: each instance table goes through the same parser.
collectionfactory.create("#cf", undefined, undefined, new LuaMap<Hash, LuaMap<string, number>>());
collectionfactory.create("#cf", undefined, undefined, new LuaMap<Hash, { speed: number }>());
collectionfactory.create(
  "#cf",
  undefined,
  undefined,
  // @ts-expect-error an instance table keyed by hash is skipped
  new LuaMap<Hash, LuaMap<Hash, number>>(),
);

// sys.save / sys.serialize: script_table.cpp raises on a key that is not a
// number, string or hash.
sys.save("/save", new LuaMap<string, unknown>());
sys.save("/save", new LuaMap<number, unknown>());
sys.save("/save", { score: 1 });
sys.save("/save", [1, "a"]);
sys.serialize(new LuaMap<string, unknown>());
sys.serialize(new LuaMap<number, unknown>());
sys.serialize({ score: 1 });
sys.serialize([1, "a"]);
// @ts-expect-error a boolean key raises
sys.save("/save", new LuaMap<boolean, unknown>());
// @ts-expect-error a boolean key raises
sys.serialize(new LuaMap<boolean, unknown>());

// http.request: script_http.cpp reads `proxy` with luaL_checkstring.
http.request("http://example.com", "GET", () => {}, undefined, undefined, {
  proxy: "http://proxy:8080",
  timeout: 5,
});

// A value typed by an interface has no index signature and still passes the
// object form.
interface EngineTableSlotsProps {
  speed: number;
  target: Hash;
}
declare const engineTableSlotsProps: EngineTableSlotsProps;
factory.create("#factory", undefined, undefined, engineTableSlotsProps);
sys.save("/save", engineTableSlotsProps);

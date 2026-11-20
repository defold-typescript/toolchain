/// <reference path="../index.d.ts" />
import type { Hash, Opaque, Quaternion, Vector3, Vector4 } from "../src/core-types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare const node: Opaque<"node">;
declare const v3: Vector3;
declare const v4: Vector4;
declare const quat: Quaternion;
declare const atlas: Hash;

// Reads are typed per name: a vector property is a Vector4, `rotation` a
// quaternion, and a sub-key a number.
const p: Vector4 = gui.get(node, "position");
void p;
const position = gui.get(node, "position");
const _position: Equal<typeof position, Vector4> = true;
const rotation = gui.get(node, "rotation");
const _rotation: Equal<typeof rotation, Quaternion> = true;
const positionX = gui.get(node, "position.x");
const _positionX: Equal<typeof positionX, number> = true;
const rotationW = gui.get(node, "rotation.w");
const _rotationW: Equal<typeof rotationW, number> = true;
void [_position, _rotation, _positionX, _rotationW];

// A `gui.PROP_*` constant reads as the name it equals.
const propRotation = gui.get(node, gui.PROP_ROTATION);
const _propRotation: Equal<typeof propRotation, Quaternion> = true;
const propColor = gui.get(node, gui.PROP_COLOR);
const _propColor: Equal<typeof propColor, Vector4> = true;
void [_propRotation, _propColor];

// A string must name a node property.
// @ts-expect-error "positon" is not a GUI node property
gui.get(node, "positon");
// @ts-expect-error "colour" is not a GUI node property
gui.set(node, "colour", v4);
// @ts-expect-error a material constant is not animatable, and a string must name a node property
gui.animate(node, "tint", v4, gui.EASING_LINEAR, 1);

// The engine's four scalar properties read and write a number and have no
// sub-keys.
const innerRadius = gui.get(node, "inner_radius");
const _innerRadius: Equal<typeof innerRadius, number> = true;
gui.set(node, "inner_radius", 0.5);
// @ts-expect-error `inner_radius` takes a number
gui.set(node, "inner_radius", v4);
// @ts-expect-error `inner_radius` has no sub-keys
gui.get(node, "inner_radius.x");
const fillAngle = gui.get(node, "fill_angle");
const _fillAngle: Equal<typeof fillAngle, number> = true;
gui.set(node, "fill_angle", 0.5);
// @ts-expect-error `fill_angle` takes a number
gui.set(node, "fill_angle", v4);
// @ts-expect-error `fill_angle` has no sub-keys
gui.get(node, "fill_angle.x");
const leading = gui.get(node, "leading");
const _leading: Equal<typeof leading, number> = true;
gui.set(node, "leading", 0.5);
// @ts-expect-error `leading` takes a number
gui.set(node, "leading", v4);
// @ts-expect-error `leading` has no sub-keys
gui.get(node, "leading.x");
const tracking = gui.get(node, "tracking");
const _tracking: Equal<typeof tracking, number> = true;
gui.set(node, "tracking", 0.5);
// @ts-expect-error `tracking` takes a number
gui.set(node, "tracking", v4);
// @ts-expect-error `tracking` has no sub-keys
gui.get(node, "tracking.x");
void [_innerRadius, _fillAngle, _leading, _tracking];

// Writes are gated per name.
gui.set(node, "rotation", quat);
// @ts-expect-error `rotation` takes a quaternion
gui.set(node, "rotation", vmath.vector3());
gui.set(node, "scale", v3);
gui.set(node, "scale", v4);
// @ts-expect-error a sub-key takes a number
gui.set(node, "position.x", v3);

// Animation targets are gated per name the way LuaAnimate reads them: `rotation`
// takes only a quaternion, a sub-key or scalar a number, and any other vector a
// number, which fills every component, a vector3 or a vector4.
const E = gui.EASING_LINEAR;
gui.animate(node, "rotation", vmath.quat(), E, 1);
gui.animate(node, "position", vmath.vector3(1, 2, 3), E, 1);
gui.animate(node, "position", 10, E, 1);
gui.animate(node, "color", vmath.vector4(), E, 1);
gui.animate(node, "position.x", 10, E, 1);
gui.animate(node, gui.PROP_SCALE, 2, E, 1);
gui.animate(node, hash("tint"), vmath.vector4(), E, 1);
gui.animate(
  node,
  "position",
  v3,
  E,
  1,
  0.5,
  (_self, done) => {
    const _done: Opaque<"node"> = done;
    void _done;
  },
  gui.PLAYBACK_ONCE_FORWARD,
);
// @ts-expect-error `rotation` takes a quaternion; a vector3 animates to a non-unit one
gui.animate(node, "rotation", vmath.vector3(0, 0, 45), E, 1);
// @ts-expect-error `rotation` takes a quaternion; a number fills all four components
gui.animate(node, "rotation", 1, E, 1);
// @ts-expect-error a sub-key is one float
gui.animate(node, "position.x", vmath.vector3(), E, 1);
// @ts-expect-error `fill_angle` is one float
gui.animate(node, "fill_angle", vmath.vector3(), E, 1);

// Cancelling names a property LuaCancelAnimations finds, or none at all.
gui.cancel_animations(node);
gui.cancel_animations(node, "position");
gui.cancel_animations(node, gui.PROP_COLOR);
gui.cancel_animations(node, hash("tint"));
// @ts-expect-error "positon" is not a GUI node property
gui.cancel_animations(node, "positon");

// LuaToPropertyOptions takes at most one of `index`, `key` and `keys`.
// @ts-expect-error `index` and `key` together raise
gui.get(node, hash("w"), { index: 1, key: "a" });
// @ts-expect-error `key` and `keys` together raise
gui.set(node, hash("w"), 1, { key: "a", keys: ["b"] });

// A material constant, or any name the engine resolves at runtime, is reached
// through a hash.
gui.get(node, hash("tint"), { index: 2 });
gui.set(node, hash("light_matrix"), vmath.matrix4());
gui.animate(node, hash("position"), v3, gui.EASING_LINEAR, 1);

// The gui component itself takes its four resource properties; only `textures`
// accepts nil, which removes the runtime mapping.
gui.set(msg.url(), "textures", atlas, { key: "k" });
gui.set(msg.url(), "textures", undefined, { key: "k" });
// @ts-expect-error only `textures` accepts nil
gui.set(msg.url(), "fonts", undefined, { key: "k" });
// @ts-expect-error a node property is not a gui component property
gui.set(msg.url(), "position", v4);

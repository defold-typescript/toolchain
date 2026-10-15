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
// quaternion, and a sub-key or one of the four scalars a number.
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
const fillAngle = gui.get(node, "fill_angle");
const _fillAngle: Equal<typeof fillAngle, number> = true;
void [_position, _rotation, _positionX, _rotationW, _fillAngle];

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
// @ts-expect-error the four scalar properties have no sub-keys
gui.get(node, "fill_angle.x");

// Writes are gated per name.
gui.set(node, "rotation", quat);
// @ts-expect-error `rotation` takes a quaternion
gui.set(node, "rotation", vmath.vector3());
gui.set(node, "scale", v3);
gui.set(node, "scale", v4);
// @ts-expect-error a sub-key takes a number
gui.set(node, "position.x", v3);

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

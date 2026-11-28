/// <reference path="../index.d.ts" />

// A hash names the property its string names: gui_script.cpp LuaSet resolves either through GetPropertyDesc.

import type { Hash, Matrix4, Opaque, Quaternion, Vector4 } from "../src/core-types";
import type { Equal } from "./type-assert";

declare const node: Opaque<"node">;

type WideRead = number | Vector4 | Quaternion | Matrix4 | number[] | Vector4[] | Matrix4[];

// @ts-expect-error `position` takes a vector, not a number
gui.set(node, hash("position"), 1);
// @ts-expect-error `rotation` takes only a quat
gui.set(node, hash("rotation"), vmath.vector4());
gui.set(node, hash("position"), vmath.vector3());
gui.set(node, hash("rotation"), vmath.quat());

const positionByName = gui.get(node, "position");
const positionByHash = gui.get(node, hash("position"));
const _position: Equal<typeof positionByHash, typeof positionByName> = true;
const rotationByName = gui.get(node, "rotation");
const rotationByHash = gui.get(node, hash("rotation"));
const _rotation: Equal<typeof rotationByHash, typeof rotationByName> = true;

// @ts-expect-error `rotation` animates only to a quat
gui.animate(node, hash("rotation"), 1, gui.EASING_LINEAR, 1);
// @ts-expect-error `rotation` animates only to a quat
gui.animate(
  node,
  hash("rotation"),
  1,
  gui.EASING_LINEAR,
  1,
  0,
  undefined,
  gui.PLAYBACK_ONCE_FORWARD,
);

declare const k: "position" | Hash<"rotation">;
// @ts-expect-error `position` refuses a quat
gui.set(node, k, vmath.quat());

declare const h: Hash;
gui.set(node, h, 1);
const wide = gui.get(node, h);
const _wide: Equal<typeof wide, WideRead> = true;
gui.set(node, h, vmath.vector4(), { index: 1 });

declare const mixed: "position" | Hash;
const mixedRead = gui.get(node, mixed);
const _mixed: Equal<typeof mixedRead, WideRead> = true;

/// <reference path="../index.d.ts" />
import type { Hash, Url } from "../src/core-types";
import { defineScript, type ScriptPropertiesOf } from "../src/lifecycle";

declare const url: Url;
const PB = go.PLAYBACK_ONCE_FORWARD;
const E = go.EASING_LINEAR;

// A transform key takes what the engine's Animate accepts for it: a value of
// the property's own type, or a number, which fills every component of a vector.
go.animate(url, "position", PB, vmath.vector3(1, 2, 3), E, 1);
go.animate(url, "position", PB, 100, E, 1);
go.animate(url, "position.x", PB, 10, E, 1);
go.animate(url, "rotation", PB, vmath.quat(), E, 1);
go.animate(url, "scale", PB, 2, E, 1);
go.animate(url, "position", PB, vmath.vector3(), E, 1, 0.5, (_self, _url, property) => {
  const _id: Hash = property;
  void _id;
});

// @ts-expect-error position is a vector3; a quaternion is a type mismatch
go.animate(url, "position", PB, vmath.quat(), E, 1);
// @ts-expect-error rotation takes only a quaternion; a number does not fill one
go.animate(url, "rotation", PB, 1, E, 1);
// @ts-expect-error position.x is one float
go.animate(url, "position.x", PB, vmath.vector3(), E, 1);
// @ts-expect-error euler is a vector3, not a vector4
go.animate(url, "euler", PB, vmath.vector4(), E, 1);

// A key typed as a union of keys takes only a target every one of them accepts.
declare const transformKey: "position" | "rotation";
// @ts-expect-error position refuses a quaternion
go.animate(url, transformKey, PB, vmath.quat(), E, 1);
// @ts-expect-error rotation refuses a vector3
go.animate(url, transformKey, PB, vmath.vector3(), E, 1);
// @ts-expect-error rotation refuses a vector3, with a delay too
go.animate(url, transformKey, PB, vmath.vector3(), E, 1, 0.5);
declare const elementKey: "position.x" | "position.y";
go.animate(url, elementKey, PB, 10, E, 1);
go.animate(url, elementKey, PB, 10, E, 1, 0.5);

// A dynamic or hashed key keeps the wide target.
declare const key: string;
go.animate(url, key, PB, vmath.quat(), E, 1);
go.animate(url, hash("tint"), PB, vmath.vector4(1, 0, 0, 1), E, 1);

// Name the component to type its keys and targets.
go.animate<sprite.Properties>()("#sprite", "playback_rate", PB, 2, E, 1);
go.animate<sprite.Properties>()("#sprite", "scale", PB, 2, E, 1);
go.animate<sprite.Properties>()("#sprite", "slice", PB, vmath.vector4(), E, 1);
// @ts-expect-error frame_count is read-only
go.animate<sprite.Properties>()("#sprite", "frame_count", PB, 2, E, 1);
// @ts-expect-error image is a Hash, which the engine cannot animate
go.animate<sprite.Properties>()("#sprite", "image", PB, 2, E, 1);
// @ts-expect-error key not in sprite.Properties
go.animate<sprite.Properties>()("#sprite", "nope", PB, 2, E, 1);
// @ts-expect-error scale is a vector3, not a quaternion
go.animate<sprite.Properties>()("#sprite", "scale", PB, vmath.quat(), E, 1);

// A key that cannot be animated is not offered at all, so it never completes.
const animateSprite = go.animate<sprite.Properties>();
type SpriteAnimatableKey = Parameters<typeof animateSprite>[1];
const _imageNotOffered: "image" extends SpriteAnimatableKey ? false : true = true;
const _frameCountNotOffered: "frame_count" extends SpriteAnimatableKey ? false : true = true;
void _imageNotOffered;
void _frameCountNotOffered;

// A script's declared properties animate the same way.
const enemy = defineScript({
  properties: { speed: 1, target: vmath.vector3(), tag: hash("a"), alive: true },
});
type EnemyProps = ScriptPropertiesOf<typeof enemy>;
go.animate<EnemyProps>()(url, "speed", PB, 3, E, 1);
go.animate<EnemyProps>()(url, "target", PB, 3, E, 1);
// @ts-expect-error tag is a Hash, which the engine cannot animate
go.animate<EnemyProps>()(url, "tag", PB, 3, E, 1);
// @ts-expect-error alive is a boolean, which the engine cannot animate
go.animate<EnemyProps>()(url, "alive", PB, 3, E, 1);

// Cancelling takes the keys an address can animate, or none at all.
go.cancel_animations();
go.cancel_animations(url);
go.cancel_animations(".", "position");
go.cancel_animations(".", "position.x");
go.cancel_animations(url, hash("tint"));
// @ts-expect-error a game object has no "positon"
go.cancel_animations(".", "positon");

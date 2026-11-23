/// <reference path="../index.d.ts" />

import type { Hash, Matrix4, Url, Vector3 } from "../src/core-types";
import type { ScriptPropertiesOf } from "../src/lifecycle";
import type enemy from "./script-properties/enemy";
import type { Equal } from "./type-assert";

// What `scene-types` writes for a `/props` object hosting one linked script and
// one component of each other shape: a registered kind, a kind whose catalog its
// generated namespace registers, an unlinked script, and a component whose kind
// could not be read.
declare global {
  interface SceneComponentAddresses {
    "/props#enemy": typeof import("./script-properties/enemy").default;
    "/props#sprite": "sprite";
    "/props#body": "collisionobject";
    "/props#fx": "particlefx";
    "/props#camera": "camera";
    "/props#music": "sound";
    "/props#map": "tilemap";
    "/props#hud": "gui";
    "/props#legacy": "script";
    "/props#ui": true;
  }
}

const PB = go.PLAYBACK_ONCE_FORWARD;
const E = go.EASING_LINEAR;

// A linked script reads its declared properties, and a vector property's
// elements, as the engine's FindPropertyName resolves them.
const speed = go.get("/props#enemy", "speed");
const target = go.get("/props#enemy", "target");
const targetX = go.get("/props#enemy", "target.x");
const _speed: Equal<typeof speed, number> = true;
const _target: Equal<typeof target, Vector3> = true;
const _targetX: Equal<typeof targetX, number> = true;
const tag = go.get("/props#enemy", "tag");
const _tag: Equal<typeof tag, ScriptPropertiesOf<typeof enemy>["tag"]> = true;
go.set("/props#enemy", "target.y", 3);
go.animate("/props#enemy", "speed", PB, 3, E, 1);
go.get("/props#enemy", hash("speed"));
// @ts-expect-error the script declares no `sped`
go.get("/props#enemy", "sped");
// @ts-expect-error a script component has no transform: CompScriptGetProperty raises
go.get("/props#enemy", "position");
// @ts-expect-error speed is a number
go.set("/props#enemy", "speed", "fast");
// @ts-expect-error alive is a boolean
go.set("/props#enemy", "alive", 1);
// @ts-expect-error tag is a Hash, which the engine cannot animate
go.animate("/props#enemy", "tag", PB, 3, E, 1);
// @ts-expect-error alive is a boolean, which the engine cannot animate
go.animate("/props#enemy", "alive", PB, 3, E, 1);
declare const k: string;
// @ts-expect-error a closed catalog takes a known key or a hash, never a free string
go.get("/props#enemy", k);
go.cancel_animations("/props#enemy", "speed");
go.cancel_animations("/props#enemy", "target.x");
// @ts-expect-error tag is a Hash: Script_CancelAnimations raises "must be of a numerical type"
go.cancel_animations("/props#enemy", "tag");
// @ts-expect-error the script declares no `sped`
go.cancel_animations("/props#enemy", "sped");

// A registered kind types the keys its catalog names and leaves any other key,
// such as a material constant, with the wide value.
go.set("/props#sprite", "scale.xy", 2);
go.set("/props#sprite", "outline_color", vmath.vector4());
const rate = go.get("/props#sprite", "playback_rate");
const _rate: Equal<typeof rate, number> = true;
// @ts-expect-error frame_count is read-only
go.set("/props#sprite", "frame_count", 2);
// @ts-expect-error playback_rate is a number
go.set("/props#sprite", "playback_rate", vmath.vector3());
// @ts-expect-error image is a Hash, which the engine cannot animate
go.animate("/props#sprite", "image", PB, 2, E, 1);
go.cancel_animations("/props#sprite", "tint");
go.cancel_animations("/props#sprite", "anything");
const velocity = go.get("/props#body", "linear_velocity");
const _velocity: Equal<typeof velocity, Vector3> = true;
// @ts-expect-error mass is read-only
go.set("/props#body", "mass", 2);

// A kind whose generated namespace declares its catalog reads that catalog.
const fov = go.get("/props#camera", "fov");
const view = go.get("/props#camera", "view");
const _fov: Equal<typeof fov, number> = true;
const _view: Equal<typeof view, Matrix4> = true;
go.animate("/props#camera", "fov", PB, 60, E, 1);
// @ts-expect-error fov is a number
go.set("/props#camera", "fov", "wide");
// @ts-expect-error projection is read-only
go.set("/props#camera", "projection", vmath.matrix4());
go.set("/props#camera", "anything", 1);
go.set("/props#music", "gain", 0.5);
go.animate("/props#music", "gain", PB, 0, E, 1);
const sound = go.get("/props#music", "sound");
const _sound: Equal<typeof sound, Hash> = true;
// @ts-expect-error sound is a Hash, which the engine cannot animate
go.animate("/props#music", "sound", PB, 0, E, 1);
const fxMaterial = go.get("/props#fx", "material");
const _fxMaterial: Equal<typeof fxMaterial, Hash> = true;
// @ts-expect-error material is a Hash
go.set("/props#fx", "material", 1);
const tileSource = go.get("/props#map", "tile_source");
const _tileSource: Equal<typeof tileSource, Hash> = true;
const hudMaterial = go.get("/props#hud", "material");
const _hudMaterial: Equal<typeof hudMaterial, Hash> = true;

// An address with no catalog behaves as it does with no scene types at all.
declare const asUrl: Url;
declare const asHash: Hash;
declare const asString: string;
const legacyPosition = go.get("/props#legacy", "position");
const uiPosition = go.get("/props#ui", "position");
const nowherePosition = go.get("/nowhere#x", "position");
const selfPosition = go.get("#", "position");
const emptyPosition = go.get("", "position");
const urlPosition = go.get(asUrl, "position");
const hashPosition = go.get(asHash, "position");
const stringPosition = go.get(asString, "position");
const _unlinkedPositions: Equal<
  [
    typeof legacyPosition,
    typeof uiPosition,
    typeof nowherePosition,
    typeof selfPosition,
    typeof emptyPosition,
    typeof urlPosition,
    typeof hashPosition,
    typeof stringPosition,
  ],
  [Vector3, Vector3, Vector3, Vector3, Vector3, Vector3, Vector3, Vector3]
> = true;
go.set("/props#legacy", "anything", 1);
go.set("/props#ui", "anything", 1);
go.set("/nowhere#x", "anything", 1);
go.set("#", "anything", 1);
go.set("", "anything", 1);
go.set(asUrl, "anything", 1);
go.set(asHash, "anything", 1);
go.set(asString, "anything", 1);
go.animate("/props#legacy", "tint", PB, vmath.vector4(), E, 1);
go.animate("/props#ui", "tint", PB, vmath.vector4(), E, 1);
go.animate("/nowhere#x", "tint", PB, vmath.vector4(), E, 1);
go.animate("#", "tint", PB, vmath.vector4(), E, 1);
go.animate("", "tint", PB, vmath.vector4(), E, 1);
go.animate(asUrl, "tint", PB, vmath.vector4(), E, 1);
go.animate(asHash, "tint", PB, vmath.vector4(), E, 1);
go.animate(asString, "tint", PB, vmath.vector4(), E, 1);

// An address with no `#` is a game object, whose only properties are its transform.
const ownPosition = go.get(".", "position");
const _ownPosition: Equal<typeof ownPosition, Vector3> = true;
go.set("/props", "position.x", 1);
go.get(".", hash("tint"));
// @ts-expect-error a game object has no tint
go.animate(".", "tint", PB, vmath.vector4(), E, 1);
// @ts-expect-error a game object has no script property
go.get("/props", "speed");
// @ts-expect-error a socket-qualified game object has no tint either
go.set("main:/props", "tint", vmath.vector4());

// Messages and the curried catalog forms are unaffected by the kind.
msg.post("/props#sprite", "anything", { x: 1 });
go.set<sprite.Properties>()("#sprite", "scale.xy", 2);

void [
  _speed,
  _target,
  _targetX,
  _tag,
  _rate,
  _velocity,
  _fov,
  _view,
  _sound,
  _fxMaterial,
  _tileSource,
  _hudMaterial,
  _unlinkedPositions,
  _ownPosition,
];

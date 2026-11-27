/// <reference path="../index.d.ts" />
import type { Hash, Quaternion, Vector3 } from "../src/core-types";

declare const url: string;
declare const someHash: Hash;
declare const v3: Vector3;

// Narrow: a known property key resolves to its real type from go.Properties.
const _pos: Vector3 = go.get(url, "position");
const _rot: Quaternion = go.get(url, "rotation");
// The engine reads scale back as a vector3 and takes a number for a uniform one.
const _scale: number | Vector3 = go.get(url, "scale");
void _pos;
void _rot;
void _scale;

go.set(url, "euler", v3);
go.set(url, "scale", 2);

// A label's scale is read back as a vector3 and refuses a number on write.
const _labelScale: Vector3 = go.get<label.Properties>()(url, "scale");
void _labelScale;
go.set<label.Properties>()(url, "scale", v3);
// @ts-expect-error the label component refuses a number scale
go.set<label.Properties>()(url, "scale", 2);

// A label's text is a writable string property.
const _labelText: string = go.get<label.Properties>()(url, "text");
void _labelText;
go.set<label.Properties>()(url, "text", "Hello");

// A known transform key takes only its catalogued value: the wide value union
// is reserved for dynamic and hashed keys, so a known key cannot fall through.
// @ts-expect-error wrong value type for a known property
go.set(url, "position", { x: 1, y: 2 });
// @ts-expect-error position is a vector3, not a quaternion
go.set(url, "position", vmath.quat());
// @ts-expect-error position is a vector3, not a boolean
go.set(url, "position", true);
// @ts-expect-error position is a vector3, not text
go.set(url, "position", "oops");
// @ts-expect-error position.x is one float
go.set(url, "position.x", vmath.vector3());

// The engine reads scale.xy back as a vector3 but sets it from a number too,
// applying the number to x and y.
go.set(url, "scale.xy", 2);
go.set(url, "scale.xy", v3);

declare const dynamicKey: string;
go.set(url, dynamicKey, true);
go.set(url, someHash, true);
go.set(url, hash("tint"), vmath.vector4());

// A key typed as a union of keys takes only a value every one of them accepts:
// position takes a vector3 and rotation a quaternion, so the union takes neither.
declare const transformKey: "position" | "rotation";
declare const quat: Quaternion;
// @ts-expect-error rotation refuses a vector3
go.set(url, transformKey, v3);
// @ts-expect-error position refuses a quaternion
go.set(url, transformKey, quat);
// @ts-expect-error position refuses a quaternion, with options too
go.set(url, transformKey, quat, { index: 1 });
declare const elementKey: "position.x" | "position.y";
go.set(url, elementKey, 1);
const _transformRead: Vector3 | Quaternion = go.get(url, transformKey);
void _transformRead;

// A union that also holds a hash takes only what its catalog keys accept.
declare const mixedKey: "position" | Hash;
go.set(url, mixedKey, v3);
// @ts-expect-error position refuses a boolean
go.set(url, mixedKey, true);

// A hash of a key's name counts as that key, beside a string key or alone.
declare const hashedPair: "position" | Hash<"rotation">;
// @ts-expect-error rotation refuses a vector3
go.set(url, hashedPair, v3);
// @ts-expect-error position refuses a quaternion
go.set(url, hashedPair, quat);
const ROTATION = hash("rotation");
go.set(url, ROTATION, quat);
// @ts-expect-error rotation refuses a vector3
go.set(url, ROTATION, v3);

// The calling script holds only what it declares, so a hash written there names
// no transform key; "." is the game object, whose rotation is a quaternion.
go.set("#", ROTATION, 1);
go.set("", ROTATION, 1);
// @ts-expect-error the game object's rotation refuses a number
go.set(".", ROTATION, 1);
go.set(".", ROTATION, quat);
// Beside a hash, only the string key constrains a write to the calling script.
go.set("#", hashedPair, v3);
// @ts-expect-error position refuses a quaternion
go.set("#", hashedPair, quat);

// A name the catalog does not list, or a bare hash, adds no constraint beside a
// listed key.
declare const openKey: "position" | "tint" | Hash;
go.set(url, openKey, v3);
// @ts-expect-error position refuses a boolean
go.set(url, openKey, true);

// @ts-expect-error position is Vector3, not assignable to Quaternion
const _wrong: Quaternion = go.get(url, "position");
void _wrong;

// Fallback: hashed and dynamic-string access keep the wide doc union, so the
// calls type-check and cross-component / runtime access is unchanged.
const _dynByHash = go.get(url, someHash);
const _dynByName = go.get(url, "my_dynamic_prop");
void _dynByHash;
void _dynByName;
go.set(url, someHash, v3);

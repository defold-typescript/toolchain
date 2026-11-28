/// <reference path="../index.d.ts" />
import type { Hash, Quaternion, Vector3 } from "../src/core-types";

declare const url: string;
declare const someHash: Hash;
declare const v3: Vector3;

// Narrow: a known property key of a game object resolves to its real type from
// go.Properties.
const _pos: Vector3 = go.get(".", "position");
const _rot: Quaternion = go.get(".", "rotation");
// The engine reads scale back as a vector3 and takes a number for a uniform one.
const _scale: number | Vector3 = go.get(".", "scale");
void _pos;
void _rot;
void _scale;

go.set(".", "euler", v3);
go.set(".", "scale", 2);

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
go.set(".", "position", { x: 1, y: 2 });
// @ts-expect-error position is a vector3, not a quaternion
go.set(".", "position", vmath.quat());
// @ts-expect-error position is a vector3, not a boolean
go.set(".", "position", true);
// @ts-expect-error position is a vector3, not text
go.set(".", "position", "oops");
// @ts-expect-error position.x is one float
go.set(".", "position.x", vmath.vector3());

// The engine reads scale.xy back as a vector3 but sets it from a number too,
// applying the number to x and y.
go.set(".", "scale.xy", 2);
go.set(".", "scale.xy", v3);

declare const dynamicKey: string;
go.set(url, dynamicKey, true);
go.set(url, someHash, true);
go.set(url, hash("tint"), vmath.vector4());

// A key typed as a union of keys takes only a value every one of them accepts:
// position takes a vector3 and rotation a quaternion, so the union takes neither.
declare const transformKey: "position" | "rotation";
declare const quat: Quaternion;
// @ts-expect-error rotation refuses a vector3
go.set(".", transformKey, v3);
// @ts-expect-error position refuses a quaternion
go.set(".", transformKey, quat);
// @ts-expect-error position refuses a quaternion, with options too
go.set(".", transformKey, quat, { index: 1 });
declare const elementKey: "position.x" | "position.y";
go.set(".", elementKey, 1);
const _transformRead: Vector3 | Quaternion = go.get(".", transformKey);
void _transformRead;

// A union that also holds a hash takes only what its catalog keys accept.
declare const mixedKey: "position" | Hash;
go.set(".", mixedKey, v3);
// @ts-expect-error position refuses a boolean
go.set(".", mixedKey, true);

// A hash of a key's name counts as that key, beside a string key or alone.
declare const hashedPair: "position" | Hash<"rotation">;
// @ts-expect-error rotation refuses a vector3
go.set(".", hashedPair, v3);
// @ts-expect-error position refuses a quaternion
go.set(".", hashedPair, quat);
const ROTATION = hash("rotation");
go.set(".", ROTATION, quat);
// @ts-expect-error rotation refuses a vector3
go.set(".", ROTATION, v3);

// The calling script holds only what it declares, which the types do not know,
// so a hash written there names no transform key; "." is the game object, whose
// rotation is a quaternion.
go.set("#", ROTATION, 1);
go.set("", ROTATION, 1);
// @ts-expect-error the game object's rotation refuses a number
go.set(".", ROTATION, 1);
go.set(".", ROTATION, quat);
// Beside a hash, a string key does not constrain a write to the calling script
// either.
go.set("#", hashedPair, v3);
go.set("#", hashedPair, quat);

// @ts-expect-error position is Vector3, not assignable to Quaternion
const _wrong: Quaternion = go.get(".", "position");
void _wrong;

// Fallback: hashed and dynamic-string access on an address that may name any
// component keep the wide doc union, so the calls type-check and cross-component
// / runtime access is unchanged.
const _dynByHash = go.get(url, someHash);
const _dynByName = go.get(url, "my_dynamic_prop");
void _dynByHash;
void _dynByName;
go.set(url, someHash, v3);

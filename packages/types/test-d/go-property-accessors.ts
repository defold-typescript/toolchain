/// <reference path="../index.d.ts" />
import type { Hash, Quaternion, Vector3 } from "../src/core-types";

declare const url: string;
declare const someHash: Hash;
declare const v3: Vector3;

// Narrow: a known property key resolves to its real type from go.properties.
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
const _labelScale: Vector3 = go.get<label.properties>()(url, "scale");
void _labelScale;
go.set<label.properties>()(url, "scale", v3);
// @ts-expect-error the label component refuses a number scale
go.set<label.properties>()(url, "scale", 2);

// A label's text is a writable string property.
const _labelText: string = go.get<label.properties>()(url, "text");
void _labelText;
go.set<label.properties>()(url, "text", "Hello");

// @ts-expect-error wrong value type for a known property; a string is a text
// property value the untyped fallback takes, so the wrong value is a plain table
go.set(url, "position", { x: 1, y: 2 });

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

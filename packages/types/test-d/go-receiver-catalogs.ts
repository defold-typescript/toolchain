/// <reference path="../index.d.ts" />

import type { Hash, Quaternion, Url, Vector3 } from "../src/core-types";
import type { Equal } from "./type-assert";

// Scene entries no other test declares: two scripts that disagree on `v`, a
// script with a boolean and a number, a script whose `position` is a number, and
// a component whose kind could not be read.
declare global {
  interface SceneComponentAddresses {
    "/rc-a#s": { properties?: { v: number } };
    "/rc-b#s": { properties?: { v: boolean } };
    "/rc-c#s": { properties?: { mode: boolean; n: number } };
    "/rc-d#s": { properties?: { position: number } };
    "/rc-any#c": true;
  }
}

const PB = go.PLAYBACK_ONCE_FORWARD;
const E = go.EASING_LINEAR;
declare const wide: string;
declare const url: Url;
declare const id: Hash;

// An address that does not prove a game object reads the wide value for every
// key: "" and "#" are the calling script, a fragment names a component, and a
// wide string or a Url may be either.
// @ts-expect-error "#" is the calling script, which has no transform
const selfPosition: Vector3 = go.get("#", "position");
// @ts-expect-error "" is the calling script, which has no transform
const emptyPosition: Vector3 = go.get("", "position");
// @ts-expect-error "#x" names a component, which has no transform
const fragmentPosition: Vector3 = go.get("#x", "position");
// @ts-expect-error "/nowhere#x" names a component, which has no transform
const nowherePosition: Vector3 = go.get("/nowhere#x", "position");
// @ts-expect-error a component of unknown kind has no transform
const anyPosition: Vector3 = go.get("/rc-any#c", "position");
// @ts-expect-error a wide string may name a component
const widePosition: Vector3 = go.get(wide, "position");
// @ts-expect-error a Url may name a component
const urlPosition: Vector3 = go.get(url, "position");
go.set("#", "position", 123);
go.set("", "position", 123);
go.set("#x", "position", 123);
go.set("/nowhere#x", "position", 123);
go.set("/rc-any#c", "position", 123);
go.set(wide, "position", 123);
go.set(url, "position", 123);

// A literal path with no `#` and a Hash id are game objects, whose only
// properties are the closed transform catalog.
const ownPosition = go.get(".", "position");
const _ownPosition: Equal<typeof ownPosition, Vector3> = true;
const idPosition = go.get(id, "position");
const _idPosition: Equal<typeof idPosition, Vector3> = true;
// @ts-expect-error a game object has no `nope`
go.set(id, "nope", 1);

// A union of linked receivers reads what any member returns and writes only a
// value every member takes.
declare const either: "/rc-a#s" | "/rc-b#s";
const eitherV = go.get(either, "v");
const _eitherV: Equal<typeof eitherV, number | boolean> = true;
// @ts-expect-error "/rc-a#s" takes a number for `v`
go.set(either, "v", true);
// @ts-expect-error "/rc-b#s" takes a boolean for `v`
go.set(either, "v", 1);
// @ts-expect-error "/rc-b#s" cannot animate a boolean
go.animate(either, "v", PB, 1, E, 1);

// A key must be one every closed member names.
declare const mixed: "." | "/rc-a#s";
// @ts-expect-error a game object has no `v`
go.get(mixed, "v");
// @ts-expect-error "/rc-a#s" has no transform
go.get(mixed, "position");

// An opaque member widens the read but never the write.
declare const open: "." | "#";
// @ts-expect-error "#" may read any value
const openPosition: Vector3 = go.get(open, "position");
// @ts-expect-error the game object takes a vector3 for `position`
go.set(open, "position", 123);

// A literal hash names its key wherever its string does: it reads that key's
// type, a closed catalog refuses one it does not list, and a bare Hash names
// nothing, so it takes the wide value without removing a named key's constraint.
const hashedPosition = go.get("/rc-d#s", hash("position"));
const _hashedPosition: Equal<typeof hashedPosition, number> = true;
const hashedRotation = go.get(".", hash("rotation"));
const _hashedRotation: Equal<typeof hashedRotation, Quaternion> = true;
// @ts-expect-error "/rc-a#s" declares no `typo`
go.set("/rc-a#s", hash("typo"), 42);
// @ts-expect-error a game object has no `typo`
go.set(".", hash("typo"), 1);
// @ts-expect-error a game object cannot animate `typo`
go.animate(".", hash("typo"), PB, 1, E, 1);
// @ts-expect-error `v` is a number, by hash too
go.set("/rc-a#s", hash("v"), true);
go.set("/rc-a#s", hash("v"), 2);
// @ts-expect-error `mode` is a boolean: Script_CancelAnimations raises "must be of a numerical type"
go.cancel_animations("/rc-c#s", hash("mode"));
go.cancel_animations("/rc-c#s", hash("n"));
declare const h: Hash;
go.set("/rc-a#s", h, true);
// An `any` key names no key, and an `any` address may name anything.
// biome-ignore lint/suspicious/noExplicitAny: an untyped value must still reach every slot.
declare const loose: any;
go.get("/rc-a#s", loose);
go.cancel_animations(".", loose);
go.set(".", loose, 1);
go.set(loose, loose, loose, loose);
go.animate(loose, loose, PB, loose, E, 1);
declare const k: "position" | Hash;
// @ts-expect-error `position` takes a vector3, whatever else `k` may be
go.set(".", k, true);

// CheckGetPropertyResult raises for `index` on a property that is not an array
// and for `key` on one that is not a hashtable, which no transform or script
// property is; an open catalog may still name a material constant array.
// @ts-expect-error a transform property is not a hashtable
go.get(".", "position", { key: "x" });
// @ts-expect-error a transform property is not an array
go.get(".", "position", { index: 1 });
// @ts-expect-error a script property is not an array
go.get("/rc-a#s", "v", { index: 1 });
go.get(".", "position", { keys: ["x"] });
go.get(url, "tint", { index: 1 });

void [
  _hashedPosition,
  _hashedRotation,
  selfPosition,
  emptyPosition,
  fragmentPosition,
  nowherePosition,
  anyPosition,
  widePosition,
  urlPosition,
  _ownPosition,
  _idPosition,
  _eitherV,
  openPosition,
];

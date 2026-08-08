/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as camera from "orthographic.camera";

// Compile-only proof (mirroring defsave-usage.test-d.ts) that the forked
// orthographic golden keeps the surface ts-defold declared while correcting
// `follow` to the multi-target signature the upstream README documents. This
// replaces the orthographic block retired from library-types.test-d.ts when the
// `./orthographic.camera` subpath went away. No assertions execute; `tsc --noEmit`
// under tsconfig.dts-check.json (skipLibCheck: false) is the gate.

// The surface ts-defold already declared still compiles unchanged: `get_view` is
// a `Matrix4`, `get_offset` a `Vector3`; `recoil` accepts a `Vector3`.
// `world_to_screen` took a third `gui` adjust-mode argument until the signature
// correction narrowed it to the two parameters upstream reads, so the fork no longer
// references any `gui.*` constant; `hash("player")` below now carries the engine-global
// claim, and the loss is that no `gui` reference is proved to resolve anywhere here.
declare const _url: Url;
declare const _v3: Vector3;
const _view: Matrix4 = camera.get_view(undefined);
const _offset: Vector3 = camera.get_offset(undefined);
camera.recoil(_url, _v3);
const _world: Vector3 = camera.world_to_screen(undefined, _v3);
const [_w, _h] = camera.get_display_size();

// The corrected `follow`: a single target still compiles, an array of targets is
// what upstream added, and a non-target value is rejected. Its `hash("player")` is
// the one reference that must resolve against an engine global.
camera.follow(undefined, hash("player"));
camera.follow(undefined, [hash("a"), hash("b")]);
camera.follow(undefined, _url, { lerp: 0.1, offset: _v3, immediate: true });
// @ts-expect-error a number is neither a target nor an array of targets
camera.follow(undefined, 3);

void _view;
void _offset;
void _world;
void _w;
void _h;

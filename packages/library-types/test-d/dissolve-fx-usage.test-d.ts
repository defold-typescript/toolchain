/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as dissolve_fx from "dissolve_fx.dissolve_fx";

// Compile-only proof for the dissolve_fx fork, written as upstream's Quick Start drives it.
// No assertions execute; the `dts-declaration-validity` compile is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

dissolve_fx.init("#sprite", "noise", "ramp");
dissolve_fx.init(msg.url("#sprite"), "noise", "ramp", "cover");
go.set("#sprite", "dissolve.z", 0.25);
go.animate("#sprite", "dissolve.w", go.PLAYBACK_LOOP_PINGPONG, 1, go.EASING_LINEAR, 3);

// The uv rect comes back as four Lua values: center x, center y, width, height.
const [x, y, w, h] = dissolve_fx.find_uvrect("#sprite", "noise", "cover");
const _rect: Equal<[typeof x, typeof y, typeof w, typeof h], [number, number, number, number]> =
  true;
void _rect;
dissolve_fx.find_uvrect(hash("sprite"), "ramp");

const mode: dissolve_fx.ScaleMode = "stretch";
dissolve_fx.find_uvrect("#sprite", "noise", mode);

// @ts-expect-error upstream asserts the scale mode is `stretch` or `cover`
dissolve_fx.init("#sprite", "noise", "ramp", "fit");
// @ts-expect-error upstream asserts the image id is a string
dissolve_fx.find_uvrect("#sprite", hash("noise"));

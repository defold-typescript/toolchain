/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as rendy from "rendy.rendy";

// Compile-only proof for the severed rendy surface, replacing the rendy block
// retired from library-types.test-d.ts when the `./rendy.rendy` subpath went
// away. No assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is
// the gate.

declare const _v3: Vector3;

declare const _hash: Hash;

// The assertions the retired block carried, less the `animate` call: upstream
// defines no such member at the pinned ref, so the fork no longer declares one.
const _rendyDisplay: Vector3 = rendy.get_display_size();
const _rendyWindow: Vector3 = rendy.get_window_size();
rendy.set("camera", _hash, 1);
const _rendyWorld: Vector3 = rendy.screen_to_world("camera", _v3);

// `CameraId` is a `Hash | string` union. The module declares nothing with
// `export`, so proving the alias is nameable also proves an ambient module's
// bare declarations are exported anyway.
const _rendyCameraId: rendy.CameraId = "camera";
rendy.create_camera("camera");
rendy.create_camera(_hash);
// @ts-expect-error a boolean is not an arm of the CameraId union
rendy.create_camera(true);

// The parameters the recorded `signature-loss` verdict would have erased are
// really required — a zero-arity emit would have made this call legal.
const _rendyStack: rendy.CameraId[] = rendy.get_stack(0, 0);
// @ts-expect-error get_stack takes two screen coordinates, not zero arguments
rendy.get_stack();

// `scaler` is the one optional parameter in the surface, so it must compile
// both ways.
rendy.shake("camera", 10, 1, 0.5);
rendy.shake("camera", 10, 1, 0.5, 0.9);

void _rendyDisplay;
void _rendyWindow;
void _rendyWorld;
void _rendyCameraId;
void _rendyStack;

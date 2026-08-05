/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as starly from "starly.starly";

// Compile-only proof (mirroring yagames-usage.test-d.ts) for the corpus's one
// `export =` surface: `const exportThis: CameraMap & Readonly<CoreModule>` has to
// resolve through its alias and intersection for any of this to type-check, and
// until starly severed no gate compiled it under `skipLibCheck: false`. This
// replaces the starly block retired from library-types.test-d.ts when the
// `./starly.starly` subpath went away. No assertions execute; `tsc --noEmit`
// under tsconfig.dts-check.json is the gate.

declare const _id: Hash;
declare const _position: Vector3;

// The two assertions the retired block carried. `vmath.matrix4` maps to `Matrix4`
// in the golden, which is what makes the fork the mapped copy rather than the raw
// ts-defold snapshot.
const _view: Matrix4 = starly.get_view(_id);
const _shaking: boolean = starly.is_shaking(_id);

// The `Readonly<CoreModule>` half: the 7 `c_*` constants the markdown lane could
// never reach are typed members here, not prose.
const _behavior: Hash = starly.c_behavior_center;
const _ratio: number = starly.c_display_ratio;

// `durationScalar`/`radiusScalar` are optional, so the 4-argument call compiles —
// the optionality the generous markdown reading lost.
starly.shake(_id, 3, 0.1, 5);
starly.shake(_id, 3, 0.1, 5, 0.9, 0.8);

// `LuaMultiReturn` destructuring: 4 slots, all numbers.
const [_x, _y, _width, _height] = starly.get_world_area(_id);
const _area: number = _x + _y + _width + _height;

// The optional-visibility overload returns `undefined` when the point is outside
// the viewport, so the result needs narrowing before it is a `Vector3`.
const _screen: Vector3 | undefined = starly.screen_to_world(_id, 0, 0);
const _world: Vector3 | undefined = starly.world_to_screen(_id, _position, true);

// The `CameraMap` half of the intersection — a `LuaMap<Hash, {...}>` keyed by the
// camera id. Without it the handle would resolve to `CoreModule` alone and the
// indexed camera state would be unreachable.
const _camera = starly.get(_id);
if (_camera) {
  const _zoom: number = _camera.zoom;
  const _cameraBehavior: Hash = _camera.behavior;
  void _zoom;
  void _cameraBehavior;
}

void _view;
void _shaking;
void _behavior;
void _ratio;
void _area;
void _screen;
void _world;

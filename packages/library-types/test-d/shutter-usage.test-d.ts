/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as shutter from "shutter.shutter";

// Compile-only proof for the hand-authored shutter surface. No assertions
// execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate. Upstream
// ships plain Lua with no annotations, so this is where the declared shapes are
// held to being callable as written.

declare const _object: Hash;
declare const _distance: Vector3;

// `activate` hands back the frustum it just installed, and `deactivate` the one
// the GUI system expects; both are matrices, not viewport tuples.
const _frustum: Matrix4 = shutter.activate(_object);
const _guiFrustum: Matrix4 = shutter.deactivate();
const _view: Matrix4 = shutter.get_view(_object);
const _projection: Matrix4 = shutter.get_projection(_object);
const _ownFrustum: Matrix4 = shutter.get_frustum(_object);

shutter.force_update(_object);

// The four-value return upstream writes as `return x, y, w, h`. Destructuring is
// the whole point of the multi-return: a single-`number` declaration would let
// this line compile while discarding three of the four.
const [_vx, _vy, _vw, _vh] = shutter.get_viewport(_object);
const _viewportX: number = _vx;
const _viewportY: number = _vy;
const _viewportWidth: number = _vw;
const _viewportHeight: number = _vh;

// Both conversions bail with a bare `return` when `visible` filters the point
// out, so the nil arm has to survive to the caller.
const _world: Vector3 | undefined = shutter.screen_to_world(_object, 10, 20);
const _worldVisible: Vector3 | undefined = shutter.screen_to_world(_object, 10, 20, true);
// @ts-expect-error `screen_to_world` may return nil when `visible` filters the point out.
const _worldUnchecked: Vector3 = shutter.screen_to_world(_object, 10, 20, true);
const _screen: Vector3 | undefined = shutter.world_to_screen(_object, _distance);
// @ts-expect-error `world_to_screen` may return nil when `visible` filters the point out.
const _screenUnchecked: Vector3 = shutter.world_to_screen(_object, _distance, true);

// `duration_scalar` and `radius_scalar` are the two upstream defaults with
// `or 1`; everything ahead of them is required, `parent` included.
shutter.shake(_object, false, 4, 0.1, 10);
shutter.shake(_object, true, 4, 0.1, 10, 0.9, 0.8);
shutter.cancel_shake(_object);
shutter.cancel_shake(_object, true);

const _absolute: Vector3 = shutter.get_distance(_object, _distance, true);
const _rotated: Vector3 = shutter.get_distance(_object, _distance);

// The three behavior constants are hashes the script compares `self.behavior`
// against, and the table they key is indexed by the game object's own id.
const _behavior: Hash = shutter.center_behavior;
const _expand: Hash = shutter.expand_behavior;
const _stretch: Hash = shutter.stretch_behavior;
const _camera = shutter.camera_table.get(_object);
const _zoom: number | undefined = _camera?.zoom;
// @ts-expect-error `camera_table` is keyed by the object's `Hash`, not by its name.
const _byName = shutter.camera_table.get("camera");

void _frustum;
void _guiFrustum;
void _view;
void _projection;
void _ownFrustum;
void _viewportX;
void _viewportY;
void _viewportWidth;
void _viewportHeight;
void _world;
void _worldVisible;
void _worldUnchecked;
void _screen;
void _screenUnchecked;
void _absolute;
void _rotated;
void _behavior;
void _expand;
void _stretch;
void _camera;
void _zoom;
void _byName;

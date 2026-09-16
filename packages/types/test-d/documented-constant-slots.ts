/// <reference path="../index.d.ts" />

import type { Opaque, Url } from "../src/core-types";

// A `constant` slot takes the constants its own doc names. What matters here is
// that the calls the Defold docs teach compile against the shipped declarations,
// and that a constant from the wrong family is rejected. Completeness across
// every slot belongs to the constant-slot drift gate.

declare const node: Opaque<"node">;
declare const url: Url;
declare const buf: Opaque<"buffer">;

// gui — the page's own animate example, every documented setter, the property
// slots that borrow animate's constants, and getter-to-setter round-trips.
gui.animate(node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5);
gui.animate(
  node,
  "position",
  vmath.vector3(),
  gui.EASING_LINEAR,
  1,
  0,
  undefined,
  gui.PLAYBACK_LOOP_PINGPONG,
);
gui.cancel_animations(node, gui.PROP_POSITION);
gui.set(node, gui.PROP_SCALE, vmath.vector3(2, 2, 2));
const _alpha = gui.get(node, gui.PROP_COLOR);
void _alpha;
gui.set_blend_mode(node, gui.BLEND_ADD);
gui.set_clipping_mode(node, gui.CLIPPING_MODE_STENCIL);
gui.set_xanchor(node, gui.ANCHOR_LEFT);
gui.set_yanchor(node, gui.ANCHOR_TOP);
gui.set_pivot(node, gui.PIVOT_NW);
gui.set_outer_bounds(node, gui.PIEBOUNDS_ELLIPSE);
gui.set_adjust_mode(node, gui.ADJUST_STRETCH);
gui.set_safe_area_mode(gui.SAFE_AREA_BOTH);
gui.set_size_mode(node, gui.SIZE_MODE_AUTO);
gui.show_keyboard(gui.KEYBOARD_TYPE_EMAIL, true);

gui.set_pivot(node, gui.get_pivot(node));
gui.set_blend_mode(node, gui.get_blend_mode(node));
gui.set_adjust_mode(node, gui.get_adjust_mode(node));
gui.set_size_mode(node, gui.get_size_mode(node));
gui.set_clipping_mode(node, gui.get_clipping_mode(node));
gui.set_xanchor(node, gui.get_xanchor(node));
gui.set_yanchor(node, gui.get_yanchor(node));
gui.set_outer_bounds(node, gui.get_outer_bounds(node));
const [_nodeType] = gui.get_type(node);
const _isText: boolean = _nodeType === gui.TYPE_TEXT;
void _isText;

// @ts-expect-error a blend constant is not a pivot
gui.set_pivot(node, gui.BLEND_ADD);

// render, profiler, model, window — constants owned by another namespace, too.
render.enable_state(graphics.STATE_DEPTH_TEST);
render.disable_state(graphics.STATE_BLEND);

// render.clear's mapping *key* is a documented constant slot too: the three
// graphics.BUFFER_TYPE_* constants its reference names, written through the
// exported alias.
const clearBuffers = new LuaMap<render.ClearBufferKey, number | Vector4>();
clearBuffers.set(graphics.BUFFER_TYPE_COLOR0_BIT, vmath.vector4(0, 0, 0, 0));
clearBuffers.set(graphics.BUFFER_TYPE_DEPTH_BIT, 1);
clearBuffers.set(graphics.BUFFER_TYPE_STENCIL_BIT, 0);
render.clear(clearBuffers);

// @ts-expect-error a graphics state constant is not a clear-buffer key
clearBuffers.set(graphics.STATE_BLEND, 1);

declare const looseBuffers: LuaMap<number, number | Vector4>;

// @ts-expect-error the clear-buffer key is the three documented constants, not any number
render.clear(looseBuffers);
profiler.set_ui_mode(profiler.MODE_RUN);
profiler.set_ui_view_mode(profiler.VIEW_MODE_MINIMIZED);
model.play_anim(url, "run", go.PLAYBACK_ONCE_FORWARD);

// @ts-expect-error model playback takes the go.PLAYBACK_* family, not gui's
model.play_anim(url, "run", gui.PLAYBACK_ONCE_FORWARD);

window.set_dim_mode(window.DIMMING_ON);

// @ts-expect-error the getter can report DIMMING_UNKNOWN, which the setter rejects
window.set_dim_mode(window.get_dim_mode());

// Getter results compare against the constants their doc lists.
const _online: boolean = sys.get_connectivity() === sys.NETWORK_CONNECTED;
const _factoryLoaded: boolean = factory.get_status(url) === factory.STATUS_LOADED;
const _collectionLoaded: boolean =
  collectionfactory.get_status(url) === collectionfactory.STATUS_LOADED;
void _online;
void _factoryLoaded;
void _collectionLoaded;

// buffer — the set_metadata example, and the getter's type fed back in.
buffer.set_metadata(buf, hash("somefloats"), [1.5, 3.2, 7.9], buffer.VALUE_TYPE_FLOAT32);
const [values, valueType] = buffer.get_metadata(buf, hash("somefloats"));
if (values !== undefined && valueType !== undefined) {
  buffer.set_metadata(buf, hash("somefloats"), values, valueType);
}

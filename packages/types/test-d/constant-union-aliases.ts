/// <reference path="../index.d.ts" />

// Every constant union with a public name: each member is assignable to the
// alias, and a constant from a sibling group is not. The compiler is the judge,
// so an alias emitted as `number`, or over the wrong group, fails here even
// while the text-level gates stay green.

// buffer
const _bufferValueType: buffer.ValueType = buffer.VALUE_TYPE_FLOAT32;
const _bufferValueTypeLast: buffer.ValueType = buffer.VALUE_TYPE_UINT8;
void _bufferValueType;
void _bufferValueTypeLast;

// collectionfactory / factory — same member names, different namespaces.
const _collectionStatus: collectionfactory.Status = collectionfactory.STATUS_LOADED;
const _factoryStatus: factory.Status = factory.STATUS_UNLOADED;
void _collectionStatus;
void _factoryStatus;

// @ts-expect-error a factory status is not a collectionfactory status
const _crossedStatus: collectionfactory.Status = factory.STATUS_LOADED;
void _crossedStatus;

// go
const _goEasing: go.Easing = go.EASING_OUTINQUINT;
const _goPlayback: go.Playback = go.PLAYBACK_LOOP_PINGPONG;
void _goEasing;
void _goPlayback;

// @ts-expect-error a playback constant is not an easing
const _goEasingWrong: go.Easing = go.PLAYBACK_ONCE_FORWARD;
void _goEasingWrong;

// graphics / render — the buffer-type split: six for the attachment set, three
// for the keys render.clear accepts.
const _bufferType: graphics.BufferType = graphics.BUFFER_TYPE_COLOR3_BIT;
const _clearKey: render.ClearBufferKey = graphics.BUFFER_TYPE_DEPTH_BIT;
const _graphicsState: graphics.State = graphics.STATE_POLYGON_OFFSET_FILL;
void _bufferType;
void _clearKey;
void _graphicsState;

// @ts-expect-error COLOR1 is a buffer type but not one of render.clear's keys
const _clearKeyWrong: render.ClearBufferKey = graphics.BUFFER_TYPE_COLOR1_BIT;
void _clearKeyWrong;

// The narrower row is assignable to the wider one, not the other way round.
const _widened: graphics.BufferType =
  graphics.BUFFER_TYPE_STENCIL_BIT satisfies render.ClearBufferKey;
void _widened;

// gui
const _adjust: gui.AdjustMode = gui.ADJUST_ZOOM;
const _blend: gui.BlendMode = gui.BLEND_SCREEN;
const _clipping: gui.ClippingMode = gui.CLIPPING_MODE_STENCIL;
const _guiEasing: gui.Easing = gui.EASING_INOUTQUAD;
const _keyboard: gui.KeyboardType = gui.KEYBOARD_TYPE_NUMBER_PAD;
const _pieBounds: gui.PieBounds = gui.PIEBOUNDS_ELLIPSE;
const _pivot: gui.Pivot = gui.PIVOT_SW;
const _guiPlayback: gui.Playback = gui.PLAYBACK_ONCE_BACKWARD;
const _property: gui.Property = gui.PROP_SLICE9;
const _safeArea: gui.SafeAreaMode = gui.SAFE_AREA_LONG;
const _sizeMode: gui.SizeMode = gui.SIZE_MODE_MANUAL;
const _nodeType: gui.NodeType = gui.TYPE_PARTICLEFX;
void _adjust;
void _blend;
void _clipping;
void _guiEasing;
void _keyboard;
void _pieBounds;
void _pivot;
void _guiPlayback;
void _property;
void _safeArea;
void _sizeMode;
void _nodeType;

// @ts-expect-error gui easing and go easing are distinct brands
const _guiEasingWrong: gui.Easing = go.EASING_INOUTQUAD;
void _guiEasingWrong;

// @ts-expect-error a gui playback is not a gui easing
const _guiEasingSibling: gui.Easing = gui.PLAYBACK_ONCE_FORWARD;
void _guiEasingSibling;

// The anchor split: NONE is in both, the directional arms are in exactly one.
const _xAnchorNone: gui.XAnchor = gui.ANCHOR_NONE;
const _yAnchorNone: gui.YAnchor = gui.ANCHOR_NONE;
const _xAnchor: gui.XAnchor = gui.ANCHOR_RIGHT;
const _yAnchor: gui.YAnchor = gui.ANCHOR_BOTTOM;
void _xAnchorNone;
void _yAnchorNone;
void _xAnchor;
void _yAnchor;

// @ts-expect-error TOP is a y anchor, not an x anchor
const _xAnchorWrong: gui.XAnchor = gui.ANCHOR_TOP;
void _xAnchorWrong;

// @ts-expect-error LEFT is an x anchor, not a y anchor
const _yAnchorWrong: gui.YAnchor = gui.ANCHOR_LEFT;
void _yAnchorWrong;

// profiler
const _profilerMode: profiler.Mode = profiler.MODE_SHOW_PEAK_FRAME;
const _profilerViewMode: profiler.ViewMode = profiler.VIEW_MODE_FULL;
void _profilerMode;
void _profilerViewMode;

// @ts-expect-error a view mode is not a ui mode
const _profilerModeWrong: profiler.Mode = profiler.VIEW_MODE_FULL;
void _profilerModeWrong;

// sys
const _connectivity: sys.NetworkConnectivity = sys.NETWORK_CONNECTED_CELLULAR;
void _connectivity;

// window — the dim-mode split: only the getter can report DIMMING_UNKNOWN.
const _dimState: window.DimModeState = window.DIMMING_UNKNOWN;
const _dimSettable: window.DimModeStateSettable = window.DIMMING_ON;
void _dimState;
void _dimSettable;

// @ts-expect-error DIMMING_UNKNOWN is reportable but not settable
const _dimSettableWrong: window.DimModeStateSettable = window.DIMMING_UNKNOWN;
void _dimSettableWrong;

// The aliases are the types the signatures actually take, so a getter's result
// feeds its setter and a wrapper can name its own parameter.
declare const node: Opaque<"node">;
function fadeIn(target: Opaque<"node">, easing: gui.Easing, playback: gui.Playback): void {
  gui.animate(
    target,
    gui.PROP_COLOR,
    vmath.vector4(1, 1, 1, 1),
    easing,
    0.5,
    0,
    undefined,
    playback,
  );
}
fadeIn(node, gui.EASING_OUTQUAD, gui.PLAYBACK_ONCE_FORWARD);
gui.set_pivot(node, gui.get_pivot(node));
render.enable_state(graphics.STATE_BLEND satisfies graphics.State);

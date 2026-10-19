/// <reference path="../index.d.ts" />

// Every constant union with a public name: representative members of the group
// are assignable to the alias, and a constant from a sibling group is not. The
// compiler is the judge, so an alias emitted as `number`, or over the wrong
// group, fails here even while the text-level gates stay green.
//
// What this file does not hold is the exhaustive member set of any alias — a
// group's members are sampled here, not enumerated. Two other gates own that:
// `test/constant-union-alias-coverage.test.ts` scans the generated declarations
// for a brand union left unnamed, so a group the alias table does not cover is
// caught; `test/constant-slot-expansion-drift.test.ts` resolves each documented
// slot from the reference documentation and expands the alias through the
// emitted `type ... = ...` declaration, never through the table it guards.

// buffer
const _bufferValueType: buffer.VALUE_TYPE = buffer.VALUE_TYPE_FLOAT32;
const _bufferValueTypeLast: buffer.VALUE_TYPE = buffer.VALUE_TYPE_UINT8;
void _bufferValueType;
void _bufferValueTypeLast;

// collectionfactory / factory — same member names, different namespaces.
const _collectionStatus: collectionfactory.STATUS = collectionfactory.STATUS_LOADED;
const _factoryStatus: factory.STATUS = factory.STATUS_UNLOADED;
void _collectionStatus;
void _factoryStatus;

// @ts-expect-error a factory status is not a collectionfactory status
const _crossedStatus: collectionfactory.STATUS = factory.STATUS_LOADED;
void _crossedStatus;

// go
const _goEasing: go.EASING = go.EASING_OUTINQUINT;
const _goPlayback: go.PLAYBACK = go.PLAYBACK_NONE;
void _goEasing;
void _goPlayback;

// @ts-expect-error a playback constant is not an easing
const _goEasingWrong: go.EASING = go.PLAYBACK_ONCE_FORWARD;
void _goEasingWrong;

// graphics / render — the buffer-type split: six for the attachment set, three
// for the keys render.clear accepts.
const _bufferType: graphics.BUFFER_TYPE = graphics.BUFFER_TYPE_COLOR0_BIT;
const _clearKey: render.ClearBufferKey = graphics.BUFFER_TYPE_DEPTH_BIT;
const _graphicsState: graphics.STATE = graphics.STATE_SCISSOR_TEST;
void _bufferType;
void _clearKey;
void _graphicsState;

// The reference types COLOR1..3 `graphics.BUFFER_TYPE|nil`: the alias takes one
// only once it is narrowed past undefined.
// @ts-expect-error COLOR3 may be undefined
const _bufferTypeUnnarrowed: graphics.BUFFER_TYPE = graphics.BUFFER_TYPE_COLOR3_BIT;
void _bufferTypeUnnarrowed;
if (graphics.BUFFER_TYPE_COLOR3_BIT !== undefined) {
  const _bufferTypeNarrowed: graphics.BUFFER_TYPE = graphics.BUFFER_TYPE_COLOR3_BIT;
  void _bufferTypeNarrowed;
}

// @ts-expect-error COLOR1 is a buffer type but not one of render.clear's keys
const _clearKeyWrong: render.ClearBufferKey = graphics.BUFFER_TYPE_COLOR1_BIT;
void _clearKeyWrong;

// The narrower row is assignable to the wider one, not the other way round.
const _widened: graphics.BUFFER_TYPE =
  graphics.BUFFER_TYPE_STENCIL_BIT satisfies render.ClearBufferKey;
void _widened;

// gui
const _adjust: gui.ADJUST = gui.ADJUST_ZOOM;
const _blend: gui.BLEND = gui.BLEND_SCREEN;
const _clipping: gui.CLIPPING_MODE = gui.CLIPPING_MODE_STENCIL;
const _guiEasing: gui.EASING = gui.EASING_INOUTQUAD;
const _keyboard: gui.KEYBOARD_TYPE = gui.KEYBOARD_TYPE_NUMBER_PAD;
const _pieBounds: gui.PIEBOUNDS = gui.PIEBOUNDS_ELLIPSE;
const _pivot: gui.PIVOT = gui.PIVOT_SW;
const _guiPlayback: gui.PLAYBACK = gui.PLAYBACK_ONCE_BACKWARD;
const _property: gui.PROP = gui.PROP_SLICE9;
const _safeArea: gui.SAFE_AREA = gui.SAFE_AREA_LONG;
const _sizeMode: gui.SIZE_MODE = gui.SIZE_MODE_MANUAL;
const _nodeType: gui.TYPE = gui.TYPE_PARTICLEFX;
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
const _guiEasingWrong: gui.EASING = go.EASING_INOUTQUAD;
void _guiEasingWrong;

// @ts-expect-error a gui playback is not a gui easing
const _guiEasingSibling: gui.EASING = gui.PLAYBACK_ONCE_FORWARD;
void _guiEasingSibling;

// One anchor name holds both axes; a slot that takes one axis excludes the other.
const _anchorNone: gui.ANCHOR = gui.ANCHOR_NONE;
const _anchorRight: gui.ANCHOR = gui.ANCHOR_RIGHT;
const _anchorTop: gui.ANCHOR = gui.ANCHOR_TOP;
void _anchorNone;
void _anchorRight;
void _anchorTop;

// @ts-expect-error a pivot is not an anchor
const _anchorWrong: gui.ANCHOR = gui.PIVOT_N;
void _anchorWrong;

// profiler
const _profilerMode: profiler.MODE = profiler.MODE_SHOW_PEAK_FRAME;
const _profilerViewMode: profiler.VIEW_MODE = profiler.VIEW_MODE_FULL;
void _profilerMode;
void _profilerViewMode;

// @ts-expect-error a view mode is not a ui mode
const _profilerModeWrong: profiler.MODE = profiler.VIEW_MODE_FULL;
void _profilerModeWrong;

// sys
const _connectivity: sys.NETWORK = sys.NETWORK_CONNECTED_CELLULAR;
void _connectivity;

// window — the dim-mode split: only the getter can report DIMMING_UNKNOWN.
const _dimState: window.DIMMING = window.DIMMING_UNKNOWN;
void _dimState;
window.set_dim_mode(window.DIMMING_ON);

// @ts-expect-error DIMMING_UNKNOWN is reportable but not settable
window.set_dim_mode(window.DIMMING_UNKNOWN);

// The aliases are the types the signatures actually take, so a getter's result
// feeds its setter and a wrapper can name its own parameter.
declare const node: Opaque<"node">;
function fadeIn(target: Opaque<"node">, easing: gui.EASING, playback: gui.PLAYBACK): void {
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
render.enable_state(graphics.STATE_BLEND satisfies graphics.STATE);

// Where the reference names the enum, that name is the only one: the curated
// spelling it replaced is declared on no target.
// @ts-expect-error the kept name is buffer.VALUE_TYPE
declare const _removedBufferValueType: buffer.ValueType;
// @ts-expect-error the kept name is collectionfactory.STATUS
declare const _removedCollectionfactoryStatus: collectionfactory.Status;
// @ts-expect-error the kept name is factory.STATUS
declare const _removedFactoryStatus: factory.Status;
// @ts-expect-error the kept name is go.EASING
declare const _removedGoEasing: go.Easing;
// @ts-expect-error the kept name is graphics.BLEND_FACTOR
declare const _removedGraphicsBlendFactor: graphics.BlendFactor;
// @ts-expect-error the kept name is graphics.BUFFER_TYPE
declare const _removedGraphicsBufferType: graphics.BufferType;
// @ts-expect-error the kept name is gui.ADJUST
declare const _removedGuiAdjustMode: gui.AdjustMode;
// @ts-expect-error the kept name is gui.BLEND
declare const _removedGuiBlendMode: gui.BlendMode;
// @ts-expect-error the kept name is gui.CLIPPING_MODE
declare const _removedGuiClippingMode: gui.ClippingMode;
// @ts-expect-error the kept name is gui.EASING
declare const _removedGuiEasing: gui.Easing;
// @ts-expect-error the kept name is gui.KEYBOARD_TYPE
declare const _removedGuiKeyboardType: gui.KeyboardType;
// @ts-expect-error the kept name is gui.TYPE
declare const _removedGuiNodeType: gui.NodeType;
// @ts-expect-error the kept name is gui.PIEBOUNDS
declare const _removedGuiPieBounds: gui.PieBounds;
// @ts-expect-error the kept name is gui.PIVOT
declare const _removedGuiPivot: gui.Pivot;
// @ts-expect-error the kept name is gui.PLAYBACK
declare const _removedGuiPlayback: gui.Playback;
// @ts-expect-error the kept name is gui.PROP
declare const _removedGuiProperty: gui.Property;
// @ts-expect-error the kept name is gui.SAFE_AREA
declare const _removedGuiSafeAreaMode: gui.SafeAreaMode;
// @ts-expect-error the kept name is gui.SIZE_MODE
declare const _removedGuiSizeMode: gui.SizeMode;
// @ts-expect-error the kept name is profiler.MODE
declare const _removedProfilerMode: profiler.Mode;
// @ts-expect-error the kept name is profiler.VIEW_MODE
declare const _removedProfilerViewMode: profiler.ViewMode;
// @ts-expect-error the kept name is sys.NETWORK
declare const _removedSysNetworkConnectivity: sys.NetworkConnectivity;
// @ts-expect-error the kept name is window.DIMMING
declare const _removedWindowDimModeState: window.DimModeState;
void _removedBufferValueType;
void _removedCollectionfactoryStatus;
void _removedFactoryStatus;
void _removedGoEasing;
void _removedGraphicsBlendFactor;
void _removedGraphicsBufferType;
void _removedGuiAdjustMode;
void _removedGuiBlendMode;
void _removedGuiClippingMode;
void _removedGuiEasing;
void _removedGuiKeyboardType;
void _removedGuiNodeType;
void _removedGuiPieBounds;
void _removedGuiPivot;
void _removedGuiPlayback;
void _removedGuiProperty;
void _removedGuiSafeAreaMode;
void _removedGuiSizeMode;
void _removedProfilerMode;
void _removedProfilerViewMode;
void _removedSysNetworkConnectivity;
void _removedWindowDimModeState;

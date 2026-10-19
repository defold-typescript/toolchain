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
const _goPlayback: go.Playback = go.PLAYBACK_NONE;
void _goEasing;
void _goPlayback;

// @ts-expect-error a playback constant is not an easing
const _goEasingWrong: go.Easing = go.PLAYBACK_ONCE_FORWARD;
void _goEasingWrong;

// graphics / render — the buffer-type split: six for the attachment set, three
// for the keys render.clear accepts.
const _bufferType: graphics.BufferType = graphics.BUFFER_TYPE_COLOR0_BIT;
const _clearKey: render.ClearBufferKey = graphics.BUFFER_TYPE_DEPTH_BIT;
const _graphicsState: graphics.State = graphics.STATE_SCISSOR_TEST;
void _bufferType;
void _clearKey;
void _graphicsState;

// The reference types COLOR1..3 `graphics.BufferType|nil`: the alias takes one
// only once it is narrowed past undefined.
// @ts-expect-error COLOR3 may be undefined
const _bufferTypeUnnarrowed: graphics.BufferType = graphics.BUFFER_TYPE_COLOR3_BIT;
void _bufferTypeUnnarrowed;
if (graphics.BUFFER_TYPE_COLOR3_BIT !== undefined) {
  const _bufferTypeNarrowed: graphics.BufferType = graphics.BUFFER_TYPE_COLOR3_BIT;
  void _bufferTypeNarrowed;
}

// @ts-expect-error COLOR1 is a buffer type but not one of render.clear's keys
const _clearKeyWrong: render.ClearBufferKey = graphics.BUFFER_TYPE_COLOR1_BIT;
void _clearKeyWrong;

// The narrower row is assignable to the wider one, not the other way round.
const _widened: graphics.BufferType =
  graphics.BUFFER_TYPE_STENCIL_BIT satisfies render.ClearBufferKey;
void _widened;

// gui
const _adjust: gui.Adjust = gui.ADJUST_ZOOM;
const _blend: gui.Blend = gui.BLEND_SCREEN;
const _clipping: gui.ClippingMode = gui.CLIPPING_MODE_STENCIL;
const _guiEasing: gui.Easing = gui.EASING_INOUTQUAD;
const _keyboard: gui.KeyboardType = gui.KEYBOARD_TYPE_NUMBER_PAD;
const _pieBounds: gui.PieBounds = gui.PIEBOUNDS_ELLIPSE;
const _pivot: gui.Pivot = gui.PIVOT_SW;
const _guiPlayback: gui.Playback = gui.PLAYBACK_ONCE_BACKWARD;
const _property: gui.Prop = gui.PROP_SLICE9;
const _safeArea: gui.SafeArea = gui.SAFE_AREA_LONG;
const _sizeMode: gui.SizeMode = gui.SIZE_MODE_MANUAL;
const _nodeType: gui.Type = gui.TYPE_PARTICLEFX;
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

// One anchor name holds both axes; a slot that takes one axis excludes the other.
const _anchorNone: gui.Anchor = gui.ANCHOR_NONE;
const _anchorRight: gui.Anchor = gui.ANCHOR_RIGHT;
const _anchorTop: gui.Anchor = gui.ANCHOR_TOP;
void _anchorNone;
void _anchorRight;
void _anchorTop;

// @ts-expect-error a pivot is not an anchor
const _anchorWrong: gui.Anchor = gui.PIVOT_N;
void _anchorWrong;

// profiler
const _profilerMode: profiler.Mode = profiler.MODE_SHOW_PEAK_FRAME;
const _profilerViewMode: profiler.ViewMode = profiler.VIEW_MODE_FULL;
void _profilerMode;
void _profilerViewMode;

// @ts-expect-error a view mode is not a ui mode
const _profilerModeWrong: profiler.Mode = profiler.VIEW_MODE_FULL;
void _profilerModeWrong;

// sys
const _connectivity: sys.Network = sys.NETWORK_CONNECTED_CELLULAR;
void _connectivity;

// window — the dim-mode split: only the getter can report DIMMING_UNKNOWN.
const _dimState: window.Dimming = window.DIMMING_UNKNOWN;
void _dimState;
window.set_dim_mode(window.DIMMING_ON);

// @ts-expect-error DIMMING_UNKNOWN is reportable but not settable
window.set_dim_mode(window.DIMMING_UNKNOWN);

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

// The reference spelling of a renamed union is not a type.
// @ts-expect-error the type is buffer.ValueType
declare const _referenceBufferValueType: buffer.VALUE_TYPE;
// @ts-expect-error the type is collectionfactory.Status
declare const _referenceCollectionfactoryStatus: collectionfactory.STATUS;
// @ts-expect-error the type is factory.Status
declare const _referenceFactoryStatus: factory.STATUS;
// @ts-expect-error the type is go.Easing
declare const _referenceGoEasing: go.EASING;
// @ts-expect-error the type is go.Playback
declare const _referenceGoPlayback: go.PLAYBACK;
// @ts-expect-error the type is graphics.BlendFactor
declare const _referenceGraphicsBlendFactor: graphics.BLEND_FACTOR;
// @ts-expect-error the type is graphics.BufferType
declare const _referenceGraphicsBufferType: graphics.BUFFER_TYPE;
// @ts-expect-error the type is graphics.State
declare const _referenceGraphicsState: graphics.STATE;
// @ts-expect-error the type is gui.Adjust
declare const _referenceGuiAdjust: gui.ADJUST;
// @ts-expect-error the type is gui.Anchor
declare const _referenceGuiAnchor: gui.ANCHOR;
// @ts-expect-error the type is gui.Blend
declare const _referenceGuiBlend: gui.BLEND;
// @ts-expect-error the type is gui.ClippingMode
declare const _referenceGuiClippingMode: gui.CLIPPING_MODE;
// @ts-expect-error the type is gui.Easing
declare const _referenceGuiEasing: gui.EASING;
// @ts-expect-error the type is gui.KeyboardType
declare const _referenceGuiKeyboardType: gui.KEYBOARD_TYPE;
// @ts-expect-error the type is gui.PieBounds
declare const _referenceGuiPiebounds: gui.PIEBOUNDS;
// @ts-expect-error the type is gui.Pivot
declare const _referenceGuiPivot: gui.PIVOT;
// @ts-expect-error the type is gui.Playback
declare const _referenceGuiPlayback: gui.PLAYBACK;
// @ts-expect-error the type is gui.Prop
declare const _referenceGuiProp: gui.PROP;
// @ts-expect-error the type is gui.SafeArea
declare const _referenceGuiSafeArea: gui.SAFE_AREA;
// @ts-expect-error the type is gui.SizeMode
declare const _referenceGuiSizeMode: gui.SIZE_MODE;
// @ts-expect-error the type is gui.Type
declare const _referenceGuiType: gui.TYPE;
// @ts-expect-error the type is profiler.Mode
declare const _referenceProfilerMode: profiler.MODE;
// @ts-expect-error the type is profiler.ViewMode
declare const _referenceProfilerViewMode: profiler.VIEW_MODE;
// @ts-expect-error the type is sys.Network
declare const _referenceSysNetwork: sys.NETWORK;
// @ts-expect-error the type is window.Dimming
declare const _referenceWindowDimming: window.DIMMING;

// A curated name that differs from the reference's derived name stays retired.
// @ts-expect-error the type is gui.Adjust
declare const _retiredGuiAdjustMode: gui.AdjustMode;
// @ts-expect-error the type is gui.Blend
declare const _retiredGuiBlendMode: gui.BlendMode;
// @ts-expect-error the type is gui.Type
declare const _retiredGuiNodeType: gui.NodeType;
// @ts-expect-error the type is gui.Prop
declare const _retiredGuiProperty: gui.Property;
// @ts-expect-error the type is gui.SafeArea
declare const _retiredGuiSafeAreaMode: gui.SafeAreaMode;
// @ts-expect-error the type is sys.Network
declare const _retiredSysNetworkConnectivity: sys.NetworkConnectivity;
// @ts-expect-error the type is window.Dimming
declare const _retiredWindowDimModeState: window.DimModeState;
void _referenceBufferValueType;
void _referenceCollectionfactoryStatus;
void _referenceFactoryStatus;
void _referenceGoEasing;
void _referenceGoPlayback;
void _referenceGraphicsBlendFactor;
void _referenceGraphicsBufferType;
void _referenceGraphicsState;
void _referenceGuiAdjust;
void _referenceGuiAnchor;
void _referenceGuiBlend;
void _referenceGuiClippingMode;
void _referenceGuiEasing;
void _referenceGuiKeyboardType;
void _referenceGuiPiebounds;
void _referenceGuiPivot;
void _referenceGuiPlayback;
void _referenceGuiProp;
void _referenceGuiSafeArea;
void _referenceGuiSizeMode;
void _referenceGuiType;
void _referenceProfilerMode;
void _referenceProfilerViewMode;
void _referenceSysNetwork;
void _referenceWindowDimming;
void _retiredGuiAdjustMode;
void _retiredGuiBlendMode;
void _retiredGuiNodeType;
void _retiredGuiProperty;
void _retiredGuiSafeAreaMode;
void _retiredSysNetworkConnectivity;
void _retiredWindowDimModeState;

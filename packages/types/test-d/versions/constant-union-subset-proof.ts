export {};

// A curated union that is a strict subset of another in its namespace has no
// name of its own: each slot spells `Exclude<parent, ...>`, so the parent must
// be declared on every surface a consumer can select, and each slot must still
// accept exactly what it accepted under the removed name.

const _playbackNone: go.PLAYBACK = go.PLAYBACK_NONE;
const _anchorTop: gui.ANCHOR = gui.ANCHOR_TOP;
const _stateScissor: graphics.STATE = graphics.STATE_SCISSOR_TEST;
const _dimUnknown: window.DIMMING = window.DIMMING_UNKNOWN;
void _playbackNone;
void _anchorTop;
void _stateScissor;
void _dimUnknown;

render.enable_state(graphics.STATE_BLEND);
render.disable_state(graphics.STATE_POLYGON_OFFSET_FILL);
window.set_dim_mode(window.DIMMING_ON);
window.set_dim_mode(window.DIMMING_OFF);

// @ts-expect-error render_script.cpp raises "Invalid state" for the scissor test
render.enable_state(graphics.STATE_SCISSOR_TEST);
// @ts-expect-error render_script.cpp raises "Invalid state" for the support query
render.disable_state(graphics.STATE_ALPHA_TEST_SUPPORTED);
// @ts-expect-error script_window.cpp rejects DIMMING_UNKNOWN as a mode to set
window.set_dim_mode(window.DIMMING_UNKNOWN);

// @ts-expect-error the kept name is go.PLAYBACK
declare const _removedGoPlayback: go.Playback;
// @ts-expect-error the kept name is gui.ANCHOR
declare const _removedGuiXAnchor: gui.XAnchor;
// @ts-expect-error the kept name is gui.ANCHOR
declare const _removedGuiYAnchor: gui.YAnchor;
// @ts-expect-error the kept name is graphics.STATE
declare const _removedGraphicsState: graphics.State;
// @ts-expect-error the kept name is window.DIMMING
declare const _removedWindowDimModeStateSettable: window.DimModeStateSettable;
void _removedGoPlayback;
void _removedGuiXAnchor;
void _removedGuiYAnchor;
void _removedGraphicsState;
void _removedWindowDimModeStateSettable;

/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as gooey from "gooey.gooey";
import * as monarch from "monarch.monarch";
import * as easings from "monarch.transitions.easings";
import * as transitionsGui from "monarch.transitions.gui";
import * as camera from "orthographic.camera";

// monarch.monarch — a transition constant is a `Hash`; `register_proxy` accepts a
// `Url`; `post` returns the passthrough `LuaMultiReturn` unchanged.
const _mHash: Hash = monarch.TRANSITION.DONE;
declare const _url: Url;
monarch.register_proxy("main", _url, {});
const [_ok, _err] = monarch.post("main", "message");

// monarch.transitions.gui — the codemod renamed every core type: `create(node)`
// takes an `Opaque<"node">` handle and returns a `Transition` whose `handle`
// callback is `(message_id: Hash | string, message, sender: Url)`; `slide_in_right`
// is a `TransitionInFn` accepting an `Opaque<"node">` and a `Vector3`.
declare const _tNode: Opaque<"node">;
declare const _tMsgId: Hash;
declare const _tV3: Vector3;
const _transition = transitionsGui.create(_tNode);
_transition.handle(_tMsgId, {}, _url);
transitionsGui.slide_in_right(_tNode, _tV3, gui.EASING_LINEAR, 1);

// monarch.transitions.easings — no core-type renames; its only external reference
// is the `gui` engine global via `(typeof gui)[...]`, so resolution proves the
// indexed gui-constant lookup type-checks. `create` accepts an easing name and
// yields an `Easing` whose `IN`/`OUT` are `gui` easing constants.
const _easing = easings.create("BACK");

// orthographic.camera — `get_view` is a `Matrix4`, `get_offset` a `Vector3`;
// `recoil` accepts a `Vector3`; `world_to_screen` accepts a `gui` adjust-mode
// constant (the one reference that must resolve against an engine global).
const _view: Matrix4 = camera.get_view(undefined);
const _offset: Vector3 = camera.get_offset(undefined);
declare const _v3: Vector3;
camera.recoil(_url, _v3);
const _world: Vector3 = camera.world_to_screen(undefined, _v3, gui.ADJUST_FIT);
const [_w, _h] = camera.get_display_size();

// gooey.gooey — a button state exposes an `Opaque<"node">` handle and a `Hash`
// node id; the handle token was renamed without touching the property name.
declare const _hash: Hash;
const _button = gooey.button("id", _hash, {}, () => {});
const _node: Opaque<"node"> = _button.node;
const _nodeId: Hash = _button.node_id;

void _mHash;
void _ok;
void _err;
void _transition;
void _easing.IN;
void _easing.OUT;
void _view;
void _offset;
void _world;
void _w;
void _h;
void _node;
void _nodeId;

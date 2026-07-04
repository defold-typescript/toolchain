/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as gooey from "gooey.gooey";
import * as monarch from "monarch.monarch";
import * as camera from "orthographic.camera";

// monarch.monarch — a transition constant is a `Hash`; `register_proxy` accepts a
// `Url`; `post` returns the passthrough `LuaMultiReturn` unchanged.
const _mHash: Hash = monarch.TRANSITION.DONE;
declare const _url: Url;
monarch.register_proxy("main", _url, {});
const [_ok, _err] = monarch.post("main", "message");

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
void _view;
void _offset;
void _world;
void _w;
void _h;
void _node;
void _nodeId;

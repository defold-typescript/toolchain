/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as bzAnim from "bzAnim.bzLibrary";
import * as dicebag from "dicebag.dicebag";
import * as gooey from "gooey.gooey";
import * as accelerometer from "in.accelerometer";
import * as button from "in.button";
import * as state from "in.state";
import * as triggers from "in.triggers";
import * as fps from "metrics.fps";
import * as mem from "metrics.mem";
import * as monarch from "monarch.monarch";
import * as easings from "monarch.transitions.easings";
import * as transitionsGui from "monarch.transitions.gui";
import * as nakama from "nakama.nakama";
import * as platypus from "platypus.platypus";
import * as rendy from "rendy.rendy";
import * as richtextColor from "richtext.color";
import * as richtext from "richtext.richtext";
import * as richtextTags from "richtext.tags";
import * as starly from "starly.starly";
import * as yagames from "yagames.yagames";

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

declare const _v3: Vector3;

// gooey.gooey — a button state exposes an `Opaque<"node">` handle and a `Hash`
// node id; the handle token was renamed without touching the property name.
declare const _hash: Hash;
const _button = gooey.button("id", _hash, {}, () => {});
const _node: Opaque<"node"> = _button.node;
const _nodeId: Hash = _button.node_id;

// in.button — `TOUCH` is a `Hash`, `register` returns an `Opaque<"node">` handle,
// and `effect` accepts that handle plus a `Vector3`; the upstream `hash`, `node`,
// and `vmath.vector3` references were all renamed off the core surface.
const _bTouch: Hash = button.TOUCH;
const _bNode: Opaque<"node"> = button.register("id", () => {});
declare const _bScale: Vector3;
button.effect(_bNode, _bScale);

// in.accelerometer — `calibrated` yields a `Vector3` (upstream `vmath.vector3`).
const _accel: Vector3 = accelerometer.calibrated();

// in.state — `acquire` takes a `Url` (upstream `url`), reusing the `_url` handle.
state.acquire(_url);

// in.triggers — every key/gamepad constant is a `Hash`.
const _trigger: Hash = triggers.KEY_SPACE;

// platypus.platypus — a lifecycle constant is a `Hash`; a `PlatypusInstance`'s
// `velocity` is a `Vector3` and `move` accepts one (upstream `vmath.vector3`),
// proving both core-type renames land on the real exported surface.
const _pFalling: Hash = platypus.FALLING;
declare const _pInstance: ReturnType<typeof platypus.create>;
const _pVelocity: Vector3 = _pInstance.velocity;
_pInstance.move(_v3);

// richtext.* — color constants and created words rename Defold core types to
// Vector4 and Opaque<"node"> while preserving passthrough LuaMultiReturn.
const _richRed: Vector4 = richtextColor.COLORS.red;
const [_richWords, _richMetrics] = richtext.create("hi", "default");
declare const _richWord: (typeof _richWords)[number];
const _richNode: Opaque<"node"> = _richWord.node;
const _richWordColor: Vector4 = _richWord.color;
const _richWidth: number = _richMetrics.width;
const _taggedWords = richtext.tagged(_richWords, "em");
declare const _taggedWord: (typeof _taggedWords)[number];
const _taggedNode: Opaque<"node"> = _taggedWord.node;
richtextTags.register("em", () => {});

// dicebag.dicebag — `flip_coin` returns a boolean; `bag_draw` accepts a
// `string | number | Hash`, proving the upstream `hash` reference was renamed.
const _dbFlip: boolean = dicebag.flip_coin();
const _dbDraw: boolean = dicebag.bag_draw(_hash);

// starly.starly — an `export =` module: `get_view` returns a `Matrix4` (upstream
// `vmath.matrix4`) for a `Hash` camera id, and `is_shaking` returns a boolean.
const _stView: Matrix4 = starly.get_view(_hash);
const _stShaking: boolean = starly.is_shaking(_hash);

// metrics.* — each submodule has its own Metrics interface, so fps and mem
// accessors stay scoped to their module.
const _fpsMetrics = fps.create();
const _configuredFpsMetrics = fps.create(60, "%.1f", "top-left", "white");
const _fpsValue: number = _fpsMetrics.fps();
_fpsMetrics.update();
_fpsMetrics.draw();
const _memMetrics = mem.create();
const _memValue: number = _memMetrics.mem();
_memMetrics.update();
_memMetrics.draw();

const _nakamaClient = nakama.create_client({
  host: "127.0.0.1",
  port: 7350,
  username: "defaultkey",
  password: "defaultkey",
  engine: {},
});
const _nakamaAccount: { id: string; vars: unknown } = nakama.create_api_account_custom("user", {});
const _nakamaSession = nakama.authenticate_custom(_nakamaClient, _nakamaAccount, true, "user");
nakama.set_bearer_token(_nakamaClient, _nakamaSession.token);

const _yagamesPlayerId: string = yagames.player_get_id();
const _yagamesDevice: "desktop" | "mobile" | "tablet" = yagames.device_info_type();
const _yagamesStorageLength: number = yagames.storage_length();
yagames.player_get_data(undefined, (ctx, err, data) => {
  void ctx;
  void err;
  void data;
});

const _bzInfoLevel: 1 = bzAnim.INFO_LEVEL;
const _bzAnimId: string = bzAnim.animate({ obj: _hash, easing: "TYPE_LINEAR" });
const _bzSeqId: string = bzAnim.animateSequence({ obj: undefined, easing: "TYPE_INQUAD" });
bzAnim.cancel(_bzAnimId);
const _bzReady: boolean = bzAnim.isReady();

const _rendyDisplay: Vector3 = rendy.get_display_size();
const _rendyWindow: Vector3 = rendy.get_window_size();
rendy.set("camera", _hash, 1);
rendy.animate("camera", _hash, go.PLAYBACK_ONCE_FORWARD, _v3, go.EASING_LINEAR, 1);
const _rendyWorld: Vector3 = rendy.screen_to_world("camera", _v3);

void _mHash;
void _ok;
void _err;
void _transition;
void _easing.IN;
void _easing.OUT;
void _node;
void _nodeId;
void _bTouch;
void _bNode;
void _accel;
void _trigger;
void _pFalling;
void _pVelocity;
void _richRed;
void _richNode;
void _richWordColor;
void _richWidth;
void _taggedNode;
void _dbFlip;
void _dbDraw;
void _stView;
void _stShaking;
void _nakamaAccount;
void _nakamaSession;
void _yagamesPlayerId;
void _yagamesDevice;
void _yagamesStorageLength;
void _bzInfoLevel;
void _bzSeqId;
void _bzReady;
void _rendyDisplay;
void _rendyWindow;
void _rendyWorld;

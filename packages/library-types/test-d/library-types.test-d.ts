/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as bzAnim from "bzAnim.bzLibrary";
import * as dicebag from "dicebag.dicebag";
import * as gooey from "gooey.gooey";
import * as fps from "metrics.fps";
import * as mem from "metrics.mem";
import * as nakama from "nakama.nakama";
import * as platypus from "platypus.platypus";
import * as rendy from "rendy.rendy";
import * as richtextColor from "richtext.color";
import * as richtext from "richtext.richtext";
import * as richtextTags from "richtext.tags";

declare const _v3: Vector3;

// gooey.gooey — a button state exposes an `Opaque<"node">` handle and a `Hash`
// node id; the handle token was renamed without touching the property name.
declare const _hash: Hash;
const _button = gooey.button("id", _hash, {}, () => {});
const _node: Opaque<"node"> = _button.node;
const _nodeId: Hash = _button.node_id;

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

void _node;
void _nodeId;
void _pFalling;
void _pVelocity;
void _richRed;
void _richNode;
void _richWordColor;
void _richWidth;
void _taggedNode;
void _dbFlip;
void _dbDraw;
void _nakamaAccount;
void _nakamaSession;
void _bzInfoLevel;
void _bzSeqId;
void _bzReady;
void _rendyDisplay;
void _rendyWindow;
void _rendyWorld;

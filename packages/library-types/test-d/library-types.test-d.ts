/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as bzAnim from "bzAnim.bzLibrary";
import * as boom from "boom.boom";
import * as bridge from "bridge.bridge";
import * as defcon from "defcon.console";
import * as defmath from "defmath.defmath";
import * as defsave from "defsave.defsave";
import * as deftest from "deftest.deftest";
import * as dicebag from "dicebag.dicebag";
import * as event from "event.event";
import * as gooey from "gooey.gooey";
import * as immutable from "immutable.immutable";
import * as accelerometer from "in.accelerometer";
import * as button from "in.button";
import * as state from "in.state";
import * as triggers from "in.triggers";
import * as lang from "lang.lang";
import * as log from "log.log";
import * as fps from "metrics.fps";
import * as mem from "metrics.mem";
import * as monarch from "monarch.monarch";
import * as easings from "monarch.transitions.easings";
import * as transitionsGui from "monarch.transitions.gui";
import * as nakamaEngine from "nakama.engine.defold";
import * as nakama from "nakama.nakama";
import * as nakamaLog from "nakama.util.log";
import * as narrator from "narrator.narrator";
import * as camera from "orthographic.camera";
import * as persist from "persist.persist";
import * as platypus from "platypus.platypus";
import * as proto from "proto.proto";
import * as rendy from "rendy.rendy";
import * as richtextColor from "richtext.color";
import * as richtext from "richtext.richtext";
import * as richtextTags from "richtext.tags";
import * as saver from "saver.saver";
import * as storage from "saver.storage";
import * as squid from "squid.squid";
import * as starly from "starly.starly";
import * as tweener from "tweener.tweener";
import * as yagames from "yagames.yagames";
import * as zzfx from "zzfx.api";

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

// event.event — a pure-passthrough module: the upstream surface is `any`-based,
// so the codemod renames nothing. The proof is that the module resolves and its
// exported surface type-checks — `create` yields an `EventInstance` whose
// `is_empty` is a boolean.
const _event = event.create(() => {});
const _eventEmpty: boolean = _event.is_empty();

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

// narrator.narrator — a mostly structural pure-Lua surface: story parsing and
// runtime helpers resolve without relying on Defold core-type renames.
const _story = narrator.init_story(narrator.parse_content("== start\nHello"));
const _canContinue: boolean = _story.can_continue();
const _continued: { text: string; tags?: string[] }[] | { text: string; tags?: string[] } =
  _story.continue();
const _storyTags: string[] = _story.get_tags("start");

// defcon.console — command registration and server lifecycle compile through the
// package subpath export.
defcon.register_command("ping", "desc", () => "pong");
defcon.start(8090);
defcon.stop();

// lang.lang — scalar helpers and logger removal overload resolve from the
// vendored declaration.
const _langId: string = lang.get_lang();
const _langs: string[] = lang.get_langs();
const _translated: string = lang.txp("score", 1);
lang.set_logger(undefined);

// saver.* — the persistence API resolves scalar returns and logger removal
// overloads while storage keeps typed scalar getter helpers.
saver.init();
const _saveOk: boolean = saver.save_game_state();
const _savePath: string = saver.get_save_path();
const _projectFolder: string | undefined = saver.get_current_game_project_folder();
saver.set_logger(undefined);
const _storageSet: boolean = storage.set("volume", 1);
const _storageNumber: number = storage.get_number("volume");
const _storageString: string = storage.get_string("name");
const _storageBoolean: boolean = storage.get_boolean("muted");

// defsave.defsave — scalar config helpers compile and unknown payloads stay
// weakly typed to match the upstream declaration.
const _defsaveAppName: string = defsave.appname;
const _defsaveLoaded: unknown = defsave.load("settings");
const _defsaveVolume: unknown = defsave.get("settings", "volume");
defsave.set("settings", "volume", 1);
defsave.save_all();
defsave.update(1 / 60);

// persist.persist — structural persistence helpers preserve the upstream
// object-or-undefined load result.
const _persistLoaded: Record<never, never> | undefined = persist.load("slot");
persist.create("slot", { volume: 1 });
persist.write("slot", "volume", 1);
persist.flush("slot");
persist.save("slot");

// proto.proto — serialization helpers preserve object-map payloads and logger
// removal overloads.
proto.init({ player: "/proto/player.proto" });
const _protoSchema: { [key: string]: unknown } = proto.get("Player");
const _protoDecoded: { [key: string]: unknown } = proto.decode("Player", "");
const _protoVerified: { [key: string]: unknown } = proto.verify("Player", { name: "Ada" });
const _protoEncoded: string = proto.encode("Player", { name: "Ada" });
proto.set_logger(undefined);

// defmath.defmath — `round` is a scalar helper; `vect_to_quat` accepts a
// `Vector3 | Vector4` and returns a `Quaternion`, proving the `vmath.quaternion`
// alias renames onto the same core surface as `vmath.quat`.
const _dmRound: number = defmath.round(1.5);
const _dmQuat: Quaternion = defmath.vect_to_quat(_v3);

// dicebag.dicebag — `flip_coin` returns a boolean; `bag_draw` accepts a
// `string | number | Hash`, proving the upstream `hash` reference was renamed.
const _dbFlip: boolean = dicebag.flip_coin();
const _dbDraw: boolean = dicebag.bag_draw(_hash);

// tweener.tweener — `insine` is a `TweenFunc`; `tween` returns a `Hash` (upstream
// `hash`) and `ease` a plain number, both driven by an `AnyTweenFunc` argument.
const _twHandle: Hash = tweener.tween(tweener.insine, 0, 1, 1, () => {});
const _twEase: number = tweener.ease(tweener.insine, 0, 1, 1, 0.5);

// squid.squid — an `export =` module: the default object exposes `save_logs`
// returning a boolean and a `SquidConfig` whose `is_enabled` is a boolean.
const _sqSaved: boolean = squid.save_logs();
const _sqEnabled: boolean = squid.get_config().is_enabled;

// starly.starly — an `export =` module: `get_view` returns a `Matrix4` (upstream
// `vmath.matrix4`) for a `Hash` camera id, and `is_shaking` returns a boolean.
const _stView: Matrix4 = starly.get_view(_hash);
const _stShaking: boolean = starly.is_shaking(_hash);

// log.log — contextual loggers expose level-scoped methods and an optional
// forced debug level union.
const _logger = log.get_logger("core");
const _debugLogger = log.get_logger("core", "DEBUG");
loggerProof(_logger);
function loggerProof(logger: ReturnType<typeof log.get_logger>): void {
  logger.info("msg");
  logger.debug("msg");
  logger.warn("msg");
  logger.error("msg");
  logger.trace("msg", {});
}

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

// deftest.deftest — module exports compile without pulling the ambient test
// globals into this proof file.
deftest.add(() => {});
deftest.run();
deftest.run({ coverage: { enabled: true }, pattern: "foo" });

// immutable.immutable — generic `Readonly<T>` output and scalar predicate resolve
// alongside tstl language-extension collection aliases.
const _immutableStats = immutable.make({ hp: 10 });
const _immutableHp: number = _immutableStats.hp;
const _isImmutable: boolean = immutable.is_immutable(_immutableStats);

const _nakamaUuid: string = nakamaEngine.uuid();
declare const _nakamaSocket: symbol;
nakamaEngine.socket_create({}, (socket, message) => {
  void socket;
  void message;
});
nakamaEngine.socket_connect(_nakamaSocket, (success, error) => {
  void success;
  void error;
});
nakamaEngine.socket_send(_nakamaSocket, "{}", () => {});
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
nakamaLog.print();
nakamaLog.silent();

const _yagamesPlayerId: string = yagames.player_get_id();
const _yagamesDevice: "desktop" | "mobile" | "tablet" = yagames.device_info_type();
const _yagamesStorageLength: number = yagames.storage_length();
yagames.player_get_data(undefined, (ctx, err, data) => {
  void ctx;
  void err;
  void data;
});

const _bridgeDevice: string = bridge.device.type();
const _bridgeInterstitialDelay: number = bridge.advertisement.minimum_delay_between_interstitial();
bridge.leaderboards.set_score(
  "score",
  100,
  () => {},
  (error) => {
    void error;
  },
);

const _zzfxSample: ReturnType<typeof zzfx.build_sample> = zzfx.build_sample(1, 0, 440);
zzfx.play_sample(_zzfxSample);
zzfx.samplerate(44100);

boom.boom(() => {});
const _boomObject = add(["player"]);
const _boomVec = vec2(1, 2);
const _boomRand: number = rand();
const _boomRed = RED;

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
void _view;
void _offset;
void _world;
void _w;
void _h;
void _node;
void _nodeId;
void _bTouch;
void _bNode;
void _accel;
void _trigger;
void _pFalling;
void _pVelocity;
void _eventEmpty;
void _richRed;
void _richNode;
void _richWordColor;
void _richWidth;
void _taggedNode;
void _canContinue;
void _continued;
void _storyTags;
void _langId;
void _langs;
void _translated;
void _saveOk;
void _savePath;
void _projectFolder;
void _storageSet;
void _storageNumber;
void _storageString;
void _storageBoolean;
void _defsaveAppName;
void _defsaveLoaded;
void _defsaveVolume;
void _persistLoaded;
void _protoSchema;
void _protoDecoded;
void _protoVerified;
void _protoEncoded;
void _dmRound;
void _dmQuat;
void _dbFlip;
void _dbDraw;
void _twHandle;
void _twEase;
void _sqSaved;
void _sqEnabled;
void _stView;
void _stShaking;
void _isImmutable;
void _nakamaUuid;
void _nakamaAccount;
void _nakamaSession;
void _yagamesPlayerId;
void _yagamesDevice;
void _yagamesStorageLength;
void _bridgeDevice;
void _bridgeInterstitialDelay;
void _zzfxSample;
void _boomObject;
void _boomVec;
void _boomRand;
void _boomRed;
void _bzInfoLevel;
void _bzSeqId;
void _bzReady;
void _rendyDisplay;
void _rendyWindow;
void _rendyWorld;

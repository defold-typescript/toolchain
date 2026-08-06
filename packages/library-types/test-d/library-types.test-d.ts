/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as dicebag from "dicebag.dicebag";
import * as nakama from "nakama.nakama";
import * as rendy from "rendy.rendy";

declare const _v3: Vector3;

declare const _hash: Hash;

// dicebag.dicebag — `flip_coin` returns a boolean; `bag_draw` accepts a
// `string | number | Hash`, proving the upstream `hash` reference was renamed.
const _dbFlip: boolean = dicebag.flip_coin();
const _dbDraw: boolean = dicebag.bag_draw(_hash);

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

const _rendyDisplay: Vector3 = rendy.get_display_size();
const _rendyWindow: Vector3 = rendy.get_window_size();
rendy.set("camera", _hash, 1);
rendy.animate("camera", _hash, go.PLAYBACK_ONCE_FORWARD, _v3, go.EASING_LINEAR, 1);
const _rendyWorld: Vector3 = rendy.screen_to_world("camera", _v3);

void _dbFlip;
void _dbDraw;
void _nakamaAccount;
void _nakamaSession;
void _rendyDisplay;
void _rendyWindow;
void _rendyWorld;

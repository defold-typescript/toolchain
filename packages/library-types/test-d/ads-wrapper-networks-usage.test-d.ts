/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as admob from "ads_wrapper.ads_networks.admob";
import * as admob_legacy from "ads_wrapper.ads_networks.admob_legacy";
import * as applovin_max from "ads_wrapper.ads_networks.applovin_max";
import * as game_distribution from "ads_wrapper.ads_networks.game_distribution";
import * as ironsource from "ads_wrapper.ads_networks.ironsource";
import * as poki from "ads_wrapper.ads_networks.poki";
import * as poki_legacy from "ads_wrapper.ads_networks.poki_legacy";
import * as portalsdk from "ads_wrapper.ads_networks.portalsdk";
import * as unity from "ads_wrapper.ads_networks.unity";
import * as vk from "ads_wrapper.ads_networks.vk";
import * as yandex from "ads_wrapper.ads_networks.yandex";
import * as yandex_mobile from "ads_wrapper.ads_networks.yandex_mobile";
import * as ads_wrapper from "ads_wrapper.ads_wrapper";

// Compile-only proof that every typed network module, annotated or authored, satisfies
// ads_network, the way upstream's docs/networks.md registers them. No assertions execute;
// tsc --noEmit under tsconfig.dts-check.json (skipLibCheck: false) is the gate.

ads_wrapper.register_network(admob, {});
ads_wrapper.register_network(admob_legacy, {});
ads_wrapper.register_network(applovin_max, {});
ads_wrapper.register_network(game_distribution, {});
ads_wrapper.register_network(ironsource, { user_id: "UserID", consent_GDPR: true });
ads_wrapper.register_network(poki, { is_debug: true });
ads_wrapper.register_network(poki_legacy, { is_debug: true });
ads_wrapper.register_network(portalsdk, { placement_id: "main" });
ads_wrapper.register_network(unity, {});
ads_wrapper.register_network(vk, {});
ads_wrapper.register_network(yandex, {});
ads_wrapper.register_network(yandex_mobile, {});

declare const vkbridge: unknown;
declare const yagames: unknown;
vk.set_vkbridge_extention(vkbridge);
yandex.set_yandex_extention(yagames);

const placed: ads_wrapper.ads_response = applovin_max.set_banner_position(
  applovin_max.POS_BOTTOM_CENTER,
);
const sized: ads_wrapper.ads_response = applovin_max.set_banner_size(applovin_max.SIZE_MREC);
const sizeNone: number = game_distribution.SIZE_NONE;
const listener: Hash = game_distribution.LISTENER;
void placed;
void sized;
void sizeNone;
void listener;

const admobPlaced: ads_wrapper.ads_response = admob.set_banner_position(0);
void admobPlaced;
admob.cancel_rewarded("load");

// admob's banner cancels pick between its load and unload operations, never a show.
// @ts-expect-error a banner cancel takes "load" or "unload"
admob.cancel_banner("show");

unity.request_idfa((response) => {
  void response.result;
});

// applovin_max stores the position and indexes maxsdk with it, so it takes a POS_* string.
// @ts-expect-error a banner position is a string constant, not a number
applovin_max.set_banner_position(4);

// @ts-expect-error vk does not define request_idfa, which the wrapper checks for first
vk.request_idfa();

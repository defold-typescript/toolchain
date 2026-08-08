/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as yagames from "yagames.yagames";

// Compile-only proof (mirroring orthographic-usage.test-d.ts) that the forked
// yagames golden keeps the surface ts-defold declared while replacing the whole
// `banner_*` family with the sticky-banner API upstream documents at `0.19.0`.
// This replaces the yagames block retired from library-types.test-d.ts when the
// `./yagames.yagames` subpath went away. No assertions execute; `tsc --noEmit`
// under tsconfig.dts-check.json (skipLibCheck: false) is the gate.

// The surface ts-defold already declared still compiles unchanged.
const _playerId: string = yagames.player_get_id();
const _device: "desktop" | "mobile" | "tablet" = yagames.device_info_type();
const _storageLength: number = yagames.storage_length();
yagames.player_get_data(undefined, (ctx, err, data) => {
  void ctx;
  void err;
  void data;
});

// The sticky-banner replacement. Show and hide take an optional callback — the
// `[callback]` form the README documents — so the bare call must compile.
yagames.adv_show_banner_adv();
yagames.adv_hide_banner_adv();

// The status callback is required, and its result is optional because the
// underlying promise may reject; narrowing it yields the documented boolean.
yagames.adv_get_banner_adv_status((self, err, result) => {
  void self;
  void err;
  if (result) {
    const _showing: boolean = result.stickyAdvIsShowing;
    void _showing;
  }
});

yagames.adv_show_banner_adv((self, err, result) => {
  void self;
  void err;
  if (result?.reason) {
    const _reason: "ADV_IS_NOT_CONNECTED" | "UNKNOWN" = result.reason;
    void _reason;
  }
});

// The retired family is gone, not merely undocumented.
// @ts-expect-error the banner_* family was replaced by the sticky-banner API
yagames.banner_create("rtb-id", {});

// The events API upstream documents at `0.19.0`, which the fork had never declared.
// The listener carries the file's `ApiCallback` shape, so the pause/resume data is
// reachable without a cast.
const _pauseListener: yagames.ApiCallback = (self, err, data) => {
  void self;
  void err;
  void data;
};
yagames.event_on("game_api_pause", _pauseListener);
yagames.event_off("game_api_pause", _pauseListener);
yagames.event_dispatch("EXIT");

// `payments_get_catalog` takes upstream's `(options, callback)`; the lone-callback
// form the fork used to declare passed the callback as `options` and never fired.
yagames.payments_get_catalog({ getPriceCurrencyImage: "medium" }, (self, err, data) => {
  void self;
  void err;
  if (data) {
    const _firstPrice: string | undefined = data[0]?.price;
    void _firstPrice;
  }
});
yagames.payments_get_catalog(undefined, (self, err, data) => {
  void self;
  void err;
  void data;
});

// The sitelock family is withdrawn: the pinned `yagames/yagames.lua` exports none of
// it, so `require("yagames.yagames").add_domain` is `nil` at this ref.
// @ts-expect-error the sitelock members are not exported by the yagames module
yagames.add_domain("example.com");

void _playerId;
void _device;
void _storageLength;
